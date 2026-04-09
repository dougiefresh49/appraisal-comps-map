"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  adjSalePrice,
  calcMonthlyIncrease,
  excessLandValue,
  salePricePerSf,
} from "~/lib/calculated-fields";
import { useSubjectData } from "~/hooks/useSubjectData";
import { useCompsParsedDataMulti } from "~/hooks/useCompsParsedDataMulti";
import type { AdjustmentGridSuggestions } from "~/lib/adjustment-suggestions";
import { CompDetailSidePanel } from "~/components/CompDetailSidePanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GridConfig {
  exclude_extremes: boolean;
  round_up: boolean;
  disable_rounding: boolean;
  round_final_value: boolean;
  round_to_5k: boolean;
  include_median: boolean;
  percent_inc_per_month: number;
  report_effective_date: string;
}

export interface AdjustmentCellState {
  qualitative: string;
  percentage: number;
  from_ai?: boolean;
}

export interface AdjustmentCategoryState {
  name: string;
  sort_order: number;
  comp_values: Record<string, AdjustmentCellState>;
  subject_value: string;
}

export interface CompColumnState {
  id: string;
  number: number;
  address: string;
  date_of_sale: string;
  base_price_per_unit: number;
  size: number;
}

export interface AdjustmentGridState {
  transaction_categories: AdjustmentCategoryState[];
  property_categories: AdjustmentCategoryState[];
  comps: CompColumnState[];
  subject_size: number;
  price_unit: string;
  config: GridConfig;
  source: "ai_suggested" | "manual" | "mixed";
  size_label?: string;
  price_label?: string;
}

interface AdjustmentGridProps {
  projectId: string;
  compType: "land" | "sales";
}

const QUAL_OPTIONS = [
  "TODO",
  "Inferior",
  "Slightly Inferior",
  "Similar",
  "Slightly Superior",
  "Superior",
] as const;

const LAND_TX = [
  "Property Rights",
  "Financing Terms",
  "Conditions of Sale",
  "Market Conditions",
] as const;

const LAND_PROP = [
  "Location",
  "Land Size (SF)",
  "Surface",
  "Utilities",
  "Frontage",
] as const;

const SALES_TX = [
  "Property Rights",
  "Financing Terms",
  "Conditions of Sale",
  "Market Conditions",
] as const;

const SALES_PROP = [
  "Location",
  "Age / Condition",
  "Building Size (SF)",
  "Office %",
  "Land / Bld Ratio",
  "Zoning",
] as const;

/** Safe display string for unknown raw values (avoids `[object Object]`). */
function formatUnknownForDisplay(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return String(v);
  if (typeof v === "bigint") return String(v);
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "symbol") return v.toString();
  if (typeof v === "function") return "[function]";
  return "";
}

/**
 * Fields that show formatted data values in the grid (mirrors GET_ADJUSTMENT_DATA formatting).
 * If a category name is a key here, comp cells show the formatted value instead of a dropdown.
 */
const DATA_FORMAT_FIELDS: Record<string, (v: unknown) => string> = {
  "Building Size (SF)": (v) =>
    typeof v === "number" ? v.toLocaleString() : formatUnknownForDisplay(v),
  "Rentable SF": (v) =>
    typeof v === "number" ? v.toLocaleString() : formatUnknownForDisplay(v),
  "Office %": (v) => {
    if (typeof v === "number") {
      const pct = v > 0 && v <= 1 ? v * 100 : v;
      return `${pct.toFixed(1)}%`;
    }
    return formatUnknownForDisplay(v);
  },
  "Land / Bld Ratio": (v) =>
    typeof v === "number" ? v.toFixed(2) : formatUnknownForDisplay(v),
  "Land / Bld Ratio (Adj)": (v) =>
    typeof v === "number" ? v.toFixed(2) : formatUnknownForDisplay(v),
  "Sale Price / SF": (v) =>
    typeof v === "number" ? `$${v.toFixed(2)}` : formatUnknownForDisplay(v),
  "Sale Price / SF (Adj)": (v) =>
    typeof v === "number" ? `$${v.toFixed(2)}` : formatUnknownForDisplay(v),
  "Annual Rent / SF": (v) =>
    typeof v === "number" ? `$${v.toFixed(2)}` : formatUnknownForDisplay(v),
  "Post Sale Renovation Cost": (v) =>
    typeof v === "number"
      ? `$${Math.round(v).toLocaleString()}`
      : formatUnknownForDisplay(v),
  "Land Size (SF)": (v) =>
    typeof v === "number" ? v.toLocaleString() : formatUnknownForDisplay(v),
  "Land Size (AC)": (v) =>
    typeof v === "number" ? v.toFixed(3) : formatUnknownForDisplay(v),
  "Parking (SF)": (v) =>
    typeof v === "number" ? v.toLocaleString() : formatUnknownForDisplay(v),
  "Effective Age": (v) =>
    typeof v === "number" ? v.toFixed(1) : formatUnknownForDisplay(v),
  Age: (v) =>
    typeof v === "number" ? String(Math.round(v)) : formatUnknownForDisplay(v),
  "Occupancy %": (v) => {
    if (typeof v === "number") {
      const pct = v > 0 && v <= 1 ? v * 100 : v;
      return `${Math.round(pct)}%`;
    }
    return formatUnknownForDisplay(v);
  },
  "Overall Cap Rate": (v) => {
    if (typeof v === "number") {
      const pct = v > 0 && v < 1 ? v * 100 : v;
      return `${pct.toFixed(2)}%`;
    }
    return formatUnknownForDisplay(v);
  },
  Zoning: (v) => formatUnknownForDisplay(v),
  "Conditions of Sale": (v) => formatUnknownForDisplay(v),
  Surface: (v) => formatUnknownForDisplay(v),
  Utilities: (v) => formatUnknownForDisplay(v),
  Frontage: (v) => formatUnknownForDisplay(v),
};

/** Categories that always use qualitative dropdowns (per comp type). */
const QUALITATIVE_ONLY_SALES = new Set([
  "Location",
  "Age / Condition",
  "Property Rights",
  "Financing Terms",
]);
const QUALITATIVE_ONLY_LAND = new Set([
  "Location",
  "Property Rights",
  "Financing Terms",
]);

/** Categories whose labels are fixed (cannot be renamed via dropdown). */
const FIXED_LABEL_SALES = new Set(["Location", "Age / Condition"]);
const FIXED_LABEL_LAND = new Set(["Location"]);

/**
 * Comp data header names available for row label selection
 * (mirrors CompsSales / CompsLand [[#HEADERS]]).
 */
const COMP_FIELD_HEADERS_SALES = [
  "Building Size (SF)",
  "Rentable SF",
  "Office %",
  "Land / Bld Ratio",
  "Land / Bld Ratio (Adj)",
  "Land Size (SF)",
  "Land Size (AC)",
  "Parking (SF)",
  "Sale Price / SF",
  "Sale Price / SF (Adj)",
  "Post Sale Renovation Cost",
  "Effective Age",
  "Age",
  "Occupancy %",
  "Overall Cap Rate",
  "Zoning",
  "Surface",
  "Utilities",
  "Frontage",
  "Conditions of Sale",
  "Amenities",
] as const;

const COMP_FIELD_HEADERS_LAND = [
  "Land Size (SF)",
  "Land Size (AC)",
  "Sale Price / SF",
  "Surface",
  "Utilities",
  "Frontage",
  "Zoning",
  "Conditions of Sale",
] as const;

const SIZE_LABEL_OPTIONS = [
  "Building Size (SF)",
  "Rentable SF",
  "Land Size (SF)",
  "Land Size (AC)",
] as const;

const PRICE_LABEL_OPTIONS = [
  "Sale Price / SF (Adj)",
  "Sale Price / SF",
  "Annual Rent / SF",
] as const;

function isQualitativeRow(
  name: string,
  compType: "land" | "sales",
): boolean {
  const set =
    compType === "sales" ? QUALITATIVE_ONLY_SALES : QUALITATIVE_ONLY_LAND;
  return set.has(name);
}

function isFixedLabel(
  name: string,
  compType: "land" | "sales",
): boolean {
  const set = compType === "sales" ? FIXED_LABEL_SALES : FIXED_LABEL_LAND;
  return set.has(name);
}

function lookupRawValue(
  raw: Record<string, unknown> | undefined,
  fieldName: string,
): unknown {
  if (!raw) return undefined;
  const v = raw[fieldName];
  if (v !== undefined && v !== null && v !== "") return v;
  if (fieldName === "Zoning") return raw["Zoning Description"];
  return undefined;
}

