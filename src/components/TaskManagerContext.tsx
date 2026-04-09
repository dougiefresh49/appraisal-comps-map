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

export type TaskKind = "parse" | "reparse" | "subject-rebuild";
export type TaskStatus = "running" | "success" | "needs_review" | "error";

interface BaseTask {
  id: string;
  projectId: string;
  label: string;
  kind: TaskKind;
  status: TaskStatus;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface CompTask extends BaseTask {
  kind: "parse" | "reparse";
  compType: ComparableType;
}

export interface SubjectTask extends BaseTask {
  kind: "subject-rebuild";
}

export type ParseTask = CompTask | SubjectTask;

/** @deprecated Use TaskStatus */
export type ParseTaskStatus = TaskStatus;
/** @deprecated Use TaskKind */
export type ParseTaskKind = TaskKind;

export interface AddParseTaskConfig {
  compId: string;
  projectId: string;
  compType: ComparableType;
  label: string;
  kind: "parse" | "reparse";
  fileIds: string[];
  extraContext?: string;
}

export interface AddSubjectRebuildTaskConfig {
  projectId: string;
  label: string;
}

interface TaskManagerContextValue {
  tasks: ParseTask[];
  addParseTask: (config: AddParseTaskConfig) => void;
  addSubjectRebuildTask: (config: AddSubjectRebuildTaskConfig) => void;
  dismissTask: (taskId: string) => void;
  retryTask: (taskId: string) => void;
  getTaskForComp: (compId: string) => ParseTask | undefined;
  getTaskById: (taskId: string) => ParseTask | undefined;
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

const SUBJECT_REBUILD_TASK_ID = "subject-rebuild";

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

export function useTaskManagerMaybe(): TaskManagerContextValue | null {
  return useContext(TaskManagerContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TaskManagerProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<ParseTask[]>([]);

  const compConfigRef = useRef<Map<string, AddParseTaskConfig>>(new Map());
  const subjectConfigRef = useRef<Map<string, AddSubjectRebuildTaskConfig>>(
    new Map(),
  );

  const updateTask = useCallback(
    (taskId: string, patch: Partial<BaseTask>) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? ({ ...t, ...patch } as ParseTask) : t,
        ),
      );
    },
    [],
  );

  // ── Comp parse/reparse ──────────────────────────────────────────────────

  const fireParseRequest = useCallback(
    (config: AddParseTaskConfig) => {
      const { compId, projectId, compType, kind, fileIds, extraContext } =
        config;

      const isReparse = kind === "reparse";
      const trimmedExtra = extraContext?.trim();

      const promise = driveFetch("/api/comps/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compId,
          projectId,
          type: compTypeToApiType(compType),
          fileIds,
          ...(trimmedExtra ? { extraContext: trimmedExtra } : {}),
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
      compConfigRef.current.set(config.compId, config);

      const task: CompTask = {
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

  // ── Subject rebuild ─────────────────────────────────────────────────────

  const fireSubjectRebuild = useCallback(
    (config: AddSubjectRebuildTaskConfig) => {
      const taskId = SUBJECT_REBUILD_TASK_ID;

      const promise = fetch("/api/subjects/reparse-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: config.projectId,
          writeProposed: true,
        }),
      });

      promise
        .then(async (res) => {
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(err.error ?? "Rebuild failed");
          }
          const data = (await res.json()) as {
            ok: boolean;
            hasChanges?: boolean;
            documentCount?: number;
          };
          updateTask(taskId, {
            status: data.hasChanges ? "needs_review" : "success",
            completedAt: Date.now(),
          });
        })
        .catch((err: unknown) => {
          updateTask(taskId, {
            status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
            completedAt: Date.now(),
          });
        });
    },
    [updateTask],
  );

  const addSubjectRebuildTask = useCallback(
    (config: AddSubjectRebuildTaskConfig) => {
      const taskId = SUBJECT_REBUILD_TASK_ID;
      subjectConfigRef.current.set(taskId, config);

      const task: SubjectTask = {
        id: taskId,
        projectId: config.projectId,
        label: config.label,
        kind: "subject-rebuild",
        status: "running",
        startedAt: Date.now(),
      };

      setTasks((prev) => {
        const existing = prev.findIndex((t) => t.id === taskId);
        if (existing >= 0) {
          const copy = [...prev];
          copy[existing] = task;
          return copy;
        }
        return [...prev, task];
      });

      fireSubjectRebuild(config);
    },
    [fireSubjectRebuild],
  );

  // ── Shared actions ──────────────────────────────────────────────────────

  const dismissTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    compConfigRef.current.delete(taskId);
    subjectConfigRef.current.delete(taskId);
  }, []);

  const retryTask = useCallback(
    (taskId: string) => {
      const compConfig = compConfigRef.current.get(taskId);
      if (compConfig) {
        addParseTask(compConfig);
        return;
      }
      const subjectConfig = subjectConfigRef.current.get(taskId);
      if (subjectConfig) {
        addSubjectRebuildTask(subjectConfig);
      }
    },
    [addParseTask, addSubjectRebuildTask],
  );

  const getTaskForComp = useCallback(
    (compId: string) => tasks.find((t) => t.id === compId),
    [tasks],
  );

  const getTaskById = useCallback(
    (taskId: string) => tasks.find((t) => t.id === taskId),
    [tasks],
  );

  return (
    <TaskManagerContext.Provider
      value={{
        tasks,
        addParseTask,
        addSubjectRebuildTask,
        dismissTask,
        retryTask,
        getTaskForComp,
        getTaskById,
      }}
    >
      {children}
    </TaskManagerContext.Provider>
  );
}
