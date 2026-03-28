"use client";

import Link from "next/link";
import { type Comparable, type ComparableType } from "~/utils/projectStore";

interface ComparablesListProps {
  projectId: string;
  type: ComparableType;
  comparables: Comparable[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, field: "address" | "addressForDisplay" | "apn", value: string) => void;
  onAddressSearch: (id: string, address: string) => void;
}



import { useState } from "react";

export function ComparablesList({
  projectId,
  type,
  comparables,
  onAdd,
  onRemove,
  onChange,
  onAddressSearch,
}: ComparablesListProps) {
  const [expandedPhotosIds, setExpandedPhotosIds] = useState<Set<string>>(new Set());

  const togglePhotos = (id: string) => {
    setExpandedPhotosIds(current => {
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
        <div className="flex gap-2">
            <button
              onClick={onAdd}
              className="rounded-md border border-blue-500 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
            >
              + Add {type}
            </button>
        </div>
      </div>

      {comparables.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white p-4 text-center text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
          No {type.toLowerCase()} comparables yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {comparables.map((comparable, index) => (
            <div
              key={comparable.id}
              className="group relative flex flex-col rounded-md border border-gray-200 bg-white p-3 shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {type} # {index + 1}
                </span>
                <div className="flex items-center gap-2">
                  {comparable.images && comparable.images.length > 0 && (
                     <button
                        onClick={() => togglePhotos(comparable.id)}
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition ${
                            expandedPhotosIds.has(comparable.id)
                            ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500" 
                            : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                        }`}
                     >
                        Photos ({comparable.images.length})
                     </button>
                  )}
                  {(type === "Land" || type === "Sales") && (
                    <Link
                      href={`/project/${projectId}/${type === "Land" ? "land-sales" : "sales"}/comps/${comparable.id}/location-map`}
                      className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition hover:bg-opacity-100 ${
                        type === "Land" 
                          ? "border-green-600 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/40"
                          : "border-purple-600 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/40"
                      }`}
                    >
                      Map
                    </Link>
                  )}
                  {/* Comp detail page link */}
                  <Link
                    href={`/project/${projectId}/${
                      type === "Land" ? "land-sales" : type === "Sales" ? "sales" : "rentals"
                    }/comps/${comparable.id}`}
                    className="rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 transition hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
                  >
                    Details
                  </Link>
                  <button
                    onClick={() => onRemove(comparable.id)}
                    className="text-[10px] font-medium text-red-600 hover:text-red-700 opacity-50 transition group-hover:opacity-100 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-3">
                {/* Address Field */}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500">
                    Address
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={comparable.address}
                      onChange={(event) =>
                        onChange(comparable.id, "address", event.target.value)
                      }
                      onKeyDown={(e) => {
                           if (e.key === "Enter" && comparable.address.trim()) {
                             onAddressSearch(comparable.id, comparable.address);
                           }
                      }}
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:focus:border-blue-400"
                      placeholder="Enter address..."
                    />
                     <button
                        onClick={() => {
                          if (comparable.address.trim()) {
                            onAddressSearch(comparable.id, comparable.address);
                          }
                        }}
                        className="flex items-center justify-center rounded border border-gray-200 bg-gray-50 px-2 text-gray-600 hover:bg-gray-100 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                        title="Search Address"
                      >
                         🔍
                      </button>
                  </div>
                </div>

                {/* Display Address Field */}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500">
                    Display Address
                  </label>
                  <input
                    type="text"
                    value={comparable.addressForDisplay}
                    onChange={(event) =>
                      onChange(comparable.id, "addressForDisplay", event.target.value)
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:focus:border-blue-400"
                    placeholder="Same as address"
                  />
                </div>

                {/* APN Field */}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500">
                    APN (Comma separated)
                  </label>
                  <input
                    type="text"
                    value={comparable.apn?.join(", ") ?? ""}
                    onChange={(event) =>
                      onChange(comparable.id, "apn", event.target.value)
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:focus:border-blue-400"
                    placeholder="e.g. 123-456, 789-012"
                  />
                </div>
              </div>

               {/* Image Grid */}
               {expandedPhotosIds.has(comparable.id) && comparable.images && (
                   <div className="mt-4 border-t pt-3 dark:border-gray-700">
                       <h4 className="mb-2 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">Photos</h4>
                       <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                           {comparable.images.map((image) => (
                               <div key={image.id} className="flex flex-col space-y-1">
                                   <div className="relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                                       {/* eslint-disable-next-line @next/next/no-img-element */}
                                       <img 
                                           src={image.webViewUrl ?? `https://drive.google.com/thumbnail?id=${image.id}&sz=w800`} 
                                           alt={image.name} 
                                           className="h-full w-full object-cover transition hover:scale-105"
                                           loading="lazy"
                                       />
                                   </div>
                                   <div className="flex flex-col px-0.5">
                                        <span className="truncate text-[10px] font-medium text-gray-600 dark:text-gray-400" title={image.name}>
                                            {image.name}
                                        </span>
                                        <a 
                                            href={image.webViewLink} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-[10px] text-blue-600 hover:underline dark:text-blue-400"
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
