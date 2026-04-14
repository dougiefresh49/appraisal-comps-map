"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";
import {
  useTaskManager,
  type ParseTask,
  type TaskStatus,
} from "~/components/TaskManagerContext";

function routeSlugForCompType(compType: string): string {
  switch (compType) {
    case "Land":
      return "land-sales";
    case "Sales":
      return "sales";
    case "Rentals":
      return "rentals";
    default:
      return "sales";
  }
}

function elapsed(startedAt: number): string {
  const sec = Math.floor((Date.now() - startedAt) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

function statusIcon(status: TaskStatus) {
  switch (status) {
    case "running":
      return (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      );
    case "success":
      return <CheckCircleIcon className="h-5 w-5 text-emerald-500" />;
    case "needs_review":
      return (
        <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
      );
    case "error":
      return <XCircleIcon className="h-5 w-5 text-red-500" />;
  }
}

function statusLabel(status: TaskStatus, kind: string): string {
  switch (status) {
    case "running":
      if (kind === "subject-rebuild") return "Rebuilding...";
      return kind === "reparse" ? "Re-parsing..." : "Parsing...";
    case "success":
      return "Done";
    case "needs_review":
      return "Review needed";
    case "error":
      return "Failed";
  }
}

function taskDetailHref(task: ParseTask): string {
  if (task.kind === "subject-rebuild") {
    return `/project/${task.projectId}/subject`;
  }
  const slug = routeSlugForCompType(task.compType);
  return `/project/${task.projectId}/${slug}/comps/${task.id}`;
}

function reviewLinkLabel(task: ParseTask): string {
  return task.kind === "subject-rebuild" ? "Review rebuild" : "Review merge";
}

function TaskRow({ task }: { task: ParseTask }) {
  const { dismissTask, retryTask } = useTaskManager();
  const [elapsedStr, setElapsedStr] = useState(() => elapsed(task.startedAt));

  useEffect(() => {
    if (task.status !== "running") return;
    const id = setInterval(() => setElapsedStr(elapsed(task.startedAt)), 1000);
    return () => clearInterval(id);
  }, [task.status, task.startedAt]);

  const detailHref = taskDetailHref(task);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="shrink-0">{statusIcon(task.status)}</div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-gray-200">
          {task.label}
        </p>
        <p className="text-[10px] text-gray-500">
          {task.status === "running" && elapsedStr}
          {task.status === "error" && (
            <span className="text-red-400">
              {task.error ?? "Unknown error"}
            </span>
          )}
          {task.status === "success" && (
            <span className="text-emerald-400">
              {statusLabel(task.status, task.kind)}
            </span>
          )}
          {task.status === "needs_review" && (
            <Link
              href={detailHref}
              className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              {reviewLinkLabel(task)}
            </Link>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {task.status === "error" && (
          <button
            type="button"
            onClick={() => retryTask(task.id)}
            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
            title="Retry"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {task.status !== "running" && (
          <button
            type="button"
            onClick={() => dismissTask(task.id)}
            className="rounded p-1 text-gray-500 hover:bg-gray-700 hover:text-gray-300"
            title="Dismiss"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function TaskManagerWidget() {
  const { tasks, dismissTask } = useTaskManager();
  const [isExpanded, setIsExpanded] = useState(true);
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTasks = tasks.filter(
    (t) => t.status === "running",
  );
  const visibleTasks = tasks;

  const clearAutoCollapse = useCallback(() => {
    if (autoCollapseTimer.current) {
      clearTimeout(autoCollapseTimer.current);
      autoCollapseTimer.current = null;
    }
  }, []);

  useEffect(() => {
    clearAutoCollapse();

    if (
      visibleTasks.length > 0 &&
      activeTasks.length === 0
    ) {
      autoCollapseTimer.current = setTimeout(() => {
        setIsExpanded(false);
      }, 4000);
    }

    if (activeTasks.length > 0) {
      setIsExpanded(true);
    }

    return clearAutoCollapse;
  }, [activeTasks.length, visibleTasks.length, clearAutoCollapse]);

  if (visibleTasks.length === 0) return null;

  const runningCount = activeTasks.length;
  const totalCount = visibleTasks.length;

  const headerLabel =
    runningCount > 0
      ? `Processing ${runningCount} item${runningCount !== 1 ? "s" : ""}`
      : `${totalCount} task${totalCount !== 1 ? "s" : ""} complete`;

  const handleDismissAll = () => {
    for (const t of visibleTasks) {
      if (t.status !== "running") dismissTask(t.id);
    }
  };

  return (
    <div className="fixed right-5 bottom-16 z-50 w-80 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-2xl print:hidden md:right-6 md:bottom-20">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-2">
        <p className="flex-1 text-xs font-semibold text-gray-200">
          {headerLabel}
        </p>
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          title={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronUpIcon className="h-4 w-4" />
          )}
        </button>
        {runningCount === 0 && (
          <button
            type="button"
            onClick={handleDismissAll}
            className="rounded p-0.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Task list */}
      {isExpanded && (
        <div className="max-h-60 divide-y divide-gray-800 overflow-y-auto">
          {visibleTasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
