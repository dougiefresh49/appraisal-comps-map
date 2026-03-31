import { type NextRequest, NextResponse } from "next/server";
import { getGoogleToken } from "~/utils/supabase/server";

const DRIVE_MEDIA = "https://www.googleapis.com/drive/v3/files";

/** Drive file IDs are alphanumeric, underscore, hyphen. */
const FILE_ID_RE = /^[a-zA-Z0-9_-]+$/;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    const { fileId } = await context.params;
    if (!fileId || !FILE_ID_RE.test(fileId)) {
      return NextResponse.json({ error: "Invalid fileId" }, { status: 400 });
    }

    const { token, error: driveAuthError, code } = await getGoogleToken();
    if (!token) {
      return NextResponse.json(
        {
          error:
            driveAuthError ??
            "Not authenticated — please sign in to grant Drive access",
          code,
        },
        { status: 401 },
      );
    }

    const url = `${DRIVE_MEDIA}/${encodeURIComponent(fileId)}?alt=media`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(
        "Drive file media error:",
        res.status,
        text.slice(0, 240),
      );
      return NextResponse.json(
        { error: "Failed to load file from Drive" },
        { status: res.status === 404 ? 404 : 502 },
      );
    }

    const contentType =
      res.headers.get("content-type") ?? "application/octet-stream";
    const buf = await res.arrayBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("Drive file route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load file" },
      { status: 500 },
    );
  }
}
