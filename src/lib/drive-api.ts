/**
 * Google Drive API v3 utility — all operations use OAuth Bearer token auth.
 * The token is obtained from the user's Supabase session (provider_token).
 * This means operations run as the authenticated user with the same permissions
 * they have in Google Drive — no service account required.
 */

/** Thrown when Google returns HTTP 401 so API routes can return a structured re-auth response. */
export class DriveAuthError extends Error {
  readonly code = "token_expired_mid_request" as const;

  constructor(message = "Google Drive rejected the access token") {
    super(message);
    this.name = "DriveAuthError";
  }
}

function throwForFailedDriveResponse(
  res: Response,
  label: string,
  bodySnippet: string,
): never {
  if (res.status === 401) {
    throw new DriveAuthError();
  }
  throw new Error(`${label} (${res.status}): ${bodySnippet}`);
}

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** RFC 3339 date-time from Drive when requested in `fields` */
  modifiedTime?: string;
}

/** File or folder metadata including parent folder ids (Drive `files.get`). */
export interface DriveItemMetadata extends DriveFile {
  parents?: string[];
}

export interface DriveListOptions {
  foldersOnly?: boolean;
  filesOnly?: boolean;
  pageSize?: number;
  /** Drive `orderBy`, e.g. `modifiedTime desc` for newest files first */
  orderBy?: string;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Lists immediate children of a Drive folder.
 */
export async function listFolderChildren(
  token: string,
  folderId: string,
  options: DriveListOptions = {},
): Promise<DriveFile[]> {
  const parts: string[] = [`'${folderId}' in parents`, "trashed = false"];

  if (options.foldersOnly) {
    parts.push("mimeType = 'application/vnd.google-apps.folder'");
  } else if (options.filesOnly) {
    parts.push("mimeType != 'application/vnd.google-apps.folder'");
  }

  const q = encodeURIComponent(parts.join(" and "));
  const pageSize = options.pageSize ?? 200;
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime)");

  let url = `${DRIVE_API_BASE}/files?q=${q}&fields=${fields}&pageSize=${pageSize}`;
  if (options.orderBy) {
    url += `&orderBy=${encodeURIComponent(options.orderBy)}`;
  }
  const res = await fetch(url, { headers: authHeaders(token) });

  const text = await res.text();
  if (!res.ok) {
    throwForFailedDriveResponse(
      res,
      "Drive listFolderChildren failed",
      text.slice(0, 300),
    );
  }

  const data = JSON.parse(text) as { files?: DriveFile[] };
  return data.files ?? [];
}

/**
 * Gets metadata (id, name, mimeType) for a single Drive item.
 */
export async function getFolderMetadata(
  token: string,
  folderId: string,
): Promise<DriveFile> {
  const fields = encodeURIComponent("id,name,mimeType");
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(folderId)}?fields=${fields}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  const text = await res.text();
  if (!res.ok) {
    throwForFailedDriveResponse(
      res,
      "Drive getFolderMetadata failed",
      text.slice(0, 300),
    );
  }

  return JSON.parse(text) as DriveFile;
}

/**
 * Gets Drive metadata for any file or folder id, including `parents` when present.
 */
export async function getDriveItemMetadata(
  token: string,
  fileId: string,
): Promise<DriveItemMetadata> {
  const fields = encodeURIComponent("id,name,mimeType,parents");
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=${fields}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  const text = await res.text();
  if (!res.ok) {
    throwForFailedDriveResponse(
      res,
      "Drive getDriveItemMetadata failed",
      text.slice(0, 300),
    );
  }

  return JSON.parse(text) as DriveItemMetadata;
}

/**
 * Finds a child item by exact name within a parent folder.
 * Returns the first match, or null if not found.
 */
