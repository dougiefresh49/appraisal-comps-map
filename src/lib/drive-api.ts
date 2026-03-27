/**
 * Google Drive API v3 utility — all operations use OAuth Bearer token auth.
 * The token is obtained from the user's Supabase session (provider_token).
 * This means operations run as the authenticated user with the same permissions
 * they have in Google Drive — no service account required.
 */

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export interface DriveListOptions {
  foldersOnly?: boolean;
  filesOnly?: boolean;
  pageSize?: number;
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
  const fields = encodeURIComponent("files(id,name,mimeType)");

  const url = `${DRIVE_API_BASE}/files?q=${q}&fields=${fields}&pageSize=${pageSize}`;
  const res = await fetch(url, { headers: authHeaders(token) });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Drive listFolderChildren failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { files?: DriveFile[] };
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Drive getFolderMetadata failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  return (await res.json()) as DriveFile;
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Drive findChildByName failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { files?: DriveFile[] };
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
    throw new Error(
      `Drive downloadFile failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  return res.arrayBuffer();
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
    // Update existing file content
    const url = `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(existing.id)}?uploadType=media`;
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
      throw new Error(
        `Drive updateFile failed (${res.status}): ${text.slice(0, 300)}`,
      );
    }

    return (await res.json()) as DriveFile;
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
    throw new Error(
      `Drive uploadFile failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  return (await res.json()) as DriveFile;
}
