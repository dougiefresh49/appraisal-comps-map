import { buildChatPrompt, type ChatMention, type ChatMessage } from "~/lib/chat-context";
import { generateChatStream } from "~/lib/gemini";
import { classifyQuery } from "~/lib/chat-router";

interface ChatRequestBody {
  projectId?: string;
  message?: string;
  mentions?: ChatMention[];
  history?: ChatMessage[];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;

    const projectId = body.projectId;
    const message = body.message;
    if (!projectId || typeof projectId !== "string") {
      return new Response(JSON.stringify({ error: "projectId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const mentions: ChatMention[] = Array.isArray(body.mentions)
      ? body.mentions.filter(
          (m): m is ChatMention =>
            typeof m === "object" &&
            m !== null &&
            (m.type === "doc" || m.type === "comp" || m.type === "project") &&
            typeof m.id === "string",
        )
      : [];

    const history: ChatMessage[] = Array.isArray(body.history)
      ? body.history.filter(
          (m): m is ChatMessage =>
            typeof m === "object" &&
            m !== null &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string",
        )
      : [];

    const { systemPrompt, contents } = await buildChatPrompt(
      projectId,
      message.trim(),
      mentions,
      history,
    );

    // Classify the query to pick the right model tier:
    // data_lookup / update → Thinking (gemini-3-flash-preview)
    // analysis             → Pro (gemini-3.1-pro-preview)
    const subjectAddress = extractSubjectAddress(systemPrompt);
    const { model } = await classifyQuery(message.trim(), subjectAddress);

    const stream = await generateChatStream(systemPrompt, contents, projectId, model);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[/api/chat] error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Unexpected error in chat",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * Pull the subject address out of the already-built system prompt so we
 * can pass a brief hint to the classifier without re-querying the DB.
 */
function extractSubjectAddress(systemPrompt: string): string | undefined {
  const match = /Address:\s*(.+)/i.exec(systemPrompt);
  return match?.[1]?.trim();
}
