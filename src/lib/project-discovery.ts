import "server-only";

import {
  listFolderChildren,
  type DriveFile,
} from "~/lib/drive-api";

export interface FolderStructure {
  subjectFolderId?: string;
  subjectPhotosFolderId?: string;
  subjectSketchesFolderId?: string;
  reportsFolderId?: string;
  reportMapsFolderId?: string;
  costReportFolderId?: string;
  engagementFolderId?: string;
  compsFolderIds?: {
    land?: string;
    sales?: string;
    rentals?: string;
  };
}

/**
 * Walk a project's Drive folder tree and discover well-known subfolder IDs.
 * This replaces the n8n `_GET_Project_Subfolder_Ids` sub-workflow.
 */
export async function discoverFolderStructure(
  token: string,
  projectFolderId: string,
): Promise<FolderStructure> {
  const result: FolderStructure = {};

  const rootChildren = await listFolderChildren(token, projectFolderId, {
    foldersOnly: true,
  });

  const findId = (name: string): string | undefined =>
    rootChildren.find(
      (f) => f.name.toLowerCase() === name.toLowerCase(),
    )?.id;

  result.subjectFolderId = findId("subject");
  result.reportsFolderId = findId("reports");
  result.engagementFolderId =
    findId("engagement-docs") ?? findId("engagement");

  const compsRootId = findId("comps");

  const [subjectChildren, reportsChildren, compsChildren] = await Promise.all([
    result.subjectFolderId
      ? listFolderChildren(token, result.subjectFolderId, { foldersOnly: true })
      : Promise.resolve([] as DriveFile[]),
    result.reportsFolderId
      ? listFolderChildren(token, result.reportsFolderId, { foldersOnly: true })
      : Promise.resolve([] as DriveFile[]),
    compsRootId
      ? listFolderChildren(token, compsRootId, { foldersOnly: true })
      : Promise.resolve([] as DriveFile[]),
  ]);

  const findChildId = (list: DriveFile[], name: string) =>
    list.find((f) => f.name.toLowerCase() === name.toLowerCase())?.id;

  result.subjectPhotosFolderId = findChildId(subjectChildren, "photos");
  result.subjectSketchesFolderId = findChildId(subjectChildren, "sketches");

  result.reportMapsFolderId = findChildId(reportsChildren, "maps");
  result.costReportFolderId = findChildId(reportsChildren, "cost-report");

  if (compsChildren.length > 0) {
    result.compsFolderIds = {
      land: findChildId(compsChildren, "land"),
      sales: findChildId(compsChildren, "sales"),
      rentals: findChildId(compsChildren, "rentals"),
    };
  }

  return result;
}

const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";

/**
 * Find the Google Spreadsheet file ID inside a project folder.
 * Searches the root level of the folder for a Sheets file.
 */
export async function findSpreadsheetId(
  token: string,
  projectFolderId: string,
): Promise<string | null> {
  const files = await listFolderChildren(token, projectFolderId);
  const sheet = files.find((f) => f.mimeType === SPREADSHEET_MIME);
  return sheet?.id ?? null;
}

/**
 * List files in a specific subfolder identified from the folder structure.
 * Convenience wrapper for the onboarding wizard steps.
 */
export async function listSubfolderFiles(
  token: string,
  folderId: string,
): Promise<DriveFile[]> {
  return listFolderChildren(token, folderId, { filesOnly: true });
}
