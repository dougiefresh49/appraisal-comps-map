import { NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";

/**
 * Proxy Supabase Storage objects from the private `chat-attachments` bucket
 * so the client can preview them in ImageZoomLightbox (same-origin fetch).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: pathSegments } = await params;
    if (!pathSegments?.length) {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const storagePath = pathSegments.join("/");
    if (!storagePath || storagePath.includes("..")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const firstFolder = pathSegments[0];
    if (firstFolder !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: blob, error } = await supabase.storage
      .from("chat-attachments")
      .download(storagePath);

    if (error || !blob) {
      console.error("[GET /api/chat/attachment]", error);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buf = Buffer.from(await blob.arrayBuffer());

    return new Response(buf, {
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[GET /api/chat/attachment]", e);
    return NextResponse.json({ error: "Failed to load file" }, { status: 500 });
  }
}
