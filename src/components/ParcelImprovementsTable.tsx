"use client";

import { useCallback, useState } from "react";
import { TrashIcon, PlusIcon } from "@heroicons/react/24/outline";
import type {
  CompParcelImprovementRow,
  CompParcelImprovementPatch,
} from "~/hooks/useCompParcels";
import type { ParcelImprovement } from "~/types/comp-data";

// ---------------------------------------------------------------------------
// Inline editable cell
// ---------------------------------------------------------------------------

function EditableCell({
  value,
  onCommit,
  type = "text",
  placeholder = "—",
}: {
  value: string | number | null | undefined;
  onCommit: (v: string) => void;
  type?: "text" | "number";
  placeholder?: string;
}) {
  const display = value != null && value !== "" ? String(value) : "";
  const [localVal, setLocalVal] = useState(display);

  const handleBlur = useCallback(() => {
    onCommit(localVal);
  }, [localVal, onCommit]);

  if (display !== localVal && document.activeElement?.tagName !== "INPUT") {
    setLocalVal(display);
  }

  return (
    <input
      type={type}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      placeholder={placeholder}
      className="w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-gray-900 placeholder-gray-400 hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 dark:text-gray-100 dark:placeholder-gray-600 dark:hover:border-gray-600 dark:focus:border-blue-400 dark:focus:bg-gray-950/60"
    />
  );
}

// ---------------------------------------------------------------------------
// Adapter: ParcelImprovement (subject JSONB) ↔ CompParcelImprovementRow
// ---------------------------------------------------------------------------

export function parcelImprovementToRow(
  imp: ParcelImprovement,
  index: number,
): CompParcelImprovementRow {
  return {
    id: `subject-imp-${index}`,
    parcel_id: null,
    comp_id: null,
    project_id: "",
    instrument_number: imp.instrumentNumber ?? null,
    apn: imp.APN ?? "",
    building_number: imp["Building #"] ?? 1,
    section_number: imp["Section #"] ?? 1,
    year_built: imp["Year Built"] ?? null,
    effective_year_built: null,
    gross_building_area_sf: imp["Gross Building Area (SF)"] ?? null,
    office_area_sf: imp["Office Area (SF)"] ?? null,
    warehouse_area_sf: imp["Warehouse Area (SF)"] ?? null,
    parking_sf: imp["Parking (SF)"] ?? null,
    storage_area_sf: imp["Storage Area (SF)"] ?? null,
    is_gla: imp["Is GLA"] ?? true,
    construction: imp.Construction ?? null,
    comments: imp.Comments ?? null,
    created_at: "",
    updated_at: "",
  };
}

export function rowToParcelImprovement(
  row: CompParcelImprovementRow,
): ParcelImprovement {
  return {
    instrumentNumber: row.instrument_number,
    APN: row.apn,
    "Building #": row.building_number,
    "Section #": row.section_number,
    "Year Built": row.year_built,
    "Gross Building Area (SF)": row.gross_building_area_sf,
    "Office Area (SF)": row.office_area_sf,
    "Warehouse Area (SF)": row.warehouse_area_sf,
    "Parking (SF)": row.parking_sf,
    "Storage Area (SF)": row.storage_area_sf,
    "Is GLA": row.is_gla,
    Construction: row.construction ?? "",
    Comments: row.comments,
  };
}

// ---------------------------------------------------------------------------
// Column definitions (excludes Is GLA which is a special toggle)
// ---------------------------------------------------------------------------

