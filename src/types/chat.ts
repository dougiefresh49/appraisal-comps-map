// Shared chat types used by both server (persistence) and client (hooks, components).

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
  /** Stored ToolResult JSON for tool messages */
  toolResult: {
    toolName: string;
    args: Record<string, string>;
    success: boolean;
    message: string;
  } | null;
  sortOrder: number;
  createdAt: string;
}

export interface MessageToSave {
  role: "user" | "assistant" | "tool";
  content: string;
  mentions?: unknown;
  tool_result?: unknown;
  sort_order: number;
}
