import "server-only";
import { z } from "zod";
import { env } from "~/env";

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

// Google Drive API configuration
const GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

// Debug function to list all files in the folder
export async function listAllFilesInFolder(folderId: string): Promise<any> {
  try {
    // Try different query approaches
    const queries = [
      `'${folderId}' in parents`,
      `'${folderId}' in parents and trashed=false`,
      `'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder'`,
    ];

    for (const query of queries) {
      const response = await fetch(
        `${GOOGLE_DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&key=${env.GOOGLE_DRIVE_API_KEY}`,
      );

      if (!response.ok) {
        continue;
      }

      const data = await response.json();

      if (data.files && data.files.length > 0) {
        return data;
      }
    }

    // If all queries return empty, return the last result
    const response = await fetch(
      `${GOOGLE_DRIVE_API_BASE}/files?q='${folderId}' in parents&key=${env.GOOGLE_DRIVE_API_KEY}`,
    );

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error listing files:", error);
    throw error;
  }
}

// Fetch input.json from Google Drive API
export async function fetchInputsJson(folderId: string): Promise<{
  photos: PhotoInputs;
  fileId: string;
}> {
  try {
    // Use Google Drive API to fetch input.json
    if (!env.GOOGLE_DRIVE_API_KEY) {
      throw new Error("GOOGLE_DRIVE_API_KEY is not set");
    }

    if (!folderId) {
      throw new Error("Folder ID is required");
    }

    const [inputData, imageFiles] = await Promise.all([
      fetchInputJsonFromDrive(folderId),
      fetchImageFilesFromDrive(folderId),
    ]);

    const photosMap = imageFiles.reduce(
      (acc, file) => {
        acc[file.name] = file;
        return acc;
      },
      {} as Record<string, { id: string; name: string }>,
    );

    const photos: PhotoInputs = inputData.inputs.map((i) => ({
      ...i,
      webViewUrl: `https://drive.google.com/thumbnail?id=${photosMap[i.image]?.id ?? ""}&sz=w800`,
    }));

    return { photos, fileId: inputData.fileId };
  } catch (error) {
    console.error("Error fetching input.json:", error);
    // Fallback to sample data for development
    return {
      photos: [],
      fileId: "",
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
    if (env.N8N_WEBHOOK_URL) {
      const response = await fetch(env.N8N_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          photos: updatedPhotos,
          folderId,
          fileId: fileId || "unknown",
        }),
      });

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
 * Helper functions
 */

async function fetchInputJsonFileId(folderId: string): Promise<string> {
  const inputFileResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+name='input.json'&key=${env.GOOGLE_DRIVE_API_KEY}`,
  );

  if (!inputFileResponse.ok) {
    throw new Error(
      `Failed to search for input.json: ${inputFileResponse.status}`,
    );
  }

  const inputFileData = (await inputFileResponse.json()) as {
    files?: Array<{ id: string }>;
  };
  const inputFiles = inputFileData.files ?? [];

  if (inputFiles.length === 0) {
    throw new Error("No input.json file found in folder");
  }

  return inputFiles[0]?.id ?? "";
}

// Helper function to find and fetch input.json from Google Drive
async function fetchInputJsonFromDrive(folderId: string): Promise<{
  inputs: Array<{ image: string; label: string }>;
  fileId: string;
}> {
  const inputFileId = await fetchInputJsonFileId(folderId);
  const inputResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${inputFileId}?alt=media&key=${env.GOOGLE_DRIVE_API_KEY}`,
  );

  if (!inputResponse.ok) {
    throw new Error(
      `Failed to fetch input.json content: ${inputResponse.status}`,
    );
  }

  const inputs = await inputResponse.json();

  return { inputs, fileId: inputFileId };
}

// Helper function to fetch image files from Google Drive
async function fetchImageFilesFromDrive(
  folderId: string,
): Promise<Array<{ id: string; name: string }>> {
  const filesResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType+contains+'image/'&key=${env.GOOGLE_DRIVE_API_KEY}`,
  );

  if (!filesResponse.ok) {
    throw new Error(`Failed to fetch image files: ${filesResponse.status}`);
  }

  const filesData = (await filesResponse.json()) as {
    files?: Array<{ id: string; name: string }>;
  };
  const imageFiles = filesData.files ?? [];

  return imageFiles.map((file) => ({ id: file.id, name: file.name }));
}
