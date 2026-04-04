import "server-only";

import { analyzeAdjustmentPatterns } from "~/lib/adjustment-patterns";
import type { ExtractedAdjustmentGrid } from "~/lib/report-md-parser";
import { getAdjustmentPatterns } from "~/lib/knowledge-retrieval";
import {
  findSimilarProjects,
  getSimilarProjectContext,
  type ProjectContext,
} from "~/lib/similar-projects";
import { createClient } from "~/utils/supabase/server";

const TAG = "[suggestions]";

export const SUGGESTION_CATEGORY_KEYS = [
  "adjustment_categories",
  "comp_recommendations",
  "summary_columns",
  "section_topics",
  "cost_approach",
] as const;

export type SuggestionCategoryKey = (typeof SUGGESTION_CATEGORY_KEYS)[number];

export interface Suggestion {
  text: string;
  confidence: "high" | "medium" | "low";
  source: string;
  details?: string;
}

export interface SuggestionCategory {
  category: string;
  title: string;
  suggestions: Suggestion[];
}

export interface ProjectSuggestions {
  projectId: string;
  projectName: string;
  similarProjectCount: number;
  categories: SuggestionCategory[];
  generatedAt: string;
}

export function buildConfidence(count: number, total: number): "high" | "medium" | "low" {
  if (total === 0) {
    return "low";
  }
  const ratio = count / total;
  if (ratio >= 0.6) {
    return "high";
  }
  if (ratio >= 0.4) {
    return "medium";
  }
  return "low";
}

function isAdjustmentGrid(v: unknown): v is ExtractedAdjustmentGrid {
  if (!v || typeof v !== "object") {
    return false;
  }
  const g = v as ExtractedAdjustmentGrid;
  return Array.isArray(g.rows);
}

function narrowCostApproach(v: unknown): {
  land_value: number | null;
  depreciation_percentage: number | null;
} | null {
  if (!v || typeof v !== "object") {
    return null;
  }
  const r = v as Record<string, unknown>;
  const lv = r.land_value;
  const dp = r.depreciation_percentage;
  return {
    land_value: typeof lv === "number" ? lv : null,
    depreciation_percentage: typeof dp === "number" ? dp : null,
  };
}

function narrowReconciliation(v: unknown): {
  final_reconciled_value: number | null;
  primary_approach: string | null;
} | null {
  if (!v || typeof v !== "object") {
    return null;
  }
  const r = v as Record<string, unknown>;
  const fv = r.final_reconciled_value;
  const pa = r.primary_approach;
  return {
    final_reconciled_value: typeof fv === "number" ? fv : null,
    primary_approach: typeof pa === "string" ? pa : null,
  };
}

function contextToPatternRow(
  projectId: string,
  ctx: ProjectContext,
): {
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
  property_type?: string | null;
} {
  const ex = ctx.extractedData;
  return {
    project_id: projectId,
    source_filename: null,
    land_adjustments:
      ex?.landAdjustments != null && isAdjustmentGrid(ex.landAdjustments)
        ? ex.landAdjustments
        : null,
    sale_adjustments:
      ex?.saleAdjustments != null && isAdjustmentGrid(ex.saleAdjustments)
        ? ex.saleAdjustments
        : null,
    rental_adjustments:
      ex?.rentalAdjustments != null && isAdjustmentGrid(ex.rentalAdjustments)
        ? ex.rentalAdjustments
        : null,
    cost_approach:
      ex?.costApproach != null ? narrowCostApproach(ex.costApproach) : null,
    reconciliation:
      ex?.reconciliation != null
        ? narrowReconciliation(ex.reconciliation)
        : null,
    property_type: ctx.project.propertyType,
  };
}

