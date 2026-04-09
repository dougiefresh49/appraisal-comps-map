"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { driveFetch } from "~/lib/drive-fetch";
import type { ComparableType } from "~/utils/projectStore";
import type { CompType } from "~/types/comp-data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParseTaskKind = "parse" | "reparse";
export type ParseTaskStatus = "running" | "success" | "needs_review" | "error";

export interface ParseTask {
  id: string;
  projectId: string;
  compType: ComparableType;
  label: string;
  kind: ParseTaskKind;
  status: ParseTaskStatus;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface AddParseTaskConfig {
  compId: string;
  projectId: string;
  compType: ComparableType;
  label: string;
  kind: ParseTaskKind;
  fileIds: string[];
  extraContext?: string;
}

interface TaskManagerContextValue {
  tasks: ParseTask[];
  addParseTask: (config: AddParseTaskConfig) => void;
  dismissTask: (compId: string) => void;
  retryTask: (compId: string) => void;
  getTaskForComp: (compId: string) => ParseTask | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compTypeToApiType(type: ComparableType): CompType {
  switch (type) {
    case "Land":
      return "land";
    case "Sales":
      return "sales";
    case "Rentals":
      return "rentals";
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TaskManagerContext = createContext<TaskManagerContextValue | null>(null);

export function useTaskManager(): TaskManagerContextValue {
  const ctx = useContext(TaskManagerContext);
  if (!ctx) {
    throw new Error("useTaskManager must be used within TaskManagerProvider");
  }
  return ctx;
}

/**
 * Optionally consume the task manager -- returns null when outside the
 * provider (e.g. in the project-list pages). This avoids the throw for
 * components that may render both inside and outside a project layout.
 */
export function useTaskManagerMaybe(): TaskManagerContextValue | null {
  return useContext(TaskManagerContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TaskManagerProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<ParseTask[]>([]);

  // Keep a ref of retry configs so we can re-fire failed tasks without
  // needing the original caller to pass config again.
  const configRef = useRef<Map<string, AddParseTaskConfig>>(new Map());

  const updateTask = useCallback(
    (compId: string, patch: Partial<ParseTask>) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === compId ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  const fireParseRequest = useCallback(
    (config: AddParseTaskConfig) => {
      const { compId, projectId, compType, kind, fileIds, extraContext } =
        config;

      const isReparse = kind === "reparse";

      const promise = driveFetch("/api/comps/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compId,
          projectId,
          type: compTypeToApiType(compType),
          fileIds,
          extraContext: extraContext?.trim() || undefined,
          ...(isReparse ? { reparse: true } : {}),
        }),
      });

      promise
        .then(async (res) => {
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(err.error ?? "Parse failed");
          }
          updateTask(compId, {
            status: isReparse ? "needs_review" : "success",
            completedAt: Date.now(),
          });
        })
        .catch((err: unknown) => {
          updateTask(compId, {
            status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
            completedAt: Date.now(),
          });
        });
    },
    [updateTask],
  );

  const addParseTask = useCallback(
    (config: AddParseTaskConfig) => {
      configRef.current.set(config.compId, config);

      const task: ParseTask = {
        id: config.compId,
        projectId: config.projectId,
        compType: config.compType,
        label: config.label,
        kind: config.kind,
        status: "running",
        startedAt: Date.now(),
      };

      setTasks((prev) => {
        const existing = prev.findIndex((t) => t.id === config.compId);
        if (existing >= 0) {
          const copy = [...prev];
          copy[existing] = task;
          return copy;
        }
        return [...prev, task];
      });

      fireParseRequest(config);
    },
    [fireParseRequest],
  );

  const dismissTask = useCallback((compId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== compId));
    configRef.current.delete(compId);
  }, []);

  const retryTask = useCallback(
    (compId: string) => {
      const config = configRef.current.get(compId);
      if (!config) return;
      addParseTask(config);
    },
    [addParseTask],
  );

  const getTaskForComp = useCallback(
    (compId: string) => tasks.find((t) => t.id === compId),
    [tasks],
  );

  return (
    <TaskManagerContext.Provider
      value={{ tasks, addParseTask, dismissTask, retryTask, getTaskForComp }}
    >
      {children}
    </TaskManagerContext.Provider>
  );
}
