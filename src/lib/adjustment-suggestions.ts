import "server-only";

import { analyzeAdjustmentPatterns } from "~/lib/adjustment-patterns";
import type { AdjustmentPatternSummary } from "~/lib/adjustment-patterns";
import type { ExtractedAdjustmentGrid } from "~/lib/report-md-parser";
import { findSimilarProjects } from "~/lib/similar-projects";
import { acToSf, salePricePerSf } from "~/lib/calculated-fields";
import { createClient } from "~/utils/supabase/server";

export interface AdjustmentSuggestion {
  category: string;
  comp_id: string;
  comp_number: number;
  subject_value: string | null;
  comp_value: string | null;
  suggested_percent: number | null;
  percent_range: { min: number; max: number } | null;
  confidence: "high" | "medium" | "low";
  rationale: string;
}

export interface AdjustmentGridSuggestions {
  project_id: string;
  comp_type: "land" | "sales";
  categories: string[];
  comps: {
    id: string;
    number: number;
    address: string;
    date_of_sale: string;
    base_price_per_unit: number;
    size: number;
  }[];
  suggestions: AdjustmentSuggestion[];
  similar_projects_used: number;
}

const LAND_TRANSACTION = [
  "Property Rights",
  "Financing Terms",
  "Conditions of Sale",
  "Market Conditions",
] as const;

const LAND_PROPERTY = [
  "Location",
  "Land Size (SF)",
  "Surface",
  "Utilities",
  "Frontage",
] as const;

const SALES_TRANSACTION = [
  "Property Rights",
  "Financing Terms",
  "Conditions of Sale",
  "Market Conditions",
] as const;

const SALES_PROPERTY = [
  "Location",
  "Age/Condition",
  "Building Size (SF)",
  "Office %",
  "Land/Bld Ratio",
  "Zoning",
] as const;

function jsonRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseMoney(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,]/g, "").trim();
    const n = Number.parseFloat(cleaned);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function numFromRaw(raw: Record<string, unknown>, key: string): number | null {
  const v = raw[key];
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function isExtractedAdjustmentGrid(v: unknown): v is ExtractedAdjustmentGrid {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return false;
  }
  const o = v as Record<string, unknown>;
  return Array.isArray(o.rows);
}

