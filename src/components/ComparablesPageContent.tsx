"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownTrayIcon,
  ArrowsUpDownIcon,
  EllipsisVerticalIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { useProject } from "~/hooks/useProject";
import { MergeCompsDialog, type MergeConflict } from "./MergeCompsDialog";
import { ComparablesList } from "./ComparablesList";
import { ReorderCompsDialog } from "./ReorderCompsDialog";
import { MapBanner } from "~/components/MapBanner";
import { CompAddFlow } from "~/components/CompAddFlow";
import { ExportJsonDialog } from "~/components/ExportJsonDialog";
import {
  type ComparableType,
  type ProjectData,
  type Comparable,
  getComparablesByType,
  getMapByType,
  mapTypeForCompType,
} from "~/utils/projectStore";

interface ComparablesPageContentProps {
  projectId: string;
  type: ComparableType;
}

function mapBannerImageType(compType: ComparableType): string {
  switch (compType) {
    case "Land":
      return "comps-land";
    case "Sales":
      return "comps-sales";
    case "Rentals":
      return "comps-rentals";
  }
}

function routeSlugForCompType(compType: ComparableType): string {
  switch (compType) {
    case "Land":
      return "land-sales";
    case "Sales":
      return "sales";
    case "Rentals":
      return "rentals";
  }
}

function compSectionHeading(compType: ComparableType): string {
  switch (compType) {
    case "Land":
      return "Land Comparables";
    case "Sales":
      return "Sales Comparables";
    case "Rentals":
      return "Rental Comparables";
  }
}

function compsFolderKey(
  compType: ComparableType,
): "land" | "sales" | "rentals" {
  switch (compType) {
    case "Land":
      return "land";
    case "Sales":
      return "sales";
    case "Rentals":
      return "rentals";
  }
}

function contextForCompType(
  compType: ComparableType,
): "land" | "sales" | "rentals" {
  switch (compType) {
    case "Land":
      return "land";
    case "Sales":
      return "sales";
    case "Rentals":
      return "rentals";
  }
}

