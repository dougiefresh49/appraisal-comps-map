"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  XMarkIcon,
  PlusIcon,
  QueueListIcon,
  ArchiveBoxArrowDownIcon,
  PencilSquareIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/solid";
import dynamic from "next/dynamic";
import "@uiw/react-markdown-preview/markdown.css";
import { createClient } from "~/utils/supabase/client";
import { useProject } from "~/hooks/useProject";
import { useChatThreads } from "~/hooks/useChatThreads";
import {
  MentionComposer,
  stripMentionTokens,
  type MentionEntity,
  type ResolvedMention,
} from "~/components/MentionComposer";
import type { ChatMention, ChatMessage } from "~/lib/chat-context";
import type { ChatThread, PersistedMessage } from "~/types/chat";

const MarkdownPreview = dynamic(() => import("@uiw/react-markdown-preview"), {
  ssr: false,
  loading: () => (
    <div className="h-4 w-24 animate-pulse rounded bg-gray-800" />
  ),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolResult {
  toolName: string;
  args: Record<string, string>;
  success: boolean;
  message: string;
}

interface UIMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  mentions?: ResolvedMention[];
  toolResult?: ToolResult;
}

interface ChatPanelProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

const CHAT_PANEL_WIDTH_KEY = "ai-chat-panel-width";
const CHAT_PANEL_DEFAULT_WIDTH = 480;
const CHAT_PANEL_MIN_WIDTH = 300;
const CHAT_PANEL_MAX_WIDTH = 960;
const THREAD_SIDEBAR_WIDTH = 196;

function clampChatPanelWidth(px: number): number {
  if (typeof window === "undefined") {
    return Math.min(CHAT_PANEL_MAX_WIDTH, Math.max(CHAT_PANEL_MIN_WIDTH, px));
  }
  const maxByViewport = Math.max(
    CHAT_PANEL_MIN_WIDTH,
    Math.floor(window.innerWidth * 0.92),
  );
  const max = Math.min(CHAT_PANEL_MAX_WIDTH, maxByViewport);
  return Math.min(max, Math.max(CHAT_PANEL_MIN_WIDTH, px));
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function persistedToUIMessage(pm: PersistedMessage): UIMessage {
  return {
    id: pm.id,
    role: pm.role,
    content: pm.content,
    mentions: pm.mentions as ResolvedMention[] | undefined,
    toolResult: pm.toolResult as ToolResult | undefined,
  };
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export function ChatPanel({ projectId, isOpen, onClose }: ChatPanelProps) {
  const { project } = useProject(projectId);
  const {
    threads,
    activeThreadId,
    isLoadingThreads,
    setActiveThreadId,
    archiveThread,
    renameThread,
    refreshThreads,
    optimisticUpdateTitle,
  } = useChatThreads(projectId);

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [entities, setEntities] = useState<MentionEntity[]>([]);
  const [panelWidth, setPanelWidth] = useState(CHAT_PANEL_DEFAULT_WIDTH);
  const [isResizingChat, setIsResizingChat] = useState(false);
  const [showThreadsSidebar, setShowThreadsSidebar] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  const chatResizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const panelWidthDuringResizeRef = useRef(panelWidth);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Restore saved panel width
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_PANEL_WIDTH_KEY);
      if (raw == null) return;
      const n = Number.parseInt(raw, 10);
      if (!Number.isNaN(n)) setPanelWidth(clampChatPanelWidth(n));
    } catch {
      /* ignore */
    }
  }, []);

  // Pointer-drag resize
  useEffect(() => {
    if (!isResizingChat) return;

    const onMove = (e: PointerEvent) => {
      const drag = chatResizeDragRef.current;
      if (!drag) return;
      const next = clampChatPanelWidth(drag.startWidth + (drag.startX - e.clientX));
      panelWidthDuringResizeRef.current = next;
      setPanelWidth(next);
    };

    const onUp = () => {
      chatResizeDragRef.current = null;
      setIsResizingChat(false);
      try {
        localStorage.setItem(
          CHAT_PANEL_WIDTH_KEY,
          String(panelWidthDuringResizeRef.current),
        );
      } catch {
        /* ignore */
      }
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isResizingChat]);

  useEffect(() => {
    panelWidthDuringResizeRef.current = panelWidth;
  }, [panelWidth]);

  // Load mention entities when panel opens
  useEffect(() => {
    if (!isOpen) return;
    const supabase = createClient();

    async function load() {
      const [{ data: docs }, { data: comps }, { data: projects }] =
        await Promise.all([
          supabase
            .from("project_documents")
            .select("id, file_name, document_type, document_label")
            .eq("project_id", projectId)
            .order("created_at", { ascending: true }),
          supabase
            .from("comparables")
            .select("id, address, address_for_display, type, number")
            .eq("project_id", projectId)
            .order("number", { ascending: true }),
          supabase
            .from("projects")
            .select("id, name, is_reference, subject_data(core)")
            .is("archived_at", null)
            .order("updated_at", { ascending: false }),
        ]);

      const docEntities: MentionEntity[] = (docs ?? []).map((d) => ({
        type: "doc" as const,
        id: d.id as string,
        label:
          (d.file_name as string) ??
          (d.document_label as string) ??
          (d.document_type as string),
        badge: d.document_type as string,
      }));

      const compEntities: MentionEntity[] = (comps ?? []).map((c) => {
        const addr = (c.address_for_display as string) || (c.address as string);
        const num = c.number as string | null;
        return {
          type: "comp" as const,
          id: c.id as string,
          label: num ? `#${num} ${addr}` : addr,
          badge: c.type as string,
        };
      });

      type ProjectRow = {
        id: string;
        name: string | null;
        is_reference: boolean | null;
        subject_data:
          | { core: Record<string, unknown> }
          | { core: Record<string, unknown> }[]
          | null;
      };

      const projectEntities: MentionEntity[] = (
        (projects ?? []) as ProjectRow[]
      )
        .filter((p) => p.id !== projectId)
        .map((p) => {
          const sd = p.subject_data;
          const core: Record<string, unknown> | null =
            sd == null
              ? null
              : Array.isArray(sd)
                ? (sd[0]?.core ?? null)
                : (sd.core ?? null);
          const address =
            typeof core?.Address === "string" ? core.Address : null;
          const city = typeof core?.City === "string" ? core.City : null;
          const isRef = p.is_reference === true;
          return {
            type: "project" as const,
            id: p.id,
            label: address ?? (p.name ?? p.id),
            badge: isRef ? "ref library" : (city ?? undefined),
          };
        });

      setEntities([...docEntities, ...compEntities, ...projectEntities]);
    }

    void load();
  }, [isOpen, projectId]);

  // Load messages when active thread changes
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    setIsLoadingMessages(true);
    fetch(`/api/chat/threads/${activeThreadId}/messages`)
      .then((res) => (res.ok ? (res.json() as Promise<{ messages: PersistedMessage[] }>) : null))
      .then((data) => {
        if (data) setMessages(data.messages.map(persistedToUIMessage));
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => setIsLoadingMessages(false));
  }, [activeThreadId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Focus title input when editing starts
  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const historyForApi = useMemo((): ChatMessage[] => {
    return messages
      .filter((m) => m.role !== "tool" && m.content.trim())
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content:
          m.role === "user" ? stripMentionTokens(m.content) : m.content,
      }));
  }, [messages]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleNewThread = useCallback(async () => {
    setActiveThreadId(null);
    setMessages([]);
  }, [setActiveThreadId]);

  const handleSwitchThread = useCallback(
    (threadId: string) => {
      if (threadId === activeThreadId) return;
      setActiveThreadId(threadId);
      // Messages load via the effect above
    },
    [activeThreadId, setActiveThreadId],
  );

  const handleArchiveThread = useCallback(
    async (threadId: string) => {
      await archiveThread(threadId);
      if (threadId === activeThreadId) setMessages([]);
    },
    [archiveThread, activeThreadId],
  );

  const handleStartEditTitle = useCallback(() => {
    setTitleDraft(activeThread?.title ?? "");
    setEditingTitle(true);
  }, [activeThread]);

  const handleSaveTitle = useCallback(async () => {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || !activeThreadId || trimmed === activeThread?.title) return;
    await renameThread(activeThreadId, trimmed);
  }, [titleDraft, activeThreadId, activeThread, renameThread]);

  const handleSend = useCallback(
    async (text: string, mentions: ResolvedMention[]) => {
      if (isStreaming) return;

      const userMsg: UIMessage = {
        id: generateId(),
        role: "user",
        content: text,
        mentions,
      };
      const assistantMsg: UIMessage = {
        id: generateId(),
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // The thread that will receive this message
      let currentThreadId = activeThreadId;

      try {
        const apiMentions: ChatMention[] = mentions.map((m) => ({
          type: m.type,
          id: m.id,
        }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            message: stripMentionTokens(text),
            mentions: apiMentions,
            history: historyForApi,
            threadId: currentThreadId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errBody.error ?? `Request failed (${res.status})`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";

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

            if (payload === "[DONE]") break;

            try {
              const parsed: unknown = JSON.parse(payload);

              if (typeof parsed === "string") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + parsed }
                      : m,
                  ),
                );
              } else if (
                typeof parsed === "object" &&
                parsed !== null &&
                "threadId" in parsed
              ) {
                // Server created a new thread for this conversation
                const newId = (parsed as { threadId: string }).threadId;
                currentThreadId = newId;
                setActiveThreadId(newId);
                // Refresh thread list so the new thread appears in the sidebar
                void refreshThreads();
              } else if (
                typeof parsed === "object" &&
                parsed !== null &&
                "toolResult" in parsed
              ) {
                const tr = (parsed as { toolResult: ToolResult }).toolResult;
                const toolMsg: UIMessage = {
                  id: generateId(),
                  role: "tool",
                  content: tr.message,
                  toolResult: tr,
                };
                setMessages((prev) => {
                  const idx = prev.findIndex((m) => m.id === assistantMsg.id);
                  if (idx === -1) return [...prev, toolMsg];
                  return [
                    ...prev.slice(0, idx),
                    toolMsg,
                    ...prev.slice(idx),
                  ];
                });
              } else if (
                typeof parsed === "object" &&
                parsed !== null &&
                "error" in parsed
              ) {
                throw new Error((parsed as { error: string }).error);
              }
            } catch (parseErr) {
              if (
                parseErr instanceof Error &&
                parseErr.message !== payload
              ) {
                throw parseErr;
              }
            }
          }
        }

        // Refresh thread list after stream completes to pick up updated
        // updated_at and auto-generated title
        void refreshThreads().then(() => {
          // If the thread title was just generated, it may now be in the list
          if (currentThreadId) {
            void fetch(
              `/api/chat/threads?projectId=${encodeURIComponent(projectId)}`,
            )
              .then((r) => (r.ok ? (r.json() as Promise<{ threads: { id: string; title: string | null }[] }>) : null))
              .then((data) => {
                if (!data || !currentThreadId) return;
                const updated = data.threads.find(
                  (t) => t.id === currentThreadId,
                );
                if (updated?.title) {
                  optimisticUpdateTitle(currentThreadId, updated.title);
                }
              })
              .catch(() => {
                /* ignore */
              });
          }
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const errorText =
          err instanceof Error ? err.message : "Something went wrong";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: `**Error:** ${errorText}` }
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [
      isStreaming,
      projectId,
      historyForApi,
      activeThreadId,
      setActiveThreadId,
      refreshThreads,
      optimisticUpdateTitle,
    ],
  );

  const handleClearOrArchive = useCallback(async () => {
    if (isStreaming && abortRef.current) abortRef.current.abort();

    if (activeThreadId) {
      await handleArchiveThread(activeThreadId);
    } else {
      setMessages([]);
      setIsStreaming(false);
    }
  }, [isStreaming, activeThreadId, handleArchiveThread]);

  const onChatResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      panelWidthDuringResizeRef.current = panelWidth;
      chatResizeDragRef.current = { startX: e.clientX, startWidth: panelWidth };
      setIsResizingChat(true);
    },
    [panelWidth],
  );

  if (!isOpen) return null;

  const projectName =
    project && typeof project === "object" && "name" in project
      ? String((project as Record<string, unknown>).name)
      : "Project";

  const activeTitle = activeThread?.title ?? null;

  // -------------------------------------------------------------------------
  // Panel content (shared between desktop/mobile)
  // -------------------------------------------------------------------------
  const panelContent = (
    <div className="flex h-full flex-col border-l border-gray-800 bg-gray-950">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-gray-800 px-3 py-2.5">
        {/* Threads toggle */}
        <button
          type="button"
          onClick={() => setShowThreadsSidebar((v) => !v)}
          className={`rounded-md p-1.5 text-gray-500 transition hover:bg-gray-800 hover:text-gray-300 ${
            showThreadsSidebar ? "bg-gray-800 text-gray-300" : ""
          }`}
          title={showThreadsSidebar ? "Hide threads" : "Show threads"}
          aria-label="Toggle thread list"
        >
          <QueueListIcon className="h-4 w-4" />
        </button>

        {/* Thread title (editable) */}
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => void handleSaveTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSaveTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              className="w-full rounded bg-gray-800 px-2 py-0.5 text-sm font-semibold text-gray-100 outline-none ring-1 ring-blue-600"
            />
          ) : (
            <button
              type="button"
              onClick={handleStartEditTitle}
              disabled={!activeThreadId}
              title={activeThreadId ? "Click to rename thread" : undefined}
              className="group flex w-full items-center gap-1.5 text-left"
            >
              <span className="truncate text-sm font-semibold text-gray-100">
                {activeTitle ?? (activeThreadId ? "Untitled" : "AI Chat")}
              </span>
              {activeThreadId && (
                <PencilSquareIcon className="h-3 w-3 shrink-0 text-gray-600 opacity-0 transition group-hover:opacity-100" />
              )}
            </button>
          )}
          {!editingTitle && (
            <p className="truncate text-[11px] text-gray-500">{projectName}</p>
          )}
        </div>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-1">
          {editingTitle ? (
            <button
              type="button"
              onClick={() => void handleSaveTitle()}
              className="rounded-md p-1.5 text-emerald-400 transition hover:bg-gray-800"
              aria-label="Save title"
            >
              <CheckIcon className="h-4 w-4" />
            </button>
          ) : (
            <>
              {/* New thread */}
              <button
                type="button"
                onClick={() => void handleNewThread()}
                disabled={isStreaming}
                className="rounded-md p-1.5 text-gray-500 transition hover:bg-gray-800 hover:text-gray-300 disabled:opacity-40"
                aria-label="New thread"
                title="New conversation"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
              {/* Archive / clear */}
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleClearOrArchive()}
                  className="rounded-md p-1.5 text-gray-500 transition hover:bg-gray-800 hover:text-gray-300"
                  aria-label={activeThreadId ? "Archive thread" : "Clear conversation"}
                  title={activeThreadId ? "Archive thread" : "Clear conversation"}
                >
                  <ArchiveBoxArrowDownIcon className="h-4 w-4" />
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-gray-200"
            aria-label="Close chat panel"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body: thread sidebar + message area */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Thread sidebar */}
        {showThreadsSidebar && (
          <ThreadsSidebar
            threads={threads}
            activeThreadId={activeThreadId}
            isLoading={isLoadingThreads}
            onSelect={handleSwitchThread}
            onArchive={(id) => void handleArchiveThread(id)}
            onNewThread={() => void handleNewThread()}
          />
        )}

        {/* Messages + composer */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 md:px-5"
          >
            {isLoadingMessages ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
              </div>
            ) : messages.length === 0 ? (
              <EmptyState hasThreads={threads.length > 0} />
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isStreaming={
                      isStreaming && msg === messages[messages.length - 1]
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-800 px-4 py-3 md:px-5">
            <MentionComposer
              entities={entities}
              onSend={handleSend}
              disabled={isStreaming}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: inline resizable panel */}
      <div
        className="relative hidden h-full shrink-0 md:block"
        style={{ width: panelWidth }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat panel"
          aria-valuenow={panelWidth}
          aria-valuemin={CHAT_PANEL_MIN_WIDTH}
          aria-valuemax={CHAT_PANEL_MAX_WIDTH}
          tabIndex={0}
          className={`absolute left-0 top-0 z-10 h-full w-3 -translate-x-1/2 touch-none select-none md:cursor-col-resize ${
            isResizingChat ? "bg-blue-500/30" : "hover:bg-gray-800/80"
          }`}
          onPointerDown={onChatResizePointerDown}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 40 : 16;
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setPanelWidth((w) => {
                const next = clampChatPanelWidth(w + step);
                try {
                  localStorage.setItem(CHAT_PANEL_WIDTH_KEY, String(next));
                } catch {
                  /* ignore */
                }
                return next;
              });
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              setPanelWidth((w) => {
                const next = clampChatPanelWidth(w - step);
                try {
                  localStorage.setItem(CHAT_PANEL_WIDTH_KEY, String(next));
                } catch {
                  /* ignore */
                }
                return next;
              });
            }
          }}
        />
        {panelContent}
      </div>

      {/* Mobile: full-screen overlay */}
      <div className="fixed inset-0 z-50 md:hidden">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="absolute inset-x-0 bottom-0 top-14 flex flex-col border-t border-gray-800 bg-gray-950 shadow-2xl">
          {panelContent}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Thread Sidebar
