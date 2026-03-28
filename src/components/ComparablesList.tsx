"use client";

import Link from "next/link";
import {
  type Comparable,
  type ComparableParsedDataStatus,
  type ComparableType,
} from "~/utils/projectStore";
import { useState } from "react";

interface ComparablesListProps {
  projectId: string;
  type: ComparableType;
  typeSlug: string;
  comparables: Comparable[];
  onAdd: () => void;
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

export function ComparablesList({
  projectId,
  type,
  typeSlug,
  comparables,
  onAdd,
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
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          {type} Comparables ({comparables.length})
        </h3>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md border border-blue-500/60 bg-blue-950/30 px-3 py-1.5 text-xs font-medium text-blue-200 transition hover:bg-blue-900/40 dark:border-blue-600 dark:text-blue-300"
        >
          + Add {type}
        </button>
      </div>

      {comparables.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-600 bg-gray-900/40 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          No {type.toLowerCase()} comparables yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {comparables.map((comparable, index) => (
            <div
              key={comparable.id}
              className="group relative flex flex-col rounded-lg border border-gray-700 bg-gray-900/50 p-4 shadow-sm ring-1 ring-black/20 transition hover:border-gray-600 hover:shadow-md"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  {type} #{comparable.number ?? index + 1}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${parsedStatusBadgeClass(comparable.parsedDataStatus)}`}
                >
                  {formatParsedLabel(comparable.parsedDataStatus)}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  {comparable.images && comparable.images.length > 0 && (
                    <button
                      type="button"
                      onClick={() => togglePhotos(comparable.id)}
                      className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition ${
                        expandedPhotosIds.has(comparable.id)
                          ? "border-blue-500 bg-blue-950/50 text-blue-300"
                          : "border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      Photos ({comparable.images.length})
                    </button>
                  )}
                  {(type === "Land" || type === "Sales") && (
                    <Link
                      href={`/project/${projectId}/${typeSlug}/comps/${comparable.id}/location-map`}
                      className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition ${
                        type === "Land"
                          ? "border-green-700 bg-green-950/40 text-green-300 hover:bg-green-950/60"
                          : "border-purple-700 bg-purple-950/40 text-purple-300 hover:bg-purple-950/60"
                      }`}
                    >
                      Map
                    </Link>
                  )}
                  <Link
                    href={`/project/${projectId}/${typeSlug}/comps/${comparable.id}`}
                    className="rounded border border-sky-700 bg-sky-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300 transition hover:bg-sky-950/60"
                  >
                    Details
                  </Link>
                  <button
                    type="button"
                    onClick={() => onRemove(comparable.id)}
                    className="text-[10px] font-medium text-red-400 opacity-60 transition group-hover:opacity-100 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-gray-500">
                    Address
                  </label>
                  <p className="min-h-[1.75rem] rounded-md border border-gray-800 bg-gray-950/60 px-2 py-1.5 text-xs text-gray-200">
                    {comparable.address?.trim()
                      ? comparable.address
                      : "—"}
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-gray-500">
                    Display Address
                  </label>
                  <input
                    type="text"
                    value={comparable.addressForDisplay}
                    onChange={(event) =>
                      onChange(
                        comparable.id,
                        "addressForDisplay",
                        event.target.value,
                      )
                    }
                    className="w-full rounded-md border border-gray-700 bg-gray-950/60 px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                    placeholder="Same as address"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-gray-500">
                    APN (comma separated)
                  </label>
                  <input
                    type="text"
                    value={comparable.apn?.join(", ") ?? ""}
                    onChange={(event) =>
                      onChange(comparable.id, "apn", event.target.value)
                    }
                    className="w-full rounded-md border border-gray-700 bg-gray-950/60 px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                    placeholder="e.g. 123-456, 789-012"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-gray-500">
                    Number
                  </label>
                  <p className="rounded-md border border-gray-800 bg-gray-950/60 px-2 py-1.5 text-xs text-gray-200">
                    {comparable.number ?? String(index + 1)}
                  </p>
                </div>
              </div>

              {expandedPhotosIds.has(comparable.id) && comparable.images && (
                <div className="mt-4 border-t border-gray-800 pt-3">
                  <h4 className="mb-2 text-[10px] font-bold uppercase text-gray-500">
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
          ))}
        </div>
      )}
    </div>
  );
}