function formatFieldValue(
  fieldName: string,
  raw: Record<string, unknown> | undefined,
): string {
  const v = lookupRawValue(raw, fieldName);
  if (v === undefined || v === null || v === "") return "—";
  const formatter = DATA_FORMAT_FIELDS[fieldName];
  if (formatter) return formatter(v);
  return formatUnknownForDisplay(v);
}

function numFromRaw(
  raw: Record<string, unknown>,
  key: string,
): number | null {
  const v = raw[key];
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(/[$,]/g, ""));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function parseMoney(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,]/g, "").trim();
    const n = Number.parseFloat(cleaned);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function compBasePriceFromRaw(
  raw: Record<string, unknown>,
  compType: "land" | "sales",
): number {
  const salePrice = parseMoney(raw["Sale Price"]);
  let landSf = numFromRaw(raw, "Land Size (SF)");
  const landAc = numFromRaw(raw, "Land Size (AC)");
  if (landSf == null && landAc != null) {
    landSf = landAc * 43560;
  }
  const bldSf = numFromRaw(raw, "Building Size (SF)");
  const denomSf = compType === "land" ? landSf : bldSf ?? landSf;
  const grossPerSf = salePricePerSf(salePrice, denomSf);

  if (compType === "sales") {
    const elVal =
      numFromRaw(raw, "Excess Land Value") ??
      excessLandValue(
        numFromRaw(raw, "Excess Land Size (AC)"),
        numFromRaw(raw, "Excess Land Value / AC"),
      );
    const adjPrice = adjSalePrice(salePrice, elVal);
    const adjPerSf = salePricePerSf(adjPrice, bldSf);
    return (
      adjPerSf ??
      numFromRaw(raw, "Sale Price / SF (Adj)") ??
      grossPerSf ??
      numFromRaw(raw, "Sale Price / SF") ??
      0
    );
  }
  return grossPerSf ?? numFromRaw(raw, "Sale Price / SF") ?? 0;
}

function compSizeFromRaw(
  raw: Record<string, unknown>,
  compType: "land" | "sales",
): number {
  if (compType === "land") {
    const sf = numFromRaw(raw, "Land Size (SF)");
    if (sf != null) return sf;
    const ac = numFromRaw(raw, "Land Size (AC)");
    if (ac != null) return ac * 43560;
    return 0;
  }
  return numFromRaw(raw, "Building Size (SF)") ?? 0;
}

/** Legacy category names in saved drafts / older suggestions — map to spreadsheet labels */
const DRAFT_CATEGORY_NAME_ALIASES: Record<string, string> = {
  "Age/Condition": "Age / Condition",
  "Land/Bld Ratio": "Land / Bld Ratio",
};

function migrateCategoryRowName(name: string): string {
  return DRAFT_CATEGORY_NAME_ALIASES[name] ?? name;
}

function migrateCategoryRows(
  rows: unknown[],
): AdjustmentCategoryState[] {
  return rows.map((row) => {
    const r = row as AdjustmentCategoryState;
    return { ...r, name: migrateCategoryRowName(r.name) };
  });
}

function defaultConfig(compType: "land" | "sales"): GridConfig {
  const today = new Date().toISOString().slice(0, 10);
  return {
    exclude_extremes: false,
    round_up: false,
    disable_rounding: false,
    round_final_value: true,
    round_to_5k: compType === "sales",
    include_median: compType === "sales",
    percent_inc_per_month: 0.5,
    report_effective_date: today,
  };
}

function mergeConfig(
  partial: Partial<GridConfig> | undefined,
  compType: "land" | "sales",
): GridConfig {
  return { ...defaultConfig(compType), ...partial };
}

