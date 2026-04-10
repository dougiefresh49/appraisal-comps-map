"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TableCellsIcon } from "@heroicons/react/24/outline";
import { MapBanner } from "~/components/MapBanner";
import { ToggleSwitch } from "~/components/ToggleField";
import { ParcelDataTable, parcelDataToRow, rowToParcelData } from "~/components/ParcelDataTable";
import { ParcelImprovementsTable, parcelImprovementToRow, rowToParcelImprovement } from "~/components/ParcelImprovementsTable";
import { useCompParsedData } from "~/hooks/useCompParsedData";
import type { LandSaleData, SaleData, RentalData, ParcelData, ParcelImprovement } from "~/types/comp-data";
import type { CompParcelPatch, CompParcelImprovementPatch } from "~/hooks/useCompParcels";
import {
  acToSf,
  adjSalePrice,
  buildOtherFeatures,
  calcAge,
  excessLandValue,
  formatCurrency,
  formatNumber,
  formatPercent,
  getVerificationVal,
  getZoneVal,
  landBldRatio,
  landBldRatioAdj,
  officePercent,
  rentPerSfPerYear,
  salePricePerAc,
  salePricePerSf,
  warehousePercent,
} from "~/lib/calculated-fields";
import {
  CONDITION_OPTIONS,
  CONDITIONS_OF_SALE_OPTIONS,
  FENCE_TYPE_OPTIONS,
  FINANCING_TERMS_OPTIONS,
  FRONTAGE_OPTIONS,
  HAS_FENCING_OPTIONS,
  HVAC_OPTIONS,
  PROPERTY_RIGHTS_OPTIONS,
  SURFACE_OPTIONS,
  USE_TYPE_OPTIONS,
  UTILITIES_STATUS_OPTIONS,
  UTILS_ELECTRICITY_OPTIONS,
  UTILS_SEWER_OPTIONS,
  UTILS_WATER_OPTIONS,
  VERIFICATION_TYPE_OPTIONS,
  WASH_BAY_OPTIONS,
  ZONING_LOCATION_OPTIONS,
} from "~/types/comp-field-options";
import {
  mapTypeForCompType,
  type ComparableType,
  type ComparableParsedDataStatus,
} from "~/utils/projectStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FieldDef = {
  key: string;
  label: string;
  variant?: "text" | "textarea" | "select" | "toggle" | "computed";
  options?: readonly string[];
  computeFn?: (draft: Record<string, unknown>) => string;
};
type SectionDef = { title: string; fields: FieldDef[] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function draftString(v: unknown): string {
  if (v == null) return "";
  if (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  ) {
    return String(v);
  }
  return "";
}

function draftNumeric(
  d: Record<string, unknown>,
  key: string,
): number | null {
  const v = d[key];
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const s = v.replace(/[$,\s]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * True when SF matches acres × 43,560 (same rule as computeGeneratedFields).
 * Allows a small float tolerance for rounded display values.
 */
function isLandSfGeneratedFromAc(d: Record<string, unknown>): boolean {
  const ac = draftNumeric(d, "Land Size (AC)");
  const sf = draftNumeric(d, "Land Size (SF)");
  if (ac == null || sf == null) return false;
  const expected = acToSf(ac);
  if (expected == null) return false;
  return Math.abs(sf - expected) < 0.05;
}

/** Yes/No fields may be stored as boolean or legacy "Yes"/"No" strings. */
function draftToggleValue(
  d: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const v = d[key];
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "Yes") return true;
    if (t === "No") return false;
  }
  return undefined;
}

function formatDateOfSaleMarketDisplay(d: Record<string, unknown>): string {
  const raw = d["Date of Sale"];
  if (raw == null || raw === "") return "—";
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  }
  if (typeof raw !== "string" && typeof raw !== "number") return "—";
  const str = String(raw).trim();
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  }
  return str || "—";
}

export function mapBannerImageType(compType: ComparableType): string {
  switch (compType) {
    case "Land":
      return "comps-land";
    case "Sales":
      return "comps-sales";
    case "Rentals":
      return "comps-rentals";
  }
}

export function fieldToInputString(
  data: Record<string, unknown>,
  key: string,
): string {
  const val = data[key];
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "object") return JSON.stringify(val);
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(val);
}

export function parseInputForStorage(value: string): unknown {
  const t = value.trim();
  if (t === "") return null;
  if (t === "Yes") return true;
  if (t === "No") return false;
  const n = Number(t);
  if (t !== "" && !Number.isNaN(n) && t === String(n)) return n;
  return value;
}

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

