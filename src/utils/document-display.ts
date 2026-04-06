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
