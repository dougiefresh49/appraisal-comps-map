/**
 * Download a file from Google Drive by file ID.
 * Uses GOOGLE_DRIVE_API_KEY for authentication — only works for files
 * shared with "anyone with the link" or public files.
 * If the file is private, throws a descriptive error suggesting direct upload instead.
 */
export async function downloadDriveFile(
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_DRIVE_API_KEY is not configured — upload the file directly instead",
    );
  }

  const metaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=mimeType,name&key=${apiKey}`;
  const metaRes = await fetch(metaUrl);

  if (!metaRes.ok) {
    if (metaRes.status === 404) {
      throw new Error(
        `File not found on Google Drive (ID: ${fileId}). Ensure the file is shared with "anyone with the link" or upload it directly.`,
      );
    }
    if (metaRes.status === 403) {
      throw new Error(
        `Access denied for Drive file (ID: ${fileId}). The file must be shared with "anyone with the link", or upload it directly instead.`,
      );
    }
    const text = await metaRes.text();
    throw new Error(
      `Failed to fetch file metadata from Drive: ${metaRes.status} ${text}`,
    );
  }

  const meta = (await metaRes.json()) as { mimeType: string; name: string };
  const isGoogleNativeFormat = meta.mimeType.startsWith(
    "application/vnd.google-apps.",
  );

  let downloadUrl: string;
  let finalMimeType: string;

  if (isGoogleNativeFormat) {
    const exportMime =
      meta.mimeType === "application/vnd.google-apps.document"
        ? "application/pdf"
        : meta.mimeType === "application/vnd.google-apps.spreadsheet"
          ? "text/csv"
          : "application/pdf";

    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}&key=${apiKey}`;
    finalMimeType = exportMime;
  } else {
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${apiKey}`;
    finalMimeType = meta.mimeType;
  }

  const downloadRes = await fetch(downloadUrl);

  if (!downloadRes.ok) {
    const text = await downloadRes.text();
    throw new Error(
      `Failed to download file from Drive: ${downloadRes.status} ${text.substring(0, 200)}`,
    );
  }

  const arrayBuffer = await downloadRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return { buffer, mimeType: finalMimeType };
}