const LAND_SECTIONS: SectionDef[] = [
  {
    title: "Property Info",
    fields: [
      { key: "Address", label: "Address" },
      { key: "APN", label: "APN", variant: "textarea" },
      { key: "Legal", label: "Legal" },
      { key: "Land Size (AC)", label: "Land Size (AC)" },
      { key: "Land Size (SF)", label: "Land Size (SF)" },
      { key: "Corner", label: "Corner", variant: "toggle" },
      {
        key: "Frontage",
        label: "Frontage",
        variant: "select",
        options: FRONTAGE_OPTIONS,
      },
      {
        key: "Has Fencing",
        label: "Has Fencing",
        variant: "select",
        options: HAS_FENCING_OPTIONS,
      },
      {
        key: "Fence Type",
        label: "Fence Type",
        variant: "select",
        options: FENCE_TYPE_OPTIONS,
      },
      { key: "Fencing", label: "Fencing Notes" },
      {
        key: "Surface",
        label: "Surface",
        variant: "select",
        options: SURFACE_OPTIONS,
      },
    ],
  },
  {
    title: "Sale Info",
    fields: [
      { key: "Sale Price", label: "Sale Price" },
      {
        key: "Sale Price / AC",
        label: "Sale Price / AC",
        variant: "computed",
        computeFn: (d) => {
          const price = draftNumeric(d, "Sale Price");
          const ac = draftNumeric(d, "Land Size (AC)");
          const val = salePricePerAc(price, ac);
          return val != null ? formatCurrency(val, 2) : "—";
        },
      },
      {
        key: "Sale Price / SF",
        label: "Sale Price / SF",
        variant: "computed",
        computeFn: (d) => {
          const price = draftNumeric(d, "Sale Price");
          const sf = draftNumeric(d, "Land Size (SF)");
          const val = salePricePerSf(price, sf);
          return val != null ? formatCurrency(val, 2) : "—";
        },
      },
      { key: "Date of Sale", label: "Date of Sale" },
      {
        key: "Market Conditions",
        label: "Market Conditions",
        variant: "computed",
        computeFn: (d) => formatDateOfSaleMarketDisplay(d),
      },
      { key: "Recording", label: "Recording" },
      { key: "Grantor", label: "Grantor" },
      { key: "Grantee", label: "Grantee" },
      {
        key: "Financing Terms",
        label: "Financing Terms",
        variant: "select",
        options: FINANCING_TERMS_OPTIONS,
      },
      {
        key: "Property Rights",
        label: "Property Rights",
        variant: "select",
        options: PROPERTY_RIGHTS_OPTIONS,
      },
      {
        key: "Conditions of Sale",
        label: "Conditions of Sale",
        variant: "select",
        options: CONDITIONS_OF_SALE_OPTIONS,
      },
    ],
  },
  {
    title: "Utilities",
    fields: [
      {
        key: "Utils - Electricity",
        label: "Electricity",
        variant: "select",
        options: UTILS_ELECTRICITY_OPTIONS,
      },
      {
        key: "Utils - Water",
        label: "Water",
        variant: "select",
        options: UTILS_WATER_OPTIONS,
      },
      {
        key: "Utils - Sewer",
        label: "Sewer",
        variant: "select",
        options: UTILS_SEWER_OPTIONS,
      },
      {
        key: "Utilities",
        label: "Utilities (Overall)",
        variant: "select",
        options: UTILITIES_STATUS_OPTIONS,
      },
    ],
  },
  {
    title: "Zoning",
    fields: [
      {
        key: "Zoning Location",
        label: "Zoning Location",
        variant: "select",
        options: ZONING_LOCATION_OPTIONS,
      },
      { key: "Zoning Description", label: "Zoning Description" },
      {
        key: "Zoning",
        label: "Zoning",
        variant: "computed",
        computeFn: (d) => {
          const loc = draftString(d["Zoning Location"]);
          const desc = draftString(d["Zoning Description"]);
          const s = getZoneVal(loc || undefined, desc || undefined);
          return s !== "" ? s : "—";
        },
      },
    ],
  },
  {
    title: "Verification & Misc",
    fields: [
      {
        key: "Verification Type",
        label: "Verification Type",
        variant: "select",
        options: VERIFICATION_TYPE_OPTIONS,
      },
      { key: "Verified By", label: "Verified By" },
      { key: "MLS #", label: "MLS #" },
      {
        key: "Verification",
        label: "Verification",
        variant: "computed",
        computeFn: (d) => {
          const typeStr = draftString(d["Verification Type"]);
          const type = typeStr !== "" ? typeStr : undefined;
          const byStr = draftString(d["Verified By"]);
          const by = byStr !== "" ? byStr : undefined;
          const mlsRaw = d["MLS #"];
          const mls =
            typeof mlsRaw === "number" || typeof mlsRaw === "string"
              ? mlsRaw
              : undefined;
          const s = getVerificationVal(type, by, mls);
          return s !== "" ? s : "—";
        },
      },
      { key: "Taxes", label: "Taxes" },
    ],
  },
];

