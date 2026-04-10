"use client";

import { useCallback, useState } from "react";
import { TrashIcon, PlusIcon } from "@heroicons/react/24/outline";
import type { CompParcelRow, CompParcelPatch } from "~/hooks/useCompParcels";
import type { ParcelData } from "~/types/comp-data";

// ---------------------------------------------------------------------------
// Shared cell components
// ---------------------------------------------------------------------------

function EditableCell({
  value,
  onCommit,
  type = "text",
  className = "",
  placeholder = "—",
}: {
  value: string | number | null | undefined;
  onCommit: (v: string) => void;
  type?: "text" | "number";
  className?: string;
  placeholder?: string;
}) {
  const display = value != null && value !== "" ? String(value) : "";
  const [localVal, setLocalVal] = useState(display);

  const handleBlur = useCallback(() => {
    onCommit(localVal);
  }, [localVal, onCommit]);

  // Keep in sync when parent updates (e.g. realtime)
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
      className={`w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-gray-900 placeholder-gray-400 hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 dark:text-gray-100 dark:placeholder-gray-600 dark:hover:border-gray-600 dark:focus:border-blue-400 dark:focus:bg-gray-950/60 ${className}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Adapter: Convert ParcelData (subject JSONB) to CompParcelRow-like shape
// ---------------------------------------------------------------------------

export function parcelDataToRow(p: ParcelData, index: number): CompParcelRow {
  return {
    id: `subject-parcel-${index}`,
    comp_id: null,
    project_id: "",
    instrument_number: p.instrumentNumber ?? null,
    apn: p.APN ?? "",
    apn_link: p["APN Link"] ?? null,
    location: p.Location ?? null,
    legal: p.Legal ?? null,
    lot_number: p["Lot #"] ?? null,
    size_ac: p["Size (AC)"] ?? null,
    size_sf: p["Size (SF)"] ?? null,
    building_size_sf: p["Building Size (SF)"] ?? null,
    office_area_sf: p["Office Area (SF)"] ?? null,
    warehouse_area_sf: p["Warehouse Area (SF)"] ?? null,
    parking_sf: p["Parking (SF)"] ?? null,
    storage_area_sf: p["Storage Area (SF)"] ?? null,
    buildings: p.Buildings ?? null,
    total_tax_amount: p["Total Tax Amount"] != null ? parseFloat(String(p["Total Tax Amount"]).replace(/[$,]/g, "")) || null : null,
    county_appraised_value: p["County Appraised Value"] != null ? parseFloat(String(p["County Appraised Value"]).replace(/[$,]/g, "")) || null : null,
    created_at: "",
    updated_at: "",
  };
}

export function rowToParcelData(row: CompParcelRow): ParcelData {
  return {
    instrumentNumber: row.instrument_number,
    APN: row.apn,
    "APN Link": row.apn_link ?? "",
    Location: row.location ?? "",
    Legal: row.legal ?? "",
    "Lot #": row.lot_number,
    "Size (AC)": row.size_ac,
    "Size (SF)": row.size_sf,
    "Flood Zone": null,
    "Building Size (SF)": row.building_size_sf,
    "Office Area (SF)": row.office_area_sf,
    "Warehouse Area (SF)": row.warehouse_area_sf,
    "Storage Area (SF)": row.storage_area_sf,
    "Parking (SF)": row.parking_sf,
    Buildings: row.buildings,
    "Total Tax Amount": row.total_tax_amount != null ? String(row.total_tax_amount) : null,
    "County Appraised Value": row.county_appraised_value != null ? String(row.county_appraised_value) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------

const COLUMNS: {
  key: keyof CompParcelRow;
  label: string;
  type?: "text" | "number";
  minWidth: string;
}[] = [
  { key: "apn", label: "APN", minWidth: "min-w-[120px]" },
  { key: "location", label: "Location", minWidth: "min-w-[120px]" },
  { key: "legal", label: "Legal", minWidth: "min-w-[120px]" },
  { key: "size_ac", label: "Size (AC)", type: "number", minWidth: "min-w-[80px]" },
  { key: "size_sf", label: "Size (SF)", type: "number", minWidth: "min-w-[88px]" },
  { key: "building_size_sf", label: "Bldg (SF)", type: "number", minWidth: "min-w-[80px]" },
  { key: "office_area_sf", label: "Office (SF)", type: "number", minWidth: "min-w-[80px]" },
  { key: "warehouse_area_sf", label: "Whse (SF)", type: "number", minWidth: "min-w-[80px]" },
  { key: "parking_sf", label: "Parking (SF)", type: "number", minWidth: "min-w-[88px]" },
  { key: "storage_area_sf", label: "Storage (SF)", type: "number", minWidth: "min-w-[88px]" },
  { key: "buildings", label: "Bldgs", type: "number", minWidth: "min-w-[56px]" },
  { key: "total_tax_amount", label: "Tax Amount", type: "number", minWidth: "min-w-[96px]" },
  { key: "county_appraised_value", label: "CAD Value", type: "number", minWidth: "min-w-[96px]" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ParcelDataTableProps {
  /** Normalized rows from useCompParcels or from parcelDataToRow() for subjects */
  rows: CompParcelRow[];
  onUpdate: (id: string, patch: CompParcelPatch) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onAdd?: () => Promise<void> | void;
  readOnly?: boolean;
  isLoading?: boolean;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ParcelDataTable({
  rows,
  onUpdate,
  onDelete,
  onAdd,
  readOnly = false,
  isLoading = false,
  error = null,
}: ParcelDataTableProps) {
  if (isLoading) {
    return (
      <div className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">
        Loading parcel data…
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
                  colSpan={COLUMNS.length + (readOnly ? 0 : 1)}
                  className="px-3 py-5 text-center text-xs text-gray-400 dark:text-gray-500"
                >
                  No parcel records found.
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
                            const parsed: CompParcelPatch = {};
                            if (col.type === "number") {
                              const n = v.trim() === "" ? null : parseFloat(v.replace(/[$,]/g, ""));
                              (parsed as Record<string, unknown>)[col.key] =
                                n != null && Number.isFinite(n) ? n : null;
                            } else {
                              (parsed as Record<string, unknown>)[col.key] = v || null;
                            }
                            void onUpdate(row.id, parsed);
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
                        title="Delete parcel"
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
          Add Parcel
        </button>
      )}
    </div>
  );
}
