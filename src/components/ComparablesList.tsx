"use client";

import Link from "next/link";
import {
  type Comparable,
  type ComparableParsedDataStatus,
  type ComparableType,
} from "~/utils/projectStore";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  DocumentTextIcon,
  EllipsisVerticalIcon,
  MapPinIcon,
  PhotoIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

interface ComparablesListProps {
  projectId: string;
  type: ComparableType;
  typeSlug: string;
  comparables: Comparable[];
  onRemove: (id: string) => void;
  onChange: (
    id: string,
    field: "address" | "addressForDisplay" | "apn",
    value: string,
  ) => void;
}

function parsedStatusBadgeClass(
  status: ComparableParsedDataStatus | undefined,
): string {
  switch (status ?? "none") {
    case "parsed":
      return "bg-emerald-950/80 text-emerald-300 ring-1 ring-emerald-800/80";
    case "processing":
      return "bg-blue-950/80 text-blue-300 ring-1 ring-blue-800/80 animate-pulse";
    case "error":
      return "bg-red-950/80 text-red-300 ring-1 ring-red-800/80";
    default:
      return "bg-gray-800/80 text-gray-400 ring-1 ring-gray-700";
  }
}

function formatParsedLabel(status: ComparableParsedDataStatus | undefined) {
  return (status ?? "none") as string;
}

function ComparableListCard({
  projectId,
  type,
  typeSlug,
  comparable,
  index,
  photosExpanded,
  onTogglePhotos,
  onRemove,
  onChange,
}: {
  projectId: string;
  type: ComparableType;
  typeSlug: string;
  comparable: Comparable;
  index: number;
  photosExpanded: boolean;
  onTogglePhotos: () => void;
  onRemove: () => void;
  onChange: (
    field: "address" | "addressForDisplay" | "apn",
    value: string,
  ) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        menuWrapRef.current &&
        !menuWrapRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const imageCount = comparable.images?.length ?? 0;
  const showMap = type === "Land" || type === "Sales";
  const mapIconClass = type === "Land" ? "text-green-400" : "text-purple-400";

  return (
    <div className="group relative flex flex-col rounded-lg border border-gray-700 bg-gray-900/50 p-4 shadow-sm ring-1 ring-black/20 transition hover:border-gray-600 hover:shadow-md">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold tracking-wide text-gray-400 uppercase">
          {type} #{comparable.number ?? index + 1}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${parsedStatusBadgeClass(comparable.parsedDataStatus)}`}
        >
          {formatParsedLabel(comparable.parsedDataStatus)}
        </span>
        <div
          className="relative ml-auto flex shrink-0 items-center"
          ref={menuWrapRef}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="Comparable actions"
            aria-label="Open comparable actions"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-800 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500/50"
          >
            <EllipsisVerticalIcon className="h-4 w-4" aria-hidden />
          </button>
          {menuOpen && (
            <ul
              className="absolute top-full right-0 z-50 mt-1 w-52 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl"
              role="menu"
              aria-orientation="vertical"
            >
              {imageCount > 0 && (
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-100 hover:bg-gray-800 ${
                      photosExpanded ? "bg-gray-800/60" : ""
                    }`}
                    onClick={() => {
                      closeMenu();
                      onTogglePhotos();
                    }}
                  >
                    <PhotoIcon
                      className="h-4 w-4 shrink-0 text-sky-400"
                      aria-hidden
                    />
                    Photos ({imageCount})
                  </button>
                </li>
              )}
              {showMap && (
                <li role="none">
                  <Link
                    role="menuitem"
                    href={`/project/${projectId}/${typeSlug}/comps/${comparable.id}/location-map`}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-100 hover:bg-gray-800"
                    onClick={closeMenu}
                  >
                    <MapPinIcon
                      className={`h-4 w-4 shrink-0 ${mapIconClass}`}
                      aria-hidden
                    />
                    Map
                  </Link>
                </li>
              )}
              <li role="none">
                <Link
                  role="menuitem"
                  href={`/project/${projectId}/${typeSlug}/comps/${comparable.id}`}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-100 hover:bg-gray-800"
                  onClick={closeMenu}
                >
                  <DocumentTextIcon
                    className="h-4 w-4 shrink-0 text-sky-400"
                    aria-hidden
                  />
                  Details
                </Link>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-red-400 hover:bg-gray-800"
                  onClick={() => {
                    closeMenu();
                    onRemove();
                  }}
                >
                  <TrashIcon className="h-4 w-4 shrink-0" aria-hidden />
                  Remove
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-3">
        <div>
          <label className="mb-1 block text-[10px] font-bold text-gray-500 uppercase">
            Address
          </label>
          <p className="min-h-[1.75rem] rounded-md border border-gray-800 bg-gray-950/60 px-2 py-1.5 text-xs text-gray-200">
            {comparable.address?.trim() ? comparable.address : "—"}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-bold text-gray-500 uppercase">
            Display Address
          </label>
          <input
            type="text"
            value={comparable.addressForDisplay}
            onChange={(event) =>
              onChange("addressForDisplay", event.target.value)
            }
            className="w-full rounded-md border border-gray-700 bg-gray-950/60 px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 focus:outline-none"
            placeholder="Same as address"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-bold text-gray-500 uppercase">
            APN (comma separated)
          </label>
          <input
            type="text"
            value={comparable.apn?.join(", ") ?? ""}
            onChange={(event) => onChange("apn", event.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-950/60 px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 focus:outline-none"
            placeholder="e.g. 123-456, 789-012"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-bold text-gray-500 uppercase">
            Number
          </label>
          <p className="rounded-md border border-gray-800 bg-gray-950/60 px-2 py-1.5 text-xs text-gray-200">
            {comparable.number ?? String(index + 1)}
          </p>
        </div>
      </div>

      {photosExpanded && comparable.images && (
        <div className="mt-4 border-t border-gray-800 pt-3">
          <h4 className="mb-2 text-[10px] font-bold text-gray-500 uppercase">
            Photos
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {comparable.images.map((image) => (
              <div key={image.id} className="flex flex-col space-y-1">
                <div className="relative aspect-square overflow-hidden rounded-md border border-gray-700 bg-gray-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      image.webViewUrl ??
                      `https://drive.google.com/thumbnail?id=${image.id}&sz=w800`
                    }
                    alt={image.name}
                    className="h-full w-full object-cover transition hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <div className="flex flex-col px-0.5">
                  <span
                    className="truncate text-[10px] font-medium text-gray-400"
                    title={image.name}
                  >
                    {image.name}
                  </span>
                  <a
                    href={image.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-400 hover:underline"
                  >
                    Open ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ComparablesList({
  projectId,
  type,
  typeSlug,
  comparables,
  onRemove,
  onChange,
}: ComparablesListProps) {
  const [expandedPhotosIds, setExpandedPhotosIds] = useState<Set<string>>(
    new Set(),
  );

  const togglePhotos = (id: string) => {
    setExpandedPhotosIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {comparables.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-600 bg-gray-900/40 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          No {type.toLowerCase()} comparables yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {comparables.map((comparable, index) => (
            <ComparableListCard
              key={comparable.id}
              projectId={projectId}
              type={type}
              typeSlug={typeSlug}
              comparable={comparable}
              index={index}
              photosExpanded={expandedPhotosIds.has(comparable.id)}
              onTogglePhotos={() => togglePhotos(comparable.id)}
              onRemove={() => onRemove(comparable.id)}
              onChange={(field, value) => onChange(comparable.id, field, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
