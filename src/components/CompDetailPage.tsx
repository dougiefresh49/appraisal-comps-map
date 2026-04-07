"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { MapBanner } from "~/components/MapBanner";
import {
  DocumentContextPanel,
  DocumentPanelToggle,
} from "~/components/DocumentContextPanel";
import { CompAddFlow } from "~/components/CompAddFlow";
import { DataMergeDialog } from "~/components/DataMergeDialog";
import { PushToSheetButton } from "~/components/PushToSheetButton";
import { ToggleSwitch } from "~/components/ToggleField";
import { useCompParsedData } from "~/hooks/useCompParsedData";
import { useProject } from "~/hooks/useProject";
import type { LandSaleData, SaleData, RentalData } from "~/types/comp-data";
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
  DEFAULT_APPROACHES,
  getComparablesByType,
  mapTypeForCompType,
  type ComparableType,
  type ComparableParsedDataStatus,
} from "~/utils/projectStore";

export interface CompDetailPageProps {
  projectId: string;
  compId: string;
  compType: ComparableType;
  typeSlug: string;
}

type FieldDef = {
  key: string;
  label: string;
  variant?: "text" | "select" | "toggle" | "computed";
  options?: readonly string[];
  computeFn?: (draft: Record<string, unknown>) => string;
};
type SectionDef = { title: string; fields: FieldDef[] };

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

function mapBannerImageType(compType: ComparableType): string {
  switch (compType) {
    case "Land":
      return "comps-land";
    case "Sales":
      return "comps-sales";
    case "Rentals":
      return "comps-rentals";
  }
}

function compLocationMapHref(
  projectId: string,
  typeSlug: string,
  compType: ComparableType,
  compId: string,
): string {
  if (compType === "Rentals") {
    return `/project/${projectId}/rentals/comparables-map`;
  }
  return `/project/${projectId}/${typeSlug}/comps/${compId}/location-map`;
}

function statusBadgeClasses(
  status: ComparableParsedDataStatus | undefined,
): string {
  switch (status) {
    case "processing":
      return "bg-blue-950/80 text-blue-300 ring-1 ring-blue-800/80 animate-pulse";
    case "parsed":
      return "bg-emerald-950/80 text-emerald-300 ring-1 ring-emerald-800/80";
    case "error":
      return "bg-red-950/80 text-red-300 ring-1 ring-red-800/80";
    default:
      return "bg-gray-800/80 text-gray-400 ring-1 ring-gray-700";
  }
}

