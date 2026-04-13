"use client";

import {
  Fragment,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
  useId,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  XMarkIcon,
  PencilSquareIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  ArchiveBoxIcon,
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
import { useTheme } from "~/components/ThemeProvider";

const MarkdownPreview = dynamic(() => import("@uiw/react-markdown-preview"), {
  ssr: false,
  loading: () => (
    <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
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
  /** ISO time for day markers and per-message labels (set when sent or loaded from DB). */
  createdAt?: string;
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
const THREAD_RAIL_COLLAPSED_WIDTH = 52;

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

/** Sidebar time: last message, or thread creation if empty (not `updated_at` / rename). */
function formatThreadActivityRelative(thread: ChatThread): string {
  return formatRelativeTime(thread.lastMessageAt ?? thread.createdAt);
}

/** Calendar day in local TZ for grouping (YYYY-MM-DD). */
function dayKeyLocal(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Centered day separator: "Today · 9:15 PM" / "Yesterday · …" / "Sunday · …". */
function formatDayMarkerLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (dOnly.getTime() === startOfToday.getTime()) return `Today · ${time}`;
  if (dOnly.getTime() === startOfYesterday.getTime()) return `Yesterday · ${time}`;
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  return `${weekday} · ${time}`;
}

function persistedToUIMessage(pm: PersistedMessage): UIMessage {
  return {
    id: pm.id,
    role: pm.role,
    content: pm.content,
    mentions: pm.mentions as ResolvedMention[] | undefined,
    toolResult: pm.toolResult as ToolResult | undefined,
    createdAt: pm.createdAt,
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
    restoreThread,
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
  const [threadRailExpanded, setThreadRailExpanded] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [archiveThreadConfirm, setArchiveThreadConfirm] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [isArchivingThread, setIsArchivingThread] = useState(false);
  const [renameThreadDialog, setRenameThreadDialog] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [isRenamingThread, setIsRenamingThread] = useState(false);
  const [archivedThreadsOpen, setArchivedThreadsOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const renameThreadInputRef = useRef<HTMLInputElement>(null);

  const chatResizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const panelWidthDuringResizeRef = useRef(panelWidth);
  /** Two instances of the chat column exist (desktop + mobile); each needs its own ref or scroll targets the wrong (hidden) node. */
  const chatScrollDesktopRef = useRef<HTMLDivElement>(null);
  const chatScrollMobileRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** When the server assigns a thread id mid-stream, skip loading messages from the API until the send finishes — persistence may not be committed yet, and an empty fetch would wipe optimistic messages. */
  const suppressThreadMessagesFetchRef = useRef<string | null>(null);

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

    if (suppressThreadMessagesFetchRef.current === activeThreadId) {
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

  const scrollChatColumnsToBottom = useCallback(() => {
    for (const el of [
      chatScrollDesktopRef.current,
      chatScrollMobileRef.current,
    ]) {
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, []);

  // Keep view pinned to newest messages (bottom): thread switch, load complete, sends, stream chunks
  useLayoutEffect(() => {
    if (isLoadingMessages) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) scrollChatColumnsToBottom();
    };

    run();
    const id = requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [
    messages,
    activeThreadId,
    isLoadingMessages,
    scrollChatColumnsToBottom,
  ]);

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
    suppressThreadMessagesFetchRef.current = null;
    setActiveThreadId(null);
    setMessages([]);
  }, [setActiveThreadId]);

  const handleSwitchThread = useCallback(
    (threadId: string) => {
      if (threadId === activeThreadId) return;
      setIsLoadingMessages(true);
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

  const confirmArchiveThread = useCallback(async () => {
    if (!archiveThreadConfirm) return;
    setIsArchivingThread(true);
    try {
      await handleArchiveThread(archiveThreadConfirm.id);
      setArchiveThreadConfirm(null);
    } finally {
      setIsArchivingThread(false);
    }
  }, [archiveThreadConfirm, handleArchiveThread]);

  const openRenameThreadDialog = useCallback((id: string, title: string) => {
    setRenameThreadDialog({ id, title });
    setRenameDraft(title.trim() ? title : "");
  }, []);

  const cancelRenameThreadDialog = useCallback(() => {
    if (isRenamingThread) return;
    setRenameThreadDialog(null);
    setRenameDraft("");
  }, [isRenamingThread]);

  const confirmRenameThread = useCallback(async () => {
    if (!renameThreadDialog) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) return;
    setIsRenamingThread(true);
    try {
      await renameThread(renameThreadDialog.id, trimmed);
      setRenameThreadDialog(null);
      setRenameDraft("");
    } finally {
      setIsRenamingThread(false);
    }
  }, [renameThreadDialog, renameDraft, renameThread]);

  useEffect(() => {
    if (!renameThreadDialog) return;
    const id = requestAnimationFrame(() => {
      renameThreadInputRef.current?.focus();
      renameThreadInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [renameThreadDialog]);

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

      const sentAt = new Date().toISOString();
      const userMsg: UIMessage = {
        id: generateId(),
        role: "user",
        content: text,
        mentions,
        createdAt: sentAt,
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
                suppressThreadMessagesFetchRef.current = newId;
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
                  createdAt: new Date().toISOString(),
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
        suppressThreadMessagesFetchRef.current = null;
        setIsStreaming(false);
        abortRef.current = null;
        const completedAt = new Date().toISOString();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id && m.role === "assistant"
              ? { ...m, createdAt: completedAt }
              : m,
          ),
        );
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
  // Panel content (shared between desktop/mobile — separate scroll refs each)
  // -------------------------------------------------------------------------
  const renderPanelContent = (scrollRef: RefObject<HTMLDivElement | null>) => (
    <div className="flex h-full min-h-0 flex-row border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      {/* Full-height thread rail (Gemini-style: sidebar spans entire panel height) */}
      <ThreadsRail
        expanded={threadRailExpanded}
        onExpand={() => setThreadRailExpanded(true)}
        onCollapse={() => setThreadRailExpanded(false)}
        threads={threads}
        activeThreadId={activeThreadId}
        isLoading={isLoadingThreads}
        onSelect={handleSwitchThread}
        onRequestArchive={(id, title) =>
          setArchiveThreadConfirm({ id, title })
        }
        onRequestRename={openRenameThreadDialog}
        onOpenArchivedThreads={() => setArchivedThreadsOpen(true)}
        onNewThread={() => void handleNewThread()}
        isStreaming={isStreaming}
      />

      {/* Chat column: title bar aligns to the right of the rail only */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-1.5 border-b border-gray-200 px-3 py-2.5 dark:border-gray-800">
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
                className="w-full rounded border border-gray-200 bg-white px-2 py-0.5 text-sm font-semibold text-gray-900 outline-none ring-1 ring-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            ) : (
              <button
                type="button"
                onClick={handleStartEditTitle}
                disabled={!activeThreadId}
                title={activeThreadId ? "Click to rename thread" : undefined}
                className="group flex w-full items-center gap-1.5 text-left"
              >
                <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {activeTitle ?? (activeThreadId ? "Untitled" : "AI Chat")}
                </span>
                {activeThreadId && (
                  <PencilSquareIcon className="h-3 w-3 shrink-0 text-gray-500 opacity-0 transition group-hover:opacity-100 dark:text-gray-600" />
                )}
              </button>
            )}
            {!editingTitle && (
              <p className="truncate text-[11px] text-gray-600 dark:text-gray-500">
                {projectName}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {editingTitle ? (
              <button
                type="button"
                onClick={() => void handleSaveTitle()}
                className="rounded-md p-1.5 text-emerald-600 transition hover:bg-gray-100 dark:text-emerald-400 dark:hover:bg-gray-800"
                aria-label="Save title"
              >
                <CheckIcon className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              aria-label="Close chat panel"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5"
        >
          {isLoadingMessages ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 dark:border-gray-700 dark:border-t-blue-500" />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState hasThreads={threads.length > 0} />
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => {
                const prev = messages[i - 1];
                const showDayMarker =
                  msg.createdAt &&
                  (!prev?.createdAt ||
                    dayKeyLocal(msg.createdAt) !== dayKeyLocal(prev.createdAt));
                return (
                  <Fragment key={msg.id}>
                    {showDayMarker && msg.createdAt ? (
                      <div
                        className="flex justify-center py-1"
                        aria-hidden
                      >
                        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-500">
                          {formatDayMarkerLabel(msg.createdAt)}
                        </span>
                      </div>
                    ) : null}
                    <MessageBubble
                      message={msg}
                      isStreaming={
                        isStreaming && msg === messages[messages.length - 1]
                      }
                    />
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-200 px-4 py-3 dark:border-gray-800 md:px-5">
          <MentionComposer
            entities={entities}
            onSend={handleSend}
            disabled={isStreaming}
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <ArchiveThreadConfirmDialog
        isOpen={archiveThreadConfirm !== null}
        threadTitle={archiveThreadConfirm?.title ?? ""}
        isArchiving={isArchivingThread}
        onCancel={() => {
          if (!isArchivingThread) setArchiveThreadConfirm(null);
        }}
        onConfirm={() => void confirmArchiveThread()}
      />

      <RenameThreadDialog
        isOpen={renameThreadDialog !== null}
        value={renameDraft}
        onChange={setRenameDraft}
        inputRef={renameThreadInputRef}
        isSaving={isRenamingThread}
        onCancel={cancelRenameThreadDialog}
        onSave={() => void confirmRenameThread()}
      />

      <ArchivedThreadsDialog
        isOpen={archivedThreadsOpen}
        projectId={projectId}
        onClose={() => setArchivedThreadsOpen(false)}
        onRestore={restoreThread}
      />

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
            isResizingChat
              ? "bg-blue-500/30"
              : "hover:bg-gray-200/90 dark:hover:bg-gray-800/80"
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
        {renderPanelContent(chatScrollDesktopRef)}
      </div>

      {/* Mobile: full-screen overlay */}
      <div className="fixed inset-0 z-50 md:hidden">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="absolute inset-x-0 bottom-0 top-14 flex flex-col border-t border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
          {renderPanelContent(chatScrollMobileRef)}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Archive thread confirmation
// ---------------------------------------------------------------------------

function ArchiveThreadConfirmDialog({
  isOpen,
  threadTitle,
  isArchiving,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  threadTitle: string;
  isArchiving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Dismiss"
        onClick={isArchiving ? undefined : onCancel}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Archive this conversation?
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          It will be removed from your thread list. You can start a new
          conversation anytime.
        </p>
        {threadTitle.trim() ? (
          <p className="mt-3 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 dark:border-gray-800 dark:bg-gray-950/80 dark:text-gray-300">
            {threadTitle.trim()}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isArchiving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isArchiving}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
          >
            {isArchiving ? "Archiving…" : "Archive"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rename thread (from thread list overflow)
// ---------------------------------------------------------------------------

function RenameThreadDialog({
  isOpen,
  value,
  onChange,
  inputRef,
  isSaving,
  onCancel,
  onSave,
}: {
  isOpen: boolean;
  value: string;
  onChange: (next: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Dismiss"
        onClick={isSaving ? undefined : onCancel}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Rename conversation
        </h3>
        <label className="mt-4 block">
          <span className="sr-only">Thread name</span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={isSaving}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSave();
              }
              if (e.key === "Escape") onCancel();
            }}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-blue-600/0 transition focus:ring-2 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Conversation title"
            autoComplete="off"
          />
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || !value.trim()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archived conversations (browse + restore)
// ---------------------------------------------------------------------------

function ArchivedThreadsDialog({
  isOpen,
  projectId,
  onClose,
  onRestore,
}: {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  onRestore: (threadId: string) => Promise<void>;
}) {
  const [archivedThreads, setArchivedThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setArchivedThreads([]);
    setLoadError(null);
    setLoading(true);
    void fetch(
      `/api/chat/threads?projectId=${encodeURIComponent(projectId)}&archived=true`,
    )
      .then((res) =>
        res.ok ? (res.json() as Promise<{ threads: ChatThread[] }>) : null,
      )
      .then((data) => {
        if (data) setArchivedThreads(data.threads ?? []);
        else setLoadError("Could not load archived conversations.");
      })
      .catch(() => setLoadError("Could not load archived conversations."))
      .finally(() => setLoading(false));
  }, [isOpen, projectId]);

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    setLoadError(null);
    try {
      await onRestore(id);
      setArchivedThreads((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setLoadError("Could not restore conversation.");
    } finally {
      setRestoringId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(70vh,520px)] w-full max-w-md flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Archived conversations
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Restore a conversation to move it back to your active list.
        </p>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 dark:border-gray-700 dark:border-t-blue-500" />
            </div>
          ) : loadError && archivedThreads.length === 0 ? (
            <p className="py-4 text-sm text-red-600 dark:text-red-400">
              {loadError}
            </p>
          ) : archivedThreads.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-600 dark:text-gray-500">
              No archived conversations.
            </p>
          ) : (
            <ul className="space-y-1.5 pr-1">
              {archivedThreads.map((t) => {
                const title = t.title ?? "New conversation";
                return (
                  <li
                    key={t.id}
                    className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-medium leading-snug text-gray-900 dark:text-gray-100">
                        {title}
                      </p>
                      <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-600">
                        {formatThreadActivityRelative(t)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestore(t.id)}
                      disabled={restoringId !== null}
                      className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-800 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      {restoringId === t.id ? "…" : "Restore"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {loadError && archivedThreads.length > 0 ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            {loadError}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread overflow menu (portal — avoids clipping in scroll area)
// ---------------------------------------------------------------------------

function ThreadOverflowMenu({
  onRename,
  onArchive,
}: {
  onRename: () => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuWidth = 148;
    setPos({
      top: r.bottom + 4,
      left: Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const menu =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        className="fixed z-[80] min-w-[9rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        style={{ top: pos.top, left: pos.left }}
      >
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center px-3 py-2 text-left text-xs text-gray-800 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
          onClick={() => {
            setOpen(false);
            onRename();
          }}
        >
          Rename
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center px-3 py-2 text-left text-xs text-gray-800 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
          onClick={() => {
            setOpen(false);
            onArchive();
          }}
        >
          Archive
        </button>
      </div>,
      document.body,
    );

  return (
    <div
      className="shrink-0"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`mt-0.5 rounded p-0.5 text-gray-500 transition hover:text-gray-800 dark:text-gray-600 dark:hover:text-gray-400 ${
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        title="Thread actions"
        aria-label="Thread actions"
      >
        <EllipsisVerticalIcon className="h-3.5 w-3.5" />
      </button>
      {menu}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread rail (expanded list or Gemini-style skinny bar)
// ---------------------------------------------------------------------------

function ThreadsRail({
  expanded,
  onExpand,
  onCollapse,
  threads,
  activeThreadId,
  isLoading,
  onSelect,
  onRequestArchive,
  onRequestRename,
  onOpenArchivedThreads,
  onNewThread,
  isStreaming,
}: {
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  threads: ChatThread[];
  activeThreadId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onRequestArchive: (id: string, title: string) => void;
  onRequestRename: (id: string, title: string) => void;
  onOpenArchivedThreads: () => void;
  onNewThread: () => void;
  isStreaming: boolean;
}) {
  if (!expanded) {
    return (
      <div
        className="flex h-full shrink-0 flex-col items-center gap-2 border-r border-gray-200 bg-white py-2 dark:border-gray-800 dark:bg-gray-950"
        style={{ width: THREAD_RAIL_COLLAPSED_WIDTH }}
      >
        <button
          type="button"
          onClick={onExpand}
          className="rounded-md p-2 text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          title="Show thread list"
          aria-label="Expand thread list"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onNewThread}
          disabled={isStreaming}
          className="rounded-md p-2 text-gray-600 transition hover:bg-gray-100 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
          title="New conversation"
          aria-label="New conversation"
        >
          <PencilSquareIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onOpenArchivedThreads}
          className="rounded-md p-2 text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          title="Archived conversations"
          aria-label="Archived conversations"
        >
          <ArchiveBoxIcon className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950"
      style={{ width: THREAD_SIDEBAR_WIDTH }}
    >
      <div className="flex shrink-0 items-center px-2 py-2">
        <button
          type="button"
          onClick={onCollapse}
          className="rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          title="Collapse thread list"
          aria-label="Collapse thread list"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <button
          type="button"
          onClick={onNewThread}
          disabled={isStreaming}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-gray-800 transition hover:bg-gray-50 disabled:opacity-40 dark:text-gray-200 dark:hover:bg-gray-900/80"
        >
          <PencilSquareIcon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
          <span>New conversation</span>
        </button>
        <button
          type="button"
          onClick={onOpenArchivedThreads}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-gray-800 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-900/80"
        >
          <ArchiveBoxIcon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
          <span>Archived</span>
        </button>
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 dark:border-gray-700 dark:border-t-gray-400" />
          </div>
        ) : threads.length === 0 ? (
          <div className="px-3 py-4">
            <p className="text-[11px] leading-relaxed text-gray-600 dark:text-gray-500">
              Your conversations will appear here.
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5 px-1 py-1">
            {threads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeThreadId}
                onSelect={() => onSelect(thread.id)}
                onRequestArchive={() =>
                  onRequestArchive(
                    thread.id,
                    thread.title ?? "New conversation",
                  )
                }
                onRequestRename={() =>
                  onRequestRename(
                    thread.id,
                    thread.title ?? "New conversation",
                  )
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ThreadItem({
  thread,
  isActive,
  onSelect,
  onRequestArchive,
  onRequestRename,
}: {
  thread: ChatThread;
  isActive: boolean;
  onSelect: () => void;
  onRequestArchive: () => void;
  onRequestRename: () => void;
}) {
  const title = thread.title ?? "New conversation";
  const time = formatThreadActivityRelative(thread);

  return (
    <li
      className={`group relative flex cursor-pointer items-start gap-1 rounded-md px-3 py-2.5 text-xs transition-colors ${
        isActive
          ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-200"
      }`}
      onClick={onSelect}
    >
      {isActive && (
        <span className="absolute inset-y-0 left-0 w-0.5 rounded-r bg-blue-500" />
      )}
      <div className="min-w-0 flex-1 pl-1">
        <p
          className={`line-clamp-2 text-[11px] font-medium leading-snug ${
            isActive
              ? "text-gray-900 dark:text-gray-100"
              : "text-gray-800 dark:text-gray-300"
          }`}
        >
          {title}
        </p>
        <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-600">
          {time}
        </p>
      </div>
      <ThreadOverflowMenu
        onRename={onRequestRename}
        onArchive={onRequestArchive}
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ hasThreads }: { hasThreads: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <ChatBubbleLeftRightIcon className="mb-3 h-9 w-9 text-gray-400 dark:text-gray-700" />
      <p className="text-sm font-medium text-gray-700 dark:text-gray-400">
        {hasThreads ? "Start a new message" : "Ask anything about your project"}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-600 dark:text-gray-600">
        Use{" "}
        <kbd className="rounded border border-gray-300 bg-gray-100 px-1 py-0.5 font-mono text-[10px] dark:border-gray-700 dark:bg-gray-800">
          @
        </kbd>{" "}
        to reference specific documents, comps, or other reports.
      </p>
      <div className="mt-4 space-y-2 text-left text-xs text-gray-600 dark:text-gray-600">
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
  const { theme } = useTheme();

  if (message.role === "tool") {
    return (
      <ToolResultBubble
        result={message.toolResult!}
        createdAt={message.createdAt}
      />
    );
  }

  const isUser = message.role === "user";
  const timeLabel =
    message.createdAt && (!isStreaming || isUser)
      ? formatMessageTime(message.createdAt)
      : null;

  if (isUser) {
    const displayText = message.content.replace(
      /@\[([^\]]+)\]\((doc|comp|project):[^)]+\)/g,
      (_, label: string) => `**@${label}**`,
    );
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-0.5">
          <div className="rounded-2xl rounded-br-md bg-blue-100 px-4 py-2.5 dark:bg-blue-600/20">
            <div
              className="text-sm leading-relaxed text-gray-900 dark:text-gray-200"
              data-color-mode={theme}
            >
              <MarkdownPreview
                source={displayText}
                style={{ background: "transparent", fontSize: "0.875rem" }}
              />
            </div>
          </div>
          {timeLabel ? (
            <span className="px-1 text-[10px] text-gray-500 dark:text-gray-500">
              {timeLabel}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  const isEmpty = !message.content.trim();
  return (
    <div className="flex justify-start">
      <div className="flex max-w-[90%] flex-col items-start gap-0.5">
        <div className="rounded-2xl rounded-bl-md border border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-transparent dark:bg-gray-900">
          {isEmpty && isStreaming ? (
            <div className="flex items-center gap-1.5 py-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 dark:bg-blue-400" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 [animation-delay:150ms] dark:bg-blue-400" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 [animation-delay:300ms] dark:bg-blue-400" />
            </div>
          ) : (
            <div
              className="prose prose-sm max-w-none text-sm leading-relaxed text-gray-800 dark:prose-invert dark:text-gray-200"
              data-color-mode={theme}
            >
              <MarkdownPreview
                source={message.content}
                style={{ background: "transparent", fontSize: "0.875rem" }}
              />
              {isStreaming && (
                <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-blue-600/70 dark:bg-blue-400/70" />
              )}
            </div>
          )}
        </div>
        {timeLabel ? (
          <span className="px-1 text-[10px] text-gray-500 dark:text-gray-500">
            {timeLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ToolResultBubble({
  result,
  createdAt,
}: {
  result: ToolResult;
  createdAt?: string;
}) {
  const toolLabels: Record<string, string> = {
    update_subject_field: "Subject Updated",
    update_subject_section_json: "Subject Section Updated",
    update_comp_field: "Comp Updated",
    update_parcel_field: "Parcel Updated",
  };
  const label = toolLabels[result.toolName] ?? "Action Complete";

  return (
    <div className="flex flex-col items-center gap-0.5 py-1">
      <div
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
          result.success
            ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800/50"
            : "bg-red-100 text-red-800 ring-1 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800/50"
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
      {createdAt ? (
        <span className="text-[10px] text-gray-500 dark:text-gray-500">
          {formatMessageTime(createdAt)}
        </span>
      ) : null}
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
      className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      title="Open AI Chat"
    >
      <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
      AI Chat
    </button>
  );
}
