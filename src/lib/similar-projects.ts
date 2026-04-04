import "server-only";

import { createClient } from "~/utils/supabase/server";

const TAG = "[similar-projects]";

export interface SimilarProjectOptions {
  limit?: number;
  includeNonReference?: boolean;
}

export interface SimilarProject {
  projectId: string;
  projectName: string;
  propertyType: string | null;
  city: string | null;
  county: string | null;
  address: string | null;
  similarityScore: number;
  matchReasons: string[];
  hasExtractedData: boolean;
}

export interface ProjectContext {
  project: {
    name: string;
    propertyType: string | null;
    city: string | null;
    county: string | null;
  };
  subjectData: Record<string, unknown>;
  extractedData: {
    landComps: unknown[];
    saleComps: unknown[];
    rentalComps: unknown[];
    landAdjustments: unknown;
    saleAdjustments: unknown;
    rentalAdjustments: unknown;
    costApproach: unknown;
    reconciliation: unknown;
  } | null;
  reportSections: { sectionKey: string; content: string }[];
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

interface ProjectListRow {
  id: string;
  name: string;
  property_type: string | null;
}

function narrowProjectListRows(data: unknown): ProjectListRow[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const out: ProjectListRow[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.name !== "string") {
      continue;
    }
    const pt = r.property_type;
    out.push({
      id: r.id,
      name: r.name,
      property_type: typeof pt === "string" ? pt : null,
    });
  }
  return out;
}

interface SubjectCoreRow {
  project_id: string;
  core: Record<string, unknown>;
}

function narrowSubjectCoreRows(data: unknown): SubjectCoreRow[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const out: SubjectCoreRow[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const r = row as Record<string, unknown>;
    if (typeof r.project_id !== "string") {
      continue;
    }
    out.push({ project_id: r.project_id, core: jsonRecord(r.core) });
  }
  return out;
}

function narrowUuidList(data: unknown): string[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((r) => {
      if (!r || typeof r !== "object") {
        return null;
      }
      const id = (r as Record<string, unknown>).project_id;
      return typeof id === "string" ? id : null;
    })
    .filter((id): id is string => id !== null);
}

export function extractCoreField(
  core: Record<string, unknown>,
  field: string,
): string | null {
  const v = core[field];
  if (typeof v === "string" && v.trim().length > 0) {
    return v.trim();
  }
  return null;
}

