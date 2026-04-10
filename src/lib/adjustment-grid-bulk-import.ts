import type {
  AdjustmentCellState,
  AdjustmentGridState,
} from "~/types/adjustment-grid";

const MC_NAME = "Market Conditions";
const ADJ_SUFFIX = /\s+adj$/i;

export type BulkImportCategoryRef = {
  section: "tx" | "prop";
  index: number;
};

/** Parse a cell like "15%", "-25%", "0%" or a decimal in (-1, 1). Returns null if empty/invalid. */
export function parsePercentCell(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return null;
    }
    if (raw >= -1 && raw <= 1) {
      return raw;
    }
    return raw / 100;
  }
  if (typeof raw !== "string") {
    return null;
  }
  const s = raw.trim();
  if (s === "") {
    return null;
  }
  if (/%\s*$/.test(s)) {
    const n = Number.parseFloat(s.replace(/%\s*$/, ""));
    return Number.isNaN(n) ? null : n / 100;
  }
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) {
    return null;
  }
  if (n >= -1 && n <= 1) {
    return n;
  }
  return n / 100;
}

function findCategory(
  state: AdjustmentGridState,
  categoryName: string,
): BulkImportCategoryRef | null {
  const tx = state.transaction_categories.findIndex((c) => c.name === categoryName);
  if (tx >= 0) {
    return { section: "tx", index: tx };
  }
  const prop = state.property_categories.findIndex((c) => c.name === categoryName);
  if (prop >= 0) {
    return { section: "prop", index: prop };
  }
  return null;
}

function patchCell(
  prev: AdjustmentCellState | undefined,
  qual: string | undefined,
  pct: number | undefined,
): AdjustmentCellState {
  const base: AdjustmentCellState = prev ?? {
    qualitative: "Similar",
    percentage: 0,
  };
  let next: AdjustmentCellState = { ...base };
  if (qual !== undefined) {
    next = { ...next, qualitative: qual, from_ai: false };
  }
  if (pct !== undefined) {
    next = { ...next, percentage: pct, from_ai: false };
  }
  return next;
}

export type NormalizedBulkRow = {
  compNumber: number;
  /** base category name -> optional qualitative and/or percentage */
  entries: Map<string, { qual?: string; pct?: number }>;
};

/**
 * Parse JSON text into normalized rows. Throws SyntaxError on invalid JSON.
 * Returns error string if top-level shape is wrong.
 */
export function parseBulkImportJson(text: string): {
  ok: true;
  rows: NormalizedBulkRow[];
  parseWarnings: string[];
} | {
  ok: false;
  error: string;
} {
  const parseWarnings: string[] = [];
  let warnedMc = false;

  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (trimmed === "") {
    return { ok: false, error: "JSON is empty." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON.";
    return { ok: false, error: msg };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "JSON must be an array of objects." };
  }

  const rows: NormalizedBulkRow[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const item: unknown = parsed[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return {
        ok: false,
        error: `Item at index ${i} must be an object.`,
      };
    }
    const rec = item as Record<string, unknown>;
    const rawNum = rec["#"];
    let compNumber: number;
    if (typeof rawNum === "number" && Number.isFinite(rawNum)) {
      compNumber = Math.trunc(rawNum);
    } else if (typeof rawNum === "string") {
      const n = Number.parseInt(rawNum.trim(), 10);
      if (Number.isNaN(n)) {
        return {
          ok: false,
          error: `Item at index ${i}: "#" must be a number or numeric string.`,
        };
      }
      compNumber = n;
    } else {
      return {
        ok: false,
        error: `Item at index ${i}: missing or invalid "#" (comp number).`,
      };
    }

    const entries = new Map<string, { qual?: string; pct?: number }>();

    for (const [key, val] of Object.entries(rec)) {
      if (key === "#") {
        continue;
      }
      const k = key.trim();
      const adjMatch = ADJ_SUFFIX.exec(k);
      if (adjMatch) {
        const baseName = k.slice(0, adjMatch.index).trim();
        if (baseName === "") {
          continue;
        }
        if (baseName === MC_NAME) {
          if (!warnedMc) {
            parseWarnings.push(
              `"${MC_NAME}" adjustment is derived in the grid; those keys were ignored.`,
            );
            warnedMc = true;
          }
          continue;
        }
        const pct = parsePercentCell(val);
        if (pct === null) {
          continue;
        }
        const cur = entries.get(baseName) ?? {};
        entries.set(baseName, { ...cur, pct });
      } else {
        if (k === MC_NAME) {
          if (!warnedMc) {
            parseWarnings.push(
              `"${MC_NAME}" adjustment is derived in the grid; those keys were ignored.`,
            );
            warnedMc = true;
          }
          continue;
        }
        if (val === null || val === undefined) {
          continue;
        }
        const s =
          typeof val === "string"
            ? val.trim()
            : typeof val === "number" && Number.isFinite(val)
              ? String(val)
              : null;
        if (s === null || s === "") {
          continue;
        }
        const cur = entries.get(k) ?? {};
        entries.set(k, { ...cur, qual: s });
      }
    }

    rows.push({ compNumber, entries });
  }

  return { ok: true, rows, parseWarnings };
}

export type BulkImportResult = {
  nextState: AdjustmentGridState;
  warnings: string[];
  appliedCells: number;
};

/**
 * Merge normalized rows into a copy of `state`. Unknown comp numbers and categories produce warnings.
 */
export function applyBulkImportFromRecords(
  rows: NormalizedBulkRow[],
  state: AdjustmentGridState,
): BulkImportResult {
  const nextState: AdjustmentGridState = structuredClone(state);
  nextState.source = "mixed";

  const warnings: string[] = [];
  let appliedCells = 0;

  const compByNumber = new Map<number, string>();
  for (const c of nextState.comps) {
    compByNumber.set(c.number, c.id);
  }

  const skippedMc = new Set<string>();

  for (const row of rows) {
    const compId = compByNumber.get(row.compNumber);
    if (!compId) {
      warnings.push(`No comp with number ${row.compNumber}.`);
      continue;
    }

    for (const [baseName, { qual, pct }] of row.entries) {
      if (baseName === MC_NAME) {
        if (!skippedMc.has("mc")) {
          warnings.push(
            `"${MC_NAME}" is derived from sale date and settings; skipped.`,
          );
          skippedMc.add("mc");
        }
        continue;
      }

      const ref = findCategory(nextState, baseName);
      if (!ref) {
        warnings.push(`Unknown category "${baseName}".`);
        continue;
      }

      const list =
        ref.section === "tx"
          ? nextState.transaction_categories
          : nextState.property_categories;
      const cat = list[ref.index];
      if (!cat) {
        continue;
      }

      const prevCell = cat.comp_values[compId];
      const hasQual = qual !== undefined;
      const hasPct = pct !== undefined;
      if (!hasQual && !hasPct) {
        continue;
      }

      cat.comp_values = { ...cat.comp_values };
      cat.comp_values[compId] = patchCell(prevCell, qual, pct);
      appliedCells += 1;
    }
  }

  return { nextState, warnings, appliedCells };
}
