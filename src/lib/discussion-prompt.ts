import "server-only";

import {
  getAdjustmentPatterns,
  getSimilarPastSections,
  type SectionKey,
} from "~/lib/knowledge-retrieval";
import { findSimilarProjects, getSimilarProjectContext } from "~/lib/similar-projects";
import { createClient } from "~/utils/supabase/server";

const LAND_ADJ_VARS =
  "Financing Terms & Market Conditions, Location, Land Size, Surface, Utilities, Frontage";

const SALES_ADJ_VARS =
  "Financing Terms & Market Conditions, Location, Age/Condition, Building Size, Office %, Land/Bld Ratio, Zoning";

const PAST_EXAMPLE_MAX = 3000;

function jsonRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function discussionSectionKey(compType: "land" | "sales"): SectionKey {
  return compType === "land"
    ? "discussion-of-land-sales"
    : "discussion-of-improved-sales";
}

function truncateBlock(label: string, text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) {
    return `### ${label}\n${t}`;
  }
  return `### ${label}\n${t.slice(0, maxLen)}\n...(truncated)`;
}

function excerptJson(value: unknown, maxLen: number): string {
  if (value === null || value === undefined) {
    return "(none)";
  }
  const s = JSON.stringify(value, null, 2);
  return s.length > maxLen ? `${s.slice(0, maxLen)}\n...(truncated)` : s;
}

const DISCUSSION_SYSTEM_PROMPT = `You are an experienced commercial real estate appraiser writing the "Discussion of [Land Sales / Improved Sales]" section of an appraisal report. Write in a professional but accessible tone.

Structure your output with bold markdown headings for each adjustment variable. The discussion should address ALL comparable sales for each variable — do NOT write per-comp paragraphs.

Format:
1. Opening paragraph: Brief overview of the comp pool, data limitations (Texas non-disclosure state), methodology for selecting comps
2. **Financing Terms & Market Conditions (Time)** — Discuss financing (usually cash/arms-length), then time adjustments using the market trend rate
3. **[Property Adjustment Variable]** — For each: discuss the subject's characteristic, then each comp's relative position (inferior/similar/superior), justify the adjustment percentage
4. Closing transition: "The following chart summarizes the above adjustments..."

Rules:
- Reference comp numbers as "Sale No. 1", "Sale No. 2", etc.
- When discussing adjustments, state the percentage and direction (e.g., "a positive adjustment of 15%", "a negative 25% adjustment")
- Be specific about WHY an adjustment is warranted (paired analysis, market data, etc.)
- For Market Conditions, mention the rate used (e.g., "6% per year or 0.5% per month")
- Match the writing style of the past report examples provided below`;

