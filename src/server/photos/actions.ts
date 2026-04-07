import "server-only";
import { createClient, createServiceClient, getGoogleToken } from "~/utils/supabase/server";
import {
  listFolderChildren,
  findChildByName,
  uploadOrUpdateFile,
  downloadFile,
} from "~/lib/drive-api";
import {
  analyzeProjectPhotos,
  buildSubjectPhotoContext,
  generateSmartLabel,
  resizeForGemini,
  resolveImageMimeType,
  type PhotoCategory,
} from "~/lib/photo-analyzer";
import { synthesizeSubjectCoreFromPhotos } from "~/lib/subject-core-synthesizer";

/**
 * Triggers photo analysis for a project's subject photos folder.
 *
 * Loads the project's subject_data.core to build subject context, then
 * calls the photo-analyzer module to classify and describe each image via Gemini.
 * Results are upserted into photo_analyses asynchronously (fire-and-forget for the caller).
 *
 * Returns immediately with { success: true, totalPhotos } where totalPhotos
 * reflects the number of images found and queued. Individual photo results
 * are written to Supabase asynchronously; the UI tracks progress via Realtime.
 *
 * @param photoIds - Optional Drive file IDs to limit analysis to. When omitted, all photos are processed.
 */
export async function triggerPhotoAnalysis(
  projectFolderId: string,
  projectId?: string,
  photoIds?: string[],
): Promise<{ success: boolean; totalPhotos?: number; error?: string }> {
  try {
    if (!projectFolderId) {
      return { success: false, error: "Project Folder ID is required" };
    }

    const { token, error: driveAuthError } = await getGoogleToken();
    if (!token) {
      return {
        success: false,
        error:
          driveAuthError ??
          "Not authenticated — please sign in again to grant Drive access",
      };
    }

    // Resolve the subject photos folder inside the project Drive folder
    const photosFolderId = await resolveSubjectPhotosFolderId(
      token,
      projectFolderId,
    );

    // Resolve project ID from folder if not provided
    let resolvedProjectId = projectId;
    if (!resolvedProjectId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("projects")
        .select("id")
        .eq("project_folder_id", projectFolderId)
        .single();
      resolvedProjectId = (data as { id: string } | null)?.id ?? undefined;
    }

    if (!resolvedProjectId) {
      return {
        success: false,
        error: "Could not resolve project ID from folder. Pass projectId explicitly.",
      };
    }

    // Load subject context from subject_data.core
    const supabase = await createClient();
    const { data: subjectRow } = await supabase
      .from("subject_data")
      .select("core")
      .eq("project_id", resolvedProjectId)
      .single();

    const core = (subjectRow as { core: Record<string, unknown> } | null)?.core ?? {};
    const subjectContext = buildSubjectPhotoContext(core);

    // Load property type and address from projects + core
    const { data: projectRow } = await supabase
      .from("projects")
      .select("property_type, name")
      .eq("id", resolvedProjectId)
      .single();

    const row = projectRow as {
      property_type: string | null;
      name: string | null;
    } | null;

    const propertyType =
      (typeof core.propertyType === "string" ? core.propertyType : null) ??
      row?.property_type ??
      "Commercial";

    const subjectAddress =
      (typeof core.address === "string" ? core.address : null) ??
      (typeof core.siteAddress === "string" ? core.siteAddress : null) ??
      row?.name ??
      "Unknown Address";

    // Fire analysis in the background using service client (bypasses RLS)
    const serviceClient = createServiceClient();

    // Return total count quickly, process asynchronously
    // Count images first for the response
    const allFiles = await listFolderChildren(token, photosFolderId, {
      filesOnly: true,
    });
    const imageExtensions = new Set([
      "jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "tif", "tiff",
    ]);
    const imageFiles = allFiles.filter((f) => {
      if (f.mimeType?.startsWith("image/")) return true;
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      return imageExtensions.has(ext);
    });
    const filesToAnalyze = photoIds
      ? imageFiles.filter((f) => photoIds.includes(f.id))
      : imageFiles;
    const totalPhotos = filesToAnalyze.length;

    // Fire-and-forget: run analysis then synthesize core in background
    void analyzeProjectPhotos(resolvedProjectId, photosFolderId, token, serviceClient, {
      propertyType,
      subjectAddress,
      subjectContext,
      concurrency: 2,
      photoIds,
    }).then(async () => {
      // After all photos are analyzed, run a single Gemini call to synthesize
      // photo observations + document data into subject_data.core fields.
      // Uses merge_subject_core RPC so only empty/null keys are filled.
      console.log(`[triggerPhotoAnalysis] Photos done, starting core synthesis for project ${resolvedProjectId}`);
      const { patchedKeys, error: synthError } = await synthesizeSubjectCoreFromPhotos(
        resolvedProjectId,
        serviceClient,
      );
      if (synthError) {
        console.error("[triggerPhotoAnalysis] Core synthesis failed:", synthError);
      } else if (patchedKeys.length > 0) {
        console.log(`[triggerPhotoAnalysis] Core synthesis patched ${patchedKeys.length} keys: ${patchedKeys.join(", ")}`);
      }
    }).catch((err) => {
      console.error("[triggerPhotoAnalysis] Background pipeline failed:", err);
    });

    return { success: true, totalPhotos };
  } catch (error) {
    console.error("Error triggering photo analysis:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Regenerates AI labels for specific photos using generateSmartLabel.
 * Fetches each photo's category and description from the DB, downloads the image
 * from Drive, calls Gemini for a smart label, and updates photo_analyses.label.
 *
 * Useful for backfilling labels on photos that were analyzed before smart labeling
 * was introduced, without re-running the full classification + description pipeline.
 */
export async function relabelPhotos(
  projectId: string,
  photoIds: string[],
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
  try {
    if (!projectId || photoIds.length === 0) {
      return { success: false, updatedCount: 0, error: "projectId and photoIds are required" };
    }

    const { token, error: driveAuthError } = await getGoogleToken();
    if (!token) {
      return {
        success: false,
        updatedCount: 0,
        error: driveAuthError ?? "Not authenticated — please sign in again",
      };
    }

    const supabase = await createClient();

    // Fetch the target photos from DB
    const { data: photoRows, error: fetchError } = await supabase
      .from("photo_analyses")
      .select("id, file_id, file_name, category, description, property_type, subject_address")
      .eq("project_id", projectId)
      .in("file_id", photoIds);

    if (fetchError) throw fetchError;
    if (!photoRows || photoRows.length === 0) {
      return { success: true, updatedCount: 0 };
    }

    const serviceClient = createServiceClient();
    let updatedCount = 0;

    const concurrency = 2;
    for (let i = 0; i < photoRows.length; i += concurrency) {
      const batch = photoRows.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (row) => {
          try {
            const typedRow = row as {
              id: string;
              file_id: string | null;
              file_name: string;
              category: string;
              description: string | null;
              property_type: string | null;
              subject_address: string | null;
            };

            if (!typedRow.file_id) return;

            const arrayBuffer = await downloadFile(token, typedRow.file_id);
            const rawBuffer = Buffer.from(arrayBuffer);
            const mimeType = resolveImageMimeType(typedRow.file_name, "");
            const { buffer: resizedBuffer, mimeType: resizedMimeType } =
              await resizeForGemini(rawBuffer, mimeType);

            const newLabel = await generateSmartLabel(
              resizedBuffer,
              resizedMimeType,
              typedRow.category as PhotoCategory,
              typedRow.description ?? "",
              typedRow.property_type ?? "Commercial",
              typedRow.subject_address ?? "",
            );

            await serviceClient
              .from("photo_analyses")
              .update({ label: newLabel, updated_at: new Date().toISOString() })
              .eq("id", typedRow.id);

            updatedCount++;
            console.log(`[relabelPhotos] Relabeled ${typedRow.file_name}: "${newLabel}"`);
          } catch (err) {
            console.error(`[relabelPhotos] Error relabeling photo ${row.id}:`, err);
          }
        }),
      );
    }

    return { success: true, updatedCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[relabelPhotos] Error:", message);
    return { success: false, updatedCount: 0, error: message };
  }
}

/**
 * Re-analyzes a specific subset of photos (classify + describe + smart label).
 * Same as triggerPhotoAnalysis but only processes the specified Drive file IDs.
 */
export async function reanalyzePhotos(
  projectId: string,
  projectFolderId: string,
  photoIds: string[],
): Promise<{ success: boolean; totalPhotos?: number; error?: string }> {
  return triggerPhotoAnalysis(projectFolderId, projectId, photoIds);
}

/**
 * Resolves the subject photos folder ID for a given project Drive folder.
 * Navigates: projectFolder → subject → photos
 */
async function resolveSubjectPhotosFolderId(
  token: string,
  projectFolderId: string,
): Promise<string> {
  const projectChildren = await listFolderChildren(token, projectFolderId, {
    foldersOnly: true,
  });

  const subjectFolder = projectChildren.find(
    (f) => f.name.toLowerCase() === "subject",
  );
  if (!subjectFolder) {
    throw new Error("Could not find 'subject' folder in project Drive folder");
  }

  const photosFolder = await findChildByName(
    token,
    subjectFolder.id,
    "photos",
    "application/vnd.google-apps.folder",
  );
  if (!photosFolder) {
    throw new Error("Could not find 'photos' subfolder inside subject folder");
  }

  return photosFolder.id;
}

/**
 * Export the current photo set as input.json to Google Drive.
 * Reads included photos from Supabase ordered by sort_order, maps them to
 * the `[{image, label}]` format that Google Apps Script expects, and writes
 * the file directly to Drive using the user's OAuth token.
 *
 * If subjectPhotosFolderId is not provided, it is discovered by traversing
 * the project folder structure (projectFolder → subject → photos).
 */
export async function exportInputJson(
  projectId: string,
  projectFolderId: string,
  subjectPhotosFolderId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectId || !projectFolderId) {
      return {
        success: false,
        error: "Project ID and Project Folder ID are required",
      };
    }

    const { token, error: driveAuthError } = await getGoogleToken();
    if (!token) {
      return {
        success: false,
        error:
          driveAuthError ??
          "Not authenticated — please sign in again to grant Drive access",
      };
    }

    const supabase = await createClient();
    const { data, error: dbError } = await supabase
      .from("photo_analyses")
      .select("file_name, label")
      .eq("project_id", projectId)
      .eq("is_included", true)
      .order("sort_order", { ascending: true });

    if (dbError) throw dbError;

    const photos = ((data ?? []) as { file_name: string; label: string }[]).map(
      (row) => ({
        image: row.file_name,
        label: row.label,
      }),
    );

    // Resolve the photos folder if not already known
    const folderId =
      subjectPhotosFolderId ??
      (await resolveSubjectPhotosFolderId(token, projectFolderId));

    await uploadOrUpdateFile(
      token,
      folderId,
      "input.json",
      JSON.stringify(photos, null, 2),
      "application/json",
    );

    return { success: true };
  } catch (error) {
    console.error("Error exporting input.json:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
