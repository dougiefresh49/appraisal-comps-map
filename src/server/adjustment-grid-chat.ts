import "server-only";

import type { AdjustmentGridSuggestions } from "~/lib/adjustment-suggestions";
import { generateAdjustmentSuggestions } from "~/lib/adjustment-suggestions";
import { calcMonthlyIncrease } from "~/lib/calculated-fields";
import { createClient } from "~/utils/supabase/server";
import type {
  AdjustmentCategoryState,
  AdjustmentCellState,
  AdjustmentGridState,
  CompColumnState,
  GridConfig,
} from "~/types/adjustment-grid";

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

/** Mirrors AdjustmentGrid suggestionsToState — used when no draft exists. */
export function buildGridStateFromSuggestions(
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

export function normalizeLoadedDraft(
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

export interface AdjustmentPatchInput {
  row: string;
  comp_number: number;
  qualitative: string;
  /** Decimal fraction: 0.15 = 15%, -0.25 = -25% */
  percentage: number;
}

export function applyAdjustmentPatches(
  state: AdjustmentGridState,
  patches: AdjustmentPatchInput[],
): { next: AdjustmentGridState; warnings: string[] } {
  const warnings: string[] = [];
  const next: AdjustmentGridState = structuredClone(state);
  next.source = "mixed";

  for (const p of patches) {
    const rowName = p.row.trim();
    if (!rowName) {
      warnings.push("Skipped patch with empty row name");
      continue;
    }

    const comp = next.comps.find((c) => c.number === p.comp_number);
    if (!comp) {
      warnings.push(
        `No comp #${p.comp_number} (available: ${next.comps.map((c) => c.number).join(", ")})`,
      );
      continue;
    }

    let cat = [...next.transaction_categories, ...next.property_categories].find(
      (c) => c.name.toLowerCase() === rowName.toLowerCase(),
    );

    if (!cat) {
      const newCat: AdjustmentCategoryState = {
        name: rowName,
        sort_order: next.property_categories.length + 100,
        comp_values: {},
        subject_value: "",
      };
      for (const c of next.comps) {
        newCat.comp_values[c.id] = emptyCell();
      }
      next.property_categories.push(newCat);
      cat = newCat;
      warnings.push(`Added property row "${rowName}"`);
    }

    cat.comp_values[comp.id] = {
      qualitative: p.qualitative.trim() || "Similar",
      percentage: p.percentage,
      from_ai: false,
    };
  }

  return { next, warnings };
}

/** Load draft JSON or build from AI suggestions + subject core. */
export async function loadOrBootstrapAdjustmentGrid(
  projectId: string,
  compType: "land" | "sales",
): Promise<{ state: AdjustmentGridState; bootstrapped: boolean }> {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("project_adjustment_drafts")
    .select("grid_data")
    .eq("project_id", projectId)
    .eq("comp_type", compType)
    .maybeSingle();

  const normalized = normalizeLoadedDraft(row?.grid_data ?? null, compType);
  if (normalized) {
    return { state: normalized, bootstrapped: false };
  }

  const suggestions = await generateAdjustmentSuggestions(projectId, compType);
  const { data: subj } = await supabase
    .from("subject_data")
    .select("core")
    .eq("project_id", projectId)
    .maybeSingle();

  const core = jsonRecord(subj?.core);
  const state = buildGridStateFromSuggestions(suggestions, core, compType);
  return { state, bootstrapped: true };
}

export async function saveAdjustmentGridDraft(
  projectId: string,
  compType: "land" | "sales",
  grid: AdjustmentGridState,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("project_adjustment_drafts").upsert(
    {
      project_id: projectId,
      comp_type: compType,
      grid_data: grid as unknown as Record<string, unknown>,
    },
    { onConflict: "project_id,comp_type" },
  );
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Compact summary for the model (read tool). */
export function summarizeAdjustmentGridForChat(state: AdjustmentGridState): {
  comps: Array<{ number: number; id: string; address: string }>;
  transaction_rows: string[];
  property_rows: string[];
  cells: Array<{
    section: "transaction" | "property";
    row: string;
    comp_number: number;
    qualitative: string;
    percentage: number;
    percentage_display: string;
  }>;
} {
  const comps = state.comps.map((c) => ({
    number: c.number,
    id: c.id,
    address: c.address,
  }));

  const cells: Array<{
    section: "transaction" | "property";
    row: string;
    comp_number: number;
    qualitative: string;
    percentage: number;
    percentage_display: string;
  }> = [];

  const pushCats = (
    cats: AdjustmentCategoryState[],
    section: "transaction" | "property",
  ) => {
    for (const cat of cats) {
      for (const c of state.comps) {
        const cell = cat.comp_values[c.id];
        if (!cell) continue;
        const pct = cell.percentage;
        cells.push({
          section,
          row: cat.name,
          comp_number: c.number,
          qualitative: cell.qualitative,
          percentage: pct,
          percentage_display: `${(pct * 100).toFixed(2)}%`,
        });
      }
    }
  };

  pushCats(state.transaction_categories, "transaction");
  pushCats(state.property_categories, "property");

  return {
    comps,
    transaction_rows: state.transaction_categories.map((c) => c.name),
    property_rows: state.property_categories.map((c) => c.name),
    cells,
  };
}

/**
 * Coerce percentage from JSON (model may send 0.15, 15, "15%", "-25%").
 * Returns decimal fraction for grid storage.
 */
export function coercePercentageToDecimal(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (Math.abs(raw) <= 1) return raw;
    if (Math.abs(raw) <= 100) return raw / 100;
    return null;
  }
  if (typeof raw === "string") {
    const t = raw.trim().replace(/%/g, "");
    const n = Number.parseFloat(t.replace(/,/g, ""));
    if (Number.isNaN(n)) return null;
    if (Math.abs(n) <= 1) return n;
    if (Math.abs(n) <= 100) return n / 100;
    return null;
  }
  return null;
}
