import "server-only";

import type { AdjustmentRow, ExtractedAdjustmentGrid } from "~/lib/report-md-parser";

export interface AdjustmentPatternSummary {
  approach: "land" | "sales" | "rental";
  category: string;
  occurrences: number;
  typical_range: {
    min: number;
    max: number;
    median: number;
    mean: number;
  };
  by_property_type: Record<
    string,
    { count: number; min: number; max: number; median: number }
  >;
  example_rationales: string[];
}

export interface CrossReportPatterns {
  total_reports_analyzed: number;
  reports_with_land_adjustments: number;
  reports_with_sale_adjustments: number;
  reports_with_rental_adjustments: number;
  land_patterns: AdjustmentPatternSummary[];
  sale_patterns: AdjustmentPatternSummary[];
  rental_patterns: AdjustmentPatternSummary[];
  common_adjustment_categories: string[];
  cost_approach_summary: {
    reports_with_cost: number;
    avg_depreciation_pct: number | null;
    land_value_range: { min: number; max: number } | null;
  };
  reconciliation_summary: {
    primary_approach_counts: Record<string, number>;
    avg_final_value: number | null;
  };
}

interface ReportExtractedRow {
  project_id: string | null;
  source_filename: string | null;
  land_adjustments: ExtractedAdjustmentGrid | null;
  sale_adjustments: ExtractedAdjustmentGrid | null;
  rental_adjustments: ExtractedAdjustmentGrid | null;
  cost_approach: {
    land_value: number | null;
    depreciation_percentage: number | null;
  } | null;
  reconciliation: {
    final_reconciled_value: number | null;
    primary_approach: string | null;
  } | null;
  // project join for property_type
  property_type?: string | null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Collect all non-null percentage values from an adjustment row across all comps.
 */
function collectPercentages(row: AdjustmentRow): number[] {
  return row.comp_adjustments
    .map((ca) => ca.percentage)
    .filter((p): p is number => p !== null);
}

/**
 * Aggregate adjustment rows from many grids into per-category pattern summaries.
 */
function aggregateAdjustmentPatterns(
  grids: { grid: ExtractedAdjustmentGrid; propertyType: string | null }[],
  approach: "land" | "sales" | "rental",
): AdjustmentPatternSummary[] {
  // Map: category -> { allValues, byPropertyType, rationales, occurrences (# of grids containing it) }
  const categoryMap = new Map<
    string,
    {
      allValues: number[];
      byPropertyType: Map<string, number[]>;
      rationales: Set<string>;
      occurrences: number;
    }
  >();

  for (const { grid, propertyType } of grids) {
    // Track which categories appeared in this grid (one per grid = one occurrence)
    const seenInThisGrid = new Set<string>();

    for (const row of grid.rows) {
      const cat = row.category.trim();
      if (!cat) continue;

      const percentages = collectPercentages(row);
      if (percentages.length === 0) continue;

      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, {
          allValues: [],
          byPropertyType: new Map(),
          rationales: new Set(),
          occurrences: 0,
        });
      }

      const entry = categoryMap.get(cat)!;
      entry.allValues.push(...percentages);

      if (!seenInThisGrid.has(cat)) {
        entry.occurrences++;
        seenInThisGrid.add(cat);
      }

      if (propertyType) {
        const pt = propertyType.trim();
        if (!entry.byPropertyType.has(pt)) {
          entry.byPropertyType.set(pt, []);
        }
        entry.byPropertyType.get(pt)!.push(...percentages);
      }

      for (const ca of row.comp_adjustments) {
        if (ca.rationale?.trim()) {
          entry.rationales.add(ca.rationale.trim());
        }
      }
    }
  }

  const patterns: AdjustmentPatternSummary[] = [];

  for (const [category, entry] of categoryMap) {
    const vals = entry.allValues;
    if (vals.length === 0) continue;

    const byPropertyType: AdjustmentPatternSummary["by_property_type"] = {};
    for (const [pt, ptVals] of entry.byPropertyType) {
      if (ptVals.length === 0) continue;
      byPropertyType[pt] = {
        count: ptVals.length,
        min: Math.min(...ptVals),
        max: Math.max(...ptVals),
        median: median(ptVals),
      };
    }

    const rationales = [...entry.rationales].slice(0, 3);

    patterns.push({
      approach,
      category,
      occurrences: entry.occurrences,
      typical_range: {
        min: Math.min(...vals),
        max: Math.max(...vals),
        median: median(vals),
        mean: Math.round(mean(vals) * 10) / 10,
      },
      by_property_type: byPropertyType,
      example_rationales: rationales,
    });
  }

  // Sort by occurrences desc, then category alpha
  return patterns.sort(
    (a, b) => b.occurrences - a.occurrences || a.category.localeCompare(b.category),
  );
}

