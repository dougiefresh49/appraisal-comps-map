import "server-only";
import { env } from "~/env";
import { createClient } from "~/utils/supabase/server";

/**
 * Trigger the n8n photo analysis workflow.
 * The n8n endpoint is expected to return a JSON response with the total number
 * of photos in the folder (e.g. `{ totalPhotos: 35 }`) once it starts processing.
 * Individual photo results are written to Supabase asynchronously by n8n,
 * so the UI can track progress via Realtime subscriptions.
 */
export async function triggerPhotoAnalysis(
  projectFolderId: string,
): Promise<{ success: boolean; totalPhotos?: number; error?: string }> {
  try {
    if (!projectFolderId) {
      return { success: false, error: "Project Folder ID is required" };
    }

    if (!env.N8N_WEBHOOK_BASE_URL) {
      return { success: false, error: "N8N_WEBHOOK_BASE_URL is not set" };
    }

    const response = await fetch(
      env.N8N_WEBHOOK_BASE_URL + "/subject-photos-analyze",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectFolderId }),
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `n8n returned ${response.status}: ${response.statusText}`,
      };
    }

    const data = (await response.json()) as { totalPhotos?: number };

    return {
      success: true,
      totalPhotos: data.totalPhotos ?? undefined,
    };
  } catch (error) {
    console.error("Error triggering photo analysis:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Export the current photo set as input.json to Google Drive via n8n.
 * Reads included photos from Supabase ordered by sort_order, maps them to
 * the `[{image, label}]` format that Google Apps Script expects, and calls
 * n8n to write the file.
 */
export async function exportInputJson(
  projectId: string,
  projectFolderId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectId || !projectFolderId) {
      return {
        success: false,
        error: "Project ID and Project Folder ID are required",
      };
    }

    if (!env.N8N_WEBHOOK_BASE_URL) {
      return { success: false, error: "N8N_WEBHOOK_BASE_URL is not set" };
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

    const response = await fetch(
      env.N8N_WEBHOOK_BASE_URL + "/subject-photos-save-input",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectFolderId,
          photos,
        }),
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `n8n returned ${response.status}: ${response.statusText}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error exporting input.json:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
