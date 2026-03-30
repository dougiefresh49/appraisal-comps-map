import type { ImprovementAnalysisRow } from "~/types/comp-data";

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

const LABEL_TO_CORE_KEYS: Record<string, string[]> = {
  "Property Type": ["propertyType", "Property Type", "Type"],
  "Gross Building Area (GBA)": ["Building Size (SF)", "Gross Building Area (SF)"],
  "Year Built": ["Year Built"],
  Condition: ["Condition"],
  "Construction Class": ["Construction"],
  "Land/Bld Ratio": ["Land / Bld Ratio", "Land/Bld Ratio"],
  "Parking (SF)": ["Parking (SF)"],
  "Land Size (AC)": ["Land Size (AC)"],
  "Land Size (SF)": ["Land Size (SF)"],
  Legal: ["Legal"],
  APN: ["APN"],
};

/** Map improvement analysis row label → value from core, project property type, and document index. */
export function resolveImprovementValueFromSources(
  label: string,
  core: Record<string, unknown>,
  projectPropertyType: string | undefined,
  docIndex: Map<string, string[]>,
): string {
  const trimmed = label.trim();
  if (!trimmed) return "";

  if (trimmed === "Property Type") {
    const fromCore = coreString(core, "Property Type", "propertyType");
    if (fromCore) return fromCore;
    const fromProject = projectPropertyType?.trim();
    if (fromProject) return fromProject;
    return firstFromDoc(docIndex, "property type", "property_type");
  }

  const keys = LABEL_TO_CORE_KEYS[trimmed];
  if (keys) {
    const fromCore = coreString(core, ...keys);
    if (fromCore) return fromCore;
  }

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
  };

  const hints = docKeyHints[trimmed] ?? [normalizeKey(trimmed)];
  return firstFromDoc(docIndex, ...hints);
}

/**
 * Fills empty row values from sources. Does not overwrite non-empty cells.
 */
export function populateImprovementRowsFromSources(
  rows: ImprovementAnalysisRow[],
  core: Record<string, unknown>,
  projectPropertyType: string | undefined,
  docStructuredSlices: unknown[],
): ImprovementAnalysisRow[] {
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

  return rows.map((row) => {
    const current = row.value?.trim() ?? "";
    if (current) return row;
    const resolved = resolveImprovementValueFromSources(
      row.label,
      core,
      projectPropertyType,
      docIndex,
    );
    if (!resolved) return row;
    return { ...row, value: resolved };
  });
}
