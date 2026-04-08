"use client";

import { useState, useEffect, useCallback } from "react";
import type { ChatThread } from "~/types/chat";

const ACTIVE_THREAD_KEY = (projectId: string) =>
  `chat-active-thread-${projectId}`;

interface UseChatThreadsReturn {
  threads: ChatThread[];
  activeThreadId: string | null;
  isLoadingThreads: boolean;
  setActiveThreadId: (id: string | null) => void;
  createThread: () => Promise<ChatThread>;
  archiveThread: (threadId: string) => Promise<void>;
  renameThread: (threadId: string, title: string) => Promise<void>;
  refreshThreads: () => Promise<void>;
  /** Optimistically update a thread's title in local state (e.g. after auto-generation) */
  optimisticUpdateTitle: (threadId: string, title: string) => void;
}

export function useChatThreads(projectId: string): UseChatThreadsReturn {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadIdState] = useState<string | null>(null);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);

  const fetchThreads = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(
        `/api/chat/threads?projectId=${encodeURIComponent(projectId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { threads: ChatThread[] };
      setThreads(data.threads ?? []);
    } catch {
      // ignore network errors silently
    } finally {
      setIsLoadingThreads(false);
    }
  }, [projectId]);

  // Initial load + restore last active thread from localStorage
  useEffect(() => {
    void fetchThreads().then(() => {
      try {
        const stored = localStorage.getItem(ACTIVE_THREAD_KEY(projectId));
        if (stored) setActiveThreadIdState(stored);
      } catch {
        // ignore storage errors
      }
    });
  }, [fetchThreads, projectId]);

  const setActiveThreadId = useCallback(
    (id: string | null) => {
      setActiveThreadIdState(id);
      try {
        if (id) localStorage.setItem(ACTIVE_THREAD_KEY(projectId), id);
        else localStorage.removeItem(ACTIVE_THREAD_KEY(projectId));
      } catch {
        // ignore storage errors
      }
    },
    [projectId],
  );

  const createThread = useCallback(async (): Promise<ChatThread> => {
    const res = await fetch("/api/chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) throw new Error("Failed to create thread");
    const data = (await res.json()) as { thread: ChatThread };
    setThreads((prev) => [data.thread, ...prev]);
    return data.thread;
  }, [projectId]);

  const archiveThread = useCallback(
    async (threadId: string): Promise<void> => {
      // Optimistic: remove from list immediately
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) setActiveThreadId(null);

      await fetch("/api/chat/threads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, archived: true }),
      });
    },
    [activeThreadId, setActiveThreadId],
  );

  const renameThread = useCallback(
    async (threadId: string, title: string): Promise<void> => {
      // Optimistic: update title immediately
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title } : t)),
      );

      await fetch("/api/chat/threads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, title }),
      });
    },
    [],
  );

  const optimisticUpdateTitle = useCallback(
    (threadId: string, title: string) => {
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title } : t)),
      );
    },
    [],
  );

  return {
    threads,
    activeThreadId,
    isLoadingThreads,
    setActiveThreadId,
    createThread,
    archiveThread,
    renameThread,
    refreshThreads: fetchThreads,
    optimisticUpdateTitle,
  };
}
