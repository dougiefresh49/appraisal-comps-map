"use client";

import { useState } from "react";
import Image from "next/image";
import type { PhotoAnalysis } from "~/lib/supabase-queries";
import { IMPROVEMENT_DISPLAY_LABELS } from "~/lib/improvement-constants";

interface PhotoDetailPanelProps {
  photo: PhotoAnalysis | null;
  onClose: () => void;
  onLabelChange?: (photoId: string, label: string) => void;
}

function buildThumbnailUrl(fileId: string | null, size = "w1200") {
  if (!fileId) return "";
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=${size}`;
}

const IMPROVEMENT_LABELS = IMPROVEMENT_DISPLAY_LABELS;

export function PhotoDetailPanel({
  photo,
  onClose,
  onLabelChange,
}: PhotoDetailPanelProps) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editLabel, setEditLabel] = useState("");

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
              <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {photo.category}
              </span>
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
