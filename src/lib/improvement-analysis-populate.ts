import type { ImprovementAnalysisRow } from "~/types/comp-data";
import { PHOTO_KEY_TO_IMPROVEMENT_LABEL } from "~/lib/improvement-constants";
import { calcAge as calcChronologicalAge } from "~/lib/calculated-fields";

/** Normalize keys from subject core / CAD extraction (snake_case, lowercase). */
function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[_\s/]+/g, " ")
    .trim();
}

/** Collect string values from nested structured document payloads (CAD, deed, etc.). */
export function collectDocumentFieldStrings(root: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();

  const push = (key: string, value: string) => {
    const k = normalizeKey(key);
    if (!k || !value.trim()) return;
    const list = out.get(k) ?? [];
    list.push(value.trim());
    out.set(k, list);
  };

  const visit = (node: unknown, prefix: string) => {
    if (node == null) return;
    if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
      if (prefix) push(prefix, String(node));
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, prefix);
      return;
    }
    if (typeof node !== "object") return;

    for (const [rawKey, v] of Object.entries(node as Record<string, unknown>)) {
      const segment = normalizeKey(rawKey).replace(/\s+/g, " ");
      const nextPrefix = prefix ? `${prefix} ${segment}` : segment;
      if (
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
      ) {
        push(nextPrefix, String(v));
        push(segment, String(v));
      } else {
        visit(v, nextPrefix);
      }
    }
  };

  visit(root, "");
  return out;
}

function firstFromDoc(
  docIndex: Map<string, string[]>,
  ...candidates: string[]
): string {
  for (const c of candidates) {
    const n = normalizeKey(c);
    const vals = docIndex.get(n);
    if (vals?.length) return vals[0]!;
  }
  return "";
}

function coreString(
  core: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const k of keys) {
    const v = core[k];
    if (v == null || v === "") continue;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
  }
  return "";
}

/** Parse a numeric value from core, tolerating stringified numbers. */
function coreNumber(
  core: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const k of keys) {
    const v = core[k];
    if (v == null || v === "") continue;
    const n =
      typeof v === "number"
        ? v
        : typeof v === "string"
          ? parseFloat(v.replace(/,/g, ""))
          : NaN;
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

/**
 * All labels that have a direct mapping to subject_data.core keys.
 * Priority when resolving: core → docs → photos.
 */
const LABEL_TO_CORE_KEYS: Record<string, string[]> = {
  // Improvement Characteristics
  "Property Type": ["propertyType", "Property Type", "Type"],
  "Property Subtype": ["Property Subtype", "propertySubtype", "Subtype"],
  Occupancy: ["Occupancy", "occupancy"],
  "Number of Buildings": ["Number of Buildings", "numberOfBuildings", "buildingCount", "Buildings"],
  "Number of Stories": ["Number of Stories", "Stories", "stories", "numberOfStories"],
  "Construction Class": ["Construction", "Construction Class", "constructionClass"],
  "Construction Quality": ["Construction Quality", "constructionQuality"],
  "Gross Building Area (GBA)": ["Building Size (SF)", "Gross Building Area (SF)", "GBA"],
  "Net Rentable Area (NRA)": ["Net Rentable Area", "NRA", "Rentable SF", "rentableSF"],
  // Ratios & Parking
  "Land/Bld Ratio": ["Land / Bld Ratio", "Land/Bld Ratio"],
  "Parking (SF)": ["Parking (SF)"],
  "Parking Spaces": ["Parking Spaces"],
  "Parking Ratio": ["Parking Ratio"],
  "Floor Area Ratio": ["Floor Area Ratio", "floorAreaRatio"],
  // Age/Life
  "Year Built": ["Year Built"],
  Condition: ["Condition"],
  "Effective Age": ["Effective Age", "effectiveAge"],
  // Site / other
  "Land Size (AC)": ["Land Size (AC)"],
  "Land Size (SF)": ["Land Size (SF)"],
  Legal: ["Legal"],
  APN: ["APN"],
};

/**
 * Inverse lookup: row label → photo improvements_observed key.
 * Built from PHOTO_KEY_TO_IMPROVEMENT_LABEL for O(1) access.
 */
const IMPROVEMENT_LABEL_TO_PHOTO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(PHOTO_KEY_TO_IMPROVEMENT_LABEL).map(([k, v]) => [v, k]),
);

// ─── Calculated Fields ────────────────────────────────────────────────────────

/**
 * Compute "Age" from core: oldest year in comma-separated "Year Built" vs effective date year.
 */