function strVal(raw: unknown): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === "boolean") {
    return raw ? "Yes" : "No";
  }
  if (typeof raw === "number" && !Number.isNaN(raw)) {
    return String(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return null;
}

function confidenceFromOccurrences(n: number): "high" | "medium" | "low" {
  if (n >= 3) {
    return "high";
  }
  if (n === 2) {
    return "medium";
  }
  return "low";
}

function findPattern(
  patterns: AdjustmentPatternSummary[],
  category: string,
): AdjustmentPatternSummary | null {
  const n = category.trim().toLowerCase();
  const exact = patterns.find(
    (p) => p.category.trim().toLowerCase() === n,
  );
  if (exact) {
    return exact;
  }
  return (
    patterns.find((p) => {
      const c = p.category.trim().toLowerCase();
      return n.includes(c) || c.includes(n);
    }) ?? null
  );
}

/** Past-report percentages are whole numbers (e.g. 5 = 5%); grid uses decimals. */
function patternPercentToDecimal(p: number): number {
  return p / 100;
}

function subjectLocation(core: Record<string, unknown>): string {
  const parts = [
    strVal(core.Address),
    strVal(core.City),
    [strVal(core.State), strVal(core.Zip)].filter(Boolean).join(" "),
  ].filter(Boolean);
  return parts.join(", ") || "—";
}

function subjectLandSizeSf(core: Record<string, unknown>): string | null {
  const sf = core["Land Size (SF)"];
  const ac = core["Land Size (AC)"];
  if (typeof sf === "number" && !Number.isNaN(sf)) {
    return `${sf} SF`;
  }
  if (typeof ac === "number" && !Number.isNaN(ac)) {
    const conv = acToSf(ac);
    return conv != null ? `${conv} SF (${ac} AC)` : `${ac} AC`;
  }
  return null;
}

function subjectUtilities(core: Record<string, unknown>): string {
  const elec = strVal(core["Utils - Electricity"]);
  const water = strVal(core["Utils - Water"]);
  const sewer = strVal(core["Utils - Sewer"]);
  const parts = [
    elec != null ? `Elec: ${elec}` : null,
    water != null ? `Water: ${water}` : null,
    sewer != null ? `Sewer: ${sewer}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "—";
}

function subjectFrontage(core: Record<string, unknown>): string {
  const corner = core.Corner === true ? "Corner" : core.Corner === false ? "Not corner" : null;
  const hw = core["Highway Frontage"] === true ? "Highway frontage" : core["Highway Frontage"] === false ? "No highway frontage" : null;
  const parts = [corner, hw].filter(Boolean);
  return parts.length ? parts.join("; ") : "—";
}

function subjectAgeCondition(core: Record<string, unknown>): string {
  const cond = strVal(core.Condition);
  const age = strVal(core.Age);
  const yb = strVal(core["Year Built"]);
  const parts = [cond, age ? `Age ${age}` : null, yb ? `Built ${yb}` : null].filter(Boolean);
  return parts.length ? parts.join("; ") : "—";
}

function extractSubjectValue(
  category: string,
  core: Record<string, unknown>,
  compType: "land" | "sales",
): string | null {
  const c = category.trim().toLowerCase();
  if (c === "property rights") {
    return strVal(core["Property Rights"]);
  }
  if (c === "financing terms") {
    return strVal(core["Financing Terms"] ?? core.Financing);
  }
  if (c === "conditions of sale") {
    return strVal(core["Conditions of Sale"]);
  }
  if (c === "market conditions") {
    return strVal(core["Market Conditions"]);
  }
  if (c === "location") {
    return subjectLocation(core);
  }
  if (c === "land size (sf)" || c === "land size") {
    return subjectLandSizeSf(core);
  }
  if (c === "surface") {
    return strVal(core.Surface);
  }
  if (c === "utilities") {
    return subjectUtilities(core);
  }
  if (c === "frontage") {
    return subjectFrontage(core);
  }
  if (c === "age/condition" || c === "age" || c === "condition") {
    return compType === "sales" ? subjectAgeCondition(core) : null;
  }
  if (c === "building size (sf)" || c === "building size") {
    const b = core["Building Size (SF)"];
    return typeof b === "number" && !Number.isNaN(b) ? `${b} SF` : strVal(b);
  }
  if (c === "office %") {
    const o = core["Office %"];
    if (typeof o === "number" && !Number.isNaN(o)) {
      const pct = o > 0 && o <= 1 ? o * 100 : o;
      return `${pct.toFixed(1)}%`;
    }
    return strVal(o);
  }
  if (c === "land/bld ratio") {
    const r = core["Land / Bld Ratio"];
    return typeof r === "number" && !Number.isNaN(r) ? String(r) : strVal(r);
  }
  if (c === "zoning") {
    return strVal(core.Zoning) ?? strVal(core["Zoning Description"]);
  }
  return null;
}

function extractCompValue(
  category: string,
  raw: Record<string, unknown>,
  compType: "land" | "sales",
): string | null {
  const c = category.trim().toLowerCase();
  if (c === "property rights") {
    return strVal(raw["Property Rights"]);
  }
  if (c === "financing terms") {
    return strVal(raw["Financing Terms"]);
  }
  if (c === "conditions of sale") {
    return strVal(raw["Conditions of Sale"]);
  }
  if (c === "market conditions") {
    return strVal(raw["Market Conditions"]);
  }
  if (c === "location") {
    const parts = [
      strVal(raw.Address),
      strVal(raw.City),
      [strVal(raw.State), strVal(raw.Zip)].filter(Boolean).join(" "),
    ].filter(Boolean);
    return parts.length ? parts.join(", ") : strVal(raw.Address);
  }
  if (c === "land size (sf)" || c === "land size") {
    const sf = raw["Land Size (SF)"];
    if (typeof sf === "number" && !Number.isNaN(sf)) {
      return `${sf} SF`;
    }
    const ac = raw["Land Size (AC)"];
    if (typeof ac === "number" && !Number.isNaN(ac)) {
      const conv = acToSf(ac);
      return conv != null ? `${conv} SF` : `${ac} AC`;
    }
    return null;
  }
  if (c === "surface") {
    return strVal(raw.Surface);
  }
  if (c === "utilities") {
    const parts = [
      strVal(raw["Utils - Electricity"]) != null
        ? `Elec: ${strVal(raw["Utils - Electricity"])}`
        : null,
      strVal(raw["Utils - Water"]) != null
        ? `Water: ${strVal(raw["Utils - Water"])}`
        : null,
      strVal(raw["Utils - Sewer"]) != null
        ? `Sewer: ${strVal(raw["Utils - Sewer"])}`
        : null,
    ].filter(Boolean);
    return parts.length ? parts.join("; ") : "—";
  }
  if (c === "frontage") {
    const corner = raw.Corner === true ? "Corner" : raw.Corner === false ? "Not corner" : null;
    const hw =
      raw["Highway Frontage"] === true
        ? "Highway frontage"
        : raw["Highway Frontage"] === false
          ? "No highway frontage"
          : null;
    const parts = [corner, hw].filter(Boolean);
    return parts.length ? parts.join("; ") : "—";
  }
  if (c === "age/condition" || c === "age" || c === "condition") {
    if (compType !== "sales") {
      return null;
    }
    const cond = strVal(raw.Condition);
    const age = strVal(raw.Age);
    const yb = strVal(raw["Year Built"]);
    const parts = [cond, age ? `Age ${age}` : null, yb ? `Built ${yb}` : null].filter(Boolean);
    return parts.length ? parts.join("; ") : "—";
  }
  if (c === "building size (sf)" || c === "building size") {
    const b = raw["Building Size (SF)"];
    return typeof b === "number" && !Number.isNaN(b) ? `${b} SF` : strVal(b);
  }
  if (c === "office %") {
    const o = raw["Office %"];
    if (typeof o === "number" && !Number.isNaN(o)) {
      const pct = o > 0 && o <= 1 ? o * 100 : o;
      return `${pct.toFixed(1)}%`;
    }
    return strVal(o);
  }
  if (c === "land/bld ratio") {
    const r = raw["Land / Bld Ratio"];
    return typeof r === "number" && !Number.isNaN(r) ? String(r) : strVal(r);
  }
  if (c === "zoning") {
    return strVal(raw.Zoning) ?? strVal(raw["Zoning Description"]);
  }
  return null;
}

function compBasePriceAndSize(
  raw: Record<string, unknown>,
  compType: "land" | "sales",
): { base: number; size: number } {
  const salePrice = parseMoney(raw["Sale Price"]);
  let landSf = numFromRaw(raw, "Land Size (SF)");
  const landAc = numFromRaw(raw, "Land Size (AC)");
  if (landSf == null && landAc != null) {
    landSf = acToSf(landAc);
  }
  const bldSf = numFromRaw(raw, "Building Size (SF)");

  const size = compType === "land" ? landSf ?? 0 : bldSf ?? landSf ?? 0;
  const denomSf = compType === "land" ? landSf : bldSf ?? landSf;
  const baseRaw = salePricePerSf(salePrice, denomSf);
  const spSf = numFromRaw(raw, "Sale Price / SF");
  const base = baseRaw ?? spSf ?? 0;

  return { base, size };
}

export async function generateAdjustmentSuggestions(
  projectId: string,
  compType: "land" | "sales",
): Promise<AdjustmentGridSuggestions> {
  const supabase = await createClient();

  const transaction =
    compType === "land" ? LAND_TRANSACTION : SALES_TRANSACTION;
  const property = compType === "land" ? LAND_PROPERTY : SALES_PROPERTY;
  const categories = [...transaction, ...property];

  const subjectRes = await supabase
    .from("subject_data")
    .select("core")
    .eq("project_id", projectId)
    .maybeSingle();

  if (subjectRes.error) {
    console.error("[adjustment-suggestions] subject_data:", subjectRes.error.message);
  }

  const core = jsonRecord(subjectRes.data?.core);

  const compTableType = compType === "land" ? "Land" : "Sales";
  const compsRes = await supabase
    .from("comparables")
    .select("id, address, number")
    .eq("project_id", projectId)
    .eq("type", compTableType)
    .order("number", { ascending: true });

  if (compsRes.error) {
    console.error("[adjustment-suggestions] comparables:", compsRes.error.message);
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
      : { data: [] as { comp_id: string; raw_data: unknown }[], error: null };

  if (parsedRes.error) {
    console.error("[adjustment-suggestions] comp_parsed_data:", parsedRes.error.message);
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

  const similar = await findSimilarProjects(projectId, { limit: 25 });
  const candidateIds = similar
    .filter((s) => s.hasExtractedData)
    .map((s) => s.projectId);

  let similarUsed = 0;
  const extractedRows: {
    project_id: string | null;
    source_filename: string | null;
    land_adjustments: ExtractedAdjustmentGrid | null;
    sale_adjustments: ExtractedAdjustmentGrid | null;
    rental_adjustments: ExtractedAdjustmentGrid | null;
    cost_approach: null;
    reconciliation: null;
    property_type: string | null;
  }[] = [];

  if (candidateIds.length > 0) {
    const exRes = await supabase
      .from("report_extracted_data")
      .select("project_id, land_adjustments, sale_adjustments")
      .in("project_id", candidateIds);

    if (exRes.error) {
      console.error("[adjustment-suggestions] report_extracted_data:", exRes.error.message);
    }

    const projRes = await supabase
      .from("projects")
      .select("id, property_type")
      .in("id", candidateIds);

    const ptById = new Map<string, string | null>();
    const rawProj = projRes.data;
    if (Array.isArray(rawProj)) {
      for (const row of rawProj) {
        if (!row || typeof row !== "object") {
          continue;
        }
        const p = row as Record<string, unknown>;
        if (typeof p.id !== "string") {
          continue;
        }
        ptById.set(
          p.id,
          typeof p.property_type === "string" ? p.property_type : null,
        );
      }
    }

    const rawEx = exRes.data;
    if (Array.isArray(rawEx)) {
      for (const row of rawEx) {
        if (!row || typeof row !== "object") {
          continue;
        }
        const r = row as Record<string, unknown>;
        const pid = r.project_id;
        if (typeof pid !== "string") {
          continue;
        }
        similarUsed++;
        extractedRows.push({
          project_id: pid,
          source_filename: null,
          land_adjustments: isExtractedAdjustmentGrid(r.land_adjustments)
            ? r.land_adjustments
            : null,
          sale_adjustments: isExtractedAdjustmentGrid(r.sale_adjustments)
            ? r.sale_adjustments
            : null,
          rental_adjustments: null,
          cost_approach: null,
          reconciliation: null,
          property_type: ptById.get(pid) ?? null,
        });
      }
    }
  }

  const cross = analyzeAdjustmentPatterns(extractedRows);
  const patterns =
    compType === "land" ? cross.land_patterns : cross.sale_patterns;

  const suggestions: AdjustmentSuggestion[] = [];
  const compsOut: AdjustmentGridSuggestions["comps"] = [];

  for (let i = 0; i < compRows.length; i++) {
    const c = compRows[i]!;
    const num = Number.parseInt(c.number ?? String(i + 1), 10);
    const compNumber = Number.isNaN(num) ? i + 1 : num;
    const raw = rawByComp.get(c.id) ?? {};
    const { base, size } = compBasePriceAndSize(raw, compType);
    const dateOfSale = strVal(raw["Date of Sale"]) ?? "";

    compsOut.push({
      id: c.id,
      number: compNumber,
      address: c.address ?? "",
      date_of_sale: dateOfSale,
      base_price_per_unit: base,
      size,
    });

    for (const category of categories) {
      const pattern = findPattern(patterns, category);
      const meanPct = pattern?.typical_range.mean ?? null;
      const suggestedPercent =
        meanPct !== null ? patternPercentToDecimal(meanPct) : null;
      const percentRange =
        pattern != null
          ? {
              min: patternPercentToDecimal(pattern.typical_range.min),
              max: patternPercentToDecimal(pattern.typical_range.max),
            }
          : null;

      suggestions.push({
        category,
        comp_id: c.id,
        comp_number: compNumber,
        subject_value: extractSubjectValue(category, core, compType),
        comp_value: extractCompValue(category, raw, compType),
        suggested_percent: suggestedPercent,
        percent_range: percentRange,
        confidence: pattern
          ? confidenceFromOccurrences(pattern.occurrences)
          : "low",
        rationale: pattern?.example_rationales[0] ?? "",
      });
    }
  }

  return {
    project_id: projectId,
    comp_type: compType,
    categories,
    comps: compsOut,
    suggestions,
    similar_projects_used: similarUsed,
  };
}
