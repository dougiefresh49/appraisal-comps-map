import { describe, expect, it } from "vitest";
import {
  applyBulkImportFromRecords,
  parseBulkImportJson,
  parsePercentCell,
} from "~/lib/adjustment-grid-bulk-import";
import type {
  AdjustmentCategoryState,
  AdjustmentGridState,
  GridConfig,
} from "~/types/adjustment-grid";

function emptyCfg(): GridConfig {
  return {
    exclude_extremes: false,
    round_up: false,
    disable_rounding: false,
    round_final_value: false,
    round_to_5k: false,
    include_median: false,
    percent_inc_per_month: 0,
    report_effective_date: "2026-01-01",
  };
}

function cat(
  name: string,
  compIds: string[],
): AdjustmentCategoryState {
  const comp_values: AdjustmentCategoryState["comp_values"] = {};
  for (const id of compIds) {
    comp_values[id] = { qualitative: "Similar", percentage: 0 };
  }
  return {
    name,
    sort_order: 0,
    comp_values,
    subject_value: "",
  };
}

function minimalLandState(): AdjustmentGridState {
  const compIds = ["a", "b", "c", "d", "e", "f"];
  return {
    transaction_categories: [],
    property_categories: [
      cat("Location", compIds),
      cat("Surface", compIds),
      cat("Utilities", compIds),
      cat("Frontage", compIds),
    ],
    comps: compIds.map((id, i) => ({
      id,
      number: i + 1,
      address: "",
      date_of_sale: "",
      base_price_per_unit: 0,
      size: 0,
    })),
    subject_size: 0,
    price_unit: "$/SF",
    config: emptyCfg(),
    source: "manual",
  };
}

describe("parsePercentCell", () => {
  it("parses percent strings", () => {
    expect(parsePercentCell("15%")).toBe(0.15);
    expect(parsePercentCell("-25%")).toBe(-0.25);
    expect(parsePercentCell("0%")).toBe(0);
  });
  it("accepts decimals in (-1,1)", () => {
    expect(parsePercentCell(0.15)).toBe(0.15);
    expect(parsePercentCell("0.1")).toBe(0.1);
  });
});

describe("parseBulkImportJson + applyBulkImportFromRecords", () => {
  const sample = `[
  {
    "#": 1,
    "Location": "Inferior",
    "Location adj": "15%",
    "Surface": "Similar",
    "Surface adj": "0%",
    "Utilities": "Inferior",
    "Utilities adj": "25%",
    "Frontage": "Inferior",
    "Frontage adj": "0%"
  },
  {
    "#": 3,
    "Location": "Superior",
    "Location adj": "-25%"
  }
]`;

  it("parses array and applies to comp columns by number", () => {
    const parsed = parseBulkImportJson(sample);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const state = minimalLandState();
    const { nextState, warnings, appliedCells } = applyBulkImportFromRecords(
      parsed.rows,
      state,
    );
    expect(warnings).toEqual([]);
    expect(appliedCells).toBeGreaterThan(0);
    expect(nextState.source).toBe("mixed");

    const loc = nextState.property_categories.find((c) => c.name === "Location");
    expect(loc).toBeDefined();
    const comp1 = nextState.comps.find((c) => c.number === 1);
    const comp3 = nextState.comps.find((c) => c.number === 3);
    expect(comp1).toBeDefined();
    expect(comp3).toBeDefined();
    expect(loc!.comp_values[comp1!.id]!.qualitative).toBe("Inferior");
    expect(loc!.comp_values[comp1!.id]!.percentage).toBeCloseTo(0.15);
    expect(loc!.comp_values[comp3!.id]!.qualitative).toBe("Superior");
    expect(loc!.comp_values[comp3!.id]!.percentage).toBeCloseTo(-0.25);

    const surf = nextState.property_categories.find((c) => c.name === "Surface");
    expect(surf!.comp_values[comp3!.id]!.qualitative).toBe("Similar");
    expect(surf!.comp_values[comp3!.id]!.percentage).toBe(0);
  });

  it("warns on unknown comp number", () => {
    const state = minimalLandState();
    const parsed = parseBulkImportJson(`[{"#": 99, "Location": "Inferior"}]`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const { warnings } = applyBulkImportFromRecords(parsed.rows, state);
    expect(warnings.some((w) => w.includes("99"))).toBe(true);
  });

  it("warns on unknown category", () => {
    const state = minimalLandState();
    const parsed = parseBulkImportJson(
      `[{"#": 1, "NotARealCategory": "x"}]`,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const { warnings } = applyBulkImportFromRecords(parsed.rows, state);
    expect(warnings.some((w) => w.includes("NotARealCategory"))).toBe(true);
  });
});
