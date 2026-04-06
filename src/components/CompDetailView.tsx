"use client";

import { useState, useCallback } from "react";
import { useCompParsedData } from "~/hooks/useCompParsedData";
import type { LandSaleData, SaleData, RentalData, CompType } from "~/types/comp-data";

interface CompDetailViewProps {
  compId: string;
  compType: CompType;
  compNumber?: string;
  compAddress?: string;
}

type AnyCompData = LandSaleData | SaleData | RentalData;

function fieldValue(data: Record<string, unknown>, key: string): string {
  const val = data[key];
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "object") return JSON.stringify(val);
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(val);
}

interface FieldDef {
  key: string;
  label: string;
}

const LAND_FIELDS: { section: string; fields: FieldDef[] }[] = [
  {
    section: "Property Information",
    fields: [
      { key: "Address", label: "Address" },
      { key: "APN", label: "APN" },
      { key: "Legal", label: "Legal" },
      { key: "Land Size (AC)", label: "Land Size (AC)" },
      { key: "Land Size (SF)", label: "Land Size (SF)" },
      { key: "Zoning", label: "Zoning" },
      { key: "Zoning Description", label: "Zoning Description" },
      { key: "Zoning Location", label: "Zoning Location" },
      { key: "Corner", label: "Corner" },
      { key: "Highway Frontage", label: "Highway Frontage" },
    ],
  },
  {
    section: "Sale Information",
    fields: [
      { key: "Sale Price", label: "Sale Price" },
      { key: "Date of Sale", label: "Date of Sale" },
      { key: "Recording", label: "Recording" },
      { key: "Grantor", label: "Grantor" },
      { key: "Grantee", label: "Grantee" },
      { key: "Financing Terms", label: "Financing Terms" },
      { key: "Property Rights", label: "Property Rights" },
      { key: "Conditions of Sale", label: "Conditions of Sale" },
    ],
  },
  {
    section: "Utilities",
    fields: [
      { key: "Utils - Electricity", label: "Electricity" },
      { key: "Utils - Water", label: "Water" },
      { key: "Utils - Sewer", label: "Sewer" },
      { key: "Surface", label: "Surface" },
    ],
  },
  {
    section: "Verification",
    fields: [
      { key: "Verification Type", label: "Verification Type" },
      { key: "Verified By", label: "Verified By" },
      { key: "MLS #", label: "MLS #" },
      { key: "Taxes", label: "Taxes" },
    ],
  },
];

const SALES_FIELDS: { section: string; fields: FieldDef[] }[] = [
  {
    section: "Property Information",
    fields: [
      { key: "Address", label: "Address" },
      { key: "APN", label: "APN" },
      { key: "Legal", label: "Legal" },
      { key: "Property Type", label: "Property Type" },
      { key: "Land Size (AC)", label: "Land Size (AC)" },
      { key: "Building Size (SF)", label: "Building Size (SF)" },
      { key: "Parking (SF)", label: "Parking (SF)" },
      { key: "Land / Bld Ratio", label: "Land / Bld Ratio" },
      { key: "Year Built", label: "Year Built" },
      { key: "Condition", label: "Condition" },
      { key: "Construction", label: "Construction" },
      { key: "Other Features", label: "Other Features" },
      { key: "HVAC", label: "HVAC" },
      { key: "Overhead Doors", label: "Overhead Doors" },
      { key: "Wash Bay", label: "Wash Bay" },
      { key: "Hoisting", label: "Hoisting" },
      { key: "Zoning", label: "Zoning" },
      { key: "Zoning Location", label: "Zoning Location" },
    ],
  },
  {
    section: "Sale Information",
    fields: [
      { key: "Sale Price", label: "Sale Price" },
      { key: "Date of Sale", label: "Date of Sale" },
      { key: "Recording", label: "Recording" },
      { key: "Grantor", label: "Grantor" },
      { key: "Grantee", label: "Grantee" },
      { key: "Financing Terms", label: "Financing Terms" },
      { key: "Property Rights", label: "Property Rights" },
      { key: "Conditions of Sale", label: "Conditions of Sale" },
      { key: "Occupancy %", label: "Occupancy %" },
    ],
  },
  {
    section: "Income Analysis",
    fields: [
      { key: "Vacancy %", label: "Vacancy %" },
      { key: "Effective Gross Income", label: "Effective Gross Income" },
      { key: "Taxes", label: "Taxes" },
      { key: "Insurance", label: "Insurance" },
      { key: "Expenses", label: "Expenses" },
      { key: "Net Operating Income", label: "Net Operating Income" },
      { key: "Overall Cap Rate", label: "Overall Cap Rate" },
      { key: "Gross Income Multiplier", label: "Gross Income Multiplier" },
      { key: "GPI", label: "GPI" },
    ],
  },
];