export async function buildDiscussionPrompt(
  projectId: string,
  compType: "land" | "sales",
  previousContent?: string,
  regenerationContext?: string,
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const supabase = await createClient();
  const sectionKey = discussionSectionKey(compType);
  const compTableType = compType === "land" ? "Land" : "Sales";
  const poolLabel = compType === "land" ? "Land Sales" : "Sales";

  const subjectRes = await supabase
    .from("subject_data")
    .select("core")
    .eq("project_id", projectId)
    .maybeSingle();

  if (subjectRes.error) {
    console.error("[discussion-prompt] subject_data:", subjectRes.error.message);
  }

  const subjectCore = jsonRecord(subjectRes.data?.core);

  const compsRes = await supabase
    .from("comparables")
    .select("id, address, number")
    .eq("project_id", projectId)
    .eq("type", compTableType)
    .order("number", { ascending: true });

  if (compsRes.error) {
    console.error("[discussion-prompt] comparables:", compsRes.error.message);
  }

  const compRows: { id: string; address: string; number: string | null }[] = [];
  const rawCompList = compsRes.data;
  if (Array.isArray(rawCompList)) {
    for (const row of rawCompList) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const r = row as Record<string, unknown>;
      if (typeof r.id !== "string") {
        continue;
      }
      compRows.push({
        id: r.id,
        address: typeof r.address === "string" ? r.address : "",
        number: typeof r.number === "string" ? r.number : null,
      });
    }
  }

  const compIds = compRows.map((c) => c.id);
  const parsedRes =
    compIds.length > 0
      ? await supabase
          .from("comp_parsed_data")
          .select("comp_id, raw_data")
          .eq("project_id", projectId)
          .in("comp_id", compIds)
      : ({ data: [] as { comp_id: string; raw_data: unknown }[], error: null } as const);

  if (parsedRes.error) {
    console.error("[discussion-prompt] comp_parsed_data:", parsedRes.error.message);
  }

  const rawByComp = new Map<string, Record<string, unknown>>();
  const rawParsed = parsedRes.data;
  if (Array.isArray(rawParsed)) {
    for (const row of rawParsed) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const r = row as Record<string, unknown>;
      if (typeof r.comp_id !== "string") {
        continue;
      }
      rawByComp.set(r.comp_id, jsonRecord(r.raw_data));
    }
  }

  const [similarPast, adjustmentPatternLines, similarProjects] = await Promise.all([
    getSimilarPastSections(sectionKey, projectId, 2),
    getAdjustmentPatterns(),
    findSimilarProjects(projectId, { limit: 3 }),
  ]);

  const withData = similarProjects.filter((s) => s.hasExtractedData);
  const similarContexts = await Promise.all(
    withData.map((s) => getSimilarProjectContext(projectId, s.projectId)),
  );

  const similarGridBlocks: string[] = [];
  for (const ctx of similarContexts) {
    const grid =
      compType === "land"
        ? ctx.extractedData?.landAdjustments
        : ctx.extractedData?.saleAdjustments;
    if (!grid) {
      continue;
    }
    similarGridBlocks.push(
      `## Similar project: ${ctx.project.name} (${ctx.project.city ?? "Unknown city"})\n` +
        `### Past report adjustment grid (${compType})\n` +
        `\`\`\`json\n${excerptJson(grid, 2500)}\n\`\`\``,
    );
  }

  const pastExampleBlocks: string[] = [];
  for (let i = 0; i < similarPast.length; i++) {
    const m = similarPast[i];
    if (!m?.content?.trim()) {
      continue;
    }
    const label = `Past example ${i + 1}${m.subjectAddress ? ` — ${m.subjectAddress}` : ""}`;
    pastExampleBlocks.push(truncateBlock(label, m.content, PAST_EXAMPLE_MAX));
  }

  const compBlocks: string[] = [];
  for (let i = 0; i < compRows.length; i++) {
    const c = compRows[i]!;
    const n =
      c.number != null && c.number.trim() !== ""
        ? Number.parseInt(c.number, 10)
        : i + 1;
    const displayNum = Number.isFinite(n) ? n : i + 1;
    const raw = rawByComp.get(c.id) ?? {};
    compBlocks.push(
      `### Comp #${displayNum} — ${c.address || "Unknown address"}\n` +
        `\`\`\`json\n${JSON.stringify(raw, null, 2)}\n\`\`\``,
    );
  }

  const varsList = compType === "land" ? LAND_ADJ_VARS : SALES_ADJ_VARS;

  const patternsText =
    adjustmentPatternLines.length > 0
      ? adjustmentPatternLines.join("\n\n---\n\n")
      : "(No adjustment pattern knowledge entries found.)";

  let userPrompt = `## Subject Property

\`\`\`json
${JSON.stringify(subjectCore, null, 2)}
\`\`\`

## Comparable ${poolLabel} (${compRows.length} total)

${compBlocks.length > 0 ? compBlocks.join("\n\n") : "_No comparables loaded for this project yet._"}

## Adjustment Variables to Discuss

Use bold markdown headings matching these themes (group transaction items in the opening + **Financing Terms & Market Conditions (Time)** as appropriate):

${varsList}

## Past Report Examples

${pastExampleBlocks.length > 0 ? pastExampleBlocks.join("\n\n---\n\n") : "_No similar past discussion sections found in the database yet._"}

## Adjustment Patterns from Similar Reports (knowledge base)

${patternsText}

## Similar Projects — Extracted Adjustment Grids

${similarGridBlocks.length > 0 ? similarGridBlocks.join("\n\n---\n\n") : "_No similar projects with extracted adjustment grids._"}`;

  if (previousContent?.trim()) {
    userPrompt += `\n\n## Previous Draft (for regeneration)\n\n${previousContent.trim()}`;
  }
  if (regenerationContext?.trim()) {
    userPrompt += `\n\n## Regeneration Instructions\n\n${regenerationContext.trim()}`;
  }

  return {
    systemPrompt: DISCUSSION_SYSTEM_PROMPT,
    userPrompt,
  };
}
