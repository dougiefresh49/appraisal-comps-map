"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { ArrowPathIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import type { PhotoAnalysis } from "~/lib/supabase-queries";
import { IMPROVEMENT_DISPLAY_LABELS } from "~/lib/improvement-constants";
import { VALID_CATEGORIES } from "~/lib/photo-category-constants";

interface PhotoDetailPanelProps {
  photo: PhotoAnalysis | null;
  projectId: string;
  onClose: () => void;
  onLabelChange?: (photoId: string, label: string) => void;
  onCategoryChange?: (photoId: string, category: string) => void;
}

function buildThumbnailUrl(fileId: string | null, sz = "1200") {
  if (!fileId) return "";
  return `/api/drive/thumbnail/${fileId}?sz=${sz}`;
}

const IMPROVEMENT_LABELS = IMPROVEMENT_DISPLAY_LABELS;

export function PhotoDetailPanel({
  photo,
  projectId,
  onClose,
  onLabelChange,
  onCategoryChange,
}: PhotoDetailPanelProps) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const [isRedescribing, setIsRedescribing] = useState(false);
  const [redescribeError, setRedescribeError] = useState<string | null>(null);

  useEffect(() => {
    setRedescribeError(null);
  }, [photo?.id]);

  useEffect(() => {
    setIsCategoryMenuOpen(false);
  }, [photo?.id]);

  useEffect(() => {
    if (!isCategoryMenuOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      const el = categoryMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setIsCategoryMenuOpen(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsCategoryMenuOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isCategoryMenuOpen]);

  if (!photo) return null;

  const thumbnailUrl = buildThumbnailUrl(photo.fileId);
  const improvements = photo.improvementsObserved ?? {};
  const improvementKeys = Object.keys(improvements).filter(
    (k) => improvements[k],
  );

  const handleStartEdit = () => {
    setEditLabel(photo.label);
    setIsEditingLabel(true);
  };

  const handleSaveLabel = () => {
    if (editLabel.trim() && editLabel.trim() !== photo.label) {
      onLabelChange?.(photo.id, editLabel.trim());
    }
    setIsEditingLabel(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSaveLabel();
    if (e.key === "Escape") setIsEditingLabel(false);
  };

  const handleRegenerateDescription = async () => {
    if (!photo.fileId || isRedescribing) return;
    setIsRedescribing(true);
    setRedescribeError(null);
    try {
      const res = await fetch("/api/photos/redescribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, photoIds: [photo.fileId] }),
      });
      const data = (await res.json()) as {
        success: boolean;
        updatedCount?: number;
        error?: string;
      };
      if (!data.success) {
        setRedescribeError(data.error ?? "Failed to regenerate description");
        return;
      }
      if ((data.updatedCount ?? 0) === 0) {
        setRedescribeError("No photo was updated. Check Drive file ID.");
      }
    } catch {
      setRedescribeError("Network error while regenerating");
    } finally {
      setIsRedescribing(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Photo Details
        </h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <svg
            className="h-5 w-5"
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Image Preview */}
        {thumbnailUrl && (
          <div className="relative aspect-[4/3] w-full bg-gray-100 dark:bg-gray-800">
            <Image
              src={thumbnailUrl}
              alt={photo.label}
              fill
              className="object-contain"
              unoptimized
            />
          </div>
        )}

        {/* Fields */}
        <div className="space-y-4 p-4">
          {/* Label */}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Label
            </dt>
            <dd className="mt-1">
              {isEditingLabel ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSaveLabel}
                    className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    autoFocus
                  />
                </div>
              ) : (
                <span
                  className="cursor-pointer text-sm text-gray-900 hover:text-blue-600 dark:text-gray-100"
                  onClick={handleStartEdit}
                  title="Click to edit"
                >
                  {photo.label}
                </span>
              )}
            </dd>
          </div>

          {/* Category */}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Category
            </dt>
            <dd className="mt-1">
              <div className="relative inline-block text-left" ref={categoryMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsCategoryMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 hover:bg-blue-200/80 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800 dark:focus:ring-offset-gray-900"
                  aria-haspopup="listbox"
                  aria-expanded={isCategoryMenuOpen}
                  title="Change category"
                >
                  {photo.category}
                  <ChevronDownIcon
                    className={`h-3.5 w-3.5 shrink-0 opacity-80 transition-transform ${isCategoryMenuOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
                {isCategoryMenuOpen && (
                  <ul
                    role="listbox"
                    className="absolute left-0 z-50 mt-1 max-h-60 min-w-[16rem] overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
                  >
                    {VALID_CATEGORIES.map((cat) => (
                      <li key={cat} role="none">
                        <button
                          type="button"
                          role="option"
                          aria-selected={cat === photo.category}
                          onClick={() => {
                            setIsCategoryMenuOpen(false);
                            if (cat !== photo.category) {
                              onCategoryChange?.(photo.id, cat);
                            }
                          }}
                          className={`flex w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 ${
                            cat === photo.category
                              ? "bg-blue-50 font-medium text-blue-900 dark:bg-blue-950/50 dark:text-blue-100"
                              : "text-gray-900 dark:text-gray-100"
                          }`}
                        >
                          {cat}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </dd>
          </div>

          {/* Description */}
          {photo.description && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Description
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                {photo.description}
              </dd>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => void handleRegenerateDescription()}
              disabled={!photo.fileId || isRedescribing}
              className="mt-1 inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <ArrowPathIcon
                className={`h-3.5 w-3.5 ${isRedescribing ? "animate-spin" : ""}`}
                aria-hidden
              />
              {isRedescribing ? "Regenerating…" : "Regenerate description from label"}
            </button>
            {redescribeError && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                {redescribeError}
              </p>
            )}
            {!photo.fileId && (
              <p className="mt-1 text-xs text-gray-500">
                This photo has no Drive file id; cannot regenerate.
              </p>
            )}
          </div>

          {/* Improvements Observed */}
          {improvementKeys.length > 0 && (
            <div>
              <dt className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Improvements Observed
              </dt>
              <dd className="space-y-2">
                {improvementKeys.map((key) => (
                  <div
                    key={key}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                  >
                    <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                      {IMPROVEMENT_LABELS[key] ?? key}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                      {improvements[key]}
                    </span>
                  </div>
                ))}
              </dd>
            </div>
          )}

          {/* Metadata */}
          <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
            <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex justify-between">
                <span>File</span>
                <span className="max-w-[200px] truncate font-mono">
                  {photo.fileName}
                </span>
              </div>
              {photo.propertyType && (
                <div className="flex justify-between">
                  <span>Property Type</span>
                  <span>{photo.propertyType}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Created</span>
                <span>
                  {new Date(photo.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