function calcAgeFromCoreForImprovementTable(core: Record<string, unknown>): string {
  const raw = core["Year Built"];
  const effectiveDateRaw =
    coreString(core, "Effective Date", "effectiveDate", "Report Date") ||
    String(new Date().getFullYear());
  const match = /(\d{4})/.exec(effectiveDateRaw);
  const effectiveYear = match
    ? parseInt(match[1]!, 10)
    : new Date().getFullYear();
  const age = calcChronologicalAge(raw as string | number | null, effectiveYear);
  return age != null ? String(age) : "";
}

/**
 * Compute "Remaining Economic Life" from rows already resolved:
 *   REL = typicalBuildingLife - effectiveAge
 * Reads Typical Building Life from the current row set (may be 50 default).
 */
function calcRemainingEconomicLife(
  rows: ImprovementAnalysisRow[],
  core: Record<string, unknown>,
): string {
  const typicalRow = rows.find((r) => r.label === "Typical Building Life");
  const typicalLife: number =
    (typicalRow?.value ? parseFloat(typicalRow.value) : NaN) ||
    (coreNumber(core, "Typical Building Life") ?? 50);

  const effectiveAge =
    coreNumber(core, "Effective Age", "effectiveAge") ??
    (() => {
      const ea = rows.find((r) => r.label === "Effective Age")?.value;
      return ea ? parseFloat(ea) : NaN;
    })();

  if (!effectiveAge || isNaN(effectiveAge)) return "";
  const rel = typicalLife - effectiveAge;
  if (rel < 0 || rel > 200) return "";
  return String(rel);
}

/**
 * Compute "Land/Bld Ratio" from core:
 *   Land / Bld Ratio = landSizeSF / buildingSizeSF
 */
function calcLandBldRatio(core: Record<string, unknown>): string {
  const landSF =
    coreNumber(core, "Land Size (SF)") ??
    (() => {
      const ac = coreNumber(core, "Land Size (AC)");
      return ac ? ac * 43560 : null;
    })();
  const bldSF = coreNumber(core, "Building Size (SF)", "Gross Building Area (SF)", "GBA");
  if (!landSF || !bldSF) return "";
  return (landSF / bldSF).toFixed(2);
}

/**
 * Compute "Floor Area Ratio" from core:
 *   FAR = buildingSizeSF / landSizeSF
 */
function calcFloorAreaRatio(core: Record<string, unknown>): string {
  const landSF =
    coreNumber(core, "Land Size (SF)") ??
    (() => {
      const ac = coreNumber(core, "Land Size (AC)");
      return ac ? ac * 43560 : null;
    })();
  const bldSF = coreNumber(core, "Building Size (SF)", "Gross Building Area (SF)", "GBA");
  if (!landSF || !bldSF) return "";
  return (bldSF / landSF).toFixed(2);
}

/**
 * Compute "Parking Ratio" from core:
 *   Parking Ratio = parkingSpaces / (buildingSizeSF / 1000)
 * Formatted as "X.XX (per 1,000 SF GBA)".
 */
function calcParkingRatio(core: Record<string, unknown>): string {
  const spaces = coreNumber(core, "Parking Spaces");
  const bldSF = coreNumber(core, "Building Size (SF)", "Gross Building Area (SF)", "GBA");
  if (!spaces || !bldSF) return "";
  const ratio = spaces / (bldSF / 1000);
  return `${ratio.toFixed(2)} (per 1,000 SF GBA)`;
}

/** Labels that are derived purely from math — skip doc/photo lookup, compute instead. */
const CALCULATED_LABELS = new Set([
  "Age",
  "Remaining Economic Life",
  "Land/Bld Ratio",
  "Floor Area Ratio",
  "Parking Ratio",
]);

/**
 * Resolve a calculated field. Returns empty string if inputs are insufficient.
 * `rows` is the full in-progress row set so REL can read Typical Building Life.
 */
function resolveCalculatedField(
  label: string,
  core: Record<string, unknown>,
  rows: ImprovementAnalysisRow[],
): string {
  switch (label) {
    case "Age":
      return calcAgeFromCoreForImprovementTable(core);
    case "Remaining Economic Life":
      return calcRemainingEconomicLife(rows, core);
    case "Land/Bld Ratio":
      return calcLandBldRatio(core);
    case "Floor Area Ratio":
      return calcFloorAreaRatio(core);
    case "Parking Ratio":
      return calcParkingRatio(core);
    default:
      return "";
  }
}

// ─── Main Resolution ──────────────────────────────────────────────────────────

/**
 * Map improvement analysis row label → value from core, project property type,
 * document index, and photo improvements_observed data.
 *
 * Priority: core → docs → photos (photos are visual observations, docs/core are authoritative).
 */
