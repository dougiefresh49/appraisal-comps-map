import "server-only";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "~/utils/supabase/server";
import { generateEmbedding } from "~/lib/embeddings";
import {
  analyzeAdjustmentPatterns,
  formatPatternSummaryText,
} from "~/lib/adjustment-patterns";
import type { ExtractedAdjustmentGrid } from "~/lib/report-md-parser";

const TAG = "[extract-patterns]";

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
}

/** Supabase row for the joined query — avoids `any` on `row.*` when mapping. */
interface ReportExtractedDataQueryRow {
  project_id: string | null;
  source_filename: string | null;
  land_adjustments: unknown;
  sale_adjustments: unknown;
  rental_adjustments: unknown;
  cost_approach: unknown;
  reconciliation: unknown;
  projects:
    | { property_type?: string | null }
    | { property_type?: string | null }[]
    | null;
}

async function fetchExtractedRows(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<
  (ReportExtractedRow & { property_type: string | null })[]
> {
  const { data, error } = await supabase
    .from("report_extracted_data")
    .select(
      `project_id, source_filename, land_adjustments, sale_adjustments, rental_adjustments, cost_approach, reconciliation,
       projects!report_extracted_data_project_id_fkey(property_type)`,
    );

  if (error) {
    throw new Error(`Failed to query report_extracted_data: ${error.message}`);
  }

  return ((data ?? []) as ReportExtractedDataQueryRow[]).map((row) => {
    const proj = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    return {
      project_id: row.project_id ?? null,
      source_filename: row.source_filename ?? null,
      land_adjustments: row.land_adjustments as ExtractedAdjustmentGrid | null,
      sale_adjustments: row.sale_adjustments as ExtractedAdjustmentGrid | null,
      rental_adjustments: row.rental_adjustments as ExtractedAdjustmentGrid | null,
      cost_approach: row.cost_approach as ReportExtractedRow["cost_approach"],
      reconciliation: row.reconciliation as ReportExtractedRow["reconciliation"],
      property_type: (proj as { property_type?: string | null } | null)?.property_type ?? null,
    };
  });
}

/** GET /api/seed/extract-patterns — view patterns without storing */
export async function GET() {
  try {
    const supabase =
      process.env.NODE_ENV === "development"
        ? createServiceClient()
        : await createClient();

    const rows = await fetchExtractedRows(supabase);

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "No report_extracted_data rows found. Run the backfill first: POST /api/seed/import-old-reports with force:true",
        },
        { status: 404 },
      );
    }

    console.log(TAG, `Analyzing ${rows.length} extracted report rows`);
    const patterns = analyzeAdjustmentPatterns(rows);

    return NextResponse.json(patterns);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(TAG, "GET failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/seed/extract-patterns — analyze and store patterns in knowledge_base */
export async function POST() {
  try {
    const supabase =
      process.env.NODE_ENV === "development"
        ? createServiceClient()
        : await createClient();

    const rows = await fetchExtractedRows(supabase);

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "No report_extracted_data rows found. Run the backfill first: POST /api/seed/import-old-reports with force:true",
        },
        { status: 404 },
      );
    }

    console.log(TAG, `Analyzing ${rows.length} extracted report rows`);
    const patterns = analyzeAdjustmentPatterns(rows);

    const entriesToStore: { gem_name: string; content: string }[] = [
      {
        gem_name: "Land Adjustment Patterns",
        content: formatPatternSummaryText(
          "land sale",
          patterns.land_patterns,
          patterns.total_reports_analyzed,
        ),
      },
      {
        gem_name: "Sales Adjustment Patterns",
        content: formatPatternSummaryText(
          "improved sales",
          patterns.sale_patterns,
          patterns.total_reports_analyzed,
        ),
      },
      {
        gem_name: "Rental Adjustment Patterns",
        content: formatPatternSummaryText(
          "rental",
          patterns.rental_patterns,
          patterns.total_reports_analyzed,
        ),
      },
      {
        gem_name: "Cost Approach Patterns",
        content: buildCostPatternText(patterns, rows.length),
      },
      {
        gem_name: "Reconciliation Patterns",
        content: buildReconciliationPatternText(patterns, rows.length),
      },
    ];

    const stored: string[] = [];
    const errors: string[] = [];

    for (const entry of entriesToStore) {
      // Delete existing pattern entries for this gem_name so they stay fresh
      await supabase
        .from("knowledge_base")
        .delete()
        .eq("gem_name", entry.gem_name)
        .eq("content_type", "knowledge");

      const insertPayload: Record<string, unknown> = {
        gem_name: entry.gem_name,
        content_type: "knowledge",
        input: null,
        output: entry.content,
      };

      try {
        const embedding = await generateEmbedding(entry.content);
        insertPayload.embedding = JSON.stringify(embedding);
      } catch (embErr) {
        console.warn(
          TAG,
          `  Embedding failed for "${entry.gem_name}":`,
          embErr instanceof Error ? embErr.message : embErr,
        );
      }

      const { error: insErr } = await supabase
        .from("knowledge_base")
        .insert(insertPayload);

      if (insErr) {
        console.error(TAG, `  Insert "${entry.gem_name}" failed:`, insErr.message);
        errors.push(`${entry.gem_name}: ${insErr.message}`);
      } else {
        stored.push(entry.gem_name);
        console.log(TAG, `  Stored "${entry.gem_name}" (${entry.content.length} chars)`);
      }
    }

    return NextResponse.json({
      message: `Stored ${stored.length} pattern entries in knowledge_base`,
      stored,
      errors: errors.length > 0 ? errors : undefined,
      patterns_summary: {
        total_reports: patterns.total_reports_analyzed,
        land_categories: patterns.land_patterns.length,
        sale_categories: patterns.sale_patterns.length,
        rental_categories: patterns.rental_patterns.length,
        common_categories: patterns.common_adjustment_categories,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(TAG, "POST failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function buildCostPatternText(
  patterns: Awaited<ReturnType<typeof analyzeAdjustmentPatterns>>,
  reportCount: number,
): string {
  const c = patterns.cost_approach_summary;
  const lines: string[] = [
    `Cost approach patterns from ${reportCount} past appraisal reports:`,
    `- Reports with cost approach data: ${c.reports_with_cost}`,
  ];

  if (c.avg_depreciation_pct !== null) {
    lines.push(`- Average total depreciation: ${c.avg_depreciation_pct}%`);
  }
  if (c.land_value_range !== null) {
    lines.push(
      `- Land value range seen: $${c.land_value_range.min.toLocaleString()} – $${c.land_value_range.max.toLocaleString()}`,
    );
  }

  return lines.join("\n");
}

function buildReconciliationPatternText(
  patterns: Awaited<ReturnType<typeof analyzeAdjustmentPatterns>>,
  reportCount: number,
): string {
  const r = patterns.reconciliation_summary;
  const lines: string[] = [
    `Reconciliation patterns from ${reportCount} past appraisal reports:`,
  ];

  const sorted = Object.entries(r.primary_approach_counts).sort(
    ([, a], [, b]) => b - a,
  );
  if (sorted.length > 0) {
    lines.push("Primary approach used:");
    for (const [approach, count] of sorted) {
      lines.push(`- ${approach}: ${count} report(s)`);
    }
  }

  if (r.avg_final_value !== null) {
    lines.push(
      `- Average final reconciled value: $${r.avg_final_value.toLocaleString()}`,
    );
  }

  return lines.join("\n");
}
