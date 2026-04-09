"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowsPointingOutIcon,
  MagnifyingGlassPlusIcon,
  PencilSquareIcon,
  MapIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { ImageZoomLightbox } from "~/components/ImageZoomLightbox";
import { useProject } from "~/hooks/useProject";
import type { MapType, ProjectData } from "~/utils/projectStore";

export type MapBannerActionType = "edit" | "expand";

type DriveListFile = { id: string; name: string; mimeType: string };

type MapBannerBase = {
  projectId: string;
  imageType: string;
  /** When set, resolves `imageFileId` from `project.maps` and enables the image picker. */
  mapType?: MapType;
  /**
   * When provided, images are listed and auto-detected from this Drive folder
   * instead of the project's `reportMapsFolderId`. Useful for comp detail pages
   * where images live in the comp's own folder
   * (`<projectFolder>/comps/<compType>/<compFolder>/`).
   */
  sourceFolderId?: string;
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

function buildBannerFilenameCandidates(imageType: string): string[] {
  const primary = `${imageType}.png`.toLowerCase();
  const out: string[] = [primary];
  const compsPrefix = "comps-";
  if (imageType.startsWith(compsPrefix)) {
    const bare = `${imageType.slice(compsPrefix.length)}.png`.toLowerCase();
    if (!out.includes(bare)) out.push(bare);
  } else {
    const prefixed = `${compsPrefix}${imageType}.png`.toLowerCase();
    if (!out.includes(prefixed)) out.push(prefixed);
  }
  return out;
}

function isBannerImageFile(f: DriveListFile): boolean {
  const n = f.name.toLowerCase();
  if (
    n.endsWith(".png") ||
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg") ||
    n.endsWith(".webp") ||
    n.endsWith(".gif")
  ) {
    return true;
  }
  return f.mimeType.startsWith("image/");
}

function findFileByCandidates(
  files: DriveListFile[],
  candidates: string[],
): DriveListFile | undefined {
  for (const c of candidates) {
    const hit = files.find((f) => f.name.toLowerCase() === c);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Displays a map image banner loaded from the project's Google Drive
 * reports/maps/ folder. Shows a placeholder when the image is unavailable.
 */
export function MapBanner(props: MapBannerProps) {
  const {
    projectId,
    imageType,
    mapType,
    sourceFolderId,
    height = "h-56",
    fallbackLabel,
    actionLabel,
  } = props;
  const actionType = props.actionType ?? "edit";
  const { project, updateProject, isLoading: projectLoading } =
    useProject(projectId);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [folderImages, setFolderImages] = useState<DriveListFile[]>([]);
  const [resolvedFileId, setResolvedFileId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const chooseWrapRef = useRef<HTMLDivElement | null>(null);

  const mapsFolderId =
    project == null
      ? undefined
      : ((project as unknown as Record<string, unknown>).folderStructure ??
          (project as unknown as Record<string, unknown>).folder_structure) as
          | FolderStructure
          | undefined;

  const reportMapsFolderId = mapsFolderId?.reportMapsFolderId;

  /** The Drive folder to list/auto-detect images from. Comp detail pages supply
   *  their own `sourceFolderId`; all other banners fall back to `reportMapsFolderId`. */
  const activeFolderId = sourceFolderId ?? reportMapsFolderId;

  const mapRow =
    mapType && project
      ? project.maps.find((m) => m.type === mapType)
      : undefined;

  const fetchFolderImages = useCallback(
    async (folderId: string): Promise<DriveListFile[]> => {
      const res = await fetch("/api/drive/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, filesOnly: true }),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { files: DriveListFile[] };
      return (data.files ?? []).filter(isBannerImageFile);
    },
    [],
  );

  useEffect(() => {
    if (projectLoading || !project) return;

    let cancelled = false;

    async function loadImage() {
      setIsLoading(true);
      setResolvedFileId(null);
      setFolderImages([]);

      if (!activeFolderId) {
        setImageUrl(null);
        setFullImageUrl(null);
        setIsLoading(false);
        return;
      }

      const explicitId = mapRow?.imageFileId?.trim();
      if (explicitId) {
        if (!cancelled) {
          setImageUrl(
            `/api/drive/thumbnail/${explicitId}?sz=1200`,
          );
          setFullImageUrl(`/api/drive/file/${explicitId}`);
          setResolvedFileId(explicitId);
        }
        setIsLoading(false);
        return;
      }

      try {
        const files = await fetchFolderImages(activeFolderId);
        if (cancelled) return;
        setFolderImages(files);

        const candidates = buildBannerFilenameCandidates(imageType);
        const match = findFileByCandidates(files, candidates);
        if (match) {
          setImageUrl(
            `/api/drive/thumbnail/${match.id}?sz=1200`,
          );
          setFullImageUrl(`/api/drive/file/${match.id}`);
          setResolvedFileId(match.id);
        } else {
          setImageUrl(null);
          setFullImageUrl(null);
        }
      } catch {
        if (!cancelled) {
          setImageUrl(null);
          setFullImageUrl(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadImage();
    return () => {
      cancelled = true;
    };
  }, [
    projectLoading,
    project,
    activeFolderId,
    mapType,
    mapRow?.imageFileId,
    imageType,
    fetchFolderImages,
  ]);

  const label =
    fallbackLabel ??
    `${imageType.charAt(0).toUpperCase()}${imageType.slice(1)} Map`;

  const resolvedActionLabel =
    actionLabel ?? (actionType === "expand" ? "Expand" : "Edit Map");

  const actionButtonClass =
    "flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-lg ring-1 ring-gray-300 backdrop-blur-sm transition hover:bg-white hover:ring-gray-400 dark:bg-gray-900/80 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-800 dark:hover:ring-gray-600";

  const chooseButtonClass =
    "flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-lg ring-1 ring-gray-300 backdrop-blur-sm transition hover:bg-white hover:ring-gray-400 dark:bg-gray-900/80 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-800 dark:hover:ring-gray-600";

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const el = chooseWrapRef.current;
      if (el && !el.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [pickerOpen]);

  const openPicker = async () => {
    const opening = !pickerOpen;
    setPickerOpen(opening);
    if (!opening) return;
    if (!activeFolderId || folderImages.length > 0) return;
    setListLoading(true);
    try {
      const files = await fetchFolderImages(activeFolderId);
      setFolderImages(files);
    } finally {
      setListLoading(false);
    }
  };

  const handlePickImage = (fileId: string) => {
    if (!mapType) return;
    updateProject((prev: ProjectData) => ({
      ...prev,
      maps: prev.maps.map((m) =>
        m.type === mapType ? { ...m, imageFileId: fileId } : m,
      ),
    }));
    setPickerOpen(false);
  };

  const handleClearSelection = () => {
    if (!mapType) return;
    updateProject((prev: ProjectData) => ({
      ...prev,
      maps: prev.maps.map((m) =>
        m.type === mapType ? { ...m, imageFileId: undefined } : m,
      ),
    }));
    setPickerOpen(false);
  };

  const highlightedId = mapRow?.imageFileId ?? resolvedFileId ?? null;
  const showChooseImage =
    Boolean(mapType) && Boolean(activeFolderId) && !projectLoading;

  const showBannerSpinner = projectLoading || isLoading;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900 ${height}`}
    >
      {showBannerSpinner ? (
        <div className="flex h-full items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500 dark:border-gray-700 dark:border-t-blue-500" />
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
          <MapIcon className="h-10 w-10 text-gray-300 dark:text-gray-700" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-500">{label}</p>
          <p className="text-xs text-gray-400 dark:text-gray-600">
            {actionType === "expand"
              ? "Map image will appear here when available in Drive"
              : "Edit the map to update this preview"}
          </p>
        </div>
      )}

      {showChooseImage && (
        <div ref={chooseWrapRef} className="absolute top-3 left-3 z-10">
          <button
            type="button"
            onClick={() => void openPicker()}
            className={chooseButtonClass}
            aria-expanded={pickerOpen}
            aria-haspopup="listbox"
          >
            <PhotoIcon className="h-3.5 w-3.5" />
            Choose Image
          </button>
          {pickerOpen && (
            <div
              className="absolute left-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/10 dark:border-gray-700 dark:bg-gray-950 dark:ring-black/40"
              role="listbox"
            >
              {mapRow?.imageFileId ? (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="w-full border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-amber-600 transition hover:bg-gray-100 dark:border-gray-800 dark:text-amber-200/90 dark:hover:bg-gray-900"
                >
                  Clear selection (use filename match)
                </button>
              ) : null}
              {listLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500 dark:border-gray-700 dark:border-t-blue-500" />
                </div>
              ) : folderImages.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
                  {sourceFolderId
                    ? "No images found in comp folder"
                    : "No images found in reports/maps/"}
                </p>
              ) : (
                <ul className="max-h-64 overflow-y-auto py-1">
                  {folderImages.map((f) => {
                    const isSelected = f.id === highlightedId;
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => handlePickImage(f.id)}
                          className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition hover:bg-gray-100 dark:hover:bg-gray-900 ${
                            isSelected
                              ? "bg-blue-50 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/40 dark:ring-blue-800/50"
                              : ""
                          }`}
                          role="option"
                          aria-selected={isSelected}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/drive/thumbnail/${f.id}?sz=200`}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded object-cover"
                          />
                          <span className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-gray-200">
                            {f.name}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="absolute top-3 right-3 z-10 flex max-w-[calc(100%-10rem)] flex-wrap items-center justify-end gap-2">
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
          <>
            {fullImageUrl ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className={actionButtonClass}
                aria-label={`Preview ${label} full size`}
              >
                <MagnifyingGlassPlusIcon className="h-3.5 w-3.5" />
                Preview
              </button>
            ) : null}
            <Link href={props.editHref} className={actionButtonClass}>
              <PencilSquareIcon className="h-3.5 w-3.5" />
              {resolvedActionLabel}
            </Link>
          </>
        )}
      </div>

      {lightboxOpen && fullImageUrl ? (
        <ImageZoomLightbox
          imageSrc={fullImageUrl}
          title={label}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </div>
  );
}
