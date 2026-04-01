import "server-only";
import { createClient, createServiceClient, getGoogleToken } from "~/utils/supabase/server";
import {
  listFolderChildren,
  findChildByName,
  uploadOrUpdateFile,
} from "~/lib/drive-api";
import {
  analyzeProjectPhotos,
  buildSubjectPhotoContext,
} from "~/lib/photo-analyzer";

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
 */
export async function triggerPhotoAnalysis(
  projectFolderId: string,
  projectId?: string,
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
    const totalPhotos = imageFiles.length;

    // Fire-and-forget: run analysis in background
    void analyzeProjectPhotos(resolvedProjectId, photosFolderId, token, serviceClient, {
      propertyType,
      subjectAddress,
      subjectContext,
      concurrency: 2,
    }).catch((err) => {
      console.error("[triggerPhotoAnalysis] Background analysis failed:", err);
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
