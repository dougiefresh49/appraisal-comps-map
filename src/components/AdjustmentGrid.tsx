"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { calcMonthlyIncrease } from "~/lib/calculated-fields";
import { useSubjectData } from "~/hooks/useSubjectData";
import type { AdjustmentGridSuggestions } from "~/lib/adjustment-suggestions";

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
}

interface AdjustmentGridProps {
  projectId: string;
  compType: "land" | "sales";
}

const QUAL_OPTIONS = ["TODO", "Inferior", "Similar", "Superior"] as const;

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
  "Age/Condition",
  "Building Size (SF)",
  "Office %",
  "Land/Bld Ratio",
  "Zoning",
] as const;

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

// ---------------------------------------------------------------------------
// Calculations (mirror spreadsheet)
// ---------------------------------------------------------------------------

function calcTransactionRunning(
  basePriceSf: number,
  transactionCategories: AdjustmentCategoryState[],
  compId: string,
): number[] {
  const running: number[] = [];
  let current = basePriceSf;
  for (const cat of transactionCategories) {
    const pct = cat.comp_values[compId]?.percentage ?? 0;
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
  );
  const lastTx =
    post.length > 0 ? (post[post.length - 1] ?? comp.base_price_per_unit) : comp.base_price_per_unit;
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
    rate = config.round_up ? Math.ceil(rate * 10) / 10 : Math.round(rate * 10) / 10;
  } else {
    let target = mean;
    if (config.include_median && compType === "sales") {
      target = (mean + median) / 2;
    }
    rate = target;
    if (!config.disable_rounding) {
      rate = config.round_up ? Math.ceil(rate * 10) / 10 : Math.round(rate * 10) / 10;
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
  const map = buildSuggestionMap(data.suggestions);

  const comps: CompColumnState[] = data.comps.map((c) => ({ ...c }));

  function rowForCategory(name: string, sort_order: number): AdjustmentCategoryState {
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
        ? map.get(suggestionKey(name, comps[0].id))?.subject_value ?? ""
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
  return {
    transaction_categories: tx as AdjustmentCategoryState[],
    property_categories: py as AdjustmentCategoryState[],
    comps: comps as CompColumnState[],
    subject_size: typeof o.subject_size === "number" ? o.subject_size : 0,
    price_unit: typeof o.price_unit === "string" ? o.price_unit : "$/SF",
    config: mergeConfig(
      o.config as Partial<GridConfig> | undefined,
      compType,
    ),
    source:
      o.source === "manual" || o.source === "mixed" || o.source === "ai_suggested"
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
    () => (state ? computeMeanMedianRate(state, compType) : { mean: 0, median: 0, rate: 0 }),
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
            qualitative: patch.qualitative ?? cat.comp_values[compId]?.qualitative ?? "Similar",
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
        subjectAddress(subjectCore),
        ...state.comps.map((c) => c.address),
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
      ["Sale Price / SF", "—", ...state.comps.map((c) => String(c.base_price_per_unit))].join(
        "\t",
      ),
    );
    lines.push("");

    for (const cat of state.transaction_categories) {
      lines.push([cat.name, cat.subject_value, ...state.comps.map(() => "")].join("\t"));
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
      lines.push(
        [
          "",
          "—",
          ...state.comps.map((c) => {
            const running = calcTransactionRunning(
              c.base_price_per_unit,
              state.transaction_categories,
              c.id,
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
      lines.push([cat.name, cat.subject_value, ...state.comps.map(() => "")].join("\t"));
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
        ...state.comps.map((c) =>
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
    lines.push(["Mean $/SF", "", "", "", String(mean)].join("\t"));
    if (compType === "sales" && state.config.include_median) {
      lines.push(["Median $/SF", "", "", "", String(median)].join("\t"));
    }
    lines.push(["$/SF rate", "", "", "", String(rate)].join("\t"));
    if (compType === "land") {
      lines.push(["$/AC rate", "", "", "", String(ratePerAc)].join("\t"));
    }
    lines.push(["Value indication", "", "", "", String(valueIndication)].join("\t"));
    lines.push(["Concluded", "", "", "", String(concluded)].join("\t"));

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
    const pool =
      compType === "land"
        ? [...LAND_PROP, ...SALES_PROP]
        : [...SALES_PROP, ...LAND_PROP];
    return [...new Set(pool)];
  }, [compType]);

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
        {loadError}
      </div>
    );
  }

  if (initializing || subjectLoading) {
    return (
      <div className="animate-pulse space-y-3 rounded-lg border border-gray-800 bg-gray-900/50 p-6">
        <div className="h-8 w-1/3 rounded bg-gray-800" />
        <div className="h-64 rounded bg-gray-800" />
      </div>
    );
  }

  if (!state) {
    return null;
  }

  if (state.comps.length === 0) {
    return (
      <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-4 text-sm text-amber-100">
        No {compType === "land" ? "land" : "sales"} comparables found for this project. Add
        comps first, then return to the adjustment grid.
      </div>
    );
  }

  const colCount = 2 + state.comps.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resetToAi}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 hover:bg-gray-700"
          >
            Reset to AI Suggestions
          </button>
          <button
            type="button"
            onClick={copyGrid}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 hover:bg-gray-700"
          >
            Copy Grid
          </button>
          <AddCategoryMenu
            options={addableCategories}
            existing={state.property_categories.map((c) => c.name)}
            onPick={addPropertyCategory}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={state.config.exclude_extremes}
              onChange={(e) => updateConfig({ exclude_extremes: e.target.checked })}
            />
            Exclude extremes
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={state.config.round_up}
              onChange={(e) => updateConfig({ round_up: e.target.checked })}
            />
            Round up
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={state.config.disable_rounding}
              onChange={(e) => updateConfig({ disable_rounding: e.target.checked })}
            />
            Disable rounding
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={state.config.round_final_value}
              onChange={(e) => updateConfig({ round_final_value: e.target.checked })}
            />
            Round final value
          </label>
          {compType === "sales" && (
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={state.config.round_to_5k}
                onChange={(e) => updateConfig({ round_to_5k: e.target.checked })}
              />
              Round to $5k
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={state.config.include_median}
              onChange={(e) => updateConfig({ include_median: e.target.checked })}
            />
            Include median
          </label>
          <span className="text-gray-500">|</span>
          <label className="flex items-center gap-1">
            %/mo
            <input
              type="number"
              step={0.1}
              className="w-16 rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-gray-100"
              value={state.config.percent_inc_per_month}
              onChange={(e) =>
                updateConfig({
                  percent_inc_per_month: Number.parseFloat(e.target.value) || 0,
                })
              }
            />
          </label>
          <label className="flex items-center gap-1">
            Eff. date
            <input
              type="date"
              className="rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-gray-100"
              value={state.config.report_effective_date.slice(0, 10)}
              onChange={(e) =>
                updateConfig({ report_effective_date: e.target.value })
              }
            />
          </label>
          {saveStatus === "saving" && <span>Saving…</span>}
          {saveStatus === "saved" && <span className="text-green-400">Saved</span>}
          {copyMsg && <span className="text-blue-400">{copyMsg}</span>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-950">
        <table className="min-w-full border-collapse text-left text-xs text-gray-100">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900">
              <th className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-2 font-medium">
                Field
              </th>
              <th className="border-r border-gray-800 px-2 py-2 font-medium">Subject</th>
              {state.comps.map((c) => (
                <th
                  key={c.id}
                  className="min-w-[120px] border-r border-gray-800 px-2 py-2 font-medium last:border-r-0"
                >
                  Comp #{c.number}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-800">
              <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1.5">
                Address
              </td>
              <td className="border-r border-gray-800 px-2 py-1.5">
                {subjectAddress(subjectCore)}
              </td>
              {state.comps.map((c) => (
                <td key={c.id} className="border-r border-gray-800 px-2 py-1.5">
                  {c.address}
                </td>
              ))}
            </tr>
            <tr className="border-b border-gray-800">
              <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1.5">
                Date of Sale
              </td>
              <td className="border-r border-gray-800 px-2 py-1.5">Current</td>
              {state.comps.map((c) => (
                <td key={c.id} className="border-r border-gray-800 px-2 py-1.5">
                  {c.date_of_sale || "—"}
                </td>
              ))}
            </tr>
            <tr className="border-b border-gray-800">
              <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1.5">
                {compType === "land" ? "Land Size (SF)" : "Building Size (SF)"}
              </td>
              <td className="border-r border-gray-800 px-2 py-1.5">
                <input
                  type="number"
                  className="w-full rounded border border-gray-700 bg-gray-900 px-1 py-0.5"
                  value={state.subject_size || ""}
                  onChange={(e) =>
                    setState((prev) =>
                      prev
                        ? {
                            ...prev,
                            subject_size: Number.parseFloat(e.target.value) || 0,
                          }
                        : prev,
                    )
                  }
                />
              </td>
              {state.comps.map((c) => (
                <td key={c.id} className="border-r border-gray-800 px-2 py-1.5">
                  {c.size || "—"}
                </td>
              ))}
            </tr>
            <tr className="border-b border-gray-800">
              <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1.5">
                Sale Price / SF
              </td>
              <td className="border-r border-gray-800 bg-gray-800/40 px-2 py-1.5">—</td>
              {state.comps.map((c) => (
                <td
                  key={c.id}
                  className="border-r border-gray-800 bg-gray-800/40 px-2 py-1.5"
                >
                  ${c.base_price_per_unit.toFixed(2)}
                </td>
              ))}
            </tr>
            <tr>
              <td
                colSpan={colCount}
                className="h-2 bg-gray-950"
              />
            </tr>

            <tr className="bg-gray-900/80">
              <td
                colSpan={colCount}
                className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400"
              >
                Transaction adjustments
              </td>
            </tr>
            {state.transaction_categories.map((cat, ci) => (
              <FragmentCategoryRows
                key={cat.name}
                cat={cat}
                catIndex={ci}
                comps={state.comps}
                transactionCategories={state.transaction_categories}
                onQualChange={(compId, q) =>
                  updateCell("tx", ci, compId, { qualitative: q })
                }
                onPctChange={(compId, pct) =>
                  updateCell("tx", ci, compId, { percentage: pct })
                }
                onSubjectChange={(v) => updateSubjectValue("tx", ci, v)}
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
                className="h-2 bg-gray-950"
              />
            </tr>

            <tr className="bg-gray-900/80">
              <td
                colSpan={colCount}
                className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400"
              >
                Property adjustments
              </td>
            </tr>
            {state.property_categories.map((cat, ci) => (
              <FragmentPropertyRows
                key={`${cat.name}-${ci}`}
                cat={cat}
                catIndex={ci}
                comps={state.comps}
                onQualChange={(compId, q) =>
                  updateCell("prop", ci, compId, { qualitative: q })
                }
                onPctChange={(compId, pct) =>
                  updateCell("prop", ci, compId, { percentage: pct })
                }
                onSubjectChange={(v) => updateSubjectValue("prop", ci, v)}
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

            <tr>
              <td
                colSpan={colCount}
                className="h-2 bg-gray-950"
              />
            </tr>

            <tr className="border-t border-gray-800">
              <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1.5 font-medium">
                Total adjustment (property %)
              </td>
              <td className="border-r border-gray-800 bg-gray-800/50 px-2 py-1.5">—</td>
              {state.comps.map((c) => (
                <td
                  key={c.id}
                  className="border-r border-gray-800 bg-gray-800/50 px-2 py-1.5"
                >
                  {(calcPropertyAdjTotal(state.property_categories, c.id) * 100).toFixed(2)}%
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1.5 font-medium">
                Adjusted $/SF
              </td>
              <td className="border-r border-gray-800 bg-gray-800/50 px-2 py-1.5">—</td>
              {state.comps.map((c) => (
                <td
                  key={c.id}
                  className="border-r border-gray-800 bg-gray-800/50 px-2 py-1.5"
                >
                  ${adjustedPriceForComp(state, c.id).toFixed(2)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1.5 font-medium">
                Adjusted mean $/SF
              </td>
              <td
                colSpan={1 + state.comps.length}
                className="border-r border-gray-800 bg-gray-800/50 px-2 py-1.5 text-right font-medium"
              >
                ${mean.toFixed(2)}
              </td>
            </tr>
            {compType === "sales" && state.config.include_median && (
              <tr>
                <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1.5 font-medium">
                  Adjusted median $/SF
                </td>
                <td
                  colSpan={1 + state.comps.length}
                  className="border-r border-gray-800 bg-gray-800/50 px-2 py-1.5 text-right font-medium"
                >
                  ${median.toFixed(2)}
                </td>
              </tr>
            )}
            <tr>
              <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1.5 font-medium">
                $/SF rate
              </td>
              <td
                colSpan={1 + state.comps.length}
                className="border-r border-gray-800 bg-gray-800/50 px-2 py-1.5 text-right font-semibold text-blue-300"
              >
                ${rate.toFixed(2)}
              </td>
            </tr>
            {compType === "land" && (
              <tr>
                <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1.5 font-medium">
                  $/AC rate
                </td>
                <td
                  colSpan={1 + state.comps.length}
                  className="border-r border-gray-800 bg-gray-800/50 px-2 py-1.5 text-right font-medium"
                >
                  ${ratePerAc.toFixed(2)}
                </td>
              </tr>
            )}
            <tr>
              <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1.5 font-medium">
                Value indication
              </td>
              <td
                colSpan={1 + state.comps.length}
                className="border-r border-gray-800 bg-gray-800/50 px-2 py-1.5 text-right font-medium"
              >
                ${valueIndication.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </td>
            </tr>
            <tr>
              <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1.5 font-medium">
                Concluded value
              </td>
              <td
                colSpan={1 + state.comps.length}
                className="border-r border-gray-800 bg-gray-800/50 px-2 py-1.5 text-right font-semibold text-green-300"
              >
                ${concluded.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {popover && (
        <div
          className="fixed z-50 max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-3 text-xs text-gray-200 shadow-xl"
          style={{ left: popover.x + 8, top: popover.y + 8 }}
        >
          <button
            type="button"
            className="float-right text-gray-500 hover:text-gray-300"
            onClick={() => setPopover(null)}
          >
            ×
          </button>
          <p className="mb-1 font-semibold text-gray-100">{popover.category}</p>
          <p className="text-gray-400">{popover.text}</p>
        </div>
      )}
    </div>
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
  onQualChange,
  onPctChange,
  onSubjectChange,
  onSuggestClick,
}: {
  cat: AdjustmentCategoryState;
  catIndex: number;
  comps: CompColumnState[];
  transactionCategories: AdjustmentCategoryState[];
  onQualChange: (compId: string, q: string) => void;
  onPctChange: (compId: string, pct: number) => void;
  onSubjectChange: (v: string) => void;
  onSuggestClick: (compId: string, e: MouseEvent) => void;
}) {
  return (
    <>
      <tr className="border-b border-gray-800/80">
        <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1 font-medium">
          {cat.name}
        </td>
        <td className="border-r border-gray-800 px-1 py-1">
          <input
            className="w-full rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[11px]"
            value={cat.subject_value}
            onChange={(e) => onSubjectChange(e.target.value)}
          />
        </td>
        {comps.map((c) => (
          <td key={c.id} className="border-r border-gray-800 px-1 py-1">
            <QualSelect
              value={cat.comp_values[c.id]?.qualitative ?? "Similar"}
              onChange={(q) => onQualChange(c.id, q)}
            />
          </td>
        ))}
      </tr>
      <tr className="border-b border-gray-800/80">
        <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1 text-gray-500">
          %
        </td>
        <td className="border-r border-gray-800 bg-gray-800/30 px-2 py-1">—</td>
        {comps.map((c) => {
          const cell = cat.comp_values[c.id] ?? emptyCell();
          const displayPct = (cell.percentage * 100).toFixed(2);
          return (
            <td
              key={c.id}
              className={`border-r border-gray-800 px-1 py-1 ${
                cell.from_ai ? "bg-blue-500/10" : ""
              }`}
            >
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  step={0.01}
                  className="w-full min-w-[72px] rounded border border-gray-700 bg-gray-900 px-1 py-0.5"
                  value={displayPct}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    onPctChange(c.id, Number.isNaN(v) ? 0 : v / 100);
                  }}
                />
                {cell.from_ai && (
                  <button
                    type="button"
                    title="AI suggestion"
                    className="shrink-0 text-[10px] text-blue-400"
                    onClick={(e) => onSuggestClick(c.id, e)}
                  >
                    i
                  </button>
                )}
              </div>
            </td>
          );
        })}
      </tr>
      <tr className="border-b border-gray-800">
        <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1 text-gray-500">
          Running $/SF
        </td>
        <td className="border-r border-gray-800 bg-gray-800/40 px-2 py-1">—</td>
        {comps.map((c) => {
          const running = calcTransactionRunning(
            c.base_price_per_unit,
            transactionCategories,
            c.id,
          );
          const v = running[catIndex];
          return (
            <td
              key={c.id}
              className="border-r border-gray-800 bg-gray-800/40 px-2 py-1"
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
  onQualChange,
  onPctChange,
  onSubjectChange,
  onRemove,
  onSuggestClick,
}: {
  cat: AdjustmentCategoryState;
  catIndex: number;
  comps: CompColumnState[];
  onQualChange: (compId: string, q: string) => void;
  onPctChange: (compId: string, pct: number) => void;
  onSubjectChange: (v: string) => void;
  onRemove: () => void;
  onSuggestClick: (compId: string, e: MouseEvent) => void;
}) {
  void _ci;
  return (
    <>
      <tr className="border-b border-gray-800/80">
        <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1 font-medium">
          <span className="flex items-center justify-between gap-1">
            {cat.name}
            <button
              type="button"
              onClick={onRemove}
              className="text-gray-500 hover:text-red-400"
              title="Remove row"
            >
              ×
            </button>
          </span>
        </td>
        <td className="border-r border-gray-800 px-1 py-1">
          <input
            className="w-full rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[11px]"
            value={cat.subject_value}
            onChange={(e) => onSubjectChange(e.target.value)}
          />
        </td>
        {comps.map((c) => (
          <td key={c.id} className="border-r border-gray-800 px-1 py-1">
            <QualSelect
              value={cat.comp_values[c.id]?.qualitative ?? "Similar"}
              onChange={(q) => onQualChange(c.id, q)}
            />
          </td>
        ))}
      </tr>
      <tr className="border-b border-gray-800">
        <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-900 px-2 py-1 text-gray-500">
          %
        </td>
        <td className="border-r border-gray-800 bg-gray-800/30 px-2 py-1">—</td>
        {comps.map((c) => {
          const cell = cat.comp_values[c.id] ?? emptyCell();
          const displayPct = (cell.percentage * 100).toFixed(2);
          return (
            <td
              key={c.id}
              className={`border-r border-gray-800 px-1 py-1 ${
                cell.from_ai ? "bg-blue-500/10" : ""
              }`}
            >
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  step={0.01}
                  className="w-full min-w-[72px] rounded border border-gray-700 bg-gray-900 px-1 py-0.5"
                  value={displayPct}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    onPctChange(c.id, Number.isNaN(v) ? 0 : v / 100);
                  }}
                />
                {cell.from_ai && (
                  <button
                    type="button"
                    title="AI suggestion"
                    className="shrink-0 text-[10px] text-blue-400"
                    onClick={(e) => onSuggestClick(c.id, e)}
                  >
                    i
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

function QualSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (q: string) => void;
}) {
  const isPreset = (QUAL_OPTIONS as readonly string[]).includes(value);
  return (
    <div className="flex flex-col gap-0.5">
      <select
        className="w-full rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[11px]"
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
          className="w-full rounded border border-gray-600 bg-gray-900 px-1 py-0.5 text-[10px]"
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
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100"
      >
        Add category
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-56 rounded-md border border-gray-700 bg-gray-900 p-2 shadow-lg">
          <select
            className="mb-2 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs"
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
              className="flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs"
              placeholder="Custom name"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button
              type="button"
              className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
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
