"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { PlusIcon, MinusIcon, ChevronUpDownIcon } from "@heroicons/react/24/outline";
import { useProject } from "~/hooks/useProject";
import { getComparablesByType, type ComparableType, type Comparable } from "~/utils/projectStore";
import { createClient } from "~/utils/supabase/client";
import {
  computeGeneratedFields,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatAcres,
} from "~/lib/calculated-fields";
import type { CompParsedDataRow } from "~/types/comp-data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompSummaryTableProps {
  projectId: string;
  compType: ComparableType;
}

interface SummaryRow {
  id: string;
  label: string;
}

type CompDataMap = Record<string, Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Default row labels per comp type
// ---------------------------------------------------------------------------

const LAND_DEFAULT_ROWS: string[] = [
  "Address",
  "Property Rights",
  "Date of Sale",
  "Land Size (AC)",
  "Land Size (SF)",
  "Sale Price",
  "Sale Price / AC",
  "Sale Price / SF",
  "Zoning",
  "Corner",
  "Highway Frontage",
  "Surface",
  "Comments",
];

const SALES_DEFAULT_ROWS: string[] = [
  "Address",
  "Property Rights",
  "Date of Sale",
  "Land Size (AC)",
  "Building Size (SF)",
  "Sale Price",
  "Sale Price / SF",
  "Land / Bld Ratio",
  "Age",
  "Condition",
  "Year Built",
  "Office %",
  "Zoning",
];

const RENTALS_DEFAULT_ROWS: string[] = [
  "Address",
  "Property Type",
  "Lease Start",
  "Rentable SF",
  "Rent / Month",
  "Rent / SF / Year",
  "Expense Structure",
  "Land / Bld Ratio",
  "Age",
  "Condition",
  "Year Built",
  "Zoning",
];

function getDefaultRows(compType: ComparableType): string[] {
  switch (compType) {
    case "Land":
      return LAND_DEFAULT_ROWS;
    case "Sales":
      return SALES_DEFAULT_ROWS;
    case "Rentals":
      return RENTALS_DEFAULT_ROWS;
  }
}

// All available field keys per comp type (sourced from type defs)
const LAND_FIELDS: string[] = [
  "#", "Address", "Use Type", "Grantor", "Grantee", "Recording",
  "Date of Sale", "Market Conditions", "Sale Price", "Financing Terms",
  "Property Rights", "Conditions of Sale", "Sale Price / AC", "Sale Price / SF",
  "Land Size (AC)", "Land Size (SF)", "APN", "Legal", "Corner",
  "Highway Frontage", "Utils - Electricity", "Utils - Water", "Utils - Sewer",
  "Surface", "Zoning Location", "Zoning Description", "Zoning", "Taxes",
  "MLS #", "Verification Type", "Verified By", "Verification", "Comments",
];

const SALES_FIELDS: string[] = [
  "#", "Address", "Use Type", "Grantor", "Grantee", "Recording",
  "Date of Sale", "Market Conditions", "Sale Price", "Financing Terms",
  "Property Rights", "Conditions of Sale", "Sale Price / SF",
  "Improvements / SF", "Land Size (AC)", "Land Size (SF)", "Land Value",
  "APN", "Legal", "Building Size (SF)", "Occupancy %", "Land / Bld Ratio",
  "Property Type", "Construction", "Other Features", "Parking (SF)",
  "Buildings", "Year Built", "Effective Age", "Condition", "HVAC",
  "Overhead Doors", "Wash Bay", "Hoisting", "Zoning Location",
  "Zoning Description", "Zoning", "Rent / SF", "Potential Gross Income",
  "Vacancy %", "Vacancy", "Effective Gross Income", "Taxes", "Insurance",
  "Expenses", "Net Operating Income", "Overall Cap Rate", "GPI",
  "Gross Income Multiplier", "Potential Value", "MLS #", "Verification Type",
  "Verified By", "Verification", "Comments", "Age", "Office %",
  "Floor Area Ratio", "Parking Ratio",
];

const RENTALS_FIELDS: string[] = [
  "#", "Address", "Use Type", "Lessor", "Tenant", "Recording", "APN",
  "Legal", "Zoning Location", "Zoning Description", "Zoning",
  "Land Size (AC)", "Land Size (SF)", "Rentable SF", "Office %",
  "Land / Bld Ratio", "Occupancy %", "Property Type", "Lease Start",
  "Rent / Month Start", "Lease Term", "% Increase / Year", "Rent / Month",
  "Expense Structure", "Rent / SF / Year", "Tenant Structure", "Year Built",
  "Age", "Effective Age", "Condition", "HVAC", "Overhead Doors", "Wash Bay",
  "Hoisting", "Construction", "Other Features", "MLS #", "Verification Type",
  "Verified By", "Verification", "Comments",
];

