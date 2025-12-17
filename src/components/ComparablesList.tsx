"use client";

import Link from "next/link";
import { type ComparableInfo, type ComparableType } from "~/utils/projectStore";

interface ComparablesListProps {
  projectId: string;
  type: ComparableType;
  comparables: ComparableInfo[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, field: "address" | "addressForDisplay", value: string) => void;
  onAddressSearch: (id: string, address: string) => void;
}

export function ComparablesList({
  projectId,
  type,
  comparables,
  onAdd,
  onRemove,
  onChange,
  onAddressSearch,
}: ComparablesListProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">
          {type} Comparables ({comparables.length})
        </h3>
        <div className="flex gap-2">
            <button
              onClick={onAdd}
              className="rounded-md border border-blue-500 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
            >
              + Add {type}
            </button>
            <button
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
                title="Refresh (Placeholder)"
              >
                🔄
            </button>
        </div>
      </div>

      {comparables.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white p-4 text-center text-xs text-gray-500">
          No {type.toLowerCase()} comparables yet.
        </div>
      ) : (
        <div className="space-y-4">
          {comparables.map((comparable, index) => (
            <div
              key={comparable.id}
              className="rounded-md border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">
                  {type} Comparable {index + 1}
                </span>
                <div className="flex items-center gap-2">
                  {type === "Land" && (
                    <Link
                      href={`/project/${projectId}/land-sales/comps/${comparable.id}/location-map`}
                      className="rounded-md border border-green-600 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 transition hover:bg-green-100"
                    >
                      Land Map
                    </Link>
                  )}
                  <button
                    onClick={() => onRemove(comparable.id)}
                    className="text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Address
                  </label>
                  <div className="flex gap-2">
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
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    placeholder="Comparable address..."
                  />
                    <button
                      onClick={() => {
                        if (comparable.address.trim()) {
                          onAddressSearch(comparable.id, comparable.address);
                        }
                      }}
                      className="rounded-md bg-gray-100 px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200"
                      title="Search"
                    >
                      🔍
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Address (Display)
                  </label>
                  <input
                    type="text"
                    value={comparable.addressForDisplay}
                    onChange={(event) =>
                      onChange(comparable.id, "addressForDisplay", event.target.value)
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    placeholder="Comparable display address..."
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