const LAND_SECTIONS: SectionDef[] = [
  {
    title: "Property Info",
    fields: [
      { key: "Address", label: "Address" },
      { key: "APN", label: "APN" },
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
      { key: "APN", label: "APN" },
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
          const raw = d["Year Built"];
          const yb =
            typeof raw === "string"
              ? parseInt(raw, 10)
              : typeof raw === "number"
                ? raw
                : NaN;
          const val = !Number.isNaN(yb) ? calcAge(yb) : null;
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
      { key: "APN", label: "APN" },
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

/** Section tag for project_documents (e.g. sales-comp-1). */
function compSectionTag(
  compType: ComparableType,
  displayNumber: string,
): string {
  const typeSlug =
    compType === "Land"
      ? "land"
      : compType === "Sales"
        ? "sales"
        : "rentals";
  return `${typeSlug}-comp-${displayNumber}`;
}

function fieldToInputString(
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

function parseInputForStorage(value: string): unknown {
  const t = value.trim();
  if (t === "") return null;
  if (t === "Yes") return true;
  if (t === "No") return false;
  const n = Number(t);
  if (t !== "" && !Number.isNaN(n) && t === String(n)) return n;
  return value;
}

export function CompDetailPage({
  projectId,
  compId,
  compType,
  typeSlug,
}: CompDetailPageProps) {
  const { project, isLoading: projectLoading, projectExists } =
    useProject(projectId);
  const {
    parsedData,
    isLoading: parsedLoading,
    error: parsedError,
    saveParsedData,
    refreshParsedData,
  } = useCompParsedData(compId);

  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [isDocPanelOpen, setIsDocPanelOpen] = useState(false);
  const [showParseFlow, setShowParseFlow] = useState(false);
  const [showReparseFlow, setShowReparseFlow] = useState(false);
  const [pendingProposedData, setPendingProposedData] = useState<Record<string, unknown> | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingEditRef = useRef(false);
  const lastSyncedAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (!parsedData?.raw_data) {
      setDraft({});
      lastSyncedAtRef.current = null;
      return;
    }

    // Skip Realtime-driven re-syncs while the user has pending edits
    if (hasPendingEditRef.current && lastSyncedAtRef.current !== null) {
      return;
    }

    const raw = { ...(parsedData.raw_data as Record<string, unknown>) };
    if (raw["Highway Frontage"] != null && raw.Frontage == null) {
      raw.Frontage = raw["Highway Frontage"];
    }
    setDraft(raw);
    lastSyncedAtRef.current = parsedData.updated_at;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init when persisted row identity/timestamp changes
  }, [parsedData?.id, parsedData?.updated_at]);

  const comparables = project ? getComparablesByType(project, compType) : [];
  const comp = comparables.find((c) => c.id === compId);

  const approaches = project?.approaches ?? DEFAULT_APPROACHES;
  const sections = useMemo(() => {
    let s = sectionsForType(compType);
    if (compType === "Sales" && !approaches.income) {
      s = s.filter((sec) => sec.title !== "Income Analysis");
    }
    return s;
  }, [compType, approaches.income]);
  const compFolderId = comp?.folderId;

  useEffect(() => {
    if (!compFolderId) return;
    void (async () => {
      try {
        const res = await fetch("/api/comps-folder-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: compFolderId }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { name?: string };
        if (data.name) setFolderName(data.name);
      } catch {
        /* ignore */
      }
    })();
  }, [compFolderId]);

  const compIndex = comparables.findIndex((c) => c.id === compId);
  const displayNumber =
    comp?.number ?? (compIndex >= 0 ? String(compIndex + 1) : "?");
  const trimmedAddress = comp?.address?.trim();
  const hasAddress =
    trimmedAddress !== undefined && trimmedAddress !== "";
  const displayAddress = hasAddress
    ? trimmedAddress
    : folderName ?? "—";

  const backHref = `/project/${projectId}/${typeSlug}/comparables`;
  const locationMapHref = compLocationMapHref(
    projectId,
    typeSlug,
    compType,
    compId,
  );

  const scheduleSave = useCallback(
    (next: Record<string, unknown>) => {
      hasPendingEditRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus("saving");
        void (async () => {
          try {
            await saveParsedData(
              next as unknown as LandSaleData | SaleData | RentalData,
            );
            hasPendingEditRef.current = false;
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2000);
          } catch {
            hasPendingEditRef.current = false;
            setSaveStatus("error");
          }
        })();
      }, 500);
    },
    [saveParsedData],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

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

  if (projectLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-gray-400">
        Loading project…
      </div>
    );
  }

  if (!projectExists || !project) {
    return (
      <div className="p-8 text-sm text-gray-500">Project not found.</div>
    );
  }

  if (!comp) {
    return (
      <div className="p-8 text-sm text-gray-500">
        Comparable not found in this project.
        <div className="mt-4">
          <Link
            href={backHref}
            className="text-blue-400 hover:text-blue-300"
          >
            Back to Comps
          </Link>
        </div>
      </div>
    );
  }

  const isProcessing = comp.parsedDataStatus === "processing";

  const headerLabel = `${compType.toUpperCase()} COMP #${displayNumber} — ${displayAddress}`;

  const renderEmptyState = () => {
    if (isProcessing) {
      return (
        <div className="rounded-xl border border-blue-800/40 bg-blue-950/20 px-6 py-14 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm font-medium text-blue-200">
            Parsing in progress…
          </p>
          <p className="mt-1 text-xs text-blue-300/60">
            Fields will auto-populate when parsing completes.
          </p>
        </div>
      );
    }

    if (compFolderId) {
      return (
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/40 px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-300">
            {folderName
              ? `Folder "${folderName}" linked — select files to parse.`
              : "Folder linked — select files to parse."}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Choose which documents to extract comp data from.
          </p>
          <button
            type="button"
            onClick={() => setShowParseFlow(true)}
            className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Select Files & Parse
          </button>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/40 px-6 py-14 text-center">
        <p className="text-sm font-medium text-gray-300">
          No parsed data for this comp yet.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Run the parse flow to extract fields from Drive documents, or enter
          data manually after creating a row.
        </p>
        <button
          type="button"
          onClick={() => setShowParseFlow(true)}
          className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          Parse Files
        </button>
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 transition hover:text-gray-200"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Comps
        </Link>
        <div className="flex items-center gap-2">
          <DocumentPanelToggle onClick={() => setIsDocPanelOpen(true)} />
          {saveStatus === "saving" && (
            <span className="text-xs text-gray-500">Saving…</span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs font-medium text-emerald-400">
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-xs text-red-400">Save failed</span>
          )}
          {parsedData && (
            <button
              type="button"
              onClick={() => setShowReparseFlow(true)}
              title="Re-parse with new documents"
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-gray-700 hover:text-gray-100"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Re-parse
            </button>
          )}
          {parsedData && (
            <PushToSheetButton
              confirmDescription={`${compType.toLowerCase()} comp #${displayNumber} data to the spreadsheet`}
              confirmDetail="All non-formula fields will be written. If the comp is found by Use Type + Recording, its existing row is updated. Otherwise a new row is appended."
              onPush={async () => {
                const res = await fetch("/api/spreadsheet/push-comp", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    projectId,
                    compId,
                    compType,
                  }),
                });
                if (!res.ok) {
                  const data = (await res.json()) as { error?: string };
                  throw new Error(data.error ?? "Push failed");
                }
              }}
              disabled={!parsedData}
            />
          )}
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-2 border-b border-gray-800 pb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-gray-100 md:text-2xl">
            {headerLabel}
          </h1>
          {comp.parsedDataStatus && comp.parsedDataStatus !== "none" && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClasses(comp.parsedDataStatus)}`}
            >
              {comp.parsedDataStatus}
            </span>
          )}
        </div>
        {!hasAddress && folderName && (
          <p className="text-xs text-gray-500">
            Folder: {folderName}
          </p>
        )}
      </div>

      <div className="mb-8">
        <MapBanner
          projectId={projectId}
          imageType={mapBannerImageType(compType)}
          mapType={mapTypeForCompType(compType)}
          editHref={locationMapHref}
          height="h-48"
        />
      </div>

      {parsedLoading ? (
        <div className="flex justify-center py-16 text-gray-400">
          Loading comp data…
        </div>
      ) : parsedError ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {parsedError}
        </div>
      ) : !parsedData ? (
        renderEmptyState()
      ) : (
        <div className="space-y-6">
          <div className="columns-1 gap-x-4 [column-fill:balance] lg:columns-2">
            {sections.map((section) => (
              <div
                key={section.title}
                className="mb-4 w-full break-inside-avoid rounded-xl border border-gray-800 bg-gray-900/40 p-5"
              >
                <h2 className="mb-4 border-b border-gray-800 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {section.title}
                </h2>
                <div className="space-y-3">
                  {section.fields.map((field) => {
                    const {
                      key,
                      label,
                      variant = "text",
                      options,
                      computeFn,
                    } = field;
                    const controlClass =
                      "w-full rounded-md border border-gray-700 bg-gray-950/60 px-2.5 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30";
                    const landSfDerivedFromAc =
                      compType === "Land" &&
                      key === "Land Size (SF)" &&
                      isLandSfGeneratedFromAc(draft);
                    return (
                      <div
                        key={key}
                        className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,11rem)_1fr] sm:items-center sm:gap-4"
                      >
                        <label className="text-xs font-medium text-gray-500">
                          {label}
                        </label>
                        {variant === "computed" && computeFn ? (
                          <span className="inline-block text-sm text-gray-400 bg-gray-900/40 rounded-md px-2.5 py-1.5 border border-gray-800">
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
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
            <h2 className="mb-3 border-b border-gray-800 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Comments
            </h2>
            <textarea
              value={fieldToInputString(draft, "Comments")}
              onChange={(e) => handleCommentsChange(e.target.value)}
              rows={4}
              className="w-full resize-y rounded-md border border-gray-700 bg-gray-950/60 px-2.5 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              placeholder="Notes…"
            />
          </div>

          {parsedData.parsed_at && (
            <p className="text-xs text-gray-600">
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
      )}

      <DocumentContextPanel
        projectId={projectId}
        sectionKey="comp-detail"
        isOpen={isDocPanelOpen}
        onClose={() => setIsDocPanelOpen(false)}
        compFolderId={compFolderId}
        sectionTag={compSectionTag(compType, displayNumber)}
      />

      {showParseFlow && (
        <CompAddFlow
          projectId={projectId}
          compId={compId}
          compType={compType}
          compsFolderId={
            project.folderStructure?.compsFolderIds?.[
              compType === "Land"
                ? "land"
                : compType === "Sales"
                  ? "sales"
                  : "rentals"
            ]
          }
          projectFolderId={project.projectFolderId}
          initialFolderId={compFolderId}
          onComplete={() => {
            void refreshParsedData();
            setShowParseFlow(false);
          }}
          onClose={() => setShowParseFlow(false)}
        />
      )}

      {/* Re-parse flow: preview-only mode */}
      {showReparseFlow && (
        <CompAddFlow
          projectId={projectId}
          compId={compId}
          compType={compType}
          compsFolderId={
            project.folderStructure?.compsFolderIds?.[
              compType === "Land"
                ? "land"
                : compType === "Sales"
                  ? "sales"
                  : "rentals"
            ]
          }
          projectFolderId={project.projectFolderId}
          initialFolderId={compFolderId}
          onComplete={() => {
            void refreshParsedData();
            setShowReparseFlow(false);
          }}
          onClose={() => setShowReparseFlow(false)}
          onPreviewComplete={(proposed) => {
            setPendingProposedData(proposed);
            setShowReparseFlow(false);
          }}
        />
      )}

      {/* Data merge dialog */}
      {pendingProposedData && parsedData && (
        <DataMergeDialog
          isOpen
          title="Review & Merge Re-parse Results"
          currentData={parsedData.raw_data as Record<string, unknown>}
          proposedData={pendingProposedData}
          onConfirm={async (merged) => {
            await saveParsedData(merged);
            setPendingProposedData(null);
          }}
          onCancel={() => setPendingProposedData(null)}
        />
      )}
    </div>
  );
}
