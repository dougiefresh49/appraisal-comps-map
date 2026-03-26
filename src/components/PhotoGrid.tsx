"use client";

import { useState } from "react";
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
import { PhotoCard } from "./PhotoCard";
import { PhotoDetailPanel } from "./PhotoDetailPanel";
import { useProjectPhotos } from "~/hooks/useProjectPhotos";
import { useProject } from "~/hooks/useProject";
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
  const { isOtherUserEditing, otherUserName } = usePresence(
    projectId,
    "photos",
  );

  const [isDenseGrid, setIsDenseGrid] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisTotal, setAnalysisTotal] = useState<number | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const processedCount = photos.length + archivedPhotos.length;
  const isAnalysisInProgress =
    analysisTotal !== null && processedCount < analysisTotal;

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

  const handleAnalyzePhotos = async () => {
    if (!project?.projectFolderId) {
      setStatusMessage({
        type: "error",
        text: "Project folder ID not found. Cannot analyze.",
      });
      return;
    }

    setIsAnalyzing(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/photos/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectFolderId: project.projectFolderId,
        }),
      });

      const result = (await response.json()) as {
        success: boolean;
        totalPhotos?: number;
        error?: string;
      };

      if (result.success) {
        if (result.totalPhotos) {
          setAnalysisTotal(result.totalPhotos);
        }
        setStatusMessage({
          type: "success",
          text: result.totalPhotos
            ? `Analysis started for ${result.totalPhotos} photos. Progress is tracked below.`
            : "Photo analysis triggered. New photos will appear as they are processed.",
        });
      } else {
        setStatusMessage({
          type: "error",
          text: result.error ?? "Failed to trigger analysis",
        });
      }
    } catch (error) {
      setStatusMessage({
        type: "error",
        text:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsAnalyzing(false);
    }
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
        {project?.projectFolderId && !isAnalyzing && (
          <button
            onClick={() => void handleAnalyzePhotos()}
            disabled={isAnalyzing}
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Analyze Photos
          </button>
        )}
        {(isAnalyzing || isAnalysisInProgress) && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="mb-2 flex items-center justify-center gap-3">
              <svg
                className="h-5 w-5 animate-spin text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <p className="text-sm font-medium text-blue-800">
                {analysisTotal
                  ? `Processing photos: ${processedCount} / ${analysisTotal}`
                  : "Photo analysis has been triggered..."}
              </p>
            </div>
            {analysisTotal && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.round((processedCount / analysisTotal) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
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

      {/* Action Buttons */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void handleExportToDrive()}
            disabled={isExporting || showArchived}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? "Exporting..." : "Export to Drive"}
          </button>
          <button
            onClick={() => void handleAnalyzePhotos()}
            disabled={isAnalyzing}
            className="rounded-lg border border-blue-300 bg-white px-5 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-600 dark:bg-gray-800 dark:text-blue-400 dark:hover:bg-gray-700"
          >
            {isAnalyzing ? "Analyzing..." : "Analyze Photos"}
          </button>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors ${
              showArchived
                ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            {showArchived
              ? `Archived (${archivedPhotos.length})`
              : `Show Archived (${archivedPhotos.length})`}
          </button>
          <button
            onClick={() => setIsDenseGrid(!isDenseGrid)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {isDenseGrid ? "Document View" : "Dense Grid"}
          </button>
        </div>

        <button
          onClick={() => void refreshPhotos()}
          className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          Refresh
        </button>
      </div>

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
      {isAnalysisInProgress && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/30">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Processing photos...
              </span>
            </div>
            <span className="text-sm font-mono text-blue-700 dark:text-blue-300">
              {processedCount} / {analysisTotal}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-800">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out dark:bg-blue-400"
              style={{
                width: `${Math.round((processedCount / analysisTotal) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

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
              {displayPhotos.map((photo, index) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  onLabelChange={(newLabel) => updateLabel(photo.id, newLabel)}
                  onArchive={archivePhoto}
                  onPreview={setSelectedPhotoId}
                  isDense
                  index={index}
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
                    {pagePhotos[pageIndex]?.map((photo, photoIndex) => {
                      const globalIndex =
                        pageIndex === 0
                          ? photoIndex
                          : 3 + (pageIndex - 1) * 6 + photoIndex;
                      return (
                        <PhotoCard
                          key={photo.id}
                          photo={photo}
                          onLabelChange={(newLabel) =>
                            updateLabel(photo.id, newLabel)
                          }
                          onArchive={archivePhoto}
                          onPreview={setSelectedPhotoId}
                          isDense={false}
                          index={globalIndex}
                          isArchived={showArchived}
                          onRestore={restorePhoto}
                        />
                      );
                    })}
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
    </div>
  );
}
