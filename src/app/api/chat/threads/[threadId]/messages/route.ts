import { NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";
import { loadMessages } from "~/lib/chat-persistence";

// GET /api/chat/threads/[threadId]/messages
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await params;
    if (!threadId) {
      return NextResponse.json({ error: "threadId is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const messages = await loadMessages(threadId);
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("[GET /api/chat/threads/[threadId]/messages]", error);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}
