import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DRIVE_V3 = "https://www.googleapis.com/drive/v3";
const MIME_DOC = "application/vnd.google-apps.document";
const MIME_FOLDER = "application/vnd.google-apps.folder";

export type DriveAuth =
  | { type: "oauth"; token: string }
  | { type: "apikey"; key: string };

export type PastReportMdMappingRow = {
  "Report PDF": string;
  "Report MD": string;
  "Project Name": string;
  "Folder Name": string;
  "Google Drive Folder ID": string;
};

export type RunPastReportMdDownloadOptions = {
  repoRoot: string;
  dryRun?: boolean;
  /** Return Doc + folder URLs only; no `files.export` (use in browser: File → Download). */
  linksOnly?: boolean;
  /** 0-based index into mapping JSON; omit for all rows */
  onlyIndex?: number | null;
};

export type RunPastReportMdDownloadResultItem = {
  projectName: string;
  projectFolderId: string;
  reportMd: string;
  status: "ok" | "skipped" | "error";
  message?: string;
  docId?: string;
  docName?: string;
  /** Open in browser; for Google Docs use File → Download → Markdown if API export fails. */
  docEditUrl?: string;
  reportsFolderUrl?: string;
  charsWritten?: number;
  relativeOutPath?: string;
};

type DriveFileMeta = { id: string; name: string; mimeType: string };

export function loadMappingEntries(repoRoot: string): PastReportMdMappingRow[] {
  const mappingPath = join(
    repoRoot,
    "docs/past-reports/project-folder-ids.md",
  );
  const text = readFileSync(mappingPath, "utf8");
  const m = /```json\s*([\s\S]*?)```/.exec(text);
  if (!m?.[1]) {
    throw new Error(`No fenced json block in ${mappingPath}`);
  }
  return JSON.parse(m[1]) as PastReportMdMappingRow[];
}

