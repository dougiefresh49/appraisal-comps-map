import "server-only";

import { createClient } from "~/utils/supabase/server";
import { generateReportSection } from "~/lib/gemini";
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
): Promise<void> {
  if (messages.length === 0) return;
  const supabase = await createClient();

  const rows = messages.map((m) => ({
    thread_id: threadId,
    role: m.role,
    content: m.content,
    mentions: m.mentions ?? null,
    tool_result: m.tool_result ?? null,
    sort_order: m.sort_order,
  }));

  const { error } = await supabase.from("chat_messages").insert(rows);
  if (error) throw error;
}

export async function loadMessages(threadId: string): Promise<PersistedMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, thread_id, role, content, mentions, tool_result, sort_order, created_at")
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
    toolResult: (row.tool_result as PersistedMessage["toolResult"]) ?? null,
    sortOrder: (row.sort_order as number) ?? 0,
    createdAt: row.created_at as string,
  };
}
