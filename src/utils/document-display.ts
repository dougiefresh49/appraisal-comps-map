/**
 * Legacy label from first comp-parse → `project_documents` registration (since removed).
 * Rows may still carry this in `document_label`; prefer `file_name` in UI.
 */
export const LEGACY_COMP_PARSE_DOCUMENT_LABEL = "Comp parse source";

/**
 * Helpers for showing document metadata when the DB `document_type` is generic
 * (e.g. comp-parse registration uses `"other"` but Gemini fills a specific kind).
 */

export function resolvedStructuredDocumentFields(
  structuredData: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!structuredData || typeof structuredData !== "object") return {};
  const inner = structuredData.structured_data;
  if (inner && typeof inner === "object" && inner !== null) {
    return inner as Record<string, unknown>;
  }
  return structuredData;
}

/**
 * For `document_type === "other"`, extraction prompt asks for `document_type` inside structured_data.
 */
export function getInferredDocumentKindLabel(
  documentType: string,
  structuredData: Record<string, unknown> | null | undefined,
): string | null {
  if (documentType !== "other") return null;
  const fields = resolvedStructuredDocumentFields(structuredData);
  const dt = fields.document_type;
  if (typeof dt === "string" && dt.trim() !== "") return dt.trim();
  return null;
}

/**
 * Primary subtitle line: inferred kind for "other" docs, otherwise snake_case → words.
 */
export function formatDocumentTypeForDisplay(
  documentType: string,
  structuredData: Record<string, unknown> | null | undefined,
): string {
  const inferred = getInferredDocumentKindLabel(documentType, structuredData);
  if (inferred) return inferred;
  return documentType.replace(/_/g, " ");
}

/**
 * Human-facing title from label + file name only (not DB `document_type`).
 * Omits legacy comp-parse placeholder so callers can fall back to file name.
 */
export function getDocumentPrimaryTitle(
  documentLabel: string | null | undefined,
  fileName: string | null | undefined,
): string {
  const label = documentLabel?.trim();
  if (label && label !== LEGACY_COMP_PARSE_DOCUMENT_LABEL) return label;
  const name = fileName?.trim();
  if (name) return name;
  return "";
}

const SLUG_SHORT_LABEL: Record<string, string> = {
  deed: "Deed",
  flood_map: "Flood",
  cad: "CAD",
  zoning_map: "Zoning",
  neighborhood_map: "NH map",
  location_map: "Loc map",
  engagement: "Engagement",
};

const INFERRED_KIND_PATTERNS: { pattern: RegExp; short: string }[] = [
  { pattern: /\bmls\b|multiple listing|listing report/i, short: "MLS" },
  { pattern: /warranty deed|quitclaim|special warranty|deed(?!th)/i, short: "Deed" },
  { pattern: /cad\b|appraisal district|tax record|property card/i, short: "CAD" },
  {
    pattern: /property appraisal|appraisal summary|appraisal report/i,
    short: "Appraisal",
  },
  { pattern: /flood|fema|\bfirm\b/i, short: "Flood" },
  { pattern: /zoning|gis layer/i, short: "Zoning" },
  { pattern: /engagement/i, short: "Engagement" },
  { pattern: /sketch|floor plan|site plan/i, short: "Sketch" },
  { pattern: /neighborhood map/i, short: "NH map" },
  { pattern: /location map/i, short: "Loc map" },
  { pattern: /survey|plat\b/i, short: "Survey" },
  { pattern: /contract|purchase agreement/i, short: "Contract" },
  { pattern: /lease\b/i, short: "Lease" },
];

function truncateWords(text: string, maxWords: number, maxLen: number): string {
  const words = text.split(/\s+/).filter(Boolean).slice(0, maxWords);
  let s = words.join(" ");
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1)}…`;
  return s;
}

/**
 * Compact type label (~1–3 words) for badges and doc panel subtitle.
 */
export function formatDocumentTypeShort(
  documentType: string,
  structuredData: Record<string, unknown> | null | undefined,
): string {
  const slugShort = SLUG_SHORT_LABEL[documentType];
  if (slugShort) return slugShort;

  const full = formatDocumentTypeForDisplay(documentType, structuredData);
  for (const { pattern, short } of INFERRED_KIND_PATTERNS) {
    if (pattern.test(full)) return short;
  }

  if (documentType === "other") {
    return truncateWords(full, 3, 28) || "Other";
  }

  return truncateWords(full.replace(/_/g, " "), 3, 28) || documentType;
}

/** Tailwind classes for document type badges (matches Documents page cards). */
export const DOCUMENT_TYPE_BADGE_CLASS: Record<string, string> = {
  deed:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-600/40 dark:bg-amber-950/60 dark:text-amber-200",
  flood_map:
    "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-600/40 dark:bg-sky-950/60 dark:text-sky-200",
  cad:
    "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-600/40 dark:bg-violet-950/60 dark:text-violet-200",
  zoning_map:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-600/40 dark:bg-emerald-950/60 dark:text-emerald-200",
  neighborhood_map:
    "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-600/40 dark:bg-teal-950/60 dark:text-teal-200",
  location_map:
    "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-600/40 dark:bg-cyan-950/60 dark:text-cyan-200",
  engagement:
    "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-600/40 dark:bg-rose-950/60 dark:text-rose-200",
  other:
    "border-gray-300 bg-gray-100 text-gray-800 dark:border-zinc-600/40 dark:bg-zinc-800/80 dark:text-zinc-300",
};

const DOCUMENT_SECTION_TAG_LABELS: { value: string; label: string }[] = [
  { value: "subject", label: "Subject" },
  { value: "neighborhood", label: "Neighborhood" },
  { value: "ownership", label: "Ownership" },
  { value: "zoning", label: "Zoning" },
  { value: "flood-map", label: "Flood Map" },
  { value: "engagement", label: "Engagement" },
];

/**
 * Human label for `project_documents.section_tag` when it matches known tags;
 * returns null for unknown values (caller may show the raw tag, e.g. sales-comp-1).
 */
export function getDocumentSectionTagLabel(
  tag: string | null | undefined,
): string | null {
  if (!tag) return null;
  return DOCUMENT_SECTION_TAG_LABELS.find((t) => t.value === tag)?.label ?? null;
}

/** Key/value rows for structured_data display (excludes processing_error). */
export function structuredEntriesForDisplay(
  data: Record<string, unknown> | undefined | null,
): [string, string][] {
  if (!data || typeof data !== "object") return [];
  return Object.entries(data)
    .filter(([k]) => k !== "processing_error")
    .map(([k, v]) => [
      k,
      v !== null && typeof v === "object"
        ? JSON.stringify(v, null, 2)
        : typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean"
          ? String(v)
          : "",
    ]);
}