function getAvailableFields(compType: ComparableType): string[] {
  switch (compType) {
    case "Land":
      return LAND_FIELDS;
    case "Sales":
      return SALES_FIELDS;
    case "Rentals":
      return RENTALS_FIELDS;
  }
}

// ---------------------------------------------------------------------------
// Storage key for persisting row config
// ---------------------------------------------------------------------------

function storageKey(projectId: string, compType: ComparableType): string {
  return `comp-summary-rows:${projectId}:${compType}`;
}

function loadSavedRows(projectId: string, compType: ComparableType): SummaryRow[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(projectId, compType));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SummaryRow[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // ignore
  }
  return null;
}

function saveRows(projectId: string, compType: ComparableType, rows: SummaryRow[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(projectId, compType), JSON.stringify(rows));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

const CURRENCY_FIELDS = new Set([
  "Sale Price", "Sale Price / AC", "Sale Price / SF", "Improvements / SF",
  "Land Value", "Rent / SF", "Potential Gross Income", "Vacancy",
  "Effective Gross Income", "Taxes", "Insurance", "Expenses",
  "Net Operating Income", "GPI", "Potential Value", "Rent / Month",
  "Rent / Month Start", "Rent / SF / Year",
]);

const PERCENT_FIELDS = new Set([
  "Office %", "Occupancy %", "Vacancy %", "Overall Cap Rate",
  "Market Conditions", "% Increase / Year",
]);

const ACRES_FIELDS = new Set(["Land Size (AC)"]);

const RATIO_FIELDS = new Set([
  "Land / Bld Ratio", "Floor Area Ratio", "Parking Ratio",
  "Gross Income Multiplier",
]);

function formatValue(key: string, value: unknown): string {
  if (value == null || value === "") return "--";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  const num = typeof value === "number" ? value : (typeof value === "string" ? parseFloat(value) : NaN);

  if (!isNaN(num)) {
    if (CURRENCY_FIELDS.has(key)) return formatCurrency(num);
    if (PERCENT_FIELDS.has(key)) return formatPercent(num);
    if (ACRES_FIELDS.has(key)) return formatAcres(num);
    if (RATIO_FIELDS.has(key)) return formatNumber(num, 2);
    if (key === "Land Size (SF)" || key === "Building Size (SF)" || key === "Rentable SF" || key === "Parking (SF)") {
      return formatNumber(num, 0);
    }
    if (Number.isInteger(num)) return formatNumber(num, 0);
    return formatNumber(num, 2);
  }

  if (typeof value === "object") return JSON.stringify(value);
  return String(value as string | number);
}

// ---------------------------------------------------------------------------
// Batch loader hook for comp parsed data
// ---------------------------------------------------------------------------

function useCompParsedDataBatch(compIds: string[]): {
  dataMap: CompDataMap;
  isLoading: boolean;
} {
  const [dataMap, setDataMap] = useState<CompDataMap>({});
  const [isLoading, setIsLoading] = useState(true);

  const idsKey = compIds.join(",");

  useEffect(() => {
    if (compIds.length === 0) {
      setDataMap({});
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("comp_parsed_data")
          .select("comp_id, raw_data")
          .in("comp_id", compIds);

        if (error) throw error;
        if (cancelled) return;

        const map: CompDataMap = {};
        for (const row of (data ?? []) as Pick<CompParsedDataRow, "comp_id" | "raw_data">[]) {
          if (row.comp_id && row.raw_data) {
            const enriched = computeGeneratedFields(row.raw_data as Record<string, unknown>);
            map[row.comp_id] = enriched;
          }
        }
        setDataMap(map);
      } catch (err) {
        console.error("Failed to batch-load comp parsed data", err);
        if (!cancelled) setDataMap({});
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return { dataMap, isLoading };
}

// ---------------------------------------------------------------------------
// Row label dropdown
// ---------------------------------------------------------------------------

function RowLabelSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded border border-gray-700 bg-gray-800 py-1 pl-2 pr-7 text-xs text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <ChevronUpDownIcon className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

let rowIdCounter = 0;
function nextRowId(): string {
  return `row-${++rowIdCounter}-${Date.now()}`;
}

function buildInitialRows(labels: string[]): SummaryRow[] {
  return labels.map((label) => ({ id: nextRowId(), label }));
}

export function CompSummaryTable({ projectId, compType }: CompSummaryTableProps) {
  const { project, isLoading: projectLoading } = useProject(projectId);

  const comps = useMemo<Comparable[]>(
    () => (project ? getComparablesByType(project, compType) : []),
    [project, compType],
  );

  const compIds = useMemo(() => comps.map((c) => c.id), [comps]);
  const { dataMap, isLoading: dataLoading } = useCompParsedDataBatch(compIds);

  const availableFields = useMemo(() => getAvailableFields(compType), [compType]);

  const [rows, setRows] = useState<SummaryRow[]>(() => {
    const saved = loadSavedRows(projectId, compType);
    return saved ?? buildInitialRows(getDefaultRows(compType));
  });

  // Persist rows on change
  useEffect(() => {
    saveRows(projectId, compType, rows);
  }, [rows, projectId, compType]);

  const updateRowLabel = useCallback((rowId: string, newLabel: string) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, label: newLabel } : r)));
  }, []);

  const addRow = useCallback(() => {
    const usedLabels = new Set(rows.map((r) => r.label));
    const nextLabel = availableFields.find((f) => !usedLabels.has(f)) ?? availableFields[0] ?? "";
    setRows((prev) => [...prev, { id: nextRowId(), label: nextLabel }]);
  }, [rows, availableFields]);

  const removeRow = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const resetToDefaults = useCallback(() => {
    setRows(buildInitialRows(getDefaultRows(compType)));
  }, [compType]);

  const isLoading = projectLoading || dataLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
        <span className="ml-3 text-sm text-gray-400">Loading summary data…</span>
      </div>
    );
  }

  if (comps.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-12 text-center">
        <p className="text-sm text-gray-400">
          No {compType.toLowerCase()} comparables found for this project.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Add comps from the Comps page, then return here to see the summary.
        </p>
      </div>
    );
  }

  const hasAnyData = Object.keys(dataMap).length > 0;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={addRow}
            className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-300 transition hover:border-blue-600 hover:text-blue-400"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add Row
          </button>
          <button
            onClick={resetToDefaults}
            className="rounded-md px-2.5 py-1.5 text-xs text-gray-500 transition hover:text-gray-300"
          >
            Reset Defaults
          </button>
        </div>
        <span className="text-xs text-gray-500">
          {comps.length} comp{comps.length !== 1 ? "s" : ""} · {rows.length} row{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          {/* Header: comp numbers */}
          <thead>
            <tr className="bg-gray-900">
              <th className="sticky left-0 z-10 min-w-[180px] border-b border-r border-gray-800 bg-gray-900 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                Field
              </th>
              {comps.map((comp, i) => (
                <th
                  key={comp.id}
                  className="min-w-[130px] border-b border-gray-800 px-3 py-2 text-center text-xs font-semibold text-gray-300"
                >
                  <span className="text-blue-400">#{comp.number ?? i + 1}</span>
                </th>
              ))}
              <th className="w-8 border-b border-gray-800 bg-gray-900" />
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIdx) => (
              <tr
                key={row.id}
                className={rowIdx % 2 === 0 ? "bg-gray-950" : "bg-gray-900/50"}
              >
                {/* Label cell with dropdown */}
                <td className="sticky left-0 z-10 border-r border-gray-800 px-2 py-1.5"
                  style={{ backgroundColor: rowIdx % 2 === 0 ? "rgb(3 7 18)" : "rgb(17 24 39 / 0.5)" }}
                >
                  <RowLabelSelect
                    value={row.label}
                    options={availableFields}
                    onChange={(v) => updateRowLabel(row.id, v)}
                  />
                </td>

                {/* Value cells */}
                {comps.map((comp) => {
                  const compData = dataMap[comp.id];
                  const rawValue = compData?.[row.label];
                  const display = hasAnyData && compData
                    ? formatValue(row.label, rawValue)
                    : "--";

                  return (
                    <td
                      key={comp.id}
                      className="whitespace-nowrap border-gray-800 px-3 py-1.5 text-center text-xs text-gray-300"
                    >
                      {display}
                    </td>
                  );
                })}

                {/* Remove button */}
                <td className="px-1 py-1.5 text-center">
                  <button
                    onClick={() => removeRow(row.id)}
                    className="rounded p-0.5 text-gray-600 transition hover:bg-red-900/30 hover:text-red-400"
                    title="Remove row"
                  >
                    <MinusIcon className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={comps.length + 2}
                  className="px-4 py-8 text-center text-xs text-gray-500"
                >
                  No rows configured. Click &ldquo;Add Row&rdquo; to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!hasAnyData && comps.length > 0 && (
        <p className="text-center text-xs text-gray-500">
          No parsed data available yet. Parse comp documents to populate this table.
        </p>
      )}
    </div>
  );
}
