import { type NextRequest, NextResponse } from "next/server";
import { getGoogleToken } from "~/utils/supabase/server";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const FILE_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Authenticated thumbnail proxy for Google Drive images.
 *
 * Uses the Drive API `thumbnailLink` (which resolves to lh3.googleusercontent.com)
 * with the user's OAuth Bearer token, avoiding the per-IP rate limits of the
 * unauthenticated `drive.google.com/thumbnail` endpoint.
 *
 * Query params:
 *   sz  – thumbnail size in px (longest edge), default 400
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    const { fileId } = await context.params;
    if (!fileId || !FILE_ID_RE.test(fileId)) {
      return NextResponse.json({ error: "Invalid fileId" }, { status: 400 });
    }

    const { token, error: authError, code } = await getGoogleToken();
    if (!token) {
      return NextResponse.json(
        { error: authError ?? "Not authenticated", code },
        { status: 401 },
      );
    }

    const sz = request.nextUrl.searchParams.get("sz") ?? "400";
    const authHeaders = { Authorization: `Bearer ${token}` };

    const metaUrl = `${DRIVE_API}/${encodeURIComponent(fileId)}?fields=thumbnailLink`;
    const metaRes = await fetch(metaUrl, { headers: authHeaders });

    if (!metaRes.ok) {
      const text = await metaRes.text();
      console.error("Drive thumbnail meta error:", metaRes.status, text.slice(0, 240));
      return NextResponse.json(
        { error: "File not found or inaccessible" },
        { status: metaRes.status === 404 ? 404 : 502 },
      );
    }

    const meta = (await metaRes.json()) as { thumbnailLink?: string };

    let thumbUrl: string;
    if (meta.thumbnailLink) {
      thumbUrl = meta.thumbnailLink.replace(/=s\d+$/, `=s${sz}`);
    } else {
      thumbUrl = `${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`;
    }

    const imgRes = await fetch(thumbUrl, { headers: authHeaders });

    if (!imgRes.ok) {
      console.error("Drive thumbnail fetch error:", imgRes.status);
      return NextResponse.json(
        { error: "Failed to fetch thumbnail" },
        { status: 502 },
      );
    }

    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    const buf = await imgRes.arrayBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("Drive thumbnail route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load thumbnail" },
      { status: 500 },
    );
  }
}
