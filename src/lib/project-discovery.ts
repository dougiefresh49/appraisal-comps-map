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
const REPORT_DATA_PREFIX = "report-data";

/**
 * Find Google Spreadsheet candidates matching the `report-data*` naming
 * convention.  Searches the `reports/` subfolder first (where the spreadsheet
 * normally lives), then falls back to the project root for backward compat.
 */
export async function findSpreadsheetCandidates(
  token: string,
  reportsFolderId: string | undefined,
  projectFolderId: string,
): Promise<DriveFile[]> {
  const isReportDataSheet = (f: DriveFile) =>
    f.mimeType === SPREADSHEET_MIME &&
    f.name.toLowerCase().startsWith(REPORT_DATA_PREFIX);

  if (reportsFolderId) {
    const reportsFiles = await listFolderChildren(token, reportsFolderId);
    const matches = reportsFiles.filter(isReportDataSheet);
    if (matches.length > 0) return matches;
  }

  const rootFiles = await listFolderChildren(token, projectFolderId);
  const rootMatches = rootFiles.filter(isReportDataSheet);
  if (rootMatches.length > 0) return rootMatches;

  const anySheet = rootFiles.filter((f) => f.mimeType === SPREADSHEET_MIME);
  return anySheet;
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