const SALES_SECTIONS: SectionDef[] = [
  {
    title: "Property Info",
    fields: [
      { key: "Address", label: "Address" },
      { key: "APN", label: "APN", variant: "textarea" },
      { key: "Legal", label: "Legal" },
      { key: "Land Size (AC)", label: "Land Size (AC)" },
      { key: "Land Size (SF)", label: "Land Size (SF)" },
      { key: "Taxes", label: "Taxes" },
      {
        key: "Use Type",
        label: "Use Type",
        variant: "select",
        options: USE_TYPE_OPTIONS,
      },
      { key: "Property Type", label: "Property Type" },
    ],
  },
  {
    title: "Property Improvements",
    fields: [
      { key: "Building Size (SF)", label: "Building Size (SF)" },
      { key: "Office Area (SF)", label: "Office Area (SF)" },
      { key: "Warehouse Area (SF)", label: "Warehouse Area (SF)" },
      {
        key: "Office %",
        label: "Office %",
        variant: "computed",
        computeFn: (d) => {
          const officeSf = draftNumeric(d, "Office Area (SF)");
          const bldg = draftNumeric(d, "Building Size (SF)");
          const val = officePercent(officeSf, bldg);
          return val != null ? formatPercent(val, 1) : "—";
        },
      },
      {
        key: "Warehouse %",
        label: "Warehouse %",
        variant: "computed",
        computeFn: (d) => {
          const wh = draftNumeric(d, "Warehouse Area (SF)");
          const bldg = draftNumeric(d, "Building Size (SF)");
          const val = warehousePercent(wh, bldg);
          return val != null ? `${formatNumber(val, 1)}%` : "—";
        },
      },
      { key: "Parking (SF)", label: "Parking (SF)" },
      {
        key: "Land / Bld Ratio",
        label: "Land / Bld Ratio",
        variant: "computed",
        computeFn: (d) => {
          const landSf = draftNumeric(d, "Land Size (SF)");
          const bldg = draftNumeric(d, "Building Size (SF)");
          const val = landBldRatio(landSf, bldg);
          return val != null ? formatNumber(val, 2) : "—";
        },
      },
      { key: "Year Built", label: "Year Built" },
      {
        key: "Age",
        label: "Age",
        variant: "computed",
        computeFn: (d) => {
          const val = calcAge(
            d["Year Built"] as string | number | null | undefined,
          );
          return val != null ? formatNumber(val, 0) : "—";
        },
      },
      { key: "Effective Age", label: "Effective Age" },
      {
        key: "Condition",
        label: "Condition",
        variant: "select",
        options: CONDITION_OPTIONS,
      },
      { key: "Construction", label: "Construction" },
      {
        key: "Other Features Description",
        label: "Other Features Description",
      },
      {
        key: "Other Features",
        label: "Other Features",
        variant: "computed",
        computeFn: (d) => {
          const ohRaw = d["Overhead Doors"];
          let overheadStr: string | null = null;
          if (typeof ohRaw === "number" && !Number.isNaN(ohRaw)) {
            overheadStr = String(ohRaw);
          } else if (typeof ohRaw === "string" && ohRaw.trim() !== "") {
            overheadStr = ohRaw.trim();
          }
          const wb = d["Wash Bay"];
          const desc = draftString(d["Other Features Description"]);
          const out = buildOtherFeatures(
            overheadStr,
            wb as string | boolean | null | undefined,
            draftString(d.Hoisting) || undefined,
            desc !== "" ? desc : undefined,
          );
          return out !== "" ? out : "—";
        },
      },
      {
        key: "HVAC",
        label: "HVAC",
        variant: "select",
        options: HVAC_OPTIONS,
      },
      { key: "Overhead Doors", label: "Overhead Doors" },
      {
        key: "Wash Bay",
        label: "Wash Bay",
        variant: "select",
        options: WASH_BAY_OPTIONS,
      },
      { key: "Hoisting", label: "Hoisting" },
      {
        key: "Has Fencing",
        label: "Has Fencing",
        variant: "select",
        options: HAS_FENCING_OPTIONS,
      },
      { key: "Buildings", label: "Buildings" },
    ],
  },
  {
    title: "Sale Info",
    fields: [
      { key: "Sale Price", label: "Sale Price" },
      {
        key: "Sale Price / SF",
        label: "Sale Price / SF",
        variant: "computed",
        computeFn: (d) => {
          const price = draftNumeric(d, "Sale Price");
          const bldg = draftNumeric(d, "Building Size (SF)");
          const val = salePricePerSf(price, bldg);
          return val != null ? formatCurrency(val, 2) : "—";
        },
      },
      { key: "Date of Sale", label: "Date of Sale" },
      {
        key: "Market Conditions",
        label: "Market Conditions",
        variant: "computed",
        computeFn: (d) => formatDateOfSaleMarketDisplay(d),
      },
      { key: "Recording", label: "Recording" },
      { key: "Grantor", label: "Grantor" },
      { key: "Grantee", label: "Grantee" },
      {
        key: "Financing Terms",
        label: "Financing Terms",
        variant: "select",
        options: FINANCING_TERMS_OPTIONS,
      },
      {
        key: "Property Rights",
        label: "Property Rights",
        variant: "select",
        options: PROPERTY_RIGHTS_OPTIONS,
      },
      {
        key: "Conditions of Sale",
        label: "Conditions of Sale",
        variant: "select",
        options: CONDITIONS_OF_SALE_OPTIONS,
      },
      { key: "Renovation Cost", label: "Renovation Cost" },
      { key: "Occupancy %", label: "Occupancy %" },
    ],
  },
  {
    title: "Excess Land",
    fields: [
      { key: "Excess Land Size (AC)", label: "Excess Land Size (AC)" },
      { key: "Excess Land Value / AC", label: "Excess Land Value / AC" },
      {
        key: "Excess Land Value",
        label: "Excess Land Value",
        variant: "computed",
        computeFn: (d) => {
          const ac = draftNumeric(d, "Excess Land Size (AC)");
          const perAc = draftNumeric(d, "Excess Land Value / AC");
          const val = excessLandValue(ac, perAc);
          return val != null ? formatCurrency(val) : "—";
        },
      },
      {
        key: "Adj Sale Price",
        label: "Adj Sale Price",
        variant: "computed",
        computeFn: (d) => {
          const price = draftNumeric(d, "Sale Price");
          const elSizeAc = draftNumeric(d, "Excess Land Size (AC)");
          const elValPerAc = draftNumeric(d, "Excess Land Value / AC");
          const elVal = excessLandValue(elSizeAc, elValPerAc);
          const adj = adjSalePrice(price, elVal);
          return adj != null ? formatCurrency(adj) : "—";
        },
      },
      {
        key: "Sale Price / SF (Adj)",
        label: "Sale Price / SF (Adj)",
        variant: "computed",
        computeFn: (d) => {
          const price = draftNumeric(d, "Sale Price");
          const elSizeAc = draftNumeric(d, "Excess Land Size (AC)");
          const elValPerAc = draftNumeric(d, "Excess Land Value / AC");
          const elVal = excessLandValue(elSizeAc, elValPerAc);
          const adj = adjSalePrice(price, elVal);
          const bldg = draftNumeric(d, "Building Size (SF)");
          const val = salePricePerSf(adj, bldg);
          return val != null ? formatCurrency(val, 2) : "—";
        },
      },
      {
        key: "Improvements / SF",
        label: "Improvements / SF",
        variant: "computed",
        computeFn: (d) => {
          const price = draftNumeric(d, "Sale Price");
          const elSizeAc = draftNumeric(d, "Excess Land Size (AC)");
          const elValPerAc = draftNumeric(d, "Excess Land Value / AC");
          const elVal = excessLandValue(elSizeAc, elValPerAc);
          const bldg = draftNumeric(d, "Building Size (SF)");
          const adj = adjSalePrice(price, elVal);
          const val = salePricePerSf(adj, bldg);
          return val != null ? formatCurrency(val, 2) : "—";
        },
      },
      {
        key: "Land / Bld Ratio (Adj)",
        label: "Land / Bld Ratio (Adj)",
        variant: "computed",
        computeFn: (d) => {
          const landSf = draftNumeric(d, "Land Size (SF)");
          const excessAc = draftNumeric(d, "Excess Land Size (AC)");
          const bldg = draftNumeric(d, "Building Size (SF)");
          const val = landBldRatioAdj(landSf, excessAc, bldg);
          return val != null ? formatNumber(val, 2) : "—";
        },
      },
    ],
  },
  {
    title: "Income Analysis",
    fields: [
      { key: "Rent / Month", label: "Rent / Month" },
      {
        key: "Rent / SF",
        label: "Rent / SF",
        variant: "computed",
        computeFn: (d) => {
          const rent = draftNumeric(d, "Rent / Month");
          const bldg = draftNumeric(d, "Building Size (SF)");
          const val = rentPerSfPerYear(rent, bldg);
          return val != null ? formatCurrency(val, 2) : "—";
        },
      },
      { key: "Potential Gross Income", label: "Potential Gross Income" },
      { key: "Vacancy %", label: "Vacancy %" },
      { key: "Vacancy", label: "Vacancy" },
      { key: "Effective Gross Income", label: "Effective Gross Income" },
      { key: "Insurance", label: "Insurance" },
      { key: "Expenses", label: "Expenses" },
      { key: "Net Operating Income", label: "Net Operating Income" },
      { key: "Overall Cap Rate", label: "Overall Cap Rate" },
      { key: "Gross Income Multiplier", label: "Gross Income Multiplier" },
      { key: "GPI", label: "GPI" },
      { key: "Potential Value", label: "Potential Value" },
    ],
  },
  {
    title: "Zoning",
    fields: [
      {
        key: "Zoning Location",
        label: "Zoning Location",
        variant: "select",
        options: ZONING_LOCATION_OPTIONS,
      },
      { key: "Zoning Description", label: "Zoning Description" },
      {
        key: "Zoning",
        label: "Zoning",
        variant: "computed",
        computeFn: (d) => {
          const loc = draftString(d["Zoning Location"]);
          const desc = draftString(d["Zoning Description"]);
          const s = getZoneVal(loc || undefined, desc || undefined);
          return s !== "" ? s : "—";
        },
      },
    ],
  },
  {
    title: "Verification & Misc",
    fields: [
      { key: "MLS #", label: "MLS #" },
      {
        key: "Verification Type",
        label: "Verification Type",
        variant: "select",
        options: VERIFICATION_TYPE_OPTIONS,
      },
      { key: "Verified By", label: "Verified By" },
      {
        key: "Verification",
        label: "Verification",
        variant: "computed",
        computeFn: (d) => {
          const typeStr = draftString(d["Verification Type"]);
          const type = typeStr !== "" ? typeStr : undefined;
          const byStr = draftString(d["Verified By"]);
          const by = byStr !== "" ? byStr : undefined;
          const mlsRaw = d["MLS #"];
          const mls =
            typeof mlsRaw === "number" || typeof mlsRaw === "string"
              ? mlsRaw
              : undefined;
          const s = getVerificationVal(type, by, mls);
          return s !== "" ? s : "—";
        },
      },
    ],
  },
];

