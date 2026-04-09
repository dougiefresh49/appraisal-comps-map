"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { CompDetailContent } from "~/components/CompDetailContent";
import { useProject } from "~/hooks/useProject";
import {
  DEFAULT_APPROACHES,
  getComparablesByType,
  type ComparableType,
} from "~/utils/projectStore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH_KEY = "adj-comp-panel-width";
const PANEL_DEFAULT_WIDTH = 420;
const PANEL_MIN_WIDTH = 340;
const PANEL_MAX_WIDTH = 760;

function clampPanelWidth(px: number): number {
  if (typeof window === "undefined") {
    return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, px));
  }
  const maxByViewport = Math.max(
    PANEL_MIN_WIDTH,
    Math.floor(window.innerWidth * 0.65),
  );
  const max = Math.min(PANEL_MAX_WIDTH, maxByViewport);
  return Math.min(max, Math.max(PANEL_MIN_WIDTH, px));
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CompDetailSidePanelProps {
  projectId: string;
  compId: string;
  /** Lowercase comp type from AdjustmentGrid. */
  compType: "land" | "sales";
  /** Display label shown in the panel header, e.g. "Comp #1". */
  compLabel: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CompDetailSidePanel({
  projectId,
  compId,
  compType,
  compLabel,
  onClose,
}: CompDetailSidePanelProps) {
  const normalizedType: ComparableType =
    compType === "land" ? "Land" : "Sales";

  const { project } = useProject(projectId);

  const comparables = project
    ? getComparablesByType(project, normalizedType)
    : [];
  const comp = comparables.find((c) => c.id === compId);
  const compFolderId = comp?.folderId;
  const approaches = project?.approaches ?? DEFAULT_APPROACHES;

  const locationMapHref = `/project/${projectId}/${compType === "land" ? "land-sales" : "sales"}/comps/${compId}/location-map`;

  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  const resizeDragRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);
  const panelWidthDuringResizeRef = useRef(panelWidth);

  // Restore saved width
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PANEL_WIDTH_KEY);
      if (raw == null) return;
      const n = Number.parseInt(raw, 10);
      if (!Number.isNaN(n)) setPanelWidth(clampPanelWidth(n));
    } catch {
      /* ignore */
    }
  }, []);

  // Keep ref in sync
  useEffect(() => {
    panelWidthDuringResizeRef.current = panelWidth;
  }, [panelWidth]);

  // Pointer-drag resize on the left edge
  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: PointerEvent) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      // dragging left increases width; dragging right decreases
      const next = clampPanelWidth(drag.startWidth + (drag.startX - e.clientX));
      panelWidthDuringResizeRef.current = next;
      setPanelWidth(next);
    };

    const onUp = () => {
      resizeDragRef.current = null;
      setIsResizing(false);
      try {
        localStorage.setItem(
          PANEL_WIDTH_KEY,
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
  }, [isResizing]);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      panelWidthDuringResizeRef.current = panelWidth;
      resizeDragRef.current = { startX: e.clientX, startWidth: panelWidth };
      setIsResizing(true);
    },
    [panelWidth],
  );

  return (
    <div
      className="fixed right-0 top-0 z-40 flex h-dvh flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950"
      style={{ width: panelWidth }}
    >
      {/* Left-edge resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize comp detail panel"
        aria-valuenow={panelWidth}
        aria-valuemin={PANEL_MIN_WIDTH}
        aria-valuemax={PANEL_MAX_WIDTH}
        tabIndex={0}
        className={`absolute left-0 top-0 z-10 h-full w-3 -translate-x-1/2 touch-none select-none cursor-col-resize ${
          isResizing ? "bg-blue-500/30" : "hover:bg-blue-500/20"
        }`}
        onPointerDown={onResizePointerDown}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 40 : 16;
          const save = (next: number) => {
            try {
              localStorage.setItem(PANEL_WIDTH_KEY, String(next));
            } catch {
              /* ignore */
            }
          };
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            setPanelWidth((w) => {
              const next = clampPanelWidth(w + step);
              save(next);
              return next;
            });
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setPanelWidth((w) => {
              const next = clampPanelWidth(w - step);
              save(next);
              return next;
            });
          }
        }}
      />

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Comp Detail
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-gray-800 dark:text-gray-200">
            {compLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-3 shrink-0 rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          aria-label="Close comp detail panel"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <CompDetailContent
          projectId={projectId}
          compId={compId}
          compType={normalizedType}
          compFolderId={compFolderId}
          locationMapHref={locationMapHref}
          parsedDataStatus={comp?.parsedDataStatus}
          approaches={approaches}
          layout="panel"
        />
      </div>
    </div>
  );
}
