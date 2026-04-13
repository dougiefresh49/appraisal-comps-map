import "server-only";

import { createClient } from "~/utils/supabase/server";
import { generateReportSection } from "~/lib/gemini";
import type { GeminiChatUsagePayload } from "~/lib/gemini-usage";
import type { ChatThread, PersistedMessage, MessageToSave } from "~/types/chat";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** RPC rows are untyped until generated Supabase types include this function. */
function threadRowsFromRpcData(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isRecord);
}

// ---------------------------------------------------------------------------
// Thread CRUD
// ---------------------------------------------------------------------------

export async function createThread(
  projectId: string,
  userId: string,
  title?: string,
): Promise<ChatThread> {
  const supabase = await createClient();
  const insertResult = await supabase
    .from("chat_threads")
    .insert({ project_id: projectId, user_id: userId, title: title ?? null })
    .select()
    .single();

  if (insertResult.error) throw insertResult.error;
  return rowToThread(insertResult.data as Record<string, unknown>);
}

async function listThreadsForProject(
  projectId: string,
  userId: string,
  archivedOnly: boolean,
): Promise<ChatThread[]> {
  const supabase = await createClient();
  const rpcResult = await supabase.rpc("list_chat_threads_for_project", {
    project_uuid: projectId,
    user_uuid: userId,
    archived_only: archivedOnly,
  });

  if (rpcResult.error) throw rpcResult.error;
  return threadRowsFromRpcData(rpcResult.data).map(rowToThread);
}

/** Active threads, ordered by last message time (falls back to thread created_at if empty). */
export async function listThreads(
  projectId: string,
  userId: string,
): Promise<ChatThread[]> {
  return listThreadsForProject(projectId, userId, false);
}

/** Archived threads, same ordering as active list. */
export async function listArchivedThreads(
  projectId: string,
  userId: string,
): Promise<ChatThread[]> {
  return listThreadsForProject(projectId, userId, true);
}

export async function archiveThread(threadId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_threads")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", threadId);

  if (error) throw error;
}

export async function unarchiveThread(threadId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_threads")
    .update({ archived_at: null })
    .eq("id", threadId);

  if (error) throw error;
}

export async function renameThread(threadId: string, title: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_threads")
    .update({ title })
    .eq("id", threadId);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Message persistence
// ---------------------------------------------------------------------------

export async function saveMessages(
  threadId: string,
  messages: MessageToSave[],
): Promise<{ id: string; role: string }[]> {
  if (messages.length === 0) return [];
  const supabase = await createClient();

  const rows = messages.map((m) => ({
    thread_id: threadId,
    role: m.role,
    content: m.content,
    mentions: m.mentions ?? null,
    attachments: m.attachments ?? null,
    tool_result: m.tool_result ?? null,
    model_used: m.model_used ?? null,
    sort_order: m.sort_order,
  }));

  const { data, error } = await supabase
    .from("chat_messages")
    .insert(rows)
    .select("id, role");

  if (error) throw error;
  return (data ?? []) as { id: string; role: string }[];
}

export async function insertGeminiChatUsage(opts: {
  projectId: string;
  threadId: string;
  userId: string;
  assistantMessageId: string | null;
  payload: GeminiChatUsagePayload;
}): Promise<void> {
  const { payload } = opts;
  if (payload.calls.length === 0) return;

  const responseIds = payload.calls
    .map((c) => c.responseId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const supabase = await createClient();
  const { error } = await supabase.from("gemini_chat_usage").insert({
    project_id: opts.projectId,
    thread_id: opts.threadId,
    user_id: opts.userId,
    assistant_message_id: opts.assistantMessageId,
    model: payload.model,
    generate_calls: payload.calls.length,
    prompt_tokens: payload.totals.promptTokens,
    candidates_tokens: payload.totals.candidatesTokens,
    total_tokens: payload.totals.totalTokens,
    response_ids: responseIds,
    calls: payload.calls,
  });

  if (error) throw error;
}

export async function loadMessages(threadId: string): Promise<PersistedMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select(
      "id, thread_id, role, content, mentions, attachments, tool_result, model_used, sort_order, created_at",
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(rowToMessage);
}

// ---------------------------------------------------------------------------
// Auto-title generation
// ---------------------------------------------------------------------------

export async function generateThreadTitle(firstMessage: string): Promise<string> {
  const prompt = `Generate a short 3-6 word title for a chat conversation that starts with this message. Return ONLY the title, no quotes, no punctuation at the end, no explanation.\n\nMessage: ${firstMessage.slice(0, 300)}`;
  const raw = await generateReportSection(prompt);
  return raw.trim().replace(/^["']|["']$/g, "").slice(0, 80);
}

// ---------------------------------------------------------------------------
// Row mapping helpers
// ---------------------------------------------------------------------------

function rowToThread(row: Record<string, unknown>): ChatThread {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    userId: row.user_id as string,
    title: (row.title as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    archivedAt: (row.archived_at as string | null) ?? null,
    lastMessageAt:
      typeof row.last_message_at === "string" ? row.last_message_at : null,
  };
}

function rowToMessage(row: Record<string, unknown>): PersistedMessage {
  return {
    id: row.id as string,
    threadId: row.thread_id as string,
    role: row.role as "user" | "assistant" | "tool",
    content: (row.content as string) ?? "",
    mentions: (row.mentions as PersistedMessage["mentions"]) ?? null,
    attachments: (row.attachments as PersistedMessage["attachments"]) ?? null,
    toolResult: (row.tool_result as PersistedMessage["toolResult"]) ?? null,
    modelUsed:
      typeof row.model_used === "string" && row.model_used.length > 0
        ? row.model_used
        : null,
    sortOrder: (row.sort_order as number) ?? 0,
    createdAt: row.created_at as string,
  };
}
