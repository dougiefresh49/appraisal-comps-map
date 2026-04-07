"use client";

import { useState, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ArchiveBoxIcon,
  ArrowPathIcon,
  CloudArrowUpIcon,
  ListBulletIcon,
  SparklesIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { PhotoCard } from "./PhotoCard";
import { PhotoDetailPanel } from "./PhotoDetailPanel";
import { PhotoAnalysisDialog } from "./PhotoAnalysisDialog";
import { useProjectPhotos } from "~/hooks/useProjectPhotos";
import { useProject } from "~/hooks/useProject";
import { useSubjectData } from "~/hooks/useSubjectData";
import { usePresence } from "~/hooks/usePresence";
import { PresenceBanner } from "~/components/PresenceBanner";

interface PhotoGridProps {
  projectId: string;
}

export default function PhotoGrid({ projectId }: PhotoGridProps) {
  const {
    photos,
    archivedPhotos,
    isLoading,
    showArchived,
    setShowArchived,
    updateLabel,
    reorder,
    archivePhoto,
    restorePhoto,
    refreshPhotos,
  } = useProjectPhotos(projectId);

  const { project } = useProject(projectId);
  const { saveSubjectData } = useSubjectData(projectId);
  const { isOtherUserEditing, otherUserName } = usePresence(
    projectId,
    "photos",
  );

  const [isDenseGrid, setIsDenseGrid] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isAnalysisDialogOpen, setIsAnalysisDialogOpen] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const handleScroll = () => {
      const y = main.scrollTop;
      if (y < 60) {
        setIsHeaderVisible(true);
      } else if (y > lastScrollYRef.current + 6) {
        setIsHeaderVisible(false);
      } else if (y < lastScrollYRef.current - 6) {
        setIsHeaderVisible(true);
      }
      lastScrollYRef.current = y;
    };
    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  const displayPhotos = showArchived ? archivedPhotos : photos;
  const selectedPhoto =
    [...photos, ...archivedPhotos].find((p) => p.id === selectedPhotoId) ??
    null;

  const numPages = Math.max(
    1,
    1 + Math.ceil((displayPhotos.length - 3) / 6),
  );
  const firstPagePhotos = displayPhotos.slice(0, 3);
  const otherPhotos = displayPhotos.slice(3);
  const otherPagePhotos = Array.from({ length: numPages - 1 }, (_, i) =>
    otherPhotos.slice(i * 6, (i + 1) * 6),
  );
  const pagePhotos = [firstPagePhotos, ...otherPagePhotos];

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorder(active.id as string, over.id as string);
    }
  };

  const handleExportToDrive = async () => {
    if (!project?.projectFolderId) {
      setStatusMessage({
        type: "error",
        text: "Project folder ID not found. Cannot export.",
      });
      return;
    }

    setIsExporting(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectFolderId: project.projectFolderId,
          subjectPhotosFolderId: project.folderStructure?.subjectPhotosFolderId ?? undefined,
        }),
      });

      const result = (await response.json()) as {
        success: boolean;
        error?: string;
      };

      if (result.success) {
        setStatusMessage({
          type: "success",
          text: "input.json exported to Google Drive successfully!",
        });
      } else {
        setStatusMessage({
          type: "error",
          text: result.error ?? "Failed to export",
        });
      }
    } catch (error) {
      setStatusMessage({
        type: "error",
        text:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDialogClose = (didUpdate?: boolean) => {
    setIsAnalysisDialogOpen(false);
    if (didUpdate) {
      void refreshPhotos();
    }
  };

  const handleSaveCore = async (core: Record<string, unknown>) => {
    await saveSubjectData({ core });
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
        <p className="mt-4 text-sm text-gray-500">Loading photos...</p>
      </div>
    );
  }

  if (photos.length === 0 && archivedPhotos.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mb-4 text-gray-400">
          <svg
            className="mx-auto h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
          No photos found
        </h3>
        <p className="mb-4 text-gray-600 dark:text-gray-400">
          Run the photo analysis workflow to process and classify images.
        </p>
        {project?.projectFolderId && !isAnalysisDialogOpen && (
          <button
            onClick={() => setIsAnalysisDialogOpen(true)}
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Analyze Photos
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={selectedPhoto ? "mr-[28rem]" : ""}>
      {/* Presence Banner */}
      <PresenceBanner
        isOtherUserEditing={isOtherUserEditing}
        otherUserName={otherUserName}
      />

      {/* Page Header */}
      <header
        className={`sticky top-14 z-10 -mx-6 mb-4 flex flex-col gap-3 border-b border-gray-800/60 bg-gray-950 px-6 pb-4 pt-4 transition-transform duration-300 ease-in-out md:-mx-8 md:top-0 md:flex-row md:items-start md:justify-between md:px-8 ${
          isHeaderVisible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Photos
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Subject property photos, organized and labeled for the report.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Export to Drive */}
          <div className="group relative">
            <button
              type="button"
              onClick={() => void handleExportToDrive()}
              disabled={isExporting || showArchived}
              aria-label="Export to Drive"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 bg-gray-800/80 text-gray-300 transition hover:border-gray-600 hover:bg-gray-700/60 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CloudArrowUpIcon className="h-4 w-4" aria-hidden />
              )}
            </button>
            <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-gray-100 opacity-0 shadow-lg ring-1 ring-gray-700 transition-opacity group-hover:opacity-100">
              {isExporting ? "Exporting…" : "Export to Drive"}
            </span>
          </div>

          {/* Analyze Photos */}
          <div className="group relative">
            <button
              type="button"
              onClick={() => setIsAnalysisDialogOpen(true)}
              aria-label="Analyze Photos"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 bg-gray-800/80 text-gray-300 transition hover:border-gray-600 hover:bg-gray-700/60 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50"
            >
              <SparklesIcon className="h-4 w-4" aria-hidden />
            </button>
            <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-gray-100 opacity-0 shadow-lg ring-1 ring-gray-700 transition-opacity group-hover:opacity-100">
              Analyze Photos
            </span>
          </div>

          <span className="mx-0.5 h-4 w-px bg-gray-700" aria-hidden />

          {/* Archived toggle */}
          <div className="group relative">
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              aria-label={showArchived ? "Show active photos" : "Show archived photos"}
              aria-pressed={showArchived}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50 ${
                showArchived
                  ? "border-amber-600 bg-amber-900/40 text-amber-400 hover:bg-amber-900/60"
                  : "border-gray-700 bg-gray-800/80 text-gray-300 hover:border-gray-600 hover:bg-gray-700/60 hover:text-gray-100"
              }`}
            >
              <ArchiveBoxIcon className="h-4 w-4" aria-hidden />
            </button>
            <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-gray-100 opacity-0 shadow-lg ring-1 ring-gray-700 transition-opacity group-hover:opacity-100">
              {showArchived
                ? `Archived (${archivedPhotos.length}) — show active`
                : `Show Archived (${archivedPhotos.length})`}
            </span>
          </div>

          {/* View mode segmented control */}
          <div className="group relative">
            <div
              role="group"
              aria-label="View mode"
              className="flex rounded-md border border-gray-700 bg-gray-900/80 p-0.5"
            >
              <button
                type="button"
                onClick={() => setIsDenseGrid(false)}
                aria-pressed={!isDenseGrid}
                aria-label="Document view"
                className={`inline-flex h-7 w-7 items-center justify-center rounded transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50 ${
                  !isDenseGrid
                    ? "bg-gray-600 text-gray-100 shadow-sm"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <ListBulletIcon className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setIsDenseGrid(true)}
                aria-pressed={isDenseGrid}
                aria-label="Dense grid view"
                className={`inline-flex h-7 w-7 items-center justify-center rounded transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50 ${
                  isDenseGrid
                    ? "bg-gray-600 text-gray-100 shadow-sm"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <Squares2X2Icon className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-gray-100 opacity-0 shadow-lg ring-1 ring-gray-700 transition-opacity group-hover:opacity-100">
              {isDenseGrid ? "Dense Grid — switch to Document" : "Document View — switch to Dense Grid"}
            </span>
          </div>

          {/* Refresh */}
          <div className="group relative">
            <button
              type="button"
              onClick={() => void refreshPhotos()}
              aria-label="Refresh photos"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 bg-gray-800/80 text-gray-300 transition hover:border-gray-600 hover:bg-gray-700/60 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50"
            >
              <ArrowPathIcon className="h-4 w-4" aria-hidden />
            </button>
            <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-gray-100 opacity-0 shadow-lg ring-1 ring-gray-700 transition-opacity group-hover:opacity-100">
              Refresh
            </span>
          </div>
        </div>
      </header>

      {/* Status Message */}
      {statusMessage && (
        <div
          className={`mb-6 rounded-lg border p-4 ${
            statusMessage.type === "success"
              ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/30"
              : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <p
              className={`text-sm font-medium ${
                statusMessage.type === "success"
                  ? "text-green-800 dark:text-green-200"
                  : "text-red-800 dark:text-red-200"
              }`}
            >
              {statusMessage.text}
            </p>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Analysis Progress */}
      {/* Photo Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={displayPhotos.map((photo) => photo.id)}
          strategy={rectSortingStrategy}
        >
          {isDenseGrid ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              {displayPhotos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  onLabelChange={(newLabel) => updateLabel(photo.id, newLabel)}
                  onArchive={archivePhoto}
                  onPreview={setSelectedPhotoId}
                  isDense
                  isArchived={showArchived}
                  onRestore={restorePhoto}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {Array.from({ length: numPages }, (_, pageIndex) => (
                <div key={pageIndex}>
                  <div
                    className={`grid gap-6 ${
                      pageIndex === 0
                        ? "mx-auto max-w-lg grid-cols-1 justify-center"
                        : "grid-cols-2"
                    }`}
                  >
                    {pagePhotos[pageIndex]?.map((photo) => (
                      <PhotoCard
                        key={photo.id}
                        photo={photo}
                        onLabelChange={(newLabel) =>
                          updateLabel(photo.id, newLabel)
                        }
                        onArchive={archivePhoto}
                        onPreview={setSelectedPhotoId}
                        isDense={false}
                        isArchived={showArchived}
                        onRestore={restorePhoto}
                      />
                    ))}
                  </div>
                  {pageIndex < numPages - 1 && (
                    <div className="mt-6 border-t-2 border-gray-300 pt-6 dark:border-gray-600">
                      <div className="text-center">
                        <span className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          Page {pageIndex + 2}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SortableContext>
      </DndContext>

      {/* Detail Side Panel */}
      <PhotoDetailPanel
        photo={selectedPhoto}
        onClose={() => setSelectedPhotoId(null)}
        onLabelChange={(photoId, label) => updateLabel(photoId, label)}
      />

      {/* Photo Analysis Dialog */}
      <PhotoAnalysisDialog
        isOpen={isAnalysisDialogOpen}
        projectId={projectId}
        projectFolderId={project?.projectFolderId}
        photos={photos}
        onClose={handleDialogClose}
        onSaveCore={handleSaveCore}
      />
    </div>
  );
}