const COLUMNS: {
  key: keyof CompParcelImprovementRow;
  label: string;
  type?: "text" | "number";
  minWidth: string;
}[] = [
  { key: "apn", label: "APN", minWidth: "min-w-[100px]" },
  { key: "building_number", label: "Bldg #", type: "number", minWidth: "min-w-[56px]" },
  { key: "section_number", label: "Sec #", type: "number", minWidth: "min-w-[52px]" },
  { key: "year_built", label: "Yr Built", type: "number", minWidth: "min-w-[68px]" },
  { key: "effective_year_built", label: "Eff Yr", type: "number", minWidth: "min-w-[64px]" },
  { key: "gross_building_area_sf", label: "GBA (SF)", type: "number", minWidth: "min-w-[80px]" },
  { key: "office_area_sf", label: "Office (SF)", type: "number", minWidth: "min-w-[80px]" },
  { key: "warehouse_area_sf", label: "Whse (SF)", type: "number", minWidth: "min-w-[80px]" },
  { key: "parking_sf", label: "Parking (SF)", type: "number", minWidth: "min-w-[88px]" },
  { key: "storage_area_sf", label: "Storage (SF)", type: "number", minWidth: "min-w-[88px]" },
  { key: "construction", label: "Construction", minWidth: "min-w-[100px]" },
  { key: "comments", label: "Comments", minWidth: "min-w-[120px]" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ParcelImprovementsTableProps {
  rows: CompParcelImprovementRow[];
  onUpdate: (id: string, patch: CompParcelImprovementPatch) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onAdd?: () => Promise<void> | void;
  readOnly?: boolean;
  isLoading?: boolean;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ParcelImprovementsTable({
  rows,
  onUpdate,
  onDelete,
  onAdd,
  readOnly = false,
  isLoading = false,
  error = null,
}: ParcelImprovementsTableProps) {
  if (isLoading) {
    return (
      <div className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">
        Loading improvement data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60">
              {/* Is GLA column first — most important filter */}
              <th className="min-w-[56px] whitespace-nowrap px-2 py-2 text-left font-medium text-gray-600 dark:text-gray-400">
                Is GLA
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`${col.minWidth} whitespace-nowrap px-2 py-2 text-left font-medium text-gray-600 dark:text-gray-400`}
                >
                  {col.label}
                </th>
              ))}
              {!readOnly && (
                <th className="w-8 px-1 py-2 text-left font-medium text-gray-600 dark:text-gray-400" />
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + (readOnly ? 1 : 2)}
                  className="px-3 py-5 text-center text-xs text-gray-400 dark:text-gray-500"
                >
                  No improvement records found.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={
                    idx % 2 === 0
                      ? "bg-white dark:bg-transparent"
                      : "bg-gray-50/60 dark:bg-gray-800/20"
                  }
                >
                  {/* Is GLA toggle — first column, prominently displayed */}
                  <td className="px-2 py-1">
                    {readOnly ? (
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          row.is_gla
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        {row.is_gla ? "Yes" : "No"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          void onUpdate(row.id, { is_gla: !row.is_gla })
                        }
                        title={row.is_gla ? "GLA — click to exclude" : "Excluded — click to include as GLA"}
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium transition hover:opacity-80 ${
                          row.is_gla
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        {row.is_gla ? "GLA" : "Excl"}
                      </button>
                    )}
                  </td>

                  {COLUMNS.map((col) => (
                    <td key={col.key} className="px-1.5 py-1">
                      {readOnly ? (
                        <span className="block px-1 py-0.5 text-gray-900 dark:text-gray-100">
                          {row[col.key] != null ? String(row[col.key]) : "—"}
                        </span>
                      ) : (
                        <EditableCell
                          value={row[col.key] as string | number | null}
                          type={col.type}
                          onCommit={(v) => {
                            const patch: CompParcelImprovementPatch = {};
                            if (col.type === "number") {
                              const n =
                                v.trim() === ""
                                  ? null
                                  : parseFloat(v.replace(/[$,]/g, ""));
                              (patch as Record<string, unknown>)[col.key] =
                                n != null && Number.isFinite(n) ? n : null;
                            } else {
                              (patch as Record<string, unknown>)[col.key] =
                                v || null;
                            }
                            void onUpdate(row.id, patch);
                          }}
                        />
                      )}
                    </td>
                  ))}

                  {!readOnly && (
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => void onDelete(row.id)}
                        title="Delete improvement"
                        className="inline-flex items-center justify-center rounded p-0.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        <TrashIcon className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && onAdd && (
        <button
          type="button"
          onClick={() => void onAdd()}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
        >
          <PlusIcon className="h-3.5 w-3.5" aria-hidden />
          Add Improvement
        </button>
      )}
    </div>
  );
}
