import {
  buildChatPrompt,
  type ChatMention,
  type ChatMessage,
} from "~/lib/chat-context";
import { generateChatStream } from "~/lib/gemini";
import { classifyQuery } from "~/lib/chat-router";
import {
  DEFAULT_CHAT_MODEL_PRESET,
  isChatModelPresetId,
  PRESET_TO_GEMINI_MODEL,
  type ChatModelPresetId,
} from "~/lib/chat-model-presets";
import {
  createThread,
  saveMessages,
  generateThreadTitle,
  renameThread,
  insertGeminiChatUsage,
} from "~/lib/chat-persistence";
import type { GeminiChatUsagePayload } from "~/lib/gemini-usage";
import { createClient } from "~/utils/supabase/server";
import {
  fileToGeminiPart,
  uploadChatAttachments,
} from "~/lib/chat-attachments";
import type { Part } from "@google/genai";
import type { ChatAttachment, MessageToSave } from "~/types/chat";

interface ChatRequestBody {
  projectId?: string;
  message?: string;
  mentions?: ChatMention[];
  history?: ChatMessage[];
  threadId?: string | null;
  /** User-selected model tier; omit or "auto" to use the query classifier */
  modelPreset?: string;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

const PLACEHOLDER_ATTACHMENT_ONLY =
  "(The user attached file(s). Analyze the attached image(s) or PDF and answer their question.)";

function parseModelPreset(raw: unknown): ChatModelPresetId {
  if (raw === undefined || raw === null || raw === "") {
    return DEFAULT_CHAT_MODEL_PRESET;
  }
  return isChatModelPresetId(raw) ? raw : DEFAULT_CHAT_MODEL_PRESET;
}

async function resolveGeminiModelId(opts: {
  preset: ChatModelPresetId;
  userMessageForModel: string;
  subjectAddress?: string;
}): Promise<string> {
  if (opts.preset === "auto") {
    const { model } = await classifyQuery(
      opts.userMessageForModel,
      opts.subjectAddress,
    );
    return model;
  }
  return PRESET_TO_GEMINI_MODEL[opts.preset];
}

export async function POST(request: Request) {
  try {
    const contentTypeHeader = request.headers.get("content-type") ?? "";

    if (contentTypeHeader.includes("multipart/form-data")) {
      return handleMultipartPost(request);
    }

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

    const modelPreset = parseModelPreset(body.modelPreset);

    return await runChatAndRespond({
      projectId,
      userMessageForModel: message.trim(),
      userMessageToSave: message.trim(),
      mentions,
      history,
      threadId: body.threadId ?? null,
      attachmentParts: undefined,
      attachmentsForClientAndDb: null,
      modelPreset,
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

async function handleMultipartPost(request: Request) {
  const formData = await request.formData();
  const projectId = formData.get("projectId");
  if (typeof projectId !== "string" || !projectId) {
    return new Response(JSON.stringify({ error: "projectId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawMessage = formData.get("message");
  const message =
    typeof rawMessage === "string" ? rawMessage : "";

  let mentions: ChatMention[] = [];
  const rawMentions = formData.get("mentions");
  if (typeof rawMentions === "string" && rawMentions.trim()) {
    try {
      const parsed = JSON.parse(rawMentions) as unknown;
      if (Array.isArray(parsed)) {
        mentions = parsed.filter((m): m is ChatMention => {
          if (typeof m !== "object" || m === null) return false;
          const o = m as { type?: unknown; id?: unknown };
          return (
            (o.type === "doc" || o.type === "comp" || o.type === "project") &&
            typeof o.id === "string"
          );
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: "Invalid mentions JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  let history: ChatMessage[] = [];
  const rawHistory = formData.get("history");
  if (typeof rawHistory === "string" && rawHistory.trim()) {
    try {
      const parsed = JSON.parse(rawHistory) as unknown;
      if (Array.isArray(parsed)) {
        history = parsed.filter((m): m is ChatMessage => {
          if (typeof m !== "object" || m === null) return false;
          const o = m as { role?: unknown; content?: unknown };
          return (
            (o.role === "user" || o.role === "assistant") &&
            typeof o.content === "string"
          );
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: "Invalid history JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const threadIdRaw = formData.get("threadId");
  const threadId =
    threadIdRaw === null || threadIdRaw === ""
      ? null
      : typeof threadIdRaw === "string"
        ? threadIdRaw
        : null;

  const fileEntries = formData.getAll("files");
  const files: File[] = [];
  for (const entry of fileEntries) {
    if (entry instanceof File && entry.size > 0) files.push(entry);
  }

  if (files.length === 0) {
    return new Response(
      JSON.stringify({ error: "At least one file is required for multipart chat" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const uploaded = await uploadChatAttachments(
    supabase,
    user.id,
    projectId,
    files,
  );

  const attachmentParts: Part[] = [];
  for (const f of files) {
    attachmentParts.push(await fileToGeminiPart(f));
  }

  const trimmed = message.trim();
  const userMessageForModel = trimmed || PLACEHOLDER_ATTACHMENT_ONLY;
  const userMessageToSave = trimmed;

  const modelPreset = parseModelPreset(formData.get("modelPreset"));

  return await runChatAndRespond({
    projectId,
    userMessageForModel,
    userMessageToSave,
    mentions,
    history,
    threadId,
    attachmentParts,
    attachmentsForClientAndDb: uploaded,
    modelPreset,
  });
}

async function runChatAndRespond(opts: {
  projectId: string;
  userMessageForModel: string;
  userMessageToSave: string;
  mentions: ChatMention[];
  history: ChatMessage[];
  threadId: string | null;
  attachmentParts: Part[] | undefined;
  attachmentsForClientAndDb: ChatAttachment[] | null;
  modelPreset: ChatModelPresetId;
}): Promise<Response> {
  const {
    projectId,
    userMessageForModel,
    userMessageToSave,
    mentions,
    history,
    threadId: initialThreadId,
    attachmentParts,
    attachmentsForClientAndDb,
    modelPreset,
  } = opts;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let resolvedThreadId: string | null = initialThreadId;
  let isNewThread = false;

  if (user) {
    if (!resolvedThreadId) {
      isNewThread = true;
      const thread = await createThread(projectId, user.id);
      resolvedThreadId = thread.id;
    }
  }

  const { systemPrompt, contents } = await buildChatPrompt(
    projectId,
    userMessageForModel,
    mentions,
    history,
  );

  const subjectAddress = extractSubjectAddress(systemPrompt);
  const model = await resolveGeminiModelId({
    preset: modelPreset,
    userMessageForModel,
    subjectAddress,
  });

  const rawStream = await generateChatStream(
    systemPrompt,
    contents,
    projectId,
    model,
    attachmentParts,
  );

  if (resolvedThreadId) {
    const [responseStream, persistStream] = rawStream.tee();

    void persistTurn(persistStream, {
      threadId: resolvedThreadId,
      projectId,
      userId: user?.id ?? null,
      userMessage: userMessageToSave,
      userMentions: mentions,
      userAttachments: attachmentsForClientAndDb,
      isNewThread,
      geminiModelId: model,
    }).catch((err: unknown) => {
      console.error("[chat persistence] background persist failed:", err);
    });

    let out: ReadableStream<Uint8Array> = responseStream;

    if (
      attachmentsForClientAndDb &&
      attachmentsForClientAndDb.length > 0
    ) {
      out = prependSSEEvent(out, {
        attachments: attachmentsForClientAndDb.map(stripPreviewUrl),
      });
    }

    if (isNewThread) {
      out = prependSSEEvent(out, { threadId: resolvedThreadId });
    }

    out = prependSSEEvent(out, { modelUsed: model });

    return new Response(out, { headers: SSE_HEADERS });
  }

  if (
    attachmentsForClientAndDb &&
    attachmentsForClientAndDb.length > 0
  ) {
    let withMeta = prependSSEEvent(rawStream, {
      attachments: attachmentsForClientAndDb.map(stripPreviewUrl),
    });
    withMeta = prependSSEEvent(withMeta, { modelUsed: model });
    return new Response(withMeta, { headers: SSE_HEADERS });
  }

  const withModel = prependSSEEvent(rawStream, { modelUsed: model });
  return new Response(withModel, { headers: SSE_HEADERS });
}

function stripPreviewUrl(a: ChatAttachment): ChatAttachment {
  return {
    fileName: a.fileName,
    mimeType: a.mimeType,
    storagePath: a.storagePath,
    size: a.size,
  };
}

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

function userIdFromChatThreadRow(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const uid = (data as Record<string, unknown>).user_id;
  return typeof uid === "string" ? uid : null;
}

function isGeminiChatUsagePayload(
  value: unknown,
): value is GeminiChatUsagePayload {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  if (typeof o.model !== "string" || !Array.isArray(o.calls)) return false;
  const t = o.totals;
  if (typeof t !== "object" || t === null) return false;
  const totals = t as Record<string, unknown>;
  return (
    typeof totals.promptTokens === "number" &&
    typeof totals.candidatesTokens === "number" &&
    typeof totals.totalTokens === "number"
  );
}

async function persistTurn(
  stream: ReadableStream<Uint8Array>,
  opts: {
    threadId: string;
    projectId: string;
    userId: string | null;
    userMessage: string;
    userMentions: ChatMention[];
    userAttachments: ChatAttachment[] | null;
    isNewThread: boolean;
    geminiModelId: string;
  },
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";
  let geminiUsage: GeminiChatUsagePayload | null = null;
  const toolMessages: Array<{
    toolName: string;
    args: Record<string, string>;
    success: boolean;
    message: string;
  }> = [];

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
            "geminiUsage" in parsed
          ) {
            const raw = (parsed as { geminiUsage: unknown }).geminiUsage;
            if (isGeminiChatUsagePayload(raw)) {
              geminiUsage = raw;
            }
          }
        } catch {
          // ignore SSE parse errors
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const hasUserText = opts.userMessage.trim().length > 0;
  const hasAttachments =
    opts.userAttachments !== null && opts.userAttachments.length > 0;
  if (!hasUserText && !hasAttachments && !assistantText.trim()) return;

  const messages: MessageToSave[] = [
    {
      role: "user",
      content: opts.userMessage,
      mentions:
        opts.userMentions.length > 0
          ? (opts.userMentions as unknown)
          : undefined,
      attachments:
        hasAttachments && opts.userAttachments
          ? (opts.userAttachments.map(stripPreviewUrl) as unknown)
          : undefined,
      sort_order: 0,
    },
    ...toolMessages.map((tr, i) => ({
      role: "tool" as const,
      content: tr.message,
      tool_result: tr as unknown,
      sort_order: i + 1,
    })),
    ...(assistantText.trim()
      ? [
          {
            role: "assistant" as const,
            content: assistantText,
            model_used: opts.geminiModelId,
            sort_order: toolMessages.length + 1,
          },
        ]
      : []),
  ];

  const insertedRows = await saveMessages(opts.threadId, messages);
  const assistantMessageId =
    insertedRows.find((r) => r.role === "assistant")?.id ?? null;

  let userIdForUsage = opts.userId;
  if (!userIdForUsage) {
    const supabase = await createClient();
    const threadLookup = await supabase
      .from("chat_threads")
      .select("user_id")
      .eq("id", opts.threadId)
      .maybeSingle();
    if (!threadLookup.error) {
      userIdForUsage =
        userIdFromChatThreadRow(threadLookup.data) ?? userIdForUsage;
    }
  }

  if (userIdForUsage && geminiUsage && geminiUsage.calls.length > 0) {
    try {
      await insertGeminiChatUsage({
        projectId: opts.projectId,
        threadId: opts.threadId,
        userId: userIdForUsage,
        assistantMessageId,
        payload: geminiUsage,
      });
    } catch (usageErr) {
      console.error("[chat persistence] gemini usage insert failed:", usageErr);
    }
  }

  if (opts.isNewThread && (hasUserText || hasAttachments)) {
    const firstAtt = opts.userAttachments?.[0];
    const titleSeed =
      opts.userMessage.trim() ||
      (firstAtt?.fileName
        ? `Attached ${firstAtt.fileName}`
        : "Chat");
    const title = await generateThreadTitle(titleSeed);
    await renameThread(opts.threadId, title);
  }
}

function extractSubjectAddress(systemPrompt: string): string | undefined {
  const match = /Address:\s*(.+)/i.exec(systemPrompt);
  return match?.[1]?.trim();
}
