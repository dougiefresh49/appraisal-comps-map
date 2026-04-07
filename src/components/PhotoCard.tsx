"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { PhotoAnalysis } from "~/lib/supabase-queries";
import { LazyImage } from "./LazyImage";

function buildThumbnailUrl(fileId: string | null, size = "w800") {
  if (!fileId) return "";
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=${size}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Building Exterior":
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  "Building Interior":
    "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  "Site & Grounds":
    "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  "Residential / Apartment Unit":
    "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  "Damage & Deferred Maintenance":
    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

interface PhotoCardProps {
  photo: PhotoAnalysis;
  onLabelChange: (newLabel: string) => void;
  onArchive: (photoId: string) => void;
  onPreview: (photoId: string) => void;
  isDense?: boolean;
  index?: number;
  isArchived?: boolean;
  onRestore?: (photoId: string) => void;
}

export function PhotoCard({
  photo,
  onLabelChange,
  onArchive,
  onPreview,
  isDense = false,
  index = 0,
  isArchived = false,
  onRestore,
}: PhotoCardProps) {
  const loadDelay = index * 100;
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(photo.label);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const thumbnailUrl = buildThumbnailUrl(photo.fileId);

  const handleLabelSave = () => {
    if (editLabel.trim() !== photo.label) {
      onLabelChange(editLabel.trim());
    }
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLabelSave();
    } else if (e.key === "Escape") {
      setEditLabel(photo.label);
      setIsEditing(false);
    }
  };

  const categoryColor =
    CATEGORY_COLORS[photo.category] ??
    "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div
        className={`overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md transition-shadow hover:shadow-lg dark:border-gray-700 dark:bg-gray-800 ${isDense ? "text-xs" : ""} ${isArchived ? "opacity-60" : ""}`}
      >
        {/* Image - Drag Area */}
        <div
          className={`relative aspect-[3/2] cursor-grab bg-gray-100 active:cursor-grabbing dark:bg-gray-700 ${isDense ? "h-24" : ""}`}
          {...attributes}
          {...listeners}
        >
          {thumbnailUrl ? (
            <LazyImage
              src={thumbnailUrl}
              alt={photo.label}
              className="h-full w-full object-cover"
              delay={loadDelay}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              <svg
                className="h-8 w-8"
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
          )}
          {/* Drag handle overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/10">
            <div className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <svg
                className="h-6 w-6 text-white drop-shadow"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M7 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 2zm0 6a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 8zm0 6a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 14zm6-8a2 2 0 1 1-.001-4.001A2 2 0 0 1 13 6zm0 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 8zm0 6a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 14z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Label & Actions */}
        <div className={isDense ? "p-2" : "p-3"}>
          {/* Category Badge */}
          {!isDense && (
            <div className="mb-1.5">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${categoryColor}`}
              >
                {photo.category}
              </span>
            </div>
          )}

          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={handleKeyPress}
                onBlur={handleLabelSave}
                className={`flex-1 rounded border border-gray-300 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 ${
                  isDense ? "px-1 py-1 text-xs" : "px-2 py-1 text-sm"
                }`}
                autoFocus
              />
              <button
                onClick={handleLabelSave}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span
                className={`cursor-pointer truncate font-medium text-gray-900 hover:text-blue-600 dark:text-gray-100 ${
                  isDense ? "text-xs" : "text-sm"
                }`}
                onClick={() => setIsEditing(true)}
                title="Click to edit"
              >
                {photo.label}
              </span>
              <div className="flex items-center gap-1">
                {/* Preview button */}
                <div className="group/tip relative">
                  <button
                    onClick={() => onPreview(photo.id)}
                    className="rounded p-1 text-gray-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
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
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  </button>
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-gray-100 opacity-0 shadow-lg ring-1 ring-gray-700 transition-opacity group-hover/tip:opacity-100">
                    View details
                  </span>
                </div>
                {/* Edit button */}
                <div className="group/tip relative">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="rounded p-1 text-gray-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
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
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-gray-100 opacity-0 shadow-lg ring-1 ring-gray-700 transition-opacity group-hover/tip:opacity-100">
                    Edit label
                  </span>
                </div>
                {/* Archive / Restore button */}
                {isArchived ? (
                  <div className="group/tip relative">
                    <button
                      onClick={() => onRestore?.(photo.id)}
                      className="rounded p-1 text-gray-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-green-100 hover:text-green-600 dark:hover:bg-green-900"
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
                          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                        />
                      </svg>
                    </button>
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-gray-100 opacity-0 shadow-lg ring-1 ring-gray-700 transition-opacity group-hover/tip:opacity-100">
                      Restore photo
                    </span>
                  </div>
                ) : (
                  <div className="group/tip relative">
                    <button
                      onClick={() => onArchive(photo.id)}
                      className="rounded p-1 text-gray-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900"
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
                          d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                        />
                      </svg>
                    </button>
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-gray-100 opacity-0 shadow-lg ring-1 ring-gray-700 transition-opacity group-hover/tip:opacity-100">
                      Archive photo
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