// ---------------------------------------------------------------------------

interface ThreadsSidebarProps {
  threads: ChatThread[];
  activeThreadId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onArchive: (id: string) => void;
  onNewThread: () => void;
}

function ThreadsSidebar({
  threads,
  activeThreadId,
  isLoading,
  onSelect,
  onArchive,
}: ThreadsSidebarProps) {
  return (
    <div
      className="flex h-full shrink-0 flex-col overflow-y-auto border-r border-gray-800"
      style={{ width: THREAD_SIDEBAR_WIDTH }}
    >
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-gray-400" />
        </div>
      ) : threads.length === 0 ? (
        <div className="px-3 py-4">
          <p className="text-[11px] leading-relaxed text-gray-600">
            Your conversations will appear here.
          </p>
        </div>
      ) : (
        <ul className="py-1">
          {threads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              onSelect={() => onSelect(thread.id)}
              onArchive={() => onArchive(thread.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ThreadItem({
  thread,
  isActive,
  onSelect,
  onArchive,
}: {
  thread: ChatThread;
  isActive: boolean;
  onSelect: () => void;
  onArchive: () => void;
}) {
  const title = thread.title ?? "New conversation";
  const time = formatRelativeTime(thread.updatedAt);

  return (
    <li
      className={`group relative flex cursor-pointer items-start gap-1 border-b border-gray-800/50 px-3 py-2.5 text-xs transition-colors ${
        isActive
          ? "bg-gray-800 text-gray-100"
          : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
      }`}
      onClick={onSelect}
    >
      {isActive && (
        <span className="absolute inset-y-0 left-0 w-0.5 rounded-r bg-blue-500" />
      )}
      <div className="min-w-0 flex-1 pl-1">
        <p
          className={`line-clamp-2 text-[11px] font-medium leading-snug ${
            isActive ? "text-gray-100" : "text-gray-300"
          }`}
        >
          {title}
        </p>
        <p className="mt-0.5 text-[10px] text-gray-600">{time}</p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onArchive();
        }}
        className="mt-0.5 shrink-0 rounded p-0.5 text-gray-600 opacity-0 transition hover:text-gray-400 group-hover:opacity-100"
        title="Archive conversation"
        aria-label="Archive conversation"
      >
        <ArchiveBoxArrowDownIcon className="h-3 w-3" />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ hasThreads }: { hasThreads: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <ChatBubbleLeftRightIcon className="mb-3 h-9 w-9 text-gray-700" />
      <p className="text-sm font-medium text-gray-400">
        {hasThreads ? "Start a new message" : "Ask anything about your project"}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
        Use{" "}
        <kbd className="rounded border border-gray-700 bg-gray-800 px-1 py-0.5 font-mono text-[10px]">
          @
        </kbd>{" "}
        to reference specific documents, comps, or other reports.
      </p>
      <div className="mt-4 space-y-2 text-left text-xs text-gray-600">
        <p>&ldquo;What is the county appraised value in @document?&rdquo;</p>
        <p>&ldquo;Compare the sale price per SF of @comp1 vs @comp2&rdquo;</p>
        <p>&ldquo;What was the land size on @6310 Tashay?&rdquo;</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  isStreaming,
}: {
  message: UIMessage;
  isStreaming: boolean;
}) {
  if (message.role === "tool") {
    return <ToolResultBubble result={message.toolResult!} />;
  }

  const isUser = message.role === "user";

  if (isUser) {
    const displayText = message.content.replace(
      /@\[([^\]]+)\]\((doc|comp|project):[^)]+\)/g,
      (_, label: string) => `**@${label}**`,
    );
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-blue-600/20 px-4 py-2.5">
          <div className="text-sm leading-relaxed text-gray-200" data-color-mode="dark">
            <MarkdownPreview
              source={displayText}
              style={{ background: "transparent", fontSize: "0.875rem" }}
            />
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = !message.content.trim();
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-gray-900 px-4 py-2.5">
        {isEmpty && isStreaming ? (
          <div className="flex items-center gap-1.5 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400 [animation-delay:300ms]" />
          </div>
        ) : (
          <div
            className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-gray-200"
            data-color-mode="dark"
          >
            <MarkdownPreview
              source={message.content}
              style={{ background: "transparent", fontSize: "0.875rem" }}
            />
            {isStreaming && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-blue-400/70" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolResultBubble({ result }: { result: ToolResult }) {
  const toolLabels: Record<string, string> = {
    update_subject_field: "Subject Updated",
    update_comp_field: "Comp Updated",
    update_parcel_field: "Parcel Updated",
  };
  const label = toolLabels[result.toolName] ?? "Action Complete";

  return (
    <div className="flex justify-center py-1">
      <div
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
          result.success
            ? "bg-emerald-900/30 text-emerald-300 ring-1 ring-emerald-800/50"
            : "bg-red-900/30 text-red-300 ring-1 ring-red-800/50"
        }`}
      >
        {result.success ? (
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6l3 3 5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
        <span>{label}</span>
        <span className="text-[10px] opacity-70">{result.message}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle button — exported separately (used by ChatToggleFAB)
// ---------------------------------------------------------------------------

export function ChatPanelToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-400 transition hover:border-gray-600 hover:bg-gray-800 hover:text-gray-200"
      title="Open AI Chat"
    >
      <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
      AI Chat
    </button>
  );
}