function jsonRecord(v: unknown): Record<string, unknown> {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function subjectSizeFromCore(
  core: Record<string, unknown>,
  compType: "land" | "sales",
): number {
  if (compType === "land") {
    const sf = core["Land Size (SF)"];
    if (typeof sf === "number" && !Number.isNaN(sf)) {
      return sf;
    }
    const ac = core["Land Size (AC)"];
    if (typeof ac === "number" && !Number.isNaN(ac)) {
      return ac * 43560;
    }
    return 0;
  }
  const b = core["Building Size (SF)"];
  if (typeof b === "number" && !Number.isNaN(b)) {
    return b;
  }
  return 0;
}

function subjectAddress(core: Record<string, unknown>): string {
  const a = core.Address;
  const c = core.City;
  const parts = [
    typeof a === "string" ? a : "",
    typeof c === "string" ? c : "",
  ].filter(Boolean);
  return parts.join(", ") || "Subject";
}

/**
 * Mirrors GET_ADJUSTMENT_DATA "Address" format:
 *   SUBSTITUTE(LEFT(raw, secondComma - 1), ",", "", 1)
 * → everything before the second comma, first comma removed → "Street City"
 * Falls back to the raw string when fewer than two commas are present.
 */
function formatGridAddress(raw: string): string {
  const firstComma = raw.indexOf(",");
  if (firstComma === -1) return raw.trim();
  const secondComma = raw.indexOf(",", firstComma + 1);
  const truncated = secondComma === -1 ? raw : raw.slice(0, secondComma);
  // Remove the first comma (SUBSTITUTE instance 1)
  return (truncated.slice(0, firstComma) + truncated.slice(firstComma + 1)).trim();
}

/**
 * Format a date string as "MMM YYYY" — mirrors GET_ADJUSTMENT_DATA "Date of Sale" format.
 */
function formatSaleDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Compute the Market Conditions % from comp sale date + config.
 * Mirrors CALC_MONTHLY_INCREASE in the spreadsheet.
 */
function marketConditionsPct(dateOfSale: string, config: GridConfig): number {
  return calcMonthlyIncrease(
    dateOfSale,
    config.report_effective_date,
    config.percent_inc_per_month,
  );
}

// ---------------------------------------------------------------------------
// Calculations (mirror spreadsheet)
// ---------------------------------------------------------------------------

function calcTransactionRunning(
  basePriceSf: number,
  transactionCategories: AdjustmentCategoryState[],
  compId: string,
  compDateOfSale: string,
  config: GridConfig,
): number[] {
  const running: number[] = [];
  let current = basePriceSf;
  for (const cat of transactionCategories) {
    // Market Conditions % is always derived — never stored in state
    const pct =
      cat.name === "Market Conditions"
        ? marketConditionsPct(compDateOfSale, config)
        : (cat.comp_values[compId]?.percentage ?? 0);
    current = current + current * pct;
    running.push(current);
  }
  return running;
}

function calcPropertyAdjTotal(
  propertyCategories: AdjustmentCategoryState[],
  compId: string,
): number {
  return propertyCategories.reduce(
    (sum, cat) => sum + (cat.comp_values[compId]?.percentage ?? 0),
    0,
  );
}

function medianValues(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function adjustedPriceForComp(
  state: AdjustmentGridState,
  compId: string,
): number {
  const comp = state.comps.find((c) => c.id === compId);
  if (!comp) {
    return 0;
  }
  const post = calcTransactionRunning(
    comp.base_price_per_unit,
    state.transaction_categories,
    compId,
    comp.date_of_sale,
    state.config,
  );
  const lastTx =
    post.length > 0
      ? (post[post.length - 1] ?? comp.base_price_per_unit)
      : comp.base_price_per_unit;
  const propTotal = calcPropertyAdjTotal(state.property_categories, compId);
  return lastTx + lastTx * propTotal;
}

function computeMeanMedianRate(
  state: AdjustmentGridState,
  compType: "land" | "sales",
): { mean: number; median: number; rate: number } {
  const adjusted = state.comps.map((c) => adjustedPriceForComp(state, c.id));
  const mean =
    adjusted.length > 0
      ? adjusted.reduce((s, v) => s + v, 0) / adjusted.length
      : 0;
  const median = medianValues(adjusted);
  const { config } = state;

  let rate: number;
  if (config.exclude_extremes && adjusted.length >= 3) {
    const sorted = [...adjusted].sort((a, b) => a - b);
    const min = sorted[0]!;
    const max = sorted[sorted.length - 1]!;
    const filtered = adjusted.filter((v) => v !== min && v !== max);
    const pool = filtered.length > 0 ? filtered : adjusted;
    rate = pool.reduce((s, v) => s + v, 0) / pool.length;
    // GET_ADJ_RATE: exclude_extremes branch always uses ROUNDUP(..., 1)
    rate = Math.ceil(rate * 10) / 10;
  } else {
    let target = mean;
    if (config.include_median && compType === "sales") {
      target = (mean + median) / 2;
    }
    rate = target;
    if (!config.disable_rounding) {
      rate = config.round_up
        ? Math.ceil(rate * 10) / 10
        : Math.round(rate * 10) / 10;
    }
  }

  return { mean, median, rate };
}

function concludedValue(
  valueIndication: number,
  roundTo5k: boolean,
  roundFinal: boolean,
): number {
  if (roundTo5k) {
    return Math.ceil(valueIndication / 5000) * 5000;
  }
  if (roundFinal) {
    return Math.round(valueIndication / 1000) * 1000;
  }
  return valueIndication;
}

// ---------------------------------------------------------------------------
// Build state from API
// ---------------------------------------------------------------------------

function suggestionKey(category: string, compId: string): string {
  return `${category}::${compId}`;
}

function buildSuggestionMap(
  suggestions: AdjustmentGridSuggestions["suggestions"],
): Map<string, AdjustmentGridSuggestions["suggestions"][0]> {
  const m = new Map<string, AdjustmentGridSuggestions["suggestions"][0]>();
  for (const s of suggestions) {
    m.set(suggestionKey(s.category, s.comp_id), s);
  }
  return m;
}

function emptyCell(): AdjustmentCellState {
  return { qualitative: "Similar", percentage: 0, from_ai: false };
}

function suggestionsToState(
  data: AdjustmentGridSuggestions,
  subjectCore: Record<string, unknown>,
  compType: "land" | "sales",
): AdjustmentGridState {
  const tx = compType === "land" ? LAND_TX : SALES_TX;
  const prop = compType === "land" ? LAND_PROP : SALES_PROP;
  const config = defaultConfig(compType);
  if (data.project_effective_date) {
    config.report_effective_date = data.project_effective_date.slice(0, 10);
  }
  if (data.project_percent_inc_per_month != null) {
    config.percent_inc_per_month = data.project_percent_inc_per_month;
  }
  const map = buildSuggestionMap(data.suggestions);

  const comps: CompColumnState[] = data.comps.map((c) => ({ ...c }));

  function rowForCategory(
    name: string,
    sort_order: number,
  ): AdjustmentCategoryState {
    const comp_values: Record<string, AdjustmentCellState> = {};
    for (const c of comps) {
      const sug = map.get(suggestionKey(name, c.id));
      let pct = sug?.suggested_percent ?? 0;
      let fromAi = (sug?.suggested_percent ?? null) !== null;

      if (name === "Market Conditions" && c.date_of_sale) {
        const mc = calcMonthlyIncrease(
          c.date_of_sale,
          config.report_effective_date,
          config.percent_inc_per_month,
        );
        if (mc !== 0) {
          pct = mc;
          fromAi = true;
        }
      }

      comp_values[c.id] = {
        qualitative: "Similar",
        percentage: pct,
        from_ai: fromAi,
      };
    }

    const subject_value =
      comps[0] != null
        ? (map.get(suggestionKey(name, comps[0].id))?.subject_value ?? "")
        : "";

    return {
      name,
      sort_order,
      comp_values,
      subject_value,
    };
  }

  const transaction_categories = tx.map((name, i) => rowForCategory(name, i));
  const property_categories = prop.map((name, i) =>
    rowForCategory(name, i + tx.length),
  );

  return {
    transaction_categories,
    property_categories,
    comps,
    subject_size: subjectSizeFromCore(subjectCore, compType),
    price_unit: "$/SF",
    config,
    source: "ai_suggested",
  };
}

function normalizeLoadedDraft(
  raw: unknown,
  compType: "land" | "sales",
): AdjustmentGridState | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const tx = o.transaction_categories;
  const py = o.property_categories;
  const comps = o.comps;
  if (!Array.isArray(tx) || !Array.isArray(py) || !Array.isArray(comps)) {
    return null;
  }
  const mergedConfig = mergeConfig(
    o.config as Partial<GridConfig> | undefined,
    compType,
  );
  const config =
    compType === "land"
      ? { ...mergedConfig, include_median: false }
      : mergedConfig;
  return {
    transaction_categories: migrateCategoryRows(tx),
    property_categories: migrateCategoryRows(py),
    comps: comps as CompColumnState[],
    subject_size: typeof o.subject_size === "number" ? o.subject_size : 0,
    price_unit: typeof o.price_unit === "string" ? o.price_unit : "$/SF",
    config,
    source:
      o.source === "manual" ||
      o.source === "mixed" ||
      o.source === "ai_suggested"
        ? o.source
        : "mixed",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdjustmentGrid({ projectId, compType }: AdjustmentGridProps) {
  const { subjectData, isLoading: subjectLoading } = useSubjectData(projectId);
  const subjectCore = useMemo(
    () => jsonRecord(subjectData?.core),
    [subjectData?.core],
  );

  const subjectCoreRef = useRef(subjectCore);
  subjectCoreRef.current = subjectCore;
  const subjectLoadingRef = useRef(subjectLoading);
  subjectLoadingRef.current = subjectLoading;

  const [state, setState] = useState<AdjustmentGridState | null>(null);

  const compIds = useMemo(
    () => (state?.comps ?? []).map((c) => c.id),
    [state?.comps],
  );
  const { rawDataByComp } = useCompsParsedDataMulti(projectId, compIds);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [popover, setPopover] = useState<{
    category: string;
    compId: string;
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);

  const skipNextSave = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingSuggestRef = useRef<AdjustmentGridSuggestions | null>(null);
  const rationaleByCellRef = useRef<Map<string, string>>(new Map());

  const applySuggestions = useCallback(
    (data: AdjustmentGridSuggestions, core: Record<string, unknown>) => {
      const m = new Map<string, string>();
      for (const s of data.suggestions) {
        m.set(suggestionKey(s.category, s.comp_id), s.rationale);
      }
      rationaleByCellRef.current = m;
      setState(suggestionsToState(data, core, compType));
      skipNextSave.current = true;
    },
    [compType],
  );

  // Initial load: draft or suggestions
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setInitializing(true);
      setLoadError(null);
      pendingSuggestRef.current = null;
      try {
        const dRes = await fetch(
          `/api/adjustments/draft?project_id=${encodeURIComponent(projectId)}&comp_type=${compType}`,
        );
        if (!dRes.ok) {
          throw new Error("Failed to load draft");
        }
        const dRaw: unknown = await dRes.json();
        const dJson = dRaw as { draft?: unknown };
        if (cancelled) {
          return;
        }
        const normalized = normalizeLoadedDraft(dJson.draft ?? null, compType);
        if (normalized) {
          rationaleByCellRef.current = new Map();
          setState(normalized);
          skipNextSave.current = true;
          setInitializing(false);
          return;
        }

        const sRes = await fetch(
          `/api/adjustments/suggest?project_id=${encodeURIComponent(projectId)}&type=${compType}`,
        );
        if (!sRes.ok) {
          const errBody = (await sRes.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errBody.error ?? "Failed to load suggestions");
        }
        const sJson = (await sRes.json()) as AdjustmentGridSuggestions;
        if (cancelled) {
          return;
        }
        pendingSuggestRef.current = sJson;
        if (!subjectLoadingRef.current) {
          applySuggestions(sJson, subjectCoreRef.current);
          pendingSuggestRef.current = null;
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Load failed");
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [projectId, compType, applySuggestions]);

  // When subject finishes loading after suggestions were fetched
  useEffect(() => {
    if (subjectLoading) {
      return;
    }
    const pending = pendingSuggestRef.current;
    if (!pending) {
      return;
    }
    applySuggestions(pending, subjectCore);
    pendingSuggestRef.current = null;
  }, [subjectLoading, subjectCore, applySuggestions]);

  // Sync comp header fields from realtime raw data updates
  useEffect(() => {
    if (!state || initializing || rawDataByComp.size === 0) return;
    let changed = false;
    const nextComps = state.comps.map((c) => {
      const raw = rawDataByComp.get(c.id);
      if (!raw) return c;
      const address =
        typeof raw.Address === "string" ? raw.Address : c.address;
      const dateOfSale =
        typeof raw["Date of Sale"] === "string"
          ? raw["Date of Sale"]
          : c.date_of_sale;
      const base = compBasePriceFromRaw(raw, compType);
      const size = compSizeFromRaw(raw, compType);
      if (
        address !== c.address ||
        dateOfSale !== c.date_of_sale ||
        base !== c.base_price_per_unit ||
        size !== c.size
      ) {
        changed = true;
        return { ...c, address, date_of_sale: dateOfSale, base_price_per_unit: base, size };
      }
      return c;
    });
    if (changed) {
      skipNextSave.current = true;
      setState((prev) => (prev ? { ...prev, comps: nextComps } : prev));
    }
  }, [rawDataByComp, state?.comps, compType, initializing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced save
  useEffect(() => {
    if (!state || initializing) {
      return;
    }
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => {
      setSaveStatus("saving");
      void (async () => {
        try {
          const res = await fetch("/api/adjustments/draft", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: projectId,
              comp_type: compType,
              grid_data: { ...state, source: "mixed" as const },
            }),
          });
          if (res.ok) {
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2000);
          } else {
            setSaveStatus("idle");
          }
        } catch {
          setSaveStatus("idle");
        }
      })();
    }, 500);

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [state, projectId, compType, initializing]);

  const { mean, median, rate } = useMemo(
    () =>
      state
        ? computeMeanMedianRate(state, compType)
        : { mean: 0, median: 0, rate: 0 },
    [state, compType],
  );

  const valueIndication = state ? rate * state.subject_size : 0;
  const concluded = state
    ? concludedValue(
        valueIndication,
        state.config.round_to_5k,
        state.config.round_final_value,
      )
    : 0;

  const ratePerAc = rate * 43560;

  const updateConfig = (patch: Partial<GridConfig>) => {
    setState((prev) =>
      prev ? { ...prev, config: { ...prev.config, ...patch } } : prev,
    );
  };

  const updateCell = (
    section: "tx" | "prop",
    catIndex: number,
    compId: string,
    patch: Partial<AdjustmentCellState>,
  ) => {
    setState((prev) => {
      if (!prev) {
        return prev;
      }
      const listKey =
        section === "tx" ? "transaction_categories" : "property_categories";
      const list = [...prev[listKey]];
      const cat = list[catIndex];
      if (!cat) {
        return prev;
      }
      const nextCat = {
        ...cat,
        comp_values: {
          ...cat.comp_values,
          [compId]: {
            qualitative:
              patch.qualitative ??
              cat.comp_values[compId]?.qualitative ??
              "Similar",
            percentage:
              patch.percentage ?? cat.comp_values[compId]?.percentage ?? 0,
            from_ai: patch.from_ai ?? cat.comp_values[compId]?.from_ai,
          },
        },
      };
      if (patch.percentage !== undefined || patch.qualitative !== undefined) {
        nextCat.comp_values[compId] = {
          ...nextCat.comp_values[compId]!,
          from_ai: false,
        };
      }
      list[catIndex] = nextCat;
      return { ...prev, [listKey]: list };
    });
  };

  const updateSubjectValue = (
    section: "tx" | "prop",
    catIndex: number,
    value: string,
  ) => {
    setState((prev) => {
      if (!prev) {
        return prev;
      }
      const listKey =
        section === "tx" ? "transaction_categories" : "property_categories";
      const list = [...prev[listKey]];
      const cat = list[catIndex];
      if (!cat) {
        return prev;
      }
      list[catIndex] = { ...cat, subject_value: value };
      return { ...prev, [listKey]: list };
    });
  };

  const resetToAi = async () => {
    if (!window.confirm("Discard local edits and reload AI suggestions?")) {
      return;
    }
    setInitializing(true);
    try {
      const sRes = await fetch(
        `/api/adjustments/suggest?project_id=${encodeURIComponent(projectId)}&type=${compType}`,
      );
      if (!sRes.ok) {
        throw new Error("Failed to fetch suggestions");
      }
      const sJson = (await sRes.json()) as AdjustmentGridSuggestions;
      applySuggestions(sJson, subjectCore);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setInitializing(false);
    }
  };

  const suggestRemaining = async () => {
    if (!state) return;
    setInitializing(true);
    try {
      const sRes = await fetch(
        `/api/adjustments/suggest?project_id=${encodeURIComponent(projectId)}&type=${compType}`,
      );
      if (!sRes.ok) throw new Error("Failed to fetch suggestions");
      const sJson = (await sRes.json()) as AdjustmentGridSuggestions;
      const map = buildSuggestionMap(sJson.suggestions);

      const isUnedited = (cell: AdjustmentCellState | undefined): boolean => {
        if (!cell) return true;
        if (cell.from_ai) return true;
        return cell.qualitative === "Similar" && cell.percentage === 0;
      };

      setState((prev) => {
        if (!prev) return prev;

        const mergeCats = (cats: AdjustmentCategoryState[]) =>
          cats.map((cat) => {
            const nextValues = { ...cat.comp_values };
            for (const c of prev.comps) {
              if (!isUnedited(nextValues[c.id])) continue;
              const sug = map.get(suggestionKey(cat.name, c.id));
              if (!sug) continue;
              const pct = sug.suggested_percent ?? 0;
              nextValues[c.id] = {
                qualitative: nextValues[c.id]?.qualitative ?? "Similar",
                percentage: pct,
                from_ai: true,
              };
            }
            return { ...cat, comp_values: nextValues };
          });

        const m = new Map<string, string>();
        for (const s of sJson.suggestions) {
          m.set(suggestionKey(s.category, s.comp_id), s.rationale);
        }
        for (const [k, v] of m) {
          rationaleByCellRef.current.set(k, v);
        }

        return {
          ...prev,
          transaction_categories: mergeCats(prev.transaction_categories),
          property_categories: mergeCats(prev.property_categories),
          source: "mixed",
        };
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Suggest failed");
    } finally {
      setInitializing(false);
    }
  };

  const copyGrid = async () => {
    if (!state) {
      return;
    }
    const lines: string[] = [];
    const headers = [
      "",
      "Subject",
      ...state.comps.map((c) => `#${c.number} ${c.address}`),
    ];
    lines.push(headers.join("\t"));
    lines.push(
      [
        "Address",
        formatGridAddress(subjectAddress(subjectCore)),
        ...state.comps.map((c) => formatGridAddress(c.address)),
      ].join("\t"),
    );
    lines.push(
      [
        "Date of Sale",
        "Current",
        ...state.comps.map((c) => c.date_of_sale),
      ].join("\t"),
    );
    lines.push(
      [
        compType === "land" ? "Land Size (SF)" : "Building Size (SF)",
        String(state.subject_size),
        ...state.comps.map((c) => String(c.size)),
      ].join("\t"),
    );
    lines.push(
      [
        compType === "sales" ? "Sale Price / SF (Adj)" : "Sale Price / SF",
        "—",
        ...state.comps.map((c) => String(c.base_price_per_unit)),
      ].join("\t"),
    );
    lines.push("");

    for (const cat of state.transaction_categories) {
      lines.push(
        [cat.name, cat.subject_value, ...state.comps.map(() => "")].join("\t"),
      );
      lines.push(
        [
          "",
          "—",
          ...state.comps.map((c) => {
            const pct =
              cat.name === "Market Conditions"
                ? marketConditionsPct(c.date_of_sale, state.config)
                : (cat.comp_values[c.id]?.percentage ?? 0);
            return `${(pct * 100).toFixed(2)}%`;
          }),
        ].join("\t"),
      );
      lines.push(
        [
          "",
          "—",
          ...state.comps.map((c) => {
            const running = calcTransactionRunning(
              c.base_price_per_unit,
              state.transaction_categories,
              c.id,
              c.date_of_sale,
              state.config,
            );
            const idx = state.transaction_categories.findIndex(
              (x) => x.name === cat.name,
            );
            const v = running[idx];
            return v != null ? v.toFixed(2) : "";
          }),
        ].join("\t"),
      );
    }
    lines.push("");
    for (const cat of state.property_categories) {
      lines.push(
        [cat.name, cat.subject_value, ...state.comps.map(() => "")].join("\t"),
      );
      lines.push(
        [
          "",
          "—",
          ...state.comps.map((c) => {
            const cell = cat.comp_values[c.id];
            return cell ? `${(cell.percentage * 100).toFixed(2)}%` : "";
          }),
        ].join("\t"),
      );
    }
    lines.push("");
    lines.push(
      [
        "Total Adjustment (property %)",
        "—",
        ...state.comps.map(
          (c) =>
            `${(calcPropertyAdjTotal(state.property_categories, c.id) * 100).toFixed(2)}%`,
        ),
      ].join("\t"),
    );
    lines.push(
      [
        "Adjusted $/SF",
        "—",
        ...state.comps.map((c) => adjustedPriceForComp(state, c.id).toFixed(2)),
      ].join("\t"),
    );
    lines.push(["Adjusted Mean $ / SF", "", "", "", mean.toFixed(2)].join("\t"));
    if (compType === "sales" && state.config.include_median) {
      lines.push(
        ["Adjusted Median $ / SF", "", "", "", median.toFixed(2)].join("\t"),
      );
    }
    lines.push(["$ / SF", "", "", "", rate.toFixed(2)].join("\t"));
    if (compType === "land") {
      lines.push(["$ / AC", "", "", "", String(ratePerAc)].join("\t"));
    }
    lines.push(
      ["Value Indication", "", "", "", String(valueIndication)].join("\t"),
    );
    lines.push(
      [
        compType === "land"
          ? "Concluded Value - Land"
          : "Concluded Value - Site and Improvements",
        "",
        "",
        "",
        String(concluded),
      ].join("\t"),
    );

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyMsg("Copied to clipboard");
      setTimeout(() => setCopyMsg(null), 2500);
    } catch {
      setCopyMsg("Copy failed");
      setTimeout(() => setCopyMsg(null), 2500);
    }
  };

  const addPropertyCategory = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setState((prev) => {
      if (!prev) {
        return prev;
      }
      const sort_order = prev.property_categories.length + 100;
      const comp_values: Record<string, AdjustmentCellState> = {};
      for (const c of prev.comps) {
        comp_values[c.id] = emptyCell();
      }
      return {
        ...prev,
        property_categories: [
          ...prev.property_categories,
          {
            name: trimmed,
            sort_order,
            comp_values,
            subject_value: "",
          },
        ],
      };
    });
  };

  const removePropertyCategory = (index: number) => {
    if (!window.confirm("Remove this adjustment row?")) {
      return;
    }
    setState((prev) => {
      if (!prev) {
        return prev;
      }
      const next = [...prev.property_categories];
      next.splice(index, 1);
      return { ...prev, property_categories: next };
    });
  };

  const addableCategories = useMemo(() => {
    const defaults = compType === "land" ? LAND_PROP : SALES_PROP;
    const headers =
      compType === "land"
        ? COMP_FIELD_HEADERS_LAND
        : COMP_FIELD_HEADERS_SALES;
    return [...new Set([...defaults, ...headers])];
  }, [compType]);

  const txFieldOptions = useMemo(() => {
    const txDefaults = compType === "land" ? LAND_TX : SALES_TX;
    const headers =
      compType === "land"
        ? COMP_FIELD_HEADERS_LAND
        : COMP_FIELD_HEADERS_SALES;
    return [...new Set([...txDefaults, ...headers])];
  }, [compType]);

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
        {loadError}
      </div>
    );
  }

  if (initializing || subjectLoading) {
    return (
      <div className="animate-pulse space-y-3 rounded-lg border border-gray-200 bg-gray-100 p-6 dark:border-gray-800 dark:bg-gray-900/50">
        <div className="h-8 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-64 rounded bg-gray-200 dark:bg-gray-800" />
      </div>
    );
  }

  if (!state) {
    return null;
  }

  if (state.comps.length === 0) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-100">
        No {compType === "land" ? "land" : "sales"} comparables found for this
        project. Add comps first, then return to the adjustment grid.
      </div>
    );
  }

  const colCount = 2 + state.comps.length;

  const concludedLabel =
    compType === "land"
      ? "Concluded Value - Land"
      : "Concluded Value - Site and Improvements";
  const valueSummarySizeLabel =
    compType === "land" ? "Land Size (SF)" : "Improvement Size (SF)";

  const selectedComp = selectedCompId
    ? state.comps.find((c) => c.id === selectedCompId)
    : null;
  const selectedCompLabel = selectedComp
    ? `Comp #${selectedComp.number}`
    : "";

  return (
    <>
    <div>
      <div className="space-y-3">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resetToAi}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700"
          >
            Reset to AI Suggestions
          </button>
          <button
            type="button"
            onClick={copyGrid}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700"
          >
            Copy Grid
          </button>
          <button
            type="button"
            onClick={suggestRemaining}
            className="rounded-md border border-blue-400 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-600 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
          >
            Suggest remaining
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {saveStatus === "saving" && (
            <span className="text-gray-400 dark:text-gray-500">Saving…</span>
          )}
          {saveStatus === "saved" && (
            <span className="font-medium text-green-600 dark:text-green-400">
              Saved
            </span>
          )}
          {copyMsg && (
            <span className="text-blue-600 dark:text-blue-400">{copyMsg}</span>
          )}
        </div>
      </div>

      {/* Config bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
        <label className="flex cursor-pointer items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-300">
          <input
            type="checkbox"
            checked={state.config.exclude_extremes}
            onChange={(e) =>
              updateConfig({ exclude_extremes: e.target.checked })
            }
          />
          Exclude extremes
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-300">
          <input
            type="checkbox"
            checked={state.config.round_up}
            onChange={(e) => updateConfig({ round_up: e.target.checked })}
          />
          Round up
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-300">
          <input
            type="checkbox"
            checked={state.config.disable_rounding}
            onChange={(e) =>
              updateConfig({ disable_rounding: e.target.checked })
            }
          />
          Disable rounding
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-300">
          <input
            type="checkbox"
            checked={state.config.round_final_value}
            onChange={(e) =>
              updateConfig({ round_final_value: e.target.checked })
            }
          />
          Round final value
        </label>
        {compType === "sales" && (
          <label className="flex cursor-pointer items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-300">
            <input
              type="checkbox"
              checked={state.config.round_to_5k}
              onChange={(e) => updateConfig({ round_to_5k: e.target.checked })}
            />
            Round to $5k
          </label>
        )}
        {compType === "sales" && (
          <label className="flex cursor-pointer items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-300">
            <input
              type="checkbox"
              checked={state.config.include_median}
              onChange={(e) =>
                updateConfig({ include_median: e.target.checked })
              }
            />
            Include median
          </label>
        )}
        <div className="h-3 w-px bg-gray-300 dark:bg-gray-700" />
        <label className="flex items-center gap-1.5">
          <span className="text-gray-400 dark:text-gray-500">%/mo</span>
          <input
            type="number"
            step={0.1}
            className="w-14 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-gray-700 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:focus:border-blue-700"
            value={state.config.percent_inc_per_month}
            onChange={(e) =>
              updateConfig({
                percent_inc_per_month: Number.parseFloat(e.target.value) || 0,
              })
            }
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-gray-400 dark:text-gray-500">Eff. date</span>
          <input
            type="date"
            className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-gray-700 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:focus:border-blue-700"
            value={state.config.report_effective_date.slice(0, 10)}
            onChange={(e) =>
              updateConfig({ report_effective_date: e.target.value })
            }
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white dark:border-gray-800 dark:bg-gray-950">
        <table
          className="border-collapse text-left text-xs text-gray-700 dark:text-gray-100"
          style={{
            tableLayout: "fixed",
            minWidth: `${176 + 152 + state.comps.length * 152}px`,
          }}
        >
          <thead>
            <tr className="border-b-2 border-gray-500 bg-gray-500 dark:border-gray-700 dark:bg-gray-900">
              <th className="sticky left-0 z-10 w-44 border-r border-gray-500 bg-gray-500 px-3 py-3 text-left text-[10px] font-semibold tracking-widest text-gray-100 uppercase dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
                Field
              </th>
              <th className="w-38 border-r border-gray-500 px-3 py-3 text-left text-[10px] font-semibold tracking-widest text-gray-100 uppercase dark:border-gray-700 dark:text-gray-500">
                Subject
              </th>
              {state.comps.map((c) => (
                <th
                  key={c.id}
                  onClick={() =>
                    setSelectedCompId((prev) =>
                      prev === c.id ? null : c.id,
                    )
                  }
                  title={
                    selectedCompId === c.id
                      ? "Click to close comp detail"
                      : "Click to open comp detail"
                  }
                  className={`w-38 cursor-pointer select-none border-r border-gray-500 px-3 py-3 text-left transition-colors last:border-r-0 dark:border-gray-700 ${
                    selectedCompId === c.id
                      ? "bg-blue-600 dark:bg-blue-700"
                      : "hover:bg-gray-400 dark:hover:bg-gray-700/80"
                  }`}
                >
                  <div className="text-[11px] font-semibold text-white dark:text-gray-200">
                    Comp #{c.number}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-snug font-normal break-words text-gray-200 dark:text-gray-500">
                    {c.address}
                  </div>
                  {selectedCompId === c.id && (
                    <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-blue-200">
                      ← Detail open
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200 dark:border-gray-800/60">
              <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-100 px-3 py-2 font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                Address
              </td>
              <td className="border-r border-gray-200 px-3 py-2 break-words text-gray-600 dark:border-gray-800 dark:text-gray-300">
                {formatGridAddress(subjectAddress(subjectCore))}
              </td>
              {state.comps.map((c) => (
                <td
                  key={c.id}
                  className="border-r border-gray-200 px-3 py-2 break-words text-gray-600 dark:border-gray-800 dark:text-gray-300"
                >
                  {formatGridAddress(c.address)}
                </td>
              ))}
            </tr>
            <tr className="border-b border-gray-200 dark:border-gray-800/60">
              <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-100 px-3 py-2 font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                Date of Sale
              </td>
              <td className="border-r border-gray-200 px-3 py-2 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                Current
              </td>
              {state.comps.map((c) => (
                <td
                  key={c.id}
                  className="border-r border-gray-200 px-3 py-2 text-gray-500 dark:border-gray-800 dark:text-gray-400"
                >
                  {c.date_of_sale || "—"}
                </td>
              ))}
            </tr>
            <tr className="border-b border-gray-200 dark:border-gray-800/60">
              <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-100 px-3 py-2 font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                <select
                  className="w-full border-0 bg-transparent text-xs font-medium text-gray-600 outline-none focus:outline-none dark:text-gray-300"
                  value={state.size_label ?? (compType === "land" ? "Land Size (SF)" : "Building Size (SF)")}
                  onChange={(e) =>
                    setState((prev) =>
                      prev ? { ...prev, size_label: e.target.value } : prev,
                    )
                  }
                >
                  {SIZE_LABEL_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </td>
              <td className="border-r border-gray-200 px-3 py-2 hover:bg-sky-50 dark:border-gray-800 dark:hover:bg-sky-950/20">
                <input
                  type="number"
                  className="w-full bg-transparent font-mono text-gray-700 outline-none focus:outline-none dark:text-gray-200"
                  value={state.subject_size ?? ""}
                  onChange={(e) =>
                    setState((prev) =>
                      prev
                        ? {
                            ...prev,
                            subject_size:
                              Number.parseFloat(e.target.value) || 0,
                          }
                        : prev,
                    )
                  }
                />
              </td>
              {state.comps.map((c, ci) => (
                <td
                  key={c.id}
                  className="border-r border-gray-200 px-3 py-2 hover:bg-sky-50 dark:border-gray-800 dark:hover:bg-sky-950/20"
                >
                  <input
                    type="number"
                    className="w-full bg-transparent font-mono text-gray-500 outline-none focus:outline-none dark:text-gray-400"
                    value={c.size ?? ""}
                    onChange={(e) => {
                      const v = Number.parseFloat(e.target.value) || 0;
                      setState((prev) => {
                        if (!prev) return prev;
                        const comps = [...prev.comps];
                        comps[ci] = { ...comps[ci]!, size: v };
                        return { ...prev, comps };
                      });
                    }}
                  />
                </td>
              ))}
            </tr>
            <tr className="border-b-2 border-gray-300 dark:border-gray-700">
              <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-100 px-3 py-2 font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                <select
                  className="w-full border-0 bg-transparent text-xs font-medium text-gray-600 outline-none focus:outline-none dark:text-gray-300"
                  value={state.price_label ?? (compType === "sales" ? "Sale Price / SF (Adj)" : "Sale Price / SF")}
                  onChange={(e) =>
                    setState((prev) =>
                      prev ? { ...prev, price_label: e.target.value } : prev,
                    )
                  }
                >
                  {PRICE_LABEL_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </td>
              <td className="border-r border-gray-200 bg-gray-100 px-3 py-2 text-gray-400 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-600">
                —
              </td>
              {state.comps.map((c, ci) => (
                <td
                  key={c.id}
                  className="border-r border-gray-200 bg-gray-100 px-3 py-2 hover:bg-sky-50 dark:border-gray-800 dark:bg-gray-900/60 dark:hover:bg-sky-950/20"
                >
                  <div className="flex items-center font-mono font-medium text-gray-700 dark:text-gray-200">
                    <span className="mr-0.5">$</span>
                    <input
                      type="number"
                      step={0.01}
                      className="w-full bg-transparent outline-none focus:outline-none"
                      value={c.base_price_per_unit ?? ""}
                      onChange={(e) => {
                        const v = Number.parseFloat(e.target.value) || 0;
                        setState((prev) => {
                          if (!prev) return prev;
                          const comps = [...prev.comps];
                          comps[ci] = { ...comps[ci]!, base_price_per_unit: v };
                          return { ...prev, comps };
                        });
                      }}
                    />
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <td
                colSpan={colCount}
                className="h-2 bg-gray-100 dark:bg-gray-950"
              />
            </tr>

            <tr className="border-b-2 border-gray-700 bg-gray-400 dark:border-gray-700/60 dark:bg-gray-900/80">
              <td
                colSpan={colCount}
                className="border-l-4 border-l-gray-500 px-3 py-2 text-[10px] font-bold tracking-widest text-gray-200 uppercase dark:border-l-gray-600 dark:text-gray-300"
              >
                Transaction Adjustments
              </td>
            </tr>
            {state.transaction_categories.map((cat, ci) => (
              <FragmentCategoryRows
                key={`${cat.name}-${ci}`}
                cat={cat}
                catIndex={ci}
                comps={state.comps}
                transactionCategories={state.transaction_categories}
                config={state.config}
                compType={compType}
                rawDataByComp={rawDataByComp}
                fieldHeaderOptions={txFieldOptions}
                onQualChange={(compId, q) =>
                  updateCell("tx", ci, compId, { qualitative: q })
                }
                onPctChange={(compId, pct) =>
                  updateCell("tx", ci, compId, { percentage: pct })
                }
                onSubjectChange={(v) => updateSubjectValue("tx", ci, v)}
                onNameChange={(newName) => {
                  setState((prev) => {
                    if (!prev) return prev;
                    const list = [...prev.transaction_categories];
                    const existing = list[ci];
                    if (!existing) return prev;
                    list[ci] = { ...existing, name: newName };
                    return { ...prev, transaction_categories: list };
                  });
                }}
                onSuggestClick={(compId, e) => {
                  const text =
                    rationaleByCellRef.current.get(
                      suggestionKey(cat.name, compId),
                    ) ?? "Suggested from past report adjustment patterns.";
                  setPopover({
                    category: cat.name,
                    compId,
                    x: e.clientX,
                    y: e.clientY,
                    text,
                  });
                }}
              />
            ))}

            <tr>
              <td
                colSpan={colCount}
                className="h-2 bg-gray-100 dark:bg-gray-950"
              />
            </tr>

            <tr className="border-b-2 border-gray-700 bg-gray-400 dark:border-gray-700/60 dark:bg-gray-900/80">
              <td
                colSpan={colCount}
                className="border-l-4 border-l-gray-500 px-3 py-2 text-[10px] font-bold tracking-widest text-gray-200 uppercase dark:border-l-gray-600 dark:text-gray-300"
              >
                Property Adjustments
              </td>
            </tr>
            {state.property_categories.map((cat, ci) => (
              <FragmentPropertyRows
                key={`${cat.name}-${ci}`}
                cat={cat}
                catIndex={ci}
                comps={state.comps}
                compType={compType}
                rawDataByComp={rawDataByComp}
                subjectCore={subjectCore}
                fieldHeaderOptions={addableCategories}
                onQualChange={(compId, q) =>
                  updateCell("prop", ci, compId, { qualitative: q })
                }
                onPctChange={(compId, pct) =>
                  updateCell("prop", ci, compId, { percentage: pct })
                }
                onSubjectChange={(v) => updateSubjectValue("prop", ci, v)}
                onNameChange={(newName) => {
                  setState((prev) => {
                    if (!prev) return prev;
                    const list = [...prev.property_categories];
                    const existing = list[ci];
                    if (!existing) return prev;
                    list[ci] = { ...existing, name: newName };
                    return { ...prev, property_categories: list };
                  });
                }}
                onRemove={() => removePropertyCategory(ci)}
                onSuggestClick={(compId, e) => {
                  const text =
                    rationaleByCellRef.current.get(
                      suggestionKey(cat.name, compId),
                    ) ?? "Suggested from past report adjustment patterns.";
                  setPopover({
                    category: cat.name,
                    compId,
                    x: e.clientX,
                    y: e.clientY,
                    text,
                  });
                }}
              />
            ))}

            <tr className="border-b border-gray-200 dark:border-gray-800/50">
              <td
                colSpan={colCount}
                className="bg-gray-100 px-3 py-1 dark:bg-gray-950"
              >
                <AddCategoryMenu
                  options={addableCategories}
                  existing={state.property_categories.map((c) => c.name)}
                  onPick={addPropertyCategory}
                />
              </td>
            </tr>

            <tr className="border-t-2 border-gray-400 bg-gray-200 dark:border-gray-700 dark:bg-gray-800/70">
              <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                Total adjustment (property %)
              </td>
              <td className="border-r border-gray-300 bg-gray-200 px-3 py-2 text-gray-400 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-600">
                —
              </td>
              {state.comps.map((c) => (
                <td
                  key={c.id}
                  className="border-r border-gray-300 bg-gray-200 px-3 py-2 font-mono text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200"
                >
                  {(
                    calcPropertyAdjTotal(state.property_categories, c.id) * 100
                  ).toFixed(1)}
                  %
                </td>
              ))}
            </tr>
            <tr className="border-b border-gray-300 dark:border-gray-700/60">
              <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                Adjusted $/SF
              </td>
              <td className="border-r border-gray-300 bg-gray-200 px-3 py-2 text-gray-400 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-600">
                —
              </td>
              {state.comps.map((c) => (
                <td
                  key={c.id}
                  className="border-r border-gray-300 bg-gray-200 px-3 py-2 font-mono text-xs font-semibold text-blue-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-blue-300"
                >
                  ${adjustedPriceForComp(state, c.id).toFixed(2)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Value summary card */}
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 dark:border-gray-700/60 dark:bg-gray-900">
        <div className="mb-3 text-[10px] font-semibold tracking-widest text-gray-400 uppercase dark:text-gray-600">
          Value Summary
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-0.5">
            <div className="text-[10px] font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500">
              Adjusted Mean $ / SF
            </div>
            <div className="font-mono text-sm text-gray-700 dark:text-gray-300">
              ${mean.toFixed(2)}
            </div>
          </div>
          {compType === "sales" && state.config.include_median && (
            <div className="space-y-0.5">
              <div className="text-[10px] font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500">
                Adjusted Median $ / SF
              </div>
              <div className="font-mono text-sm text-gray-700 dark:text-gray-300">
                ${median.toFixed(2)}
              </div>
            </div>
          )}
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold tracking-wide text-blue-500 uppercase dark:text-blue-500">
              $ / SF
            </div>
            <div className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-300">
              ${rate.toFixed(2)}
            </div>
          </div>
          {compType === "land" && (
            <div className="space-y-0.5">
              <div className="text-[10px] font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500">
                $ / AC
              </div>
              <div className="font-mono text-sm text-gray-700 dark:text-gray-300">
                ${ratePerAc.toFixed(2)}
              </div>
            </div>
          )}
          <div className="space-y-0.5">
            <div className="text-[10px] font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500">
              {valueSummarySizeLabel}
            </div>
            <div className="font-mono text-sm text-gray-600 dark:text-gray-400">
              {state.subject_size.toLocaleString()}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500">
              Value Indication
            </div>
            <div className="font-mono text-sm text-gray-700 dark:text-gray-300">
              $
              {valueIndication.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </div>
          </div>
          <div className="ml-auto rounded-lg bg-emerald-50 px-5 py-3 ring-1 ring-emerald-300/60 ring-inset dark:bg-emerald-950/50 dark:ring-emerald-800/40">
            <div className="text-[10px] font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-600">
              {concludedLabel}
            </div>
            <div className="mt-0.5 font-mono text-xl font-bold text-emerald-700 dark:text-emerald-300">
              $
              {concluded.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </div>
          </div>
        </div>
      </div>

      {popover && (
        <div
          className="fixed z-50 max-w-sm rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          style={{ left: popover.x + 8, top: popover.y + 8 }}
        >
          <button
            type="button"
            className="float-right text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            onClick={() => setPopover(null)}
          >
            ×
          </button>
          <p className="mb-1 font-semibold text-gray-800 dark:text-gray-100">
            {popover.category}
          </p>
          <p className="text-gray-500 dark:text-gray-400">{popover.text}</p>
        </div>
      )}
      </div>
    </div>

    {/* Comp detail side panel — fixed to right viewport edge, full height */}
    {selectedCompId && selectedComp && (
      <CompDetailSidePanel
        projectId={projectId}
        compId={selectedCompId}
        compType={compType}
        compLabel={selectedCompLabel}
        onClose={() => setSelectedCompId(null)}
      />
    )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function FragmentCategoryRows({
  cat,
  catIndex,
  comps,
  transactionCategories,
  config,
  compType,
  rawDataByComp,
  fieldHeaderOptions,
  onQualChange,
  onPctChange,
  onSubjectChange,
  onNameChange,
  onSuggestClick,
}: {
  cat: AdjustmentCategoryState;
  catIndex: number;
  comps: CompColumnState[];
  transactionCategories: AdjustmentCategoryState[];
  config: GridConfig;
  compType: "land" | "sales";
  rawDataByComp: Map<string, Record<string, unknown>>;
  fieldHeaderOptions: string[];
  onQualChange: (compId: string, q: string) => void;
  onPctChange: (compId: string, pct: number) => void;
  onSubjectChange: (v: string) => void;
  onNameChange: (newName: string) => void;
  onSuggestClick: (compId: string, e: MouseEvent) => void;
}) {
  const isMC = cat.name === "Market Conditions";
  const isDataRow = !isQualitativeRow(cat.name, compType) && !isMC;
  return (
    <>
      {/* Qualitative / data-value row */}
      <tr className="border-b border-gray-200 dark:border-gray-800/50">
        <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-100 px-3 py-1.5 font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
          {isMC ? (
            cat.name
          ) : (
            <select
              className="w-full border-0 bg-transparent text-[11px] font-medium text-gray-600 outline-none focus:outline-none dark:text-gray-200"
              value={cat.name}
              onChange={(e) => onNameChange(e.target.value)}
            >
              <option value={cat.name}>{cat.name}</option>
              {fieldHeaderOptions
                .filter((h) => h !== cat.name)
                .map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
            </select>
          )}
        </td>
        {isMC ? (
          <td className="border-r border-gray-200 px-3 py-1.5 dark:border-gray-800">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              Current
            </span>
          </td>
        ) : (
          <td className="border-r border-gray-200 px-3 py-1.5 hover:bg-sky-50 dark:border-gray-800 dark:hover:bg-sky-950/20">
            <input
              className="w-full bg-transparent text-[11px] text-gray-600 outline-none focus:outline-none dark:text-gray-200"
              value={cat.subject_value}
              onChange={(e) => onSubjectChange(e.target.value)}
            />
          </td>
        )}
        {comps.map((c) =>
          isMC ? (
            <td
              key={c.id}
              className="border-r border-gray-200 px-3 py-1.5 dark:border-gray-800"
            >
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {formatSaleDate(c.date_of_sale)}
              </span>
            </td>
          ) : isDataRow ? (
            <td
              key={c.id}
              className="border-r border-gray-200 px-3 py-1.5 hover:bg-sky-50 dark:border-gray-800 dark:hover:bg-sky-950/20"
            >
              <input
                className="w-full bg-transparent text-[11px] text-gray-500 outline-none focus:outline-none dark:text-gray-400"
                value={
                  cat.comp_values[c.id]?.qualitative &&
                  cat.comp_values[c.id]?.qualitative !== "Similar"
                    ? cat.comp_values[c.id]!.qualitative
                    : formatFieldValue(cat.name, rawDataByComp.get(c.id))
                }
                onChange={(e) => onQualChange(c.id, e.target.value)}
              />
            </td>
          ) : (
            <td
              key={c.id}
              className="border-r border-gray-200 px-2 py-1.5 hover:bg-sky-50 dark:border-gray-800 dark:hover:bg-sky-950/20"
            >
              <QualSelect
                value={cat.comp_values[c.id]?.qualitative ?? "Similar"}
                onChange={(q) => onQualChange(c.id, q)}
              />
            </td>
          ),
        )}
      </tr>
      {/* Percentage row */}
      <tr className="border-b border-gray-200 dark:border-gray-800/50">
        <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-100 px-3 py-1 text-[10px] font-semibold tracking-wide text-gray-400 uppercase dark:border-gray-800 dark:bg-gray-950 dark:text-gray-600">
          %
        </td>
        <td className="border-r border-gray-200 bg-gray-100 px-3 py-1 text-gray-300 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-600">
          —
        </td>
        {comps.map((c) => {
          if (isMC) {
            const pct = marketConditionsPct(c.date_of_sale, config);
            return (
              <td
                key={c.id}
                className="border-r border-gray-200 bg-gray-100 px-3 py-1 dark:border-gray-800 dark:bg-gray-950"
              >
                <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
                  {(pct * 100).toFixed(2)}%
                </span>
              </td>
            );
          }
          const cell = cat.comp_values[c.id] ?? emptyCell();
          const displayPct = (cell.percentage * 100).toFixed(2);
          return (
            <td
              key={c.id}
              className={`border-r border-gray-200 px-1.5 py-1 transition-colors dark:border-gray-800 ${
                cell.from_ai
                  ? "border-l-2 border-l-blue-400 bg-blue-50 dark:border-l-blue-600 dark:bg-blue-950/50"
                  : "bg-gray-100 hover:bg-sky-50 dark:bg-gray-950 dark:hover:bg-sky-950/20"
              }`}
            >
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step={0.01}
                  className="w-full min-w-[56px] bg-transparent font-mono text-[11px] text-gray-700 outline-none focus:outline-none dark:text-gray-200"
                  value={displayPct}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    onPctChange(c.id, Number.isNaN(v) ? 0 : v / 100);
                  }}
                />
                {cell.from_ai && (
                  <button
                    type="button"
                    title="AI suggestion — click to see rationale"
                    className="shrink-0 rounded px-1 py-0.5 text-[9px] font-bold text-blue-500 hover:bg-blue-100 hover:text-blue-600 dark:text-blue-400 dark:hover:bg-blue-900/60 dark:hover:text-blue-300"
                    onClick={(e) => onSuggestClick(c.id, e)}
                  >
                    AI
                  </button>
                )}
              </div>
            </td>
          );
        })}
      </tr>
      {/* Running $/SF row — emphasis border separates each category group */}
      <tr className="border-b-2 border-gray-300 dark:border-gray-700/60">
        <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-100 px-3 py-1 text-[10px] font-semibold tracking-wide text-gray-400 uppercase dark:border-gray-800 dark:bg-gray-950 dark:text-gray-600">
          Running $/SF
        </td>
        <td className="border-r border-gray-200 bg-gray-100 px-3 py-1 text-gray-300 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-600">
          —
        </td>
        {comps.map((c) => {
          const running = calcTransactionRunning(
            c.base_price_per_unit,
            transactionCategories,
            c.id,
            c.date_of_sale,
            config,
          );
          const v = running[catIndex];
          return (
            <td
              key={c.id}
              className="border-r border-gray-200 bg-gray-100 px-3 py-1 font-mono text-[11px] text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-500"
            >
              {v != null ? `$${v.toFixed(2)}` : "—"}
            </td>
          );
        })}
      </tr>
    </>
  );
}

function FragmentPropertyRows({
  cat,
  catIndex: _ci,
  comps,
  compType,
  rawDataByComp,
  subjectCore,
  fieldHeaderOptions,
  onQualChange,
  onPctChange,
  onSubjectChange,
  onNameChange,
  onRemove,
  onSuggestClick,
}: {
  cat: AdjustmentCategoryState;
  catIndex: number;
  comps: CompColumnState[];
  compType: "land" | "sales";
  rawDataByComp: Map<string, Record<string, unknown>>;
  subjectCore: Record<string, unknown>;
  fieldHeaderOptions: string[];
  onQualChange: (compId: string, q: string) => void;
  onPctChange: (compId: string, pct: number) => void;
  onSubjectChange: (v: string) => void;
  onNameChange: (newName: string) => void;
  onRemove: () => void;
  onSuggestClick: (compId: string, e: MouseEvent) => void;
}) {
  void _ci;
  const qualitative = isQualitativeRow(cat.name, compType);
  const fixed = isFixedLabel(cat.name, compType);
  const isDataRow = !qualitative;
  return (
    <>
      {/* Qualitative / data-value row */}
      <tr className="border-b border-gray-200 dark:border-gray-800/50">
        <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-100 px-3 py-1.5 font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
          <span className="flex items-center justify-between gap-1">
            {fixed ? (
              cat.name
            ) : (
              <select
                className="w-full border-0 bg-transparent text-[11px] font-medium text-gray-600 outline-none focus:outline-none dark:text-gray-200"
                value={cat.name}
                onChange={(e) => onNameChange(e.target.value)}
              >
                <option value={cat.name}>{cat.name}</option>
                {fieldHeaderOptions
                  .filter((h) => h !== cat.name)
                  .map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
              </select>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="ml-1 shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:text-gray-600 dark:hover:bg-red-950/60 dark:hover:text-red-400"
              title="Remove row"
            >
              ×
            </button>
          </span>
        </td>
        {isDataRow ? (
          <td className="border-r border-gray-200 px-3 py-1.5 dark:border-gray-800">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {formatFieldValue(cat.name, subjectCore)}
            </span>
          </td>
        ) : (
          <td className="border-r border-gray-200 px-3 py-1.5 hover:bg-sky-50 dark:border-gray-800 dark:hover:bg-sky-950/20">
            <input
              className="w-full bg-transparent text-[11px] text-gray-600 outline-none focus:outline-none dark:text-gray-200"
              value={cat.subject_value}
              onChange={(e) => onSubjectChange(e.target.value)}
            />
          </td>
        )}
        {comps.map((c) =>
          isDataRow ? (
            <td
              key={c.id}
              className="border-r border-gray-200 px-3 py-1.5 dark:border-gray-800"
            >
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {formatFieldValue(cat.name, rawDataByComp.get(c.id))}
              </span>
            </td>
          ) : (
            <td
              key={c.id}
              className="border-r border-gray-200 px-2 py-1.5 hover:bg-sky-50 dark:border-gray-800 dark:hover:bg-sky-950/20"
            >
              <QualSelect
                value={cat.comp_values[c.id]?.qualitative ?? "Similar"}
                onChange={(q) => onQualChange(c.id, q)}
              />
            </td>
          ),
        )}
      </tr>
      {/* Percentage row — emphasis border separates each property category group */}
      <tr className="border-b-2 border-gray-300 dark:border-gray-700/60">
        <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-100 px-3 py-1 text-[10px] font-semibold tracking-wide text-gray-400 uppercase dark:border-gray-800 dark:bg-gray-950 dark:text-gray-600">
          %
        </td>
        <td className="border-r border-gray-200 bg-gray-100 px-3 py-1 text-gray-300 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-600">
          —
        </td>
        {comps.map((c) => {
          const cell = cat.comp_values[c.id] ?? emptyCell();
          const displayPct = (cell.percentage * 100).toFixed(2);
          return (
            <td
              key={c.id}
              className={`border-r border-gray-200 px-1.5 py-1 transition-colors dark:border-gray-800 ${
                cell.from_ai
                  ? "border-l-2 border-l-blue-400 bg-blue-50 dark:border-l-blue-600 dark:bg-blue-950/50"
                  : "bg-gray-100 hover:bg-sky-50 dark:bg-gray-950 dark:hover:bg-sky-950/20"
              }`}
            >
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step={0.01}
                  className="w-full min-w-[56px] bg-transparent font-mono text-[11px] text-gray-700 outline-none focus:outline-none dark:text-gray-200"
                  value={displayPct}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    onPctChange(c.id, Number.isNaN(v) ? 0 : v / 100);
                  }}
                />
                {cell.from_ai && (
                  <button
                    type="button"
                    title="AI suggestion — click to see rationale"
                    className="shrink-0 rounded px-1 py-0.5 text-[9px] font-bold text-blue-500 hover:bg-blue-100 hover:text-blue-600 dark:text-blue-400 dark:hover:bg-blue-900/60 dark:hover:text-blue-300"
                    onClick={(e) => onSuggestClick(c.id, e)}
                  >
                    AI
                  </button>
                )}
              </div>
            </td>
          );
        })}
      </tr>
    </>
  );
}

function qualColor(value: string): string {
  if (value === "Inferior") return "text-red-600 dark:text-red-400";
  if (value === "Slightly Inferior") return "text-red-400 dark:text-red-300";
  if (value === "Superior") return "text-emerald-600 dark:text-emerald-400";
  if (value === "Slightly Superior") return "text-emerald-400 dark:text-emerald-300";
  if (value === "TODO") return "text-amber-600 dark:text-amber-400";
  return "text-gray-600 dark:text-gray-300";
}

function QualSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (q: string) => void;
}) {
  const isPreset = (QUAL_OPTIONS as readonly string[]).includes(value);
  const colorCls = qualColor(value);
  return (
    <div className="flex flex-col gap-0.5">
      <select
        className={`w-full border-0 bg-transparent text-[11px] font-medium outline-none focus:outline-none ${colorCls}`}
        value={isPreset ? value : "CUSTOM"}
        onChange={(e) => {
          if (e.target.value === "CUSTOM") {
            onChange("");
          } else {
            onChange(e.target.value);
          }
        }}
      >
        {QUAL_OPTIONS.map((q) => (
          <option key={q} value={q}>
            {q}
          </option>
        ))}
        <option value="CUSTOM">Custom…</option>
      </select>
      {!isPreset && (
        <input
          className="w-full border-0 bg-transparent text-[10px] text-gray-600 outline-none focus:outline-none dark:text-gray-300"
          placeholder="Custom"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function AddCategoryMenu({
  options,
  existing,
  onPick,
}: {
  options: string[];
  existing: string[];
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const filtered = options.filter((o) => !existing.includes(o));

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Add property adjustment category"
        className="flex h-5 w-5 items-center justify-center rounded border border-dashed border-gray-400 text-sm leading-none text-gray-400 transition-colors hover:border-blue-500 hover:bg-blue-500/10 hover:text-blue-500 dark:border-gray-600 dark:text-gray-500 dark:hover:border-blue-400 dark:hover:text-blue-400"
      >
        +
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <select
            className="mb-2 w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
            onChange={(e) => {
              if (e.target.value) {
                onPick(e.target.value);
                setOpen(false);
              }
            }}
            defaultValue=""
          >
            <option value="">Pick preset…</option>
            {filtered.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            <input
              className="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
              placeholder="Custom name"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button
              type="button"
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
              onClick={() => {
                onPick(custom);
                setCustom("");
                setOpen(false);
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