export async function findChildByName(
  token: string,
  parentId: string,
  name: string,
  mimeType?: string,
): Promise<DriveFile | null> {
  const nameSafe = name.replace(/'/g, "\\'");
  const parts: string[] = [
    `'${parentId}' in parents`,
    "trashed = false",
    `name = '${nameSafe}'`,
  ];
  if (mimeType) {
    parts.push(`mimeType = '${mimeType}'`);
  }

  const q = encodeURIComponent(parts.join(" and "));
  const fields = encodeURIComponent("files(id,name,mimeType)");
  const url = `${DRIVE_API_BASE}/files?q=${q}&fields=${fields}&pageSize=1`;

  const res = await fetch(url, { headers: authHeaders(token) });
  const text = await res.text();
  if (!res.ok) {
    throwForFailedDriveResponse(
      res,
      "Drive findChildByName failed",
      text.slice(0, 300),
    );
  }

  const data = JSON.parse(text) as { files?: DriveFile[] };
  return data.files?.[0] ?? null;
}

/**
 * Downloads file content from Drive. Returns an ArrayBuffer.
 * For Google native formats (Docs, Sheets), throws — use export instead.
 */
export async function downloadFile(
  token: string,
  fileId: string,
): Promise<ArrayBuffer> {
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`;
  const res = await fetch(url, { headers: authHeaders(token) });

  if (!res.ok) {
    const text = await res.text();
    throwForFailedDriveResponse(
      res,
      "Drive downloadFile failed",
      text.slice(0, 300),
    );
  }

  return res.arrayBuffer();
}

/**
 * Grants "anyone with the link" reader access to a Drive file.
 * Required before downloading with an API key, which can only access publicly-shared files.
 */
export async function shareDriveFile(
  token: string,
  fileId: string,
): Promise<void> {
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/permissions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "reader",
      type: "anyone",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throwForFailedDriveResponse(
      res,
      "Drive shareDriveFile failed",
      text.slice(0, 300),
    );
  }
}

/**
 * Finds a folder by name inside a parent, or creates it if it doesn't exist.
 * Uses folder mimeType so the result is always a Drive folder.
 */
export async function findOrCreateFolder(
  token: string,
  parentId: string,
  folderName: string,
): Promise<DriveFile> {
  const FOLDER_MIME = "application/vnd.google-apps.folder";

  const existing = await findChildByName(token, parentId, folderName, FOLDER_MIME);
  if (existing) return existing;

  const url = `${DRIVE_API_BASE}/files?fields=${encodeURIComponent("id,name,mimeType")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throwForFailedDriveResponse(
      res,
      "Drive createFolder failed",
      text.slice(0, 300),
    );
  }

  return (await res.json()) as DriveFile;
}

/**
 * Copies a Drive file into a destination folder.
 * Returns the new file metadata.
 */
export async function copyFile(
  token: string,
  sourceFileId: string,
  destFolderId: string,
  newName?: string,
): Promise<DriveFile> {
  const fields = encodeURIComponent("id,name,mimeType");
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(sourceFileId)}/copy?fields=${fields}`;
  const body: Record<string, unknown> = { parents: [destFolderId] };
  if (newName) body.name = newName;

  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throwForFailedDriveResponse(
      res,
      "Drive copyFile failed",
      text.slice(0, 300),
    );
  }

  return (await res.json()) as DriveFile;
}

/**
 * Creates or updates a file in a Drive folder.
 * Searches for an existing file by name; if found, updates its content.
 * If not found, creates a new file using multipart upload.
 */
export async function uploadOrUpdateFile(
  token: string,
  folderId: string,
  fileName: string,
  content: string | Buffer | ArrayBuffer,
  mimeType: string,
): Promise<DriveFile> {
  const existing = await findChildByName(token, folderId, fileName);

  if (existing) {
    return updateFileContentById(token, existing.id, content, mimeType);
  }

  // Create new file with multipart upload so we can set the parent folder
  const boundary = "-------appraisal_drive_upload_boundary";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });

  const contentBuffer =
    typeof content === "string"
      ? new TextEncoder().encode(content)
      : content instanceof ArrayBuffer
        ? content
        : content;

  const metadataPart =
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}` +
    `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;

  const metadataBytes = new TextEncoder().encode(metadataPart);
  const closeBytes = new TextEncoder().encode(closeDelimiter);

  const body = new Uint8Array(
    metadataBytes.byteLength +
      (contentBuffer instanceof ArrayBuffer
        ? contentBuffer.byteLength
        : (contentBuffer as Buffer).length) +
      closeBytes.byteLength,
  );
  body.set(metadataBytes, 0);
  body.set(
    new Uint8Array(
      contentBuffer instanceof ArrayBuffer
        ? contentBuffer
        : (contentBuffer as Buffer).buffer,
    ),
    metadataBytes.byteLength,
  );
  body.set(
    closeBytes,
    metadataBytes.byteLength +
      (contentBuffer instanceof ArrayBuffer
        ? contentBuffer.byteLength
        : (contentBuffer as Buffer).length),
  );

  const url = `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": `multipart/related; boundary="${boundary}"`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throwForFailedDriveResponse(
      res,
      "Drive uploadFile failed",
      text.slice(0, 300),
    );
  }

  return (await res.json()) as DriveFile;
}

/**
 * Overwrites a Drive file's media content in place (by file id).
 */
export async function updateFileContentById(
  token: string,
  fileId: string,
  content: string | Buffer | ArrayBuffer,
  mimeType: string,
): Promise<DriveFile> {
  const url = `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=media`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      ...authHeaders(token),
      "Content-Type": mimeType,
    },
    body: content,
  });

  if (!res.ok) {
    const text = await res.text();
    throwForFailedDriveResponse(
      res,
      "Drive updateFile failed",
      text.slice(0, 300),
    );
  }

  return (await res.json()) as DriveFile;
}