const RENTALS_SECTIONS: SectionDef[] = [
  {
    title: "Property Info",
    fields: [
      { key: "Address", label: "Address" },
      { key: "APN", label: "APN", variant: "textarea" },
      { key: "Legal", label: "Legal" },
      { key: "Land Size (AC)", label: "Land Size (AC)" },
      { key: "Land Size (SF)", label: "Land Size (SF)" },
      { key: "Zoning", label: "Zoning" },
      { key: "Zoning Location", label: "Zoning Location" },
      { key: "Zoning Description", label: "Zoning Description" },
      { key: "Property Type", label: "Property Type" },
    ],
  },
  {
    title: "Lease Analysis",
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
      { key: "Rent / SF / Year", label: "Rent / SF / Year" },
      { key: "Recording", label: "Recording" },
      { key: "Use Type", label: "Use Type" },
    ],
  },
  {
    title: "Property Improvements",
    fields: [
      { key: "Rentable SF", label: "Rentable SF" },
      { key: "Office %", label: "Office %" },
      { key: "Land / Bld Ratio", label: "Land / Bld Ratio" },
      { key: "Year Built", label: "Year Built" },
      { key: "Age", label: "Age" },
      { key: "Effective Age", label: "Effective Age" },
      { key: "Condition", label: "Condition" },
      { key: "Construction", label: "Construction" },
      { key: "Other Features", label: "Other Features" },
      { key: "HVAC", label: "HVAC" },
      { key: "Overhead Doors", label: "Overhead Doors" },
      { key: "Wash Bay", label: "Wash Bay" },
      { key: "Hoisting", label: "Hoisting" },
    ],
  },
  {
    title: "Key Indicators",
    fields: [
      { key: "Verification Type", label: "Verification Type" },
      { key: "Verified By", label: "Verified By" },
      { key: "MLS #", label: "MLS #" },
      { key: "Verification", label: "Verification" },
    ],
  },
];