const RENTALS_FIELDS: { section: string; fields: FieldDef[] }[] = [
  {
    section: "Property Information",
    fields: [
      { key: "Address", label: "Address" },
      { key: "APN", label: "APN" },
      { key: "Legal", label: "Legal" },
      { key: "Property Type", label: "Property Type" },
      { key: "Land Size (AC)", label: "Land Size (AC)" },
      { key: "Rentable SF", label: "Rentable SF" },
      { key: "Year Built", label: "Year Built" },
      { key: "Condition", label: "Condition" },
      { key: "Construction", label: "Construction" },
      { key: "HVAC", label: "HVAC" },
      { key: "Overhead Doors", label: "Overhead Doors" },
      { key: "Zoning", label: "Zoning" },
    ],
  },
  {
    section: "Lease Information",
    fields: [
      { key: "Lessor", label: "Lessor" },
      { key: "Tenant", label: "Tenant" },
      { key: "Lease Start", label: "Lease Start" },
      { key: "Lease Term", label: "Lease Term" },
      { key: "Expense Structure", label: "Expense Structure" },
      { key: "Tenant Structure", label: "Tenant Structure" },
      { key: "Occupancy %", label: "Occupancy %" },
      { key: "Rent / Month Start", label: "Rent / Month Start" },
      { key: "Rent / Month", label: "Rent / Month" },
      { key: "% Increase / Year", label: "% Increase / Year" },
    ],
  },
];

function getFieldDefs(type: CompType) {
  switch (type) {
    case "land":
      return LAND_FIELDS;
    case "sales":
      return SALES_FIELDS;
    case "rentals":
      return RENTALS_FIELDS;
  }
}

function EditableField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mb-1.5 grid grid-cols-[160px_1fr] gap-3 text-sm">
      <div className="text-gray-500 dark:text-gray-400">{label}</div>
      <input
        type="text"
        value={value === "—" ? "" : value}
        placeholder="—"
        onChange={(e) => onChange(e.target.value)}
        className="rounded border-0 bg-transparent px-0 py-0 text-gray-900 placeholder-gray-300 focus:ring-0 focus:border-b focus:border-blue-400 dark:text-gray-100"
      />
    </div>
  );
}

export function CompDetailView({
  compId,
  compType,
  compNumber,
  compAddress,
}: CompDetailViewProps) {
  const { parsedData, isLoading, error, saveParsedData } =
    useCompParsedData(compId);

  const [editData, setEditData] = useState<Record<string, unknown> | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">(
    "idle",
  );

  const displayData = editData ?? (parsedData?.raw_data as Record<string, unknown>) ?? {};

  const handleFieldChange = useCallback((key: string, value: string) => {
    setEditData((prev) => ({
      ...(prev ?? (parsedData?.raw_data as Record<string, unknown>) ?? {}),
      [key]: value || null,
    }));
    setSaveStatus("idle");
  }, [parsedData]);

  const handleSave = async () => {
    if (!editData) return;
    setIsSaving(true);
    try {
      await saveParsedData(editData as unknown as AnyCompData);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        Loading comp data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!parsedData) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center dark:border-gray-700 dark:bg-gray-800/30">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          No parsed data yet.
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          Use the &quot;Parse Files&quot; button on the Comps page to extract data from
          Drive documents.
        </p>
      </div>
    );
  }

  const fieldDefs = getFieldDefs(compType);
  const comments = fieldValue(displayData, "Comments");
  const hasEdits = editData !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase text-gray-900 dark:text-gray-100">
            {compType === "land"
              ? "Land Sale"
              : compType === "sales"
                ? "Comparable Sale"
                : "Rental Comp"}{" "}
            No. {compNumber ?? "?"}
          </h2>
          {compAddress && (
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {compAddress}
            </p>
          )}
        </div>
        {hasEdits && (
          <div className="flex items-center gap-3">
            {saveStatus === "saved" && (
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                Saved ✓
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-sm text-red-600 dark:text-red-400">
                Save failed
              </span>
            )}
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white shadow-sm dark:bg-gray-900">
        {/* Two-column section grid */}
        <div className="grid gap-0 md:grid-cols-2">
          {fieldDefs.map((section) => (
            <div key={section.section} className="border border-gray-200 p-5 dark:border-gray-700">
              <h3 className="mb-3 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {section.section}
              </h3>
              {section.fields.map(({ key, label }) => (
                <EditableField
                  key={key}
                  label={label}
                  value={fieldValue(displayData, key)}
                  onChange={(v) => handleFieldChange(key, v)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Comments */}
        <div className="border border-t-0 border-gray-200 p-5 dark:border-gray-700">
          <h3 className="mb-3 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Comments
          </h3>
          <textarea
            value={comments === "—" ? "" : comments}
            placeholder="No comments"
            rows={3}
            onChange={(e) => handleFieldChange("Comments", e.target.value)}
            className="w-full resize-none border-0 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:ring-0 dark:text-gray-100"
          />
        </div>

        {/* Parse metadata */}
        {parsedData.parsed_at && (
          <div className="border border-t-0 border-gray-200 px-5 py-2 dark:border-gray-700">
            <p className="text-xs text-gray-400">
              Parsed on{" "}
              {new Date(parsedData.parsed_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              · Source: {parsedData.source}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
