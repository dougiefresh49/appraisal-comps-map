"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowsPointingOutIcon,
  PencilSquareIcon,
  MapIcon,
} from "@heroicons/react/24/outline";
import { useProject } from "~/hooks/useProject";

export type MapBannerActionType = "edit" | "expand";

type MapBannerBase = {
  projectId: string;
  imageType: string;
  height?: string;
  fallbackLabel?: string;
  /** Overrides the default action label ("Edit Map" or "Expand"). */
  actionLabel?: string;
};

type MapBannerProps =
  | (MapBannerBase & {
      actionType?: "edit";
      /** Map editor route when actionType is edit (default). */
      editHref: string;
    })
  | (MapBannerBase & {
      actionType: "expand";
      editHref?: undefined;
    });

interface FolderStructure {
  reportMapsFolderId?: string;
  [key: string]: unknown;
}

/**
 * Displays a map image banner loaded from the project's Google Drive
 * reports/maps/ folder. Shows a placeholder when the image is unavailable.
 */
export function MapBanner(props: MapBannerProps) {
  const {
    projectId,
    imageType,
    height = "h-56",
    fallbackLabel,
    actionLabel,
  } = props;
  const actionType = props.actionType ?? "edit";
  const { project } = useProject(projectId);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadImage() {
      setIsLoading(true);

      const raw = project as unknown as Record<string, unknown> | undefined;
      const folderStructure = (raw?.folderStructure ??
        raw?.folder_structure) as FolderStructure | undefined;

      const mapsFolderId = folderStructure?.reportMapsFolderId;
      if (!mapsFolderId) {
        setIsLoading(false);
        return;
      }

      try {
        const fileName = `${imageType}.png`;
        const res = await fetch("/api/drive/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: mapsFolderId, filesOnly: true }),
        });

        if (!res.ok) {
          setIsLoading(false);
          return;
        }

        const data = (await res.json()) as {
          files: { id: string; name: string; mimeType: string }[];
        };

        const match = data.files.find(
          (f) => f.name.toLowerCase() === fileName.toLowerCase(),
        );

        if (match && !cancelled) {
          setImageUrl(
            `https://drive.google.com/thumbnail?id=${match.id}&sz=w1200`,
          );
          setFullImageUrl(`/api/drive/file/${match.id}`);
        }
      } catch {
        // Silently fail -- show placeholder
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadImage();
    return () => {
      cancelled = true;
    };
  }, [project, imageType]);

  const label = fallbackLabel ?? `${imageType.charAt(0).toUpperCase()}${imageType.slice(1)} Map`;

  const resolvedActionLabel =
    actionLabel ?? (actionType === "expand" ? "Expand" : "Edit Map");

  const actionButtonClass =
    "absolute top-3 right-3 flex items-center gap-1.5 rounded-lg bg-gray-900/80 px-3 py-1.5 text-xs font-semibold text-gray-200 shadow-lg ring-1 ring-gray-700 backdrop-blur-sm transition hover:bg-gray-800 hover:ring-gray-600";

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-gray-800 bg-gray-900 ${height}`}
    >
      {isLoading ? (
        <div className="flex h-full items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
        </div>
      ) : imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={label}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <MapIcon className="h-10 w-10 text-gray-700" />
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-xs text-gray-600">
            {actionType === "expand"
              ? "Map image will appear here when available in Drive"
              : "Edit the map to update this preview"}
          </p>
        </div>
      )}

      {props.actionType === "expand" ? (
        <button
          type="button"
          disabled={!fullImageUrl}
          onClick={() => setLightboxOpen(true)}
          className={`${actionButtonClass} disabled:pointer-events-none disabled:opacity-40`}
        >
          <ArrowsPointingOutIcon className="h-3.5 w-3.5" />
          {resolvedActionLabel}
        </button>
      ) : (
        <Link href={props.editHref} className={actionButtonClass}>
          <PencilSquareIcon className="h-3.5 w-3.5" />
          {resolvedActionLabel}
        </Link>
      )}

      {lightboxOpen && fullImageUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${label} full size`}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute inset-0 cursor-default"
            aria-label="Close lightbox"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullImageUrl}
            alt={label}
            className="relative z-[1] max-h-[min(92vh,1200px)] max-w-full object-contain shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 z-[2] rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-200 ring-1 ring-gray-600 hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
