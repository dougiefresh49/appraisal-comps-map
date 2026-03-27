import {
  insertProjectDocument,
  fetchDocumentsByType,
} from "~/lib/supabase-queries";

/**
 * Upserts a project_documents row for a map that was saved/exported.
 * Called after a user captures a neighborhood or location map screenshot.
 * If a document of this type already exists for this project, we skip insertion
 * to avoid duplicates — the user can manage documents via the Documents page.
 */
export async function registerMapContext(
  projectId: string,
  mapType: "neighborhood_map" | "location_map",
  metadata: {
    driveFileId?: string;
    drawingsSummary?: string;
    boundaryDescription?: string;
  },
): Promise<void> {
  try {
    const existing = await fetchDocumentsByType(projectId, mapType);
    if (existing.length > 0) return;

    await insertProjectDocument(projectId, {
      documentType: mapType,
      documentLabel:
        mapType === "neighborhood_map"
          ? "Neighborhood Map"
          : "Subject Location Map",
      fileId: metadata.driveFileId,
    });
  } catch (err) {
    console.error(`Failed to register ${mapType} context`, err);
  }
}
