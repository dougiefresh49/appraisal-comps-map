"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { XMarkIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { fetchPhotosForImprovementKey, type PhotoAnalysis } from "~/lib/supabase-queries";
import { ImageZoomLightbox } from "~/components/ImageZoomLightbox";

interface ImprovementRefPanelProps {
  projectId: string;
  /** Human-readable improvement row label, e.g. "Foundation" */
  fieldLabel: string;
  /** Snake_case key in improvements_observed, e.g. "foundation" */
  photoKey: string;
  onClose: () => void;
}

function buildThumbnailUrl(fileId: string | null, sz = "800") {
  if (!fileId) return "";
  return `/api/drive/thumbnail/${fileId}?sz=${sz}`;
}

interface PhotoCardProps {
  photo: PhotoAnalysis;
  observedValue: string;
  fieldLabel: string;
}

function PhotoRefCard({ photo, observedValue, fieldLabel }: PhotoCardProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const thumbnailUrl = buildThumbnailUrl(photo.fileId);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700/60 dark:bg-gray-900">
      {/* Thumbnail */}
      {thumbnailUrl ? (
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="group relative block aspect-[4/3] w-full cursor-zoom-in overflow-hidden bg-gray-100 dark:bg-gray-800"
          aria-label={`View full size: ${photo.label}`}
        >
          <Image
            src={thumbnailUrl}
            alt={photo.label}
            fill
            className="object-cover transition group-hover:opacity-90 group-hover:scale-[1.02]"
            unoptimized
          />
        </button>
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-gray-100 dark:bg-gray-800">
          <PhotoIcon className="h-8 w-8 text-gray-400" />
        </div>
      )}

      {/* Info */}
      <div className="px-3 py-3 space-y-1.5">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate" title={photo.label}>
          {photo.label || "Untitled photo"}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1" title={photo.category}>
          {photo.category}
        </p>
        {/* The observed value for this specific key */}
        <div className="rounded-md bg-blue-50 px-2.5 py-2 dark:bg-blue-950/30">
          <p className="text-[11px] font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-0.5">
            {fieldLabel}
          </p>
          <p className="text-xs text-blue-800 dark:text-blue-200 leading-snug">
            {observedValue}
          </p>
        </div>
      </div>

      {lightboxOpen && photo.fileId ? (
        <ImageZoomLightbox
          imageSrc={`/api/drive/file/${photo.fileId}`}
          title={photo.label}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function ImprovementRefPanel({
  projectId,
  fieldLabel,
  photoKey,
  onClose,
}: ImprovementRefPanelProps) {
  const [photos, setPhotos] = useState<PhotoAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFetchError(null);
    setPhotos([]);

    fetchPhotosForImprovementKey(projectId, photoKey)
      .then((results) => {
        if (!cancelled) {
          setPhotos(results);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load reference photos");
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, photoKey]);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-[28rem] flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-700/60 dark:bg-gray-950"
      role="dialog"
      aria-label={`Reference photos for ${fieldLabel}`}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-3.5 dark:border-gray-700/60">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Reference Photos
          </p>
          <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {fieldLabel}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label="Close reference panel"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400 dark:text-gray-500">
            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-400" />
            Loading photos…
          </div>
        )}

        {!isLoading && fetchError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
            {fetchError}
          </div>
        )}

        {!isLoading && !fetchError && photos.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <PhotoIcon className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No photos found with data for this field.
            </p>
            <p className="max-w-[220px] text-xs text-gray-400 dark:text-gray-500">
              This value may have come from a document or subject data rather than a photo.
            </p>
          </div>
        )}

        {!isLoading && photos.length > 0 && (
          <div className="space-y-4">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {photos.length} photo{photos.length !== 1 ? "s" : ""} with observed data for this field
            </p>
            {photos.map((photo) => {
              const observedValue = (photo.improvementsObserved?.[photoKey] ?? "").trim();
              return (
                <PhotoRefCard
                  key={photo.id}
                  photo={photo}
                  observedValue={observedValue}
                  fieldLabel={fieldLabel}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