function extractCoreNumber(
  core: Record<string, unknown>,
  field: string,
): number | null {
  const v = core[field];
  if (typeof v === "number" && !Number.isNaN(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number.parseFloat(v.trim());
    if (!Number.isNaN(n)) {
      return n;
    }
  }
  return null;
}

function normalizeLoose(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function scorePropertyType(a: string | null, b: string | null): number {
  const na = normalizeLoose(a);
  const nb = normalizeLoose(b);
  if (!na || !nb) {
    return 0;
  }
  if (na === nb) {
    return 1;
  }
  const commercialish = (x: string) =>
    x.includes("commercial") || x.includes("retail") || x.includes("office");
  const industrialish = (x: string) =>
    x.includes("industrial") || x.includes("warehouse");
  if (
    (commercialish(na) && commercialish(nb)) ||
    (industrialish(na) && industrialish(nb))
  ) {
    return 0.5;
  }
  return 0;
}

function scoreCounty(
  countyA: string | null,
  countyB: string | null,
  stateA: string | null,
  stateB: string | null,
): number {
  const ca = normalizeLoose(countyA);
  const cb = normalizeLoose(countyB);
  if (ca && cb && ca === cb) {
    return 1;
  }
  const sa = normalizeLoose(stateA);
  const sb = normalizeLoose(stateB);
  if (sa && sb && sa === sb) {
    return 0.3;
  }
  return 0;
}

function scoreCity(a: string | null, b: string | null): number {
  const na = normalizeLoose(a);
  const nb = normalizeLoose(b);
  if (na && nb && na === nb) {
    return 1;
  }
  return 0;
}

function zoningCategory(z: string): "C" | "R" | "I" | "other" {
  const t = z.trim().toUpperCase();
  if (
    t.startsWith("C") ||
    t.includes("COMMERCIAL") ||
    t.startsWith("CB") ||
    t.startsWith("CS") ||
    t.startsWith("CG")
  ) {
    return "C";
  }
  if (t.startsWith("R") || t.includes("RESIDENTIAL")) {
    return "R";
  }
  if (
    t.startsWith("I") ||
    t.includes("INDUSTRIAL") ||
    t.startsWith("LI") ||
    t.startsWith("HI")
  ) {
    return "I";
  }
  return "other";
}

function scoreZoning(a: string | null, b: string | null): number {
  const za = (a ?? "").trim();
  const zb = (b ?? "").trim();
  if (!za || !zb) {
    return 0;
  }
  if (za.toLowerCase() === zb.toLowerCase()) {
    return 1;
  }
  const ca = zoningCategory(za);
  const cb = zoningCategory(zb);
  if (ca !== "other" && ca === cb) {
    return 0.5;
  }
  return 0;
}

function scoreLandSizeAc(a: number | null, b: number | null): number {
  if (a === null || b === null) {
    return 0.5;
  }
  if (a <= 0 && b <= 0) {
    return 0.5;
  }
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) {
    return 0.5;
  }
  return 1 - Math.min(Math.abs(a - b) / max, 1);
}

interface CoreSignals {
  propertyType: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  zoning: string | null;
  landAc: number | null;
  address: string | null;
}

function coreSignals(
  core: Record<string, unknown>,
  fallbackPropertyType: string | null,
): CoreSignals {
  return {
    propertyType:
      extractCoreField(core, "Property Type") ?? fallbackPropertyType,
    city: extractCoreField(core, "City"),
    county: extractCoreField(core, "County"),
    state: extractCoreField(core, "State"),
    zoning: extractCoreField(core, "Zoning"),
    landAc: extractCoreNumber(core, "Land Size (AC)"),
    address: extractCoreField(core, "Address"),
  };
}

function buildMatchReasons(
  sProp: number,
  sCounty: number,
  sCity: number,
  sZoning: number,
  sSize: number,
  hadBothLandAc: boolean,
): string[] {
  const reasons: string[] = [];
  if (sProp >= 1) {
    reasons.push("Same property type");
  } else if (sProp >= 0.5) {
    reasons.push("Similar property type");
  }
  if (sCounty >= 1) {
    reasons.push("Same county");
  } else if (sCounty >= 0.3 && sCounty < 1) {
    reasons.push("Same state");
  }
  if (sCity >= 1) {
    reasons.push("Same city");
  }
  if (sZoning >= 1) {
    reasons.push("Same zoning");
  } else if (sZoning >= 0.5) {
    reasons.push("Similar zoning");
  }
  if (hadBothLandAc && sSize > 0.55) {
    reasons.push("Similar land size");
  }
  return reasons;
}

function weightedScore(
  sProp: number,
  sCounty: number,
  sCity: number,
  sZoning: number,
  sSize: number,
): number {
  return (
    sProp * 0.35 +
    sCounty * 0.25 +
    sCity * 0.2 +
    sZoning * 0.1 +
    sSize * 0.1
  );
}

export async function findSimilarProjects(
  projectId: string,
  options?: SimilarProjectOptions,
): Promise<SimilarProject[]> {
  const limit = options?.limit ?? 5;
  const includeNonReference = options?.includeNonReference ?? false;

  const supabase = await createClient();

  const currentProjectRes = await supabase
    .from("projects")
    .select("id, name, property_type")
    .eq("id", projectId)
    .maybeSingle();

  if (currentProjectRes.error) {
    console.error(TAG, "current project:", currentProjectRes.error.message);
  }

  const currentSubjectRes = await supabase
    .from("subject_data")
    .select("core")
    .eq("project_id", projectId)
    .maybeSingle();

  if (currentSubjectRes.error) {
    console.error(TAG, "current subject_data:", currentSubjectRes.error.message);
  }

  const currentCore = jsonRecord(currentSubjectRes.data?.core);
  const curProj = currentProjectRes.data;
  const curPtRaw =
    curProj && typeof curProj === "object"
      ? (curProj as Record<string, unknown>).property_type
      : undefined;
  const currentPt =
    (typeof curPtRaw === "string" ? curPtRaw : null) ??
    extractCoreField(currentCore, "Property Type");
  const cur = coreSignals(currentCore, currentPt);

  let candidatesQuery = supabase
    .from("projects")
    .select("id, name, property_type")
    .neq("id", projectId);

  if (!includeNonReference) {
    candidatesQuery = candidatesQuery.eq("is_reference", true);
  }

  const candidatesRes = await candidatesQuery;

  if (candidatesRes.error) {
    console.error(TAG, "candidates:", candidatesRes.error.message);
    return [];
  }

  const candidates = narrowProjectListRows(candidatesRes.data);
  if (candidates.length === 0) {
    return [];
  }

  const candidateIds = candidates.map((c) => c.id);
  const subjectsRes = await supabase
    .from("subject_data")
    .select("project_id, core")
    .in("project_id", candidateIds);

  if (subjectsRes.error) {
    console.error(TAG, "candidate subject_data:", subjectsRes.error.message);
  }

  const coreByProject = new Map<string, Record<string, unknown>>();
  for (const row of narrowSubjectCoreRows(subjectsRes.data)) {
    coreByProject.set(row.project_id, row.core);
  }

  const extractedRes = await supabase
    .from("report_extracted_data")
    .select("project_id")
    .in("project_id", candidateIds);

  if (extractedRes.error) {
    console.error(TAG, "report_extracted_data:", extractedRes.error.message);
  }

  const extractedSet = new Set(narrowUuidList(extractedRes.data));

  const scored: SimilarProject[] = [];

  for (const c of candidates) {
    const candCore = coreByProject.get(c.id) ?? {};
    const candPt =
      extractCoreField(candCore, "Property Type") ?? c.property_type;
    const cand = coreSignals(candCore, candPt);

    const sProp = scorePropertyType(cur.propertyType, cand.propertyType);
    const sCounty = scoreCounty(
      cur.county,
      cand.county,
      cur.state,
      cand.state,
    );
    const sCity = scoreCity(cur.city, cand.city);
    const sZoning = scoreZoning(cur.zoning, cand.zoning);
    const hadBothLandAc = cur.landAc !== null && cand.landAc !== null;
    const sSize = scoreLandSizeAc(cur.landAc, cand.landAc);

    const similarityScore = weightedScore(
      sProp,
      sCounty,
      sCity,
      sZoning,
      sSize,
    );
    const matchReasons = buildMatchReasons(
      sProp,
      sCounty,
      sCity,
      sZoning,
      sSize,
      hadBothLandAc,
    );

    scored.push({
      projectId: c.id,
      projectName: c.name,
      propertyType: cand.propertyType,
      city: cand.city,
      county: cand.county,
      address: cand.address,
      similarityScore: Math.round(similarityScore * 1000) / 1000,
      matchReasons,
      hasExtractedData: extractedSet.has(c.id),
    });
  }

  scored.sort((a, b) => b.similarityScore - a.similarityScore);
  return scored.slice(0, limit);
}

function asUnknownArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export async function getSimilarProjectContext(
  projectId: string,
  similarProjectId: string,
): Promise<ProjectContext> {
  const supabase = await createClient();

  const { count: originCount, error: originError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("id", projectId);

  if (originError) {
    console.error(TAG, "getSimilarProjectContext origin:", originError.message);
  }
  if (originCount === 0) {
    console.error(TAG, "getSimilarProjectContext: projectId not found:", projectId);
  }

  const projectRes = await supabase
    .from("projects")
    .select("name, property_type")
    .eq("id", similarProjectId)
    .maybeSingle();

  if (projectRes.error) {
    console.error(TAG, "getSimilarProjectContext project:", projectRes.error.message);
  }

  const subjectRes = await supabase
    .from("subject_data")
    .select("core")
    .eq("project_id", similarProjectId)
    .maybeSingle();

  if (subjectRes.error) {
    console.error(TAG, "getSimilarProjectContext subject:", subjectRes.error.message);
  }

  const core = jsonRecord(subjectRes.data?.core);
  const city = extractCoreField(core, "City");
  const county = extractCoreField(core, "County");
  const projRow = projectRes.data;
  const projPt =
    projRow && typeof projRow === "object"
      ? (projRow as Record<string, unknown>).property_type
      : undefined;
  const propertyType =
    extractCoreField(core, "Property Type") ??
    (typeof projPt === "string" ? projPt : null);

  const extractedRes = await supabase
    .from("report_extracted_data")
    .select(
      "land_comps, sale_comps, rental_comps, land_adjustments, sale_adjustments, rental_adjustments, cost_approach, reconciliation",
    )
    .eq("project_id", similarProjectId)
    .maybeSingle();

  if (extractedRes.error) {
    console.error(TAG, "getSimilarProjectContext extracted:", extractedRes.error.message);
  }

  const extractedRowRaw = extractedRes.data;
  const extractedRow =
    extractedRowRaw !== null &&
    typeof extractedRowRaw === "object" &&
    !Array.isArray(extractedRowRaw)
      ? (extractedRowRaw as Record<string, unknown>)
      : null;

  const extractedData =
    extractedRow != null
      ? {
          landComps: asUnknownArray(extractedRow.land_comps),
          saleComps: asUnknownArray(extractedRow.sale_comps),
          rentalComps: asUnknownArray(extractedRow.rental_comps),
          landAdjustments: extractedRow.land_adjustments ?? null,
          saleAdjustments: extractedRow.sale_adjustments ?? null,
          rentalAdjustments: extractedRow.rental_adjustments ?? null,
          costApproach: extractedRow.cost_approach ?? null,
          reconciliation: extractedRow.reconciliation ?? null,
        }
      : null;

  const sectionsRes = await supabase
    .from("report_sections")
    .select("section_key, content")
    .eq("project_id", similarProjectId);

  if (sectionsRes.error) {
    console.error(TAG, "getSimilarProjectContext sections:", sectionsRes.error.message);
  }

  const reportSections: { sectionKey: string; content: string }[] = [];
  const secData = sectionsRes.data;
  if (Array.isArray(secData)) {
    for (const r of secData) {
      if (!r || typeof r !== "object") {
        continue;
      }
      const row = r as Record<string, unknown>;
      const sk = row.section_key;
      const ct = row.content;
      if (typeof sk !== "string") {
        continue;
      }
      reportSections.push({
        sectionKey: sk,
        content: typeof ct === "string" ? ct : "",
      });
    }
  }

  const projNameRaw =
    projectRes.data && typeof projectRes.data === "object"
      ? (projectRes.data as Record<string, unknown>).name
      : undefined;

  return {
    project: {
      name: typeof projNameRaw === "string" ? projNameRaw : "",
      propertyType,
      city,
      county,
    },
    subjectData: core,
    extractedData,
    reportSections,
  };
}