export function resolveImprovementValueFromSources(
  label: string,
  core: Record<string, unknown>,
  projectPropertyType: string | undefined,
  docIndex: Map<string, string[]>,
  photoImprovements: Record<string, string> = {},
): string {
  const trimmed = label.trim();
  if (!trimmed) return "";

  // Special: Property Type checks project-level field too
  if (trimmed === "Property Type") {
    const fromCore = coreString(core, "Property Type", "propertyType");
    if (fromCore) return fromCore;
    const fromProject = projectPropertyType?.trim();
    if (fromProject) return fromProject;
    const fromDoc = firstFromDoc(docIndex, "property type", "property_type");
    if (fromDoc) return fromDoc;
    return photoImprovements.construction_quality
      ? ""
      : (photoImprovements.property_type ?? "");
  }

  // 1. Core lookup
  const coreKeys = LABEL_TO_CORE_KEYS[trimmed];
  if (coreKeys) {
    const fromCore = coreString(core, ...coreKeys);
    if (fromCore) return fromCore;
  }

  // 2. Document lookup (extended hints per label)
  const docKeyHints: Record<string, string[]> = {
    "Year Built": ["year built", "yearbuilt"],
    "Gross Building Area (GBA)": [
      "building size sf",
      "gross building area",
      "gross building area sf",
    ],
    Condition: ["condition"],
    "Construction Class": ["construction", "construction class"],
    "Land/Bld Ratio": ["land bld ratio", "land building ratio"],
    "Parking (SF)": ["parking sf", "parking"],
    "Number of Buildings": ["number of buildings", "buildings"],
    "Number of Stories": ["number of stories", "stories"],
    "Construction Quality": ["construction quality"],
    "Net Rentable Area (NRA)": ["net rentable area", "rentable sf", "nra"],
    "Effective Age": ["effective age"],
    "Parking Spaces": ["parking spaces"],
  };

  const hints = docKeyHints[trimmed] ?? [normalizeKey(trimmed)];
  const fromDoc = firstFromDoc(docIndex, ...hints);
  if (fromDoc) return fromDoc;

  // 3. Photo improvements_observed lookup
  const photoKey = IMPROVEMENT_LABEL_TO_PHOTO_KEY[trimmed];
  if (photoKey) {
    const fromPhoto = photoImprovements[photoKey];
    if (fromPhoto?.trim()) return fromPhoto.trim();
  }

  return "";
}

/**
 * Fills empty row values from all available sources.
 * Calculated fields (Age, ratios, etc.) are derived from core math.
 * Does not overwrite non-empty cells.
 *
 * @param rows - current improvement analysis rows
 * @param core - subject_data.core fields
 * @param projectPropertyType - project-level property type string
 * @param docStructuredSlices - structured data from project documents
 * @param photoImprovements - aggregated improvements_observed across all project photos
 */
export function populateImprovementRowsFromSources(
  rows: ImprovementAnalysisRow[],
  core: Record<string, unknown>,
  projectPropertyType: string | undefined,
  docStructuredSlices: unknown[],
  photoImprovements: Record<string, string> = {},
): ImprovementAnalysisRow[] {
  // Build document index once
  const docIndex = new Map<string, string[]>();
  for (const slice of docStructuredSlices) {
    const inner =
      slice &&
      typeof slice === "object" &&
      "structured_data" in (slice as Record<string, unknown>) &&
      (slice as Record<string, unknown>).structured_data != null
        ? (slice as Record<string, unknown>).structured_data
        : slice;
    const collected = collectDocumentFieldStrings(inner);
    for (const [k, vals] of collected) {
      const cur = docIndex.get(k) ?? [];
      docIndex.set(k, [...cur, ...vals]);
    }
  }

  // Two-pass: first resolve everything except REL (which depends on Effective Age row value)
  const firstPass = rows.map((row): ImprovementAnalysisRow => {
    const current = row.value?.trim() ?? "";
    if (current) return row;

    // Calculated fields: derive from math, not lookups
    if (CALCULATED_LABELS.has(row.label) && row.label !== "Remaining Economic Life") {
      const calc = resolveCalculatedField(row.label, core, rows);
      return calc ? { ...row, value: calc } : row;
    }

    const resolved = resolveImprovementValueFromSources(
      row.label,
      core,
      projectPropertyType,
      docIndex,
      photoImprovements,
    );
    return resolved ? { ...row, value: resolved } : row;
  });

  // Second pass: Remaining Economic Life can now read the resolved Effective Age
  return firstPass.map((row): ImprovementAnalysisRow => {
    if (row.label !== "Remaining Economic Life" || row.value?.trim()) return row;
    const calc = calcRemainingEconomicLife(firstPass, core);
    return calc ? { ...row, value: calc } : row;
  });
}