function formatPctSigned(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n}%`;
}

function formatTypicalRange(min: number, max: number, median: number): string {
  if (min === max) {
    return formatPctSigned(min);
  }
  return `${formatPctSigned(min)} to ${formatPctSigned(max)} (median ${formatPctSigned(median)})`;
}

function approachLabel(approach: "land" | "sales" | "rental"): string {
  if (approach === "land") {
    return "Land";
  }
  if (approach === "sales") {
    return "Sales";
  }
  return "Rental";
}

export function buildAdjustmentCategorySuggestions(input: {
  patternRows: ReturnType<typeof contextToPatternRow>[];
  knowledgePatternTexts: string[];
}): Suggestion[] {
  const { patternRows, knowledgePatternTexts } = input;
  const suggestions: Suggestion[] = [];
  const total = patternRows.length;
  if (total === 0) {
    return suggestions;
  }

  const patterns = analyzeAdjustmentPatterns(patternRows);
  const combined = [
    ...patterns.land_patterns.map((p) => ({ ...p, approach: "land" as const })),
    ...patterns.sale_patterns.map((p) => ({ ...p, approach: "sales" as const })),
    ...patterns.rental_patterns.map((p) => ({
      ...p,
      approach: "rental" as const,
    })),
  ].sort((a, b) => b.occurrences - a.occurrences || a.category.localeCompare(b.category));

  for (const p of combined) {
    if (p.occurrences < 2) {
      continue;
    }
    const tr = p.typical_range;
    const confidence = buildConfidence(p.occurrences, total);
    const label = approachLabel(p.approach);
    suggestions.push({
      text: `${label} — ${p.category} adjustment (appeared in ${p.occurrences}/${total} similar reports, typically ${formatTypicalRange(tr.min, tr.max, tr.median)})`,
      confidence,
      source: `Based on ${total} similar reports with extracted data`,
      details:
        p.example_rationales.length > 0
          ? `Example rationales: ${p.example_rationales.join("; ")}`
          : undefined,
    });
  }

  if (knowledgePatternTexts.length > 0) {
    suggestions.push({
      text: `Knowledge base holds ${knowledgePatternTexts.length} cross-report adjustment pattern summaries — use them together with the similar-project signals above.`,
      confidence: "medium",
      source: "Adjustment pattern knowledge entries",
      details: knowledgePatternTexts.join("\n\n---\n\n").slice(0, 4000),
    });
  }

  return suggestions;
}

export function buildCompRecommendationSuggestions(input: {
  contexts: ProjectContext[];
  totalSimilar: number;
}): Suggestion[] {
  const { contexts, totalSimilar } = input;
  if (contexts.length === 0) {
    return [];
  }

  const n = contexts.length;
  const source = `Based on ${n} similar reports with extracted data`;
  const out: Suggestion[] = [];

  const landNs = contexts.map((c) => (c.extractedData?.landComps ?? []).length);
  const saleNs = contexts.map((c) => (c.extractedData?.saleComps ?? []).length);
  const rentNs = contexts.map((c) => (c.extractedData?.rentalComps ?? []).length);

  const pushIfAny = (counts: number[], compType: string) => {
    if (!counts.some((x) => x > 0)) {
      return;
    }
    const minC = Math.min(...counts);
    const maxC = Math.max(...counts);
    const avg = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length);
    const lo = Math.max(0, minC);
    const hi = Math.max(lo, maxC);
    const padLo = Math.max(0, lo - 1);
    const padHi = hi + 1;
    out.push({
      text: `Consider ${padLo}-${padHi} ${compType} comps (similar reports used ${minC}-${maxC} on average, mean ${avg})`,
      confidence: buildConfidence(counts.filter((c) => c > 0).length, n),
      source,
    });
  };

  pushIfAny(landNs, "land");
  pushIfAny(saleNs, "sales");
  pushIfAny(rentNs, "rental");

  if (out.length === 0 && totalSimilar > 0) {
    out.push({
      text: "Similar reports did not include comp counts in extracted data yet — run structured extraction on past reports to unlock comp-count suggestions.",
      confidence: "low",
      source: `Based on ${totalSimilar} similar projects (no comp arrays found)`,
    });
  }

  return out;
}

type ApproachKind = "land" | "sales" | "rental";

export function buildSummaryColumnSuggestions(input: {
  contexts: ProjectContext[];
}): Suggestion[] {
  const { contexts } = input;
  const total = contexts.length;
  if (total === 0) {
    return [];
  }

  const freq = new Map<
    string,
    { land: number; sales: number; rental: number }
  >();

  const bump = (category: string, approach: ApproachKind) => {
    const k = category.trim();
    if (!k) {
      return;
    }
    const cur = freq.get(k) ?? { land: 0, sales: 0, rental: 0 };
    cur[approach] += 1;
    freq.set(k, cur);
  };

  for (const ctx of contexts) {
    const ex = ctx.extractedData;
    if (!ex) {
      continue;
    }
    const grids: { approach: ApproachKind; grid: unknown }[] = [
      { approach: "land", grid: ex.landAdjustments },
      { approach: "sales", grid: ex.saleAdjustments },
      { approach: "rental", grid: ex.rentalAdjustments },
    ];
    for (const { approach, grid } of grids) {
      if (!isAdjustmentGrid(grid)) {
        continue;
      }
      const seen = new Set<string>();
      for (const row of grid.rows) {
        const cat = row.category.trim();
        if (!cat || seen.has(cat)) {
          continue;
        }
        seen.add(cat);
        bump(cat, approach);
      }
    }
  }

  const suggestions: Suggestion[] = [];
  const approachSummary = (a: ApproachKind): string => {
    if (a === "land") {
      return "land comp summary";
    }
    if (a === "sales") {
      return "sales comp summary";
    }
    return "rental comp summary";
  };

  for (const [category, counts] of freq) {
    const entries: { approach: ApproachKind; c: number }[] = [
      { approach: "land", c: counts.land },
      { approach: "sales", c: counts.sales },
      { approach: "rental", c: counts.rental },
    ];
    const best = entries.reduce((m, e) => (e.c > m.c ? e : m));
    if (best.c < 2) {
      continue;
    }
    const ptHint =
      contexts
        .map((c) => c.project.propertyType)
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .slice(0, 1)[0] ?? "similar";
    suggestions.push({
      text: `Include “${category}” in ${approachSummary(best.approach)} (used in ${best.c}/${total} similar ${ptHint} reports)`,
      confidence: buildConfidence(best.c, total),
      source: `Based on ${total} similar reports with adjustment grids`,
    });
  }

  return suggestions
    .sort((a, b) => {
      const ma = /used in (\d+)\//.exec(a.text);
      const mb = /used in (\d+)\//.exec(b.text);
      const na = ma ? Number.parseInt(ma[1] ?? "0", 10) : 0;
      const nb = mb ? Number.parseInt(mb[1] ?? "0", 10) : 0;
      return nb - na;
    })
    .slice(0, 12);
}

function prettySectionKey(sectionKey: string): string {
  return sectionKey
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function excerptHint(content: string, maxChars = 500): string {
  const flat = content
    .trim()
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .slice(0, maxChars)
    .trim();
  const dot = flat.indexOf(". ");
  if (dot > 48 && dot < 220) {
    return `${flat.slice(0, dot + 1).trim()}...`;
  }
  if (flat.length > 180) {
    return `${flat.slice(0, 177).trim()}...`;
  }
  return flat;
}

export function buildSectionTopicSuggestions(input: {
  contexts: ProjectContext[];
  currentCity: string | null;
  currentCounty: string | null;
}): Suggestion[] {
  const { contexts, currentCity, currentCounty } = input;
  const byKey = new Map<
    string,
    { count: number; sample: string }
  >();

  for (const ctx of contexts) {
    for (const sec of ctx.reportSections) {
      const content = sec.content?.trim() ?? "";
      if (content.length < 40) {
        continue;
      }
      const prev = byKey.get(sec.sectionKey);
      const hint = excerptHint(content);
      if (!prev) {
        byKey.set(sec.sectionKey, { count: 1, sample: hint });
      } else {
        byKey.set(sec.sectionKey, {
          count: prev.count + 1,
          sample: prev.sample || hint,
        });
      }
    }
  }

  const suggestions: Suggestion[] = [];
  const loc =
    currentCity && currentCounty
      ? `${currentCity} (${currentCounty} County)`
      : currentCity ?? currentCounty ?? "regional";

  for (const [key, { count, sample }] of byKey) {
    if (count < 1 || !sample) {
      continue;
    }
    const conf = buildConfidence(count, contexts.length);
    suggestions.push({
      text: `${prettySectionKey(key)}: similar ${loc} reports often cover themes like — ${sample}`,
      confidence: conf,
      source: `Based on ${count} similar report(s) with ${prettySectionKey(key)} content`,
    });
  }

  return suggestions.slice(0, 10);
}

export function buildCostApproachSuggestions(input: {
  patternRows: ReturnType<typeof contextToPatternRow>[];
}): Suggestion[] {
  const { patternRows } = input;
  const deps: number[] = [];
  const lands: number[] = [];
  for (const row of patternRows) {
    const ca = row.cost_approach;
    if (ca?.depreciation_percentage != null) {
      deps.push(ca.depreciation_percentage);
    }
    if (ca?.land_value != null) {
      lands.push(ca.land_value);
    }
  }
  if (deps.length === 0 && lands.length === 0) {
    return [];
  }

  const fmtMoney = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const parts: string[] = [];
  if (deps.length > 0) {
    const minD = Math.min(...deps);
    const maxD = Math.max(...deps);
    const avg =
      Math.round((deps.reduce((a, b) => a + b, 0) / deps.length) * 10) / 10;
    parts.push(
      `Typical depreciation for similar properties: ${minD}-${maxD}% (from ${deps.length} reports, average ${avg}%)`,
    );
  }
  let details: string | undefined;
  if (lands.length > 0) {
    const minL = Math.min(...lands);
    const maxL = Math.max(...lands);
    details = `Land values ranged ${fmtMoney(minL)}–${fmtMoney(maxL)} across ${lands.length} reports.`;
  }

  const text = parts[0] ?? "Cost approach signals from similar reports";
  return [
    {
      text,
      confidence: buildConfidence(deps.length || lands.length, patternRows.length),
      source: `Based on cost approach data from ${Math.max(deps.length, lands.length)} similar reports`,
      details,
    },
  ];
}

export async function generateSuggestions(
  projectId: string,
  categoryFilter?: SuggestionCategoryKey,
): Promise<ProjectSuggestions> {
  const supabase = await createClient();
  const projectRes = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();

  if (projectRes.error) {
    console.error(TAG, "project:", projectRes.error.message);
  }

  const subjectRes = await supabase
    .from("subject_data")
    .select("core")
    .eq("project_id", projectId)
    .maybeSingle();

  if (subjectRes.error) {
    console.error(TAG, "subject:", subjectRes.error.message);
  }

  const core = (subjectRes.data?.core ?? {}) as Record<string, unknown>;
  const currentCity =
    typeof core.City === "string" ? core.City.trim() || null : null;
  const currentCounty =
    typeof core.County === "string" ? core.County.trim() || null : null;

  const similar = await findSimilarProjects(projectId, { limit: 5 });
  const withData = similar.filter((s) => s.hasExtractedData);

  const contexts: ProjectContext[] = await Promise.all(
    withData.map((s) => getSimilarProjectContext(projectId, s.projectId)),
  );

  const patternRows = contexts.map((ctx, i) =>
    contextToPatternRow(withData[i]?.projectId ?? "", ctx),
  );

  let knowledgePatternTexts: string[] = [];
  try {
    knowledgePatternTexts = await getAdjustmentPatterns();
  } catch (err) {
    console.error(
      TAG,
      "getAdjustmentPatterns:",
      err instanceof Error ? err.message : err,
    );
  }

  const allCategories: SuggestionCategory[] = [
    {
      category: "adjustment_categories",
      title: "Suggested Adjustment Categories",
      suggestions: buildAdjustmentCategorySuggestions({
        patternRows,
        knowledgePatternTexts,
      }),
    },
    {
      category: "comp_recommendations",
      title: "Comp Count Recommendations",
      suggestions: buildCompRecommendationSuggestions({
        contexts,
        totalSimilar: similar.length,
      }),
    },
    {
      category: "summary_columns",
      title: "Summary Table Columns",
      suggestions: buildSummaryColumnSuggestions({ contexts }),
    },
    {
      category: "section_topics",
      title: "Section Topics",
      suggestions: buildSectionTopicSuggestions({
        contexts,
        currentCity,
        currentCounty,
      }),
    },
    {
      category: "cost_approach",
      title: "Cost Approach Parameters",
      suggestions: buildCostApproachSuggestions({ patternRows }),
    },
  ];

  const categories =
    categoryFilter != null
      ? allCategories.filter((c) => c.category === categoryFilter)
      : allCategories;

  const projNameRaw =
    projectRes.data && typeof projectRes.data === "object"
      ? (projectRes.data as Record<string, unknown>).name
      : undefined;

  return {
    projectId,
    projectName: typeof projNameRaw === "string" ? projNameRaw : "",
    similarProjectCount: similar.length,
    categories,
    generatedAt: new Date().toISOString(),
  };
}
