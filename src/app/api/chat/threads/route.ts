import { NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";
import {
  listThreads,
  createThread,
  archiveThread,
  renameThread,
} from "~/lib/chat-persistence";

// GET /api/chat/threads?projectId=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const threads = await listThreads(projectId, user.id);
    return NextResponse.json({ threads });
  } catch (error) {
    console.error("[GET /api/chat/threads]", error);
    return NextResponse.json({ error: "Failed to list threads" }, { status: 500 });
  }
}

// POST /api/chat/threads  { projectId, title? }
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { projectId?: string; title?: string };
    const projectId = body.projectId;
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const thread = await createThread(projectId, user.id, body.title);
    return NextResponse.json({ thread });
  } catch (error) {
    console.error("[POST /api/chat/threads]", error);
    return NextResponse.json({ error: "Failed to create thread" }, { status: 500 });
  }
}

// PATCH /api/chat/threads  { threadId, title?, archived? }
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      threadId?: string;
      title?: string;
      archived?: boolean;
    };
    const threadId = body.threadId;
    if (!threadId) {
      return NextResponse.json({ error: "threadId is required" }, { status: 400 });
    }

    // Verify auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (body.archived === true) {
      await archiveThread(threadId);
      return NextResponse.json({ ok: true });
    }

    if (typeof body.title === "string") {
      await renameThread(threadId, body.title);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  } catch (error) {
    console.error("[PATCH /api/chat/threads]", error);
    return NextResponse.json({ error: "Failed to update thread" }, { status: 500 });
  }
}
