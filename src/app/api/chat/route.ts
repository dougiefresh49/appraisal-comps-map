import { buildChatPrompt, type ChatMention, type ChatMessage } from "~/lib/chat-context";
import { generateChatStream } from "~/lib/gemini";
import { classifyQuery } from "~/lib/chat-router";
import { createClient } from "~/utils/supabase/server";
import {
  createThread,
  saveMessages,
  generateThreadTitle,
  renameThread,
} from "~/lib/chat-persistence";
import type { MessageToSave } from "~/types/chat";

interface ChatRequestBody {
  projectId?: string;
  message?: string;
  mentions?: ChatMention[];
  history?: ChatMessage[];
  threadId?: string | null;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

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

    // -----------------------------------------------------------------------
    // Resolve thread + auth (gracefully falls back to no persistence)
    // -----------------------------------------------------------------------
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let resolvedThreadId: string | null = body.threadId ?? null;
    let isNewThread = false;

    if (user) {
      if (!resolvedThreadId) {
        isNewThread = true;
        const thread = await createThread(projectId, user.id);
        resolvedThreadId = thread.id;
      }
    }

    // -----------------------------------------------------------------------
    // Build prompt + classify
    // -----------------------------------------------------------------------
    const { systemPrompt, contents } = await buildChatPrompt(
      projectId,
      message.trim(),
      mentions,
      history,
    );

    const subjectAddress = extractSubjectAddress(systemPrompt);
    const { model } = await classifyQuery(message.trim(), subjectAddress);

    // -----------------------------------------------------------------------
    // Generate stream, tee for background persistence
    // -----------------------------------------------------------------------
    const rawStream = await generateChatStream(systemPrompt, contents, projectId, model);

    if (resolvedThreadId) {
      const [responseStream, persistStream] = rawStream.tee();

      void persistTurn(persistStream, {
        threadId: resolvedThreadId,
        userMessage: message.trim(),
        userMentions: mentions,
        isNewThread,
      }).catch((err: unknown) => {
        console.error("[chat persistence] background persist failed:", err);
      });

      // For new threads, prepend a threadId SSE event so the client knows the ID
      const finalStream = isNewThread
        ? prependSSEEvent(responseStream, { threadId: resolvedThreadId })
        : responseStream;

      return new Response(finalStream, { headers: SSE_HEADERS });
    }

    // No auth → stream directly without persistence
    return new Response(rawStream, { headers: SSE_HEADERS });
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

// ---------------------------------------------------------------------------
// Prepend a single SSE event before the rest of a stream
// ---------------------------------------------------------------------------
function prependSSEEvent(
  stream: ReadableStream<Uint8Array>,
  payload: Record<string, unknown>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const eventBytes = encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(eventBytes);
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        controller.close();
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Background: drain the persist branch, collect messages, save to DB
// ---------------------------------------------------------------------------
async function persistTurn(
  stream: ReadableStream<Uint8Array>,
  opts: {
    threadId: string;
    userMessage: string;
    userMentions: ChatMention[];
    isNewThread: boolean;
  },
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";
  const toolMessages: Array<{
    toolName: string;
    args: Record<string, string>;
    success: boolean;
    message: string;
  }> = [];
  let hadError = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload) as unknown;
          if (typeof parsed === "string") {
            assistantText += parsed;
          } else if (
            typeof parsed === "object" &&
            parsed !== null &&
            "toolResult" in parsed
          ) {
            const tr = (
              parsed as {
                toolResult: {
                  toolName: string;
                  args: Record<string, string>;
                  success: boolean;
                  message: string;
                };
              }
            ).toolResult;
            toolMessages.push(tr);
          } else if (
            typeof parsed === "object" &&
            parsed !== null &&
            "error" in parsed
          ) {
            hadError = true;
          }
        } catch {
          // ignore SSE parse errors
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Don't persist if the AI returned an error with no content
  if (hadError && !assistantText.trim()) return;

  const messages: MessageToSave[] = [
    {
      role: "user",
      content: opts.userMessage,
      mentions:
        opts.userMentions.length > 0
          ? (opts.userMentions as unknown)
          : undefined,
      sort_order: 0,
    },
    ...toolMessages.map((tr, i) => ({
      role: "tool" as const,
      content: tr.message,
      tool_result: tr as unknown,
      sort_order: i + 1,
    })),
    {
      role: "assistant",
      content: assistantText,
      sort_order: toolMessages.length + 1,
    },
  ];

  await saveMessages(opts.threadId, messages);

  // Auto-generate title for new threads after first message
  if (opts.isNewThread && opts.userMessage) {
    const title = await generateThreadTitle(opts.userMessage);
    await renameThread(opts.threadId, title);
  }
}

// ---------------------------------------------------------------------------
// Pull the subject address out of the system prompt for query classification
// ---------------------------------------------------------------------------
function extractSubjectAddress(systemPrompt: string): string | undefined {
  const match = /Address:\s*(.+)/i.exec(systemPrompt);
  return match?.[1]?.trim();
}