function sectionsForType(compType: ComparableType): SectionDef[] {
  switch (compType) {
    case "Land":
      return LAND_SECTIONS;
    case "Sales":
      return SALES_SECTIONS;
    case "Rentals":
      return RENTALS_SECTIONS;
  }
}

// ---------------------------------------------------------------------------
// Props & component
// ---------------------------------------------------------------------------

export interface CompDetailContentProps {
  projectId: string;
  compId: string;
  compType: ComparableType;
  compFolderId?: string;
  locationMapHref?: string;
  parsedDataStatus?: ComparableParsedDataStatus;
  approaches?: { income?: boolean };
  /** "page" uses 2-col masonry; "panel" uses single-column compact layout. */
  layout?: "page" | "panel";
  /** Called when user clicks the empty-state Parse button. */
  onParseRequest?: () => void;
  /** Propagates internal save status to a parent toolbar. */
  onSaveStatusChange?: (
    status: "idle" | "saving" | "saved" | "error",
  ) => void;
  /** Fires once when parsed data presence is determined (for conditional toolbar buttons). */
  onHasParsedDataChange?: (hasParsedData: boolean) => void;
}

export function CompDetailContent({
  projectId,
  compId,
  compType,
  compFolderId,
  locationMapHref,
  parsedDataStatus,
  approaches,
  layout = "page",
  onParseRequest,
  onSaveStatusChange,
  onHasParsedDataChange,
}: CompDetailContentProps) {
  const {
    parsedData,
    isLoading: parsedLoading,
    error: parsedError,
    saveParsedData,
  } = useCompParsedData(compId);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );

  const toggleSection = useCallback((title: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  }, []);

  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingEditRef = useRef(false);
  const lastSyncedAtRef = useRef<string | null>(null);
  const onSaveStatusChangeRef = useRef(onSaveStatusChange);
  onSaveStatusChangeRef.current = onSaveStatusChange;
  const onHasParsedDataChangeRef = useRef(onHasParsedDataChange);
  onHasParsedDataChangeRef.current = onHasParsedDataChange;

  // Sync draft from persisted data; skip Realtime updates during in-flight edits.
  useEffect(() => {
    if (!parsedData?.raw_data) {
      setDraft({});
      lastSyncedAtRef.current = null;
      onHasParsedDataChangeRef.current?.(false);
      return;
    }
    if (hasPendingEditRef.current && lastSyncedAtRef.current !== null) {
      return;
    }
    const raw = { ...(parsedData.raw_data as Record<string, unknown>) };
    if (raw["Highway Frontage"] != null && raw.Frontage == null) {
      raw.Frontage = raw["Highway Frontage"];
    }
    setDraft(raw);
    lastSyncedAtRef.current = parsedData.updated_at;
    onHasParsedDataChangeRef.current?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init when persisted row identity/timestamp changes
  }, [parsedData?.id, parsedData?.updated_at]);

  // Notify parent when loading completes and there is no data.
  useEffect(() => {
    if (!parsedLoading && !parsedData) {
      onHasParsedDataChangeRef.current?.(false);
    }
  }, [parsedLoading, parsedData]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const sections = useMemo(() => {
    let s = sectionsForType(compType);
    if (compType === "Sales" && !approaches?.income) {
      s = s.filter((sec) => sec.title !== "Income Analysis");
    }
    return s;
  }, [compType, approaches?.income]);

  const notifyStatus = useCallback(
    (s: "idle" | "saving" | "saved" | "error") => {
      setSaveStatus(s);
      onSaveStatusChangeRef.current?.(s);
    },
    [],
  );

  const scheduleSave = useCallback(
    (next: Record<string, unknown>) => {
      hasPendingEditRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        notifyStatus("saving");
        void (async () => {
          try {
            await saveParsedData(
              next as unknown as LandSaleData | SaleData | RentalData,
            );
            hasPendingEditRef.current = false;
            notifyStatus("saved");
            setTimeout(() => notifyStatus("idle"), 2000);
          } catch {
            hasPendingEditRef.current = false;
            notifyStatus("error");
          }
        })();
      }, 500);
    },
    [saveParsedData, notifyStatus],
  );

  const handleFieldChange = useCallback(
    (key: string, value: string) => {
      const coerced = parseInputForStorage(value);
      setDraft((prev) => {
        const next = { ...prev, [key]: coerced };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const handleCommentsChange = useCallback(
    (value: string) => {
      handleFieldChange("Comments", value);
    },
    [handleFieldChange],
  );

  // ---------------------------------------------------------------------------
  // Parcel / improvement mutations — read/write _parcelData and
  // _parcelImprovements keys within draft (persisted via scheduleSave)
  // ---------------------------------------------------------------------------

  const handleParcelUpdate = useCallback(
    (id: string, patch: CompParcelPatch) => {
      const idx = parseInt(id.replace("subject-parcel-", ""), 10);
      setDraft((prev) => {
        const currentParcels = (prev._parcelData as ParcelData[] | undefined) ?? [];
        if (isNaN(idx) || idx < 0 || idx >= currentParcels.length) return prev;
        const existing = currentParcels[idx];
        if (!existing) return prev;
        const updatedRow = { ...parcelDataToRow(existing, idx), ...patch };
        const next = {
          ...prev,
          _parcelData: currentParcels.map((p, i) =>
            i === idx ? rowToParcelData(updatedRow) : p,
          ),
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const handleParcelDelete = useCallback(
    (id: string) => {
      const idx = parseInt(id.replace("subject-parcel-", ""), 10);
      setDraft((prev) => {
        const currentParcels = (prev._parcelData as ParcelData[] | undefined) ?? [];
        if (isNaN(idx)) return prev;
        const next = {
          ...prev,
          _parcelData: currentParcels.filter((_, i) => i !== idx),
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const handleParcelAdd = useCallback(() => {
    setDraft((prev) => {
      const currentParcels = (prev._parcelData as ParcelData[] | undefined) ?? [];
      const newParcel: ParcelData = {
        instrumentNumber: null,
        APN: "",
        "APN Link": "",
        Location: "",
        Legal: "",
        "Lot #": null,
        "Size (AC)": null,
        "Size (SF)": null,
        "Flood Zone": null,
        "Building Size (SF)": null,
        "Office Area (SF)": null,
        "Warehouse Area (SF)": null,
        "Storage Area (SF)": null,
        "Parking (SF)": null,
        Buildings: null,
        "Total Tax Amount": null,
      };
      const next = { ...prev, _parcelData: [...currentParcels, newParcel] };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const handleImprovementUpdate = useCallback(
    (id: string, patch: CompParcelImprovementPatch) => {
      const idx = parseInt(id.replace("subject-imp-", ""), 10);
      setDraft((prev) => {
        const currentImps = (prev._parcelImprovements as ParcelImprovement[] | undefined) ?? [];
        if (isNaN(idx) || idx < 0 || idx >= currentImps.length) return prev;
        const existing = currentImps[idx];
        if (!existing) return prev;
        const updatedRow = { ...parcelImprovementToRow(existing, idx), ...patch };
        const next = {
          ...prev,
          _parcelImprovements: currentImps.map((imp, i) =>
            i === idx ? rowToParcelImprovement(updatedRow) : imp,
          ),
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const handleImprovementDelete = useCallback(
    (id: string) => {
      const idx = parseInt(id.replace("subject-imp-", ""), 10);
      setDraft((prev) => {
        const currentImps = (prev._parcelImprovements as ParcelImprovement[] | undefined) ?? [];
        if (isNaN(idx)) return prev;
        const next = {
          ...prev,
          _parcelImprovements: currentImps.filter((_, i) => i !== idx),
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const handleImprovementAdd = useCallback(() => {
    setDraft((prev) => {
      const currentImps = (prev._parcelImprovements as ParcelImprovement[] | undefined) ?? [];
      const newImp: ParcelImprovement = {
        instrumentNumber: null,
        APN: "",
        "Building #": currentImps.length + 1,
        "Section #": 1,
        "Year Built": null,
        "Gross Building Area (SF)": null,
        "Office Area (SF)": null,
        "Warehouse Area (SF)": null,
        "Parking (SF)": null,
        "Storage Area (SF)": null,
        "Is GLA": true,
        Construction: "",
        Comments: null,
      };
      const next = {
        ...prev,
        _parcelImprovements: [...currentImps, newImp],
      };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const isProcessing = parsedDataStatus === "processing";
  const isReparsing = parsedDataStatus === "reparsing" || parsedDataStatus === "pending_review";

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (parsedLoading) {
    return (
      <div className="flex justify-center py-16 text-gray-600 dark:text-gray-400">
        Loading comp data…
      </div>
    );
  }

  if (parsedError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
        {parsedError}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  if (!parsedData) {
    if (isProcessing) {
      return (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-14 text-center dark:border-blue-800/40 dark:bg-blue-950/20">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
            Parsing in progress…
          </p>
          <p className="mt-1 text-xs text-blue-800/80 dark:text-blue-300/60">
            Fields will auto-populate when parsing completes.
          </p>
        </div>
      );
    }

    if (onParseRequest) {
      return (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center dark:border-gray-700 dark:bg-gray-900/40">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-300">
            {compFolderId
              ? "Folder linked — select files to parse."
              : "No parsed data for this comp yet."}
          </p>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-500">
            Choose which documents to extract comp data from.
          </p>
          <button
            type="button"
            onClick={onParseRequest}
            className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Parse Files
          </button>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center dark:border-gray-700 dark:bg-gray-900/40">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-300">
          No parsed data for this comp yet.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Form layout
  // ---------------------------------------------------------------------------

  /* Container queries: 2-up only when the main column is wide (not viewport `lg`). */
  const columnsClass =
    layout === "page"
      ? "columns-1 gap-x-4 [column-fill:balance] @min-[900px]:columns-2"
      : "columns-1 gap-x-4";

  const controlClass =
    "w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-950/60 dark:text-gray-100 dark:placeholder-gray-600";

  return (
    <div className={isReparsing ? "pointer-events-none opacity-60" : ""}>
      {/* Map banner */}
      <div className="mb-6">
        <MapBanner
          projectId={projectId}
          imageType={mapBannerImageType(compType)}
          mapType={mapTypeForCompType(compType)}
          sourceFolderId={compFolderId}
          editHref={locationMapHref ?? "#"}
          height="h-48"
        />
      </div>

      <div className="space-y-4">
        {/* Inline save indicator */}
        {saveStatus !== "idle" && (
          <div className="flex justify-end">
            {saveStatus === "saving" && (
              <span className="text-xs text-gray-600 dark:text-gray-500">
                Saving…
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-red-600 dark:text-red-400">
                Save failed
              </span>
            )}
          </div>
        )}

        {/* Sections — @container so field rows respond to card width, not the viewport */}
        <div className="@container">
          <div className={columnsClass}>
            {sections.map((section) => {
              const isExpandable =
                layout === "page" &&
                (section.title === "Property Info" ||
                  section.title === "Property Improvements");
              const isExpanded = expandedSections.has(section.title);

              return (
              <div
                key={section.title}
                className={`mb-4 w-full @container rounded-xl border border-gray-200 bg-white p-5 shadow-sm ring-1 ring-black/5 dark:border-gray-800 dark:bg-gray-900/40 dark:shadow-none dark:ring-white/5${isExpanded ? " [column-span:all]" : " break-inside-avoid"}`}
              >
              <h2 className="mb-4 flex items-center justify-between border-b border-gray-200 pb-2 dark:border-gray-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-500">
                  {section.title}
                </span>
                {isExpandable && (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.title)}
                    title={
                      isExpanded
                        ? `Hide ${section.title === "Property Info" ? "parcel" : "improvement"} detail`
                        : `Show ${section.title === "Property Info" ? "parcel" : "improvement"} detail`
                    }
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium transition hover:bg-gray-100 dark:hover:bg-gray-800 ${
                      isExpanded
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    <TableCellsIcon className="h-3.5 w-3.5" aria-hidden />
                    {isExpanded ? "Hide" : "Parcels"}
                  </button>
                )}
              </h2>
              <div
                className={
                  isExpanded
                    ? "grid grid-cols-1 gap-3 @min-[700px]:grid-cols-2"
                    : "space-y-3"
                }
              >
                {section.fields.map((field) => {
                  const {
                    key,
                    label,
                    variant = "text",
                    options,
                    computeFn,
                  } = field;
                  const landSfDerivedFromAc =
                    compType === "Land" &&
                    key === "Land Size (SF)" &&
                    isLandSfGeneratedFromAc(draft);
                  const rowAlignClass =
                    variant === "textarea"
                      ? "@min-[520px]:items-start @min-[520px]:pt-0.5"
                      : "@min-[520px]:items-center";
                  return (
                    <div
                      key={key}
                      className={`grid grid-cols-1 gap-1 @min-[520px]:grid-cols-[1fr_3fr] @min-[520px]:gap-4 ${rowAlignClass}`}
                    >
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-500">
                        {label}
                      </label>
                      {variant === "computed" && computeFn ? (
                        <span className="inline-block rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300">
                          {computeFn(draft)}
                        </span>
                      ) : variant === "select" && options ? (
                        <select
                          value={fieldToInputString(draft, key)}
                          onChange={(e) =>
                            handleFieldChange(key, e.target.value)
                          }
                          className={controlClass}
                        >
                          <option value="">—</option>
                          {options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : variant === "toggle" ? (
                        <div className="flex justify-end">
                          <ToggleSwitch
                            value={draftToggleValue(draft, key)}
                            onChange={(b) =>
                              handleFieldChange(key, b ? "Yes" : "No")
                            }
                            aria-label={label}
                          />
                        </div>
                      ) : variant === "textarea" ? (
                        <textarea
                          value={fieldToInputString(draft, key)}
                          onChange={(e) =>
                            handleFieldChange(key, e.target.value)
                          }
                          rows={2}
                          className={`${controlClass} resize-y py-2 leading-snug`}
                          placeholder="—"
                        />
                      ) : (
                        <input
                          type="text"
                          value={fieldToInputString(draft, key)}
                          onChange={(e) =>
                            handleFieldChange(key, e.target.value)
                          }
                          disabled={landSfDerivedFromAc}
                          title={
                            landSfDerivedFromAc
                              ? "Derived from Land Size (AC) × 43,560. Edit acres or clear square feet to override."
                              : undefined
                          }
                          className={`${controlClass} disabled:cursor-not-allowed disabled:opacity-60`}
                          placeholder="—"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Parcels table — shown when Property Info is expanded */}
              {isExpanded && section.title === "Property Info" && (
                <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Parcels
                  </p>
                  <ParcelDataTable
                    rows={((draft._parcelData as ParcelData[] | undefined) ?? []).map(
                      (p, i) => parcelDataToRow(p, i),
                    )}
                    onUpdate={handleParcelUpdate}
                    onDelete={handleParcelDelete}
                    onAdd={handleParcelAdd}
                  />
                </div>
              )}

              {/* Improvements table — shown when Property Improvements is expanded */}
              {isExpanded && section.title === "Property Improvements" && (
                <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Parcel Improvements
                  </p>
                  <ParcelImprovementsTable
                    rows={((draft._parcelImprovements as ParcelImprovement[] | undefined) ?? []).map(
                      (imp, i) => parcelImprovementToRow(imp, i),
                    )}
                    onUpdate={handleImprovementUpdate}
                    onDelete={handleImprovementDelete}
                    onAdd={handleImprovementAdd}
                  />
                </div>
              )}
            </div>
            );
            })}
          </div>
        </div>

        {/* Comments */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm ring-1 ring-black/5 dark:border-gray-800 dark:bg-gray-900/40 dark:shadow-none dark:ring-white/5">
          <h2 className="mb-3 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:border-gray-800 dark:text-gray-500">
            Comments
          </h2>
          <textarea
            value={fieldToInputString(draft, "Comments")}
            onChange={(e) => handleCommentsChange(e.target.value)}
            rows={4}
            className="w-full resize-y rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-950/60 dark:text-gray-100 dark:placeholder-gray-600 dark:focus:ring-blue-500/30"
            placeholder="Notes…"
          />
        </div>

        {parsedData.parsed_at && (
          <p className="text-xs text-gray-500 dark:text-gray-600">
            Parsed{" "}
            {new Date(parsedData.parsed_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · Source: {parsedData.source}
          </p>
        )}
      </div>
    </div>
  );
}