/**
 * Analyze report_extracted_data rows and produce cross-report adjustment patterns.
 */
export function analyzeAdjustmentPatterns(
  rows: ReportExtractedRow[],
): CrossReportPatterns {
  const landGrids: { grid: ExtractedAdjustmentGrid; propertyType: string | null }[] = [];
  const saleGrids: { grid: ExtractedAdjustmentGrid; propertyType: string | null }[] = [];
  const rentalGrids: { grid: ExtractedAdjustmentGrid; propertyType: string | null }[] = [];

  const depreciationValues: number[] = [];
  const landValues: number[] = [];
  const finalValues: number[] = [];
  const primaryApproachCounts: Record<string, number> = {};

  for (const row of rows) {
    const pt = row.property_type ?? null;

    if (row.land_adjustments?.rows.length) {
      landGrids.push({ grid: row.land_adjustments, propertyType: pt });
    }
    if (row.sale_adjustments?.rows.length) {
      saleGrids.push({ grid: row.sale_adjustments, propertyType: pt });
    }
    if (row.rental_adjustments?.rows.length) {
      rentalGrids.push({ grid: row.rental_adjustments, propertyType: pt });
    }

    if (row.cost_approach) {
      if (row.cost_approach.depreciation_percentage !== null) {
        depreciationValues.push(row.cost_approach.depreciation_percentage);
      }
      if (row.cost_approach.land_value !== null) {
        landValues.push(row.cost_approach.land_value);
      }
    }

    if (row.reconciliation) {
      if (row.reconciliation.final_reconciled_value !== null) {
        finalValues.push(row.reconciliation.final_reconciled_value);
      }
      if (row.reconciliation.primary_approach) {
        const pa = row.reconciliation.primary_approach;
        primaryApproachCounts[pa] = (primaryApproachCounts[pa] ?? 0) + 1;
      }
    }
  }

  const landPatterns = aggregateAdjustmentPatterns(landGrids, "land");
  const salePatterns = aggregateAdjustmentPatterns(saleGrids, "sales");
  const rentalPatterns = aggregateAdjustmentPatterns(rentalGrids, "rental");

  const totalReports = rows.length;
  const commonThreshold = Math.ceil(totalReports * 0.5);

  const allPatterns = [...landPatterns, ...salePatterns, ...rentalPatterns];
  const commonCategories = [
    ...new Set(
      allPatterns
        .filter((p) => p.occurrences >= commonThreshold)
        .map((p) => p.category),
    ),
  ].sort();

  return {
    total_reports_analyzed: totalReports,
    reports_with_land_adjustments: landGrids.length,
    reports_with_sale_adjustments: saleGrids.length,
    reports_with_rental_adjustments: rentalGrids.length,
    land_patterns: landPatterns,
    sale_patterns: salePatterns,
    rental_patterns: rentalPatterns,
    common_adjustment_categories: commonCategories,
    cost_approach_summary: {
      reports_with_cost: depreciationValues.length,
      avg_depreciation_pct:
        depreciationValues.length > 0
          ? Math.round(mean(depreciationValues) * 10) / 10
          : null,
      land_value_range:
        landValues.length > 0
          ? { min: Math.min(...landValues), max: Math.max(...landValues) }
          : null,
    },
    reconciliation_summary: {
      primary_approach_counts: primaryApproachCounts,
      avg_final_value:
        finalValues.length > 0
          ? Math.round(mean(finalValues))
          : null,
    },
  };
}

/**
 * Format an AdjustmentPatternSummary[] as a human-readable text block for knowledge_base storage.
 */
export function formatPatternSummaryText(
  approach: string,
  patterns: AdjustmentPatternSummary[],
  reportCount: number,
): string {
  if (patterns.length === 0) {
    return `No ${approach} adjustment patterns found across ${reportCount} past reports.`;
  }

  const lines: string[] = [
    `Common ${approach} adjustment categories (from ${reportCount} past reports):`,
  ];

  for (const p of patterns) {
    const r = p.typical_range;
    const sign = (n: number) => (n >= 0 ? `+${n}%` : `${n}%`);
    const rangeStr =
      r.min === r.max
        ? sign(r.min)
        : `${sign(r.min)} to ${sign(r.max)} (median ${sign(r.median)})`;

    lines.push(`- ${p.category}: typically ${rangeStr} (${p.occurrences}/${reportCount} reports)`);

    if (p.example_rationales.length > 0) {
      lines.push(`  Rationale examples: ${p.example_rationales.join("; ")}`);
    }
  }

  return lines.join("\n");
}
