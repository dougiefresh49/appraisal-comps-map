// Shared chat types used by both server (persistence) and client (hooks, components).

/** Metadata for a file attached to a user chat message (stored in Supabase Storage). */
export interface ChatAttachment {
  fileName: string;
  mimeType: string;
  /** Path within bucket `chat-attachments` (e.g. `{userId}/{projectId}/...`). */
  storagePath: string;
  size: number;
  /** Ephemeral blob URL for optimistic UI before storage path is known (client-only; not persisted). */
  previewUrl?: string;
}

export interface ChatThread {
  id: string;
  projectId: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  /** Latest `chat_messages.created_at` in this thread; omit/null if none yet (list RPC fills this). */
  lastMessageAt?: string | null;
}

export interface PersistedMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  /** Stored ResolvedMention[] JSON for user messages */
  mentions: Array<{ type: "doc" | "comp" | "project"; id: string; label?: string }> | null;
  /** Stored ChatAttachment[] JSON for user messages with uploads */
  attachments: ChatAttachment[] | null;
  /** Stored ToolResult JSON for tool messages */
  toolResult: {
    toolName: string;
    args: Record<string, string>;
    success: boolean;
    message: string;
  } | null;
  /** Resolved Gemini model id for assistant messages (e.g. gemini-3-flash-preview). */
  modelUsed: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface MessageToSave {
  role: "user" | "assistant" | "tool";
  content: string;
  mentions?: unknown;
  attachments?: unknown;
  tool_result?: unknown;
  /** Gemini model id; set only for assistant messages */
  model_used?: string | null;
  sort_order: number;
}