export function ComparablesPageContent({
  projectId,
  type,
}: ComparablesPageContentProps) {
  const router = useRouter();
  const { project, updateProject, isLoading, projectExists } =
    useProject(projectId);
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[] | null>(
    null,
  );
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [showReorderDialog, setShowReorderDialog] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuWrapRef = useRef<HTMLDivElement>(null);

  const closeActionsMenu = useCallback(() => setActionsMenuOpen(false), []);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        actionsMenuWrapRef.current &&
        !actionsMenuWrapRef.current.contains(e.target as Node)
      ) {
        setActionsMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionsMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [actionsMenuOpen]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">
          Loading project...
        </div>
      </div>
    );
  }

  if (!projectExists || !project) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">
          Project not found
        </div>
      </div>
    );
  }

  const comparables = getComparablesByType(project, type);
  const typeSlug = routeSlugForCompType(type);
  const comparablesMapHref = `/project/${projectId}/${typeSlug}/comparables-map`;

  const compsFolderIdForType =
    project.folderStructure?.compsFolderIds?.[compsFolderKey(type)];

  const existingFolderIds = comparables
    .map((c) => c.folderId)
    .filter((id): id is string => !!id);

  const handleAddComparable = () => {
    setShowAddFlow(true);
  };

  const handleAddFlowComplete = (compId: string, newComp?: Comparable) => {
    // Optimistically add to local project state so the list and detail
    // page both see it immediately — without waiting for the Realtime event.
    if (newComp) {
      updateProject((proj: ProjectData) => ({
        ...proj,
        comparables: [...proj.comparables, newComp],
      }));
    }
    router.push(`/project/${projectId}/${typeSlug}/comps/${compId}`);
  };

  const handleComparableChange = (
    id: string,
    field: "address" | "addressForDisplay" | "apn",
    value: string,
  ) => {
    updateProject((proj: ProjectData) => ({
      ...proj,
      comparables: proj.comparables.map((comp) => {
        if (comp.id !== id || comp.type !== type) return comp;

        if (field === "apn") {
          return {
            ...comp,
            apn: value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          };
        }

        return { ...comp, [field]: value };
      }),
    }));
  };

  const handleReorderSave = async (orderedIds: string[]) => {
    const res = await fetch("/api/comps/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, compType: type, orderedIds }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Reorder failed");
    }
    // Optimistically apply new numbers to local state
    updateProject((proj: ProjectData) => ({
      ...proj,
      comparables: proj.comparables.map((comp) => {
        const newNumber = orderedIds.indexOf(comp.id);
        if (comp.type !== type || newNumber === -1) return comp;
        return { ...comp, number: String(newNumber + 1) };
      }),
    }));
  };

  const handleRemoveComparable = (id: string) => {
    updateProject((proj: ProjectData) => {
      const mType = mapTypeForCompType(type);
      const compsMap = getMapByType(proj, mType);
      let maps = proj.maps.filter(
        (m) => !(m.type === "comp-location" && m.linkedCompId === id),
      );
      if (compsMap) {
        maps = maps.map((m) =>
          m.id === compsMap.id
            ? { ...m, markers: m.markers.filter((mk) => mk.compId !== id) }
            : m,
        );
      }
      return {
        ...proj,
        comparables: proj.comparables.filter((c) => c.id !== id),
        maps,
      };
    });
  };

  return (
    <div className="p-8">
      <MapBanner
        projectId={projectId}
        imageType={mapBannerImageType(type)}
        mapType={mapTypeForCompType(type)}
        editHref={comparablesMapHref}
        height="h-48"
      />

      <div className="mt-6 mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex w-full min-w-0 flex-row items-start gap-2 md:w-1/2 md:max-w-[50%] md:flex-col md:gap-0 md:pr-4">
          <div className="w-3/4 min-w-0 md:w-full">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {compSectionHeading(type)}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage {type.toLowerCase()} comparables.
            </p>
          </div>
          <div
            className="relative flex w-1/4 shrink-0 justify-end self-start pt-0.5 md:hidden"
            ref={actionsMenuWrapRef}
          >
            <button
              type="button"
              onClick={() => setActionsMenuOpen((o) => !o)}
              aria-expanded={actionsMenuOpen}
              aria-haspopup="menu"
              title="Actions"
              aria-label="Open actions menu"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-700 bg-gray-800/80 text-gray-300 transition hover:border-gray-600 hover:bg-gray-700/60 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50 dark:border-gray-700"
            >
              <EllipsisVerticalIcon className="h-4 w-4" aria-hidden />
            </button>
            {actionsMenuOpen && (
              <ul
                className="absolute top-full right-0 z-50 mt-1 w-56 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl dark:bg-gray-900"
                role="menu"
                aria-orientation="vertical"
              >
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-100 hover:bg-gray-800"
                    onClick={() => {
                      closeActionsMenu();
                      setIsExportDialogOpen(true);
                    }}
                  >
                    <ArrowDownTrayIcon
                      className="h-4 w-4 shrink-0 text-violet-400"
                      aria-hidden
                    />
                    Export JSON
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-100 hover:bg-gray-800"
                    onClick={() => {
                      closeActionsMenu();
                      setShowReorderDialog(true);
                    }}
                  >
                    <ArrowsUpDownIcon
                      className="h-4 w-4 shrink-0 text-gray-400"
                      aria-hidden
                    />
                    Reorder comparables
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-100 hover:bg-gray-800"
                    onClick={() => {
                      closeActionsMenu();
                      handleAddComparable();
                    }}
                  >
                    <PlusIcon
                      className="h-4 w-4 shrink-0 text-blue-400"
                      strokeWidth={2}
                      aria-hidden
                    />
                    Add comparable
                  </button>
                </li>
              </ul>
            )}
          </div>
        </div>
        <div className="hidden md:flex md:flex-wrap md:items-center md:justify-end md:gap-1.5">
          <button
            type="button"
            onClick={() => setIsExportDialogOpen(true)}
            title="Export comp data as JSON for AppScript importer"
            aria-label="Export JSON"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-700 bg-gray-800/80 text-gray-300 transition hover:border-violet-700 hover:bg-violet-950/30 hover:text-violet-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 dark:border-gray-700"
          >
            <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setShowReorderDialog(true)}
            title="Reorder comparables (drag to change comp numbers)"
            aria-label="Reorder comparables"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-700 bg-gray-800/80 text-gray-300 transition hover:border-gray-600 hover:bg-gray-700/60 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50 dark:border-gray-700"
          >
            <ArrowsUpDownIcon className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={handleAddComparable}
            title="Add comparable"
            aria-label="Add comparable"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      {mergeConflicts && mergeConflicts.length > 0 && (
        <MergeCompsDialog
          conflicts={mergeConflicts}
          onMerge={() => {
            setMergeConflicts(null);
          }}
          onClose={() => setMergeConflicts(null)}
        />
      )}

      <ComparablesList
        projectId={projectId}
        type={type}
        typeSlug={typeSlug}
        comparables={comparables}
        onRemove={handleRemoveComparable}
        onChange={handleComparableChange}
      />

      {showAddFlow && (
        <CompAddFlow
          projectId={projectId}
          compType={type}
          compsFolderId={compsFolderIdForType}
          projectFolderId={project.projectFolderId}
          existingFolderIds={existingFolderIds}
          onComplete={handleAddFlowComplete}
          onClose={() => setShowAddFlow(false)}
        />
      )}
      <ExportJsonDialog
        projectId={projectId}
        context={contextForCompType(type)}
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
      />

      {showReorderDialog && (
        <ReorderCompsDialog
          projectId={projectId}
          type={type}
          comparables={comparables}
          onSave={handleReorderSave}
          onClose={() => setShowReorderDialog(false)}
        />
      )}
    </div>
  );
}