export function googleDocEditUrl(fileId: string): string {
  return `https://docs.google.com/document/d/${encodeURIComponent(fileId)}/edit`;
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

/** For CLI: OAuth token or Drive API key from env (same as standalone script). */
export function resolveAuthFromEnv(): DriveAuth | null {
  const token = process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim();
  if (token) return { type: "oauth", token };
  const key = process.env.GOOGLE_DRIVE_API_KEY?.trim();
  if (key) return { type: "apikey", key };
  return null;
}

function driveFetchHeaders(auth: DriveAuth): Record<string, string> {
  return auth.type === "oauth"
    ? { Authorization: `Bearer ${auth.token}` }
    : {};
}

function appendApiKeyIfNeeded(u: URL, auth: DriveAuth) {
  if (auth.type === "apikey") {
    u.searchParams.set("key", auth.key);
  }
}

async function driveList(
  auth: DriveAuth,
  query: string,
  pageSize = 50,
): Promise<DriveFileMeta[]> {
  const u = new URL(`${DRIVE_V3}/files`);
  u.searchParams.set("q", query);
  u.searchParams.set("fields", "files(id,name,mimeType)");
  u.searchParams.set("pageSize", String(pageSize));
  appendApiKeyIfNeeded(u, auth);
  const res = await fetch(u, { headers: driveFetchHeaders(auth) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive files.list (${res.status}): ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as { files?: DriveFileMeta[] };
  return data.files ?? [];
}

async function findChildFolderByName(
  auth: DriveAuth,
  parentId: string,
  folderName: string,
): Promise<DriveFileMeta | null> {
  const safe = folderName.replace(/'/g, "\\'");
  const q = `'${parentId}' in parents and trashed = false and mimeType = '${MIME_FOLDER}' and name = '${safe}'`;
  const files = await driveList(auth, q, 2);
  return files[0] ?? null;
}

async function listGoogleDocsInFolder(
  auth: DriveAuth,
  folderId: string,
): Promise<DriveFileMeta[]> {
  const q = `'${folderId}' in parents and trashed = false and mimeType = '${MIME_DOC}'`;
  return driveList(auth, q, 100);
}

async function exportDocAsMarkdown(
  auth: DriveAuth,
  fileId: string,
): Promise<string> {
  const u = new URL(`${DRIVE_V3}/files/${encodeURIComponent(fileId)}/export`);
  u.searchParams.set("mimeType", "text/markdown");
  appendApiKeyIfNeeded(u, auth);
  const res = await fetch(u, { headers: driveFetchHeaders(auth) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`files.export (${res.status}): ${body.slice(0, 400)}`);
  }
  return res.text();
}

function isRetryableExportError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|503|502|504|408|ECONNRESET|ETIMEDOUT|ECONNABORTED|fetch failed|Premature close|network/i.test(
    msg,
  );
}

/** Large Docs → markdown exports often hit transient limits; retry a few times. */
async function exportDocAsMarkdownWithRetry(
  auth: DriveAuth,
  fileId: string,
  maxAttempts = 4,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await exportDocAsMarkdown(auth, fileId);
    } catch (e) {
      lastErr = e;
      if (!isRetryableExportError(e) || attempt === maxAttempts) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr;
}

function expectedDocTitleFromReportMd(reportMdFilename: string) {
  return reportMdFilename.replace(/\.md$/i, "");
}

function pickReportGoogleDoc(
  docs: DriveFileMeta[],
  reportMdFilename: string,
): DriveFileMeta | null {
  const want = expectedDocTitleFromReportMd(reportMdFilename);
  const exact = docs.find((d) => d.name === want);
  if (exact) return exact;
  const loose = docs.filter(
    (d) => d.name.includes(" - Report") || d.name.endsWith(" - Report"),
  );
  if (loose.length === 1) return loose[0] ?? null;
  if (loose.length > 1) {
    const byWant = loose.find((d) => d.name === want);
    if (byWant) return byWant;
    return loose[0] ?? null;
  }
  return docs[0] ?? null;
}

/**
 * Export Google Docs under each project’s `reports` folder as markdown files in `docs/past-reports/`.
 */
export async function runPastReportMdDownload(
  auth: DriveAuth,
  options: RunPastReportMdDownloadOptions,
): Promise<{ results: RunPastReportMdDownloadResultItem[] }> {
  const {
    repoRoot,
    dryRun = false,
    linksOnly = false,
    onlyIndex = null,
  } = options;
  const outDir = join(repoRoot, "docs/past-reports");
  let entries = loadMappingEntries(repoRoot);
  if (onlyIndex != null) {
    const one = entries[onlyIndex];
    entries = one ? [one] : [];
  }

  mkdirSync(outDir, { recursive: true });
  const results: RunPastReportMdDownloadResultItem[] = [];

  for (const row of entries) {
    const projectName = row["Project Name"];
    const projectFolderId = row["Google Drive Folder ID"];
    const reportMd = row["Report MD"];

    if (!projectFolderId || !reportMd) {
      results.push({
        projectName,
        projectFolderId: projectFolderId ?? "",
        reportMd: reportMd ?? "",
        status: "skipped",
        message: "missing folder id or Report MD",
      });
      continue;
    }

    const base: RunPastReportMdDownloadResultItem = {
      projectName,
      projectFolderId,
      reportMd,
      status: "error",
    };

    let chosen: DriveFileMeta | null = null;
    let reportsFolderUrl: string | undefined;

    try {
      const reportsFolder = await findChildFolderByName(
        auth,
        projectFolderId,
        "reports",
      );
      if (!reportsFolder) {
        results.push({
          ...base,
          status: "skipped",
          message: `No "reports" subfolder under project folder ${projectFolderId}`,
        });
        continue;
      }

      reportsFolderUrl = driveFolderUrl(reportsFolder.id);
      const docs = await listGoogleDocsInFolder(auth, reportsFolder.id);
      chosen = pickReportGoogleDoc(docs, reportMd);
      if (!chosen) {
        results.push({
          ...base,
          status: "skipped",
          message: `No Google Doc in reports folder (files: ${docs.length})`,
          reportsFolderUrl,
        });
        continue;
      }

      const relativeOutPath = join("docs/past-reports", reportMd);
      const docEditUrl = googleDocEditUrl(chosen.id);

      if (dryRun) {
        results.push({
          ...base,
          status: "ok",
          message: "dry-run",
          docId: chosen.id,
          docName: chosen.name,
          docEditUrl,
          reportsFolderUrl,
          relativeOutPath,
        });
        continue;
      }

      if (linksOnly) {
        results.push({
          ...base,
          status: "ok",
          message:
            "links-only — open Doc, then File → Download → Markdown (.md), save as name in Report MD column",
          docId: chosen.id,
          docName: chosen.name,
          docEditUrl,
          reportsFolderUrl,
          relativeOutPath,
        });
        continue;
      }

      const md = await exportDocAsMarkdownWithRetry(auth, chosen.id);
      const outPath = join(outDir, reportMd);
      writeFileSync(outPath, md, "utf8");
      results.push({
        ...base,
        status: "ok",
        docId: chosen.id,
        docName: chosen.name,
        docEditUrl,
        reportsFolderUrl,
        charsWritten: md.length,
        relativeOutPath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        ...base,
        status: "error",
        message,
        docId: chosen?.id,
        docName: chosen?.name,
        docEditUrl: chosen ? googleDocEditUrl(chosen.id) : undefined,
        reportsFolderUrl,
      });
    }
  }

  return { results };
}
