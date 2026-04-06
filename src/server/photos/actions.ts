import "server-only";
import { z } from "zod";
import { env } from "~/env";
import {
  listFolderChildren,
  findChildByName,
} from "~/lib/drive-api";
import {
  analyzeProjectPhotos,
  buildSubjectPhotoContext,
} from "~/lib/photo-analyzer";
import { createClient, createServiceClient, getGoogleToken } from "~/utils/supabase/server";

// Schema for photo input data with webViewUrl (final merged format)
export const PhotoInputSchema = z.object({
  image: z.string(),
  label: z.string(),
  webViewUrl: z.string(),
  fallbackUrl: z.string().optional(),
});

export const PhotoInputsSchema = z.array(PhotoInputSchema);

export type PhotoInput = z.infer<typeof PhotoInputSchema>;
export type PhotoInputs = z.infer<typeof PhotoInputsSchema>;




// Fetch input.json from Google Drive API
// Fetch input.json using n8n webhook
export async function fetchInputsJson(folderId: string): Promise<{
  photos: PhotoInputs;
  fileId: string;
}> {
  try {
    if (!folderId) {
      throw new Error("Folder ID is required");
    }

    if (!env.N8N_WEBHOOK_BASE_URL) {
       throw new Error("N8N_WEBHOOK_BASE_URL is not set");
    }

    const response = await fetch(`${env.N8N_WEBHOOK_BASE_URL}/subject-photos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectFolderId: folderId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch photos from n8n: ${response.statusText}`);
    }


    const data = (await response.json()) as N8nPhotoResponse;
    if (!data) {
      return { photos: [], fileId: "" };
    }

    // Define interface for n8n response
    interface N8nPhotoResponse {
      status: string;
      photos: { id: string; name: string }[];
      inputFileId: string;
      input: { image: string; label: string }[];
    }
    
    if (!data || data.status !== "success") {
       // Handle case where n8n returns something else or empty
       console.warn("n8n returned unsuccessful status or invalid format", data);
       return { photos: [], fileId: "" };
    }

    const imageFiles = data.photos || [];
    const inputs = data.input || [];
    const inputFileId = data.inputFileId || "";

    const photosMap = imageFiles.reduce(
      (acc, file) => {
        acc[file.name] = file;
        return acc;
      },
      {} as Record<string, { id: string; name: string }>,
    );

    const photos: PhotoInputs = inputs.map((i) => ({
      ...i,
      webViewUrl: `https://drive.google.com/thumbnail?id=${photosMap[i.image]?.id ?? ""}&sz=w800`,
    }));

    console.log("photos:", photos[0]);
    return { photos, fileId: inputFileId };
  } catch (error) {
    console.error("Error fetching input.json:", error);
    // Fallback to empty arrays
    return {
      photos: [],
      fileId: "",
    };
  }
}

// Process images via webhook to create input.json
// This function triggers the webhook but doesn't wait for completion (fire-and-forget)
export async function processImages(
  projectFolderId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectFolderId) {
      return {
        success: false,
        error: "Project Folder ID is required",
      };
    }

    // Fire-and-forget: trigger the webhook but don't wait for response
    fetch(env.N8N_WEBHOOK_BASE_URL + "/subject-process-photos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectFolderId,
      }),
    }).catch((error) => {
      // Log errors but don't block the response
      console.error("Error triggering image processing webhook:", error);
    });

    // Return immediately with success
    return {
      success: true,
    };
  } catch (error) {
    console.error("Error processing images:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Save changes back to Google Drive via n8n webhook or return JSON for manual update
export async function saveChanges(
  updatedPhotos: PhotoInputs,
  folderId: string,
  fileId?: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    // Option 1: Try to save via n8n webhook if configured
    if (env.N8N_WEBHOOK_BASE_URL) {
      const response = await fetch(
        env.N8N_WEBHOOK_BASE_URL + "/photos-update",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            photos: updatedPhotos,
            folderId,
            fileId: fileId ?? "unknown",
          }),
        },
      );

      if (response.ok) {
        return { success: true };
      }
    }

    // Option 2: Return JSON for manual update
    const jsonData = JSON.stringify(updatedPhotos, null, 2);
    return {
      success: true,
      data: jsonData,
      error: "Please manually update input.json with the provided data",
    };
  } catch (error) {
    console.error("Error saving changes:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Triggers photo analysis for a project's subject photos folder.
 *
 * Loads subject_data.core for context, then runs photo-analyzer (Gemini) on
 * each image. Results are written to photo_analyses asynchronously.
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

    const photosFolderId = await resolveSubjectPhotosFolderId(
      token,
      projectFolderId,
    );

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
        error:
          "Could not resolve project ID from folder. Pass projectId explicitly.",
      };
    }

    const supabase = await createClient();
    const { data: subjectRow } = await supabase
      .from("subject_data")
      .select("core")
      .eq("project_id", resolvedProjectId)
      .single();

    const core =
      (subjectRow as { core: Record<string, unknown> } | null)?.core ?? {};
    const subjectContext = buildSubjectPhotoContext(core);

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

    const serviceClient = createServiceClient();

    const allFiles = await listFolderChildren(token, photosFolderId, {
      filesOnly: true,
    });
    const imageExtensions = new Set([
      "jpg",
      "jpeg",
      "png",
      "webp",
      "gif",
      "heic",
      "heif",
      "tif",
      "tiff",
    ]);
    const imageFiles = allFiles.filter((f) => {
      if (f.mimeType?.startsWith("image/")) return true;
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      return imageExtensions.has(ext);
    });
    const totalPhotos = imageFiles.length;

    void analyzeProjectPhotos(
      resolvedProjectId,
      photosFolderId,
      token,
      serviceClient,
      {
        propertyType,
        subjectAddress,
        subjectContext,
        concurrency: 2,
      },
    ).catch((err) => {
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
