import "server-only";

import { GoogleGenAI } from "@google/genai";
import type {
  FemaData,
  ImprovementAnalysisRow,
  ImprovementCategory,
  SubjectTax,
  TaxEntity,
} from "~/types/comp-data";
import { parseZoningLocation } from "~/types/comp-field-options";

const TAG = "[report-md-parser]";
/** Pass 1: lightweight flash model for narrative + metadata extraction. */
const MODEL = "gemini-3.1-flash-lite-preview";
/** Pass 2: Pro model for complex table parsing (adjustment grids, comp summaries). */
const MODEL_PASS2 = "gemini-3.1-pro-preview";

/** Cover / identification fields written to `projects` + used for report_sections metadata. */
export interface ReportCoverExtraction {
  client_name: string | null;
  client_company: string | null;
  effective_date: string | null;
  report_date: string | null;
  property_address: string | null;
  final_value: string | null;
  property_rights: string | null;
  property_type: string | null;
}

export const REPORT_MD_SECTION_KEYS = [
  "neighborhood",
  "zoning",
  "subject-site-summary",
  "highest-best-use",
  "ownership",
  "reconciliation",
  "extraordinary-assumptions",
  "cost-approach",
  "sales-comparison-land",
  "sales-comparison-improved",
  "discussion-of-land-sales",
  "discussion-of-improved-sales",
] as const;

export type ReportMdSectionKey = (typeof REPORT_MD_SECTION_KEYS)[number];

/** Simplified land comp extracted from a past report's summary chart / narrative. */
export interface ExtractedLandComp {
  index: number;
  address: string;
  date_of_sale: string | null;
  sale_price: string | null;
  land_size_ac: number | null;
  land_size_sf: number | null;
  sale_price_per_ac: number | null;
  sale_price_per_sf: number | null;
  corner: boolean | null;
  highway_frontage: boolean | null;
  zoning: string | null;
  utilities: string | null;
  surface: string | null;
  comments: string | null;
}

/** Simplified improved sale comp extracted from a past report. */
export interface ExtractedSaleComp {
  index: number;
  address: string;
  date_of_sale: string | null;
  sale_price: string | null;
  building_size_sf: number | null;
  land_size_ac: number | null;
  sale_price_per_sf: number | null;
  year_built: number | null;
  condition: string | null;
  construction: string | null;
  property_type: string | null;
  comments: string | null;
}

/** Simplified rental comp extracted from a past report. */
export interface ExtractedRentalComp {
  index: number;
  address: string;
  rent_per_sf_year: number | null;
  building_size_sf: number | null;
  lease_date: string | null;
  lease_terms: string | null;
  expense_structure: string | null;
  condition: string | null;
  comments: string | null;
}

/** One row in an adjustment grid (one adjustment category across all comps). */
export interface AdjustmentRow {
  /** e.g. "Market Conditions", "Location", "Corner", "Highway Frontage" */
  category: string;
  comp_adjustments: {
    comp_index: number;
    /** e.g. 5 for +5%, -10 for -10% */
    percentage: number | null;
    dollar_amount: number | null;
    rationale: string | null;
  }[];
}

/** Structured adjustment grid for one approach. */
export interface ExtractedAdjustmentGrid {
  approach: "land" | "sales" | "rental";
  /** e.g. "$/SF", "$/AC", "$/SF/Year" */
  subject_price_unit: string;
  rows: AdjustmentRow[];
  total_adjustments: {
    comp_index: number;
    total_percent: number | null;
    adjusted_value: number | null;
  }[];
}

/** Cost approach schedule values. */
export interface ExtractedCostApproach {
  land_value: number | null;
  replacement_cost_new: number | null;
  total_depreciation: number | null;
  depreciation_percentage: number | null;
  depreciated_cost: number | null;
  cost_approach_value: number | null;
}

/** Reconciliation values from final value estimate section. */
export interface ExtractedReconciliation {
  cost_approach_value: number | null;
  sales_comparison_value: number | null;
  income_approach_value: number | null;
  land_value: number | null;
  final_reconciled_value: number | null;
  /** e.g. "Sales Comparison" */
  primary_approach: string | null;
}

/** Full structured extraction from one appraisal report markdown export. */
export interface ReportMarkdownParseResult {
  cover: ReportCoverExtraction;
  /** Spreadsheet-style `SubjectData` keys; may be partial — backfill normalizes before DB. */
  subject_core: Record<string, unknown>;
  improvement_analysis: ImprovementAnalysisRow[];
  taxes: SubjectTax[];
  tax_entities: TaxEntity[];
  fema: FemaData;
  /** Narrative sections for RAG / report_sections; empty string if missing. */
  sections: Record<string, string>;
  // Pass 2 structured data extraction:
  land_comps: ExtractedLandComp[];
  sale_comps: ExtractedSaleComp[];
  rental_comps: ExtractedRentalComp[];
  land_adjustments: ExtractedAdjustmentGrid | null;
  sale_adjustments: ExtractedAdjustmentGrid | null;
  rental_adjustments: ExtractedAdjustmentGrid | null;
  cost_approach: ExtractedCostApproach | null;
  reconciliation: ExtractedReconciliation | null;
}

const EXTRACTION_PROMPT = `You are extracting structured data from a commercial real estate appraisal report exported as Markdown from Google Docs.

The document includes a cover page, tables, and section headings (##). Use the full markdown to populate every field as accurately as possible.

Return a SINGLE JSON object (no markdown fences) with this exact top-level shape:

{
  "cover": {
    "client_name": string | null,
    "client_company": string | null,
    "effective_date": string | null,
    "report_date": string | null,
    "property_address": string | null,
    "final_value": string | null,
    "property_rights": string | null,
    "property_type": string | null
  },
  "subject_core": { ... },
  "improvement_analysis": [ ... ],
  "taxes": [ ... ],
  "tax_entities": [ ... ],
  "fema": { ... },
  "sections": { ... }
}

## cover
- Read the first pages: "PREPARED FOR" / client lines, effective date, report date, subject address, final value, fee simple / leased fee if stated, and property type (Commercial, Industrial, Land, etc.).

## subject_core
Object whose keys match the spreadsheet subject row (SubjectData). Use these exact key names (including spaces and punctuation):

"Address", "Type" ("Improvements" | "Excess Land"), "APN", "Legal", "Property Rights", "instrumentNumber", "Date of Sale" (always "Current" for subject), "Market Conditions",
"Land Size (AC)", "Land Size (SF)", "Parking (SF)", "Building Size (SF)", "Office Area (SF)", "Warehouse Area (SF)", "Office %", "Land / Bld Ratio", "Total Taxes",
"City", "State", "County", "Zip", "AddressLabel", "AddressLocal", "Zoning Area", "Zoning Description", "Zoning", "Other Features",
"Hoisting", "Wash Bay", "Corner", "Highway Frontage", "Utils - Electricity", "Utils - Water" ("Public"|"Well"|"None"), "Utils - Sewer" ("Public"|"Septic"|"None"),
"Surface" ("Cleared"|"Caliche"|"Raw"), "Construction", "Condition" ("Good"|"Average"|"Fair"|"Poor"), "Year Built", "Age", "Effective Age", "Est Insurance", "Est Expences"

Rules:
- Use null for unknown scalars; use "" only when explicitly empty text is appropriate.
- Booleans: true/false; unknown booleans may be null.
- Generated spreadsheet fields (Office Area (SF), etc.) may be "GENERATED", "BLANK", or a number/string as in the sheet.

## improvement_analysis
Array of rows from the **IMPROVEMENT ANALYSIS** table (Property Subtype, Year Built, Land/Bld ratio, structural/mechanical fields, etc.).
Each element:
{ "label": string, "category": string, "include": boolean, "value": string }

category MUST be one of exactly:
"Improvement Characteristics", "Ratios & Parking", "Age/Life", "Structural Characteristics", "Interior Characteristics", "Mechanical Systems", "Site Improvements", "Legal/Conforming Status"
Map subsection headers in the report to the closest of these (e.g. "Age / Life" -> "Age/Life").

## taxes
Array of { "Entity": string, "Amount": number } for subject property tax line items if broken out; otherwise infer from narrative/tables if possible. Empty array if not available.

## tax_entities
Array of { "Entity": string, "Rate": number } for tax rates per $100 if stated. Empty array if not available.

## fema
{ "FemaMapNum": string|null, "FemaZone": string|null, "FemaIsHazardZone": boolean|null, "FemaMapDate": string|null } from Flood Plain / FEMA discussion.

## sections
Long-form narrative text for RAG. Keys MUST all be present (use "" if missing):

- "neighborhood": MARKET AREA / NEIGHBORHOOD ANALYSIS (main narrative, not just TOC)
- "zoning": Zoning section narrative (from SITE ANALYSIS or dedicated zoning section)
- "subject-site-summary": SITE ANALYSIS + Subject Property Development + utilities/easements narrative (exclude raw image-only lines)
- "highest-best-use": HIGHEST AND BEST USE / MARKET ANALYSIS full section
- "ownership": OWNERSHIP / SALES HISTORY + Summary and Conclusion under it if short
- "reconciliation": RECONCILIATION AND FINAL VALUE ESTIMATE + certification value discussion
- "extraordinary-assumptions": EXTRAORDINARY ASSUMPTIONS + HYPOTHETICAL CONDITIONS combined text
- "cost-approach": THE COST APPROACH + depreciation + Swift Estimator narrative
- "sales-comparison-land": Land sales approach: summary chart discussion + adjustments + land comp narrative
- "sales-comparison-improved": Improved sales comparison approach narrative + adjustments + discussion of improved sales

Do not include table-of-contents lines. Prefer substantive paragraphs. Minimum length per section is not required — use "" if the section truly does not exist.

Finally: respond with ONLY valid JSON, no trailing commentary.`;

const PASS2_EXTRACTION_PROMPT = `You are performing PASS 2 data extraction from a commercial real estate appraisal report (Markdown from Google Docs).

PASS 1 already extracted narratives, subject data, and taxes. Your job is ONLY to extract structured numeric data from tables:
- Comparable land sales summary charts
- Land sales adjustment charts
- Comparable improved sales summary charts
- Improved sales adjustment charts
- Rental comparable charts (if present)
- Cost approach schedule
- Reconciliation / final value summary

Return a SINGLE JSON object (no markdown fences) with this exact shape:

{
  "land_comps": [
    {
      "index": 1,
      "address": "16580 SW Wind Ave Odessa",
      "date_of_sale": "Mar 2025",
      "sale_price": null,
      "land_size_ac": 5.00,
      "land_size_sf": null,
      "sale_price_per_ac": 35000,
      "sale_price_per_sf": 0.80,
      "corner": false,
      "highway_frontage": true,
      "zoning": "None (Outside ETJ)",
      "utilities": "None",
      "surface": "Cleared",
      "comments": null
    }
  ],
  "sale_comps": [
    {
      "index": 1,
      "address": "2941 Didram Rd Odessa",
      "date_of_sale": "Jan 2024",
      "sale_price": "170000",
      "building_size_sf": 2400,
      "land_size_ac": 2.57,
      "sale_price_per_sf": 70.83,
      "year_built": 2018,
      "condition": "Good",
      "construction": "Metal",
      "property_type": "Industrial",
      "comments": null
    }
  ],
  "rental_comps": [],
  "land_adjustments": {
    "approach": "land",
    "subject_price_unit": "$/SF",
    "rows": [
      {
        "category": "Market Conditions",
        "comp_adjustments": [
          { "comp_index": 1, "percentage": 5, "dollar_amount": null, "rationale": null },
          { "comp_index": 2, "percentage": 3, "dollar_amount": null, "rationale": null }
        ]
      }
    ],
    "total_adjustments": [
      { "comp_index": 1, "total_percent": 35, "adjusted_value": 1.13 },
      { "comp_index": 2, "total_percent": 31, "adjusted_value": 1.13 }
    ]
  },
  "sale_adjustments": {
    "approach": "sales",
    "subject_price_unit": "$/SF",
    "rows": [],
    "total_adjustments": []
  },
  "rental_adjustments": null,
  "cost_approach": {
    "land_value": 335000,
    "replacement_cost_new": 280008,
    "total_depreciation": 30007,
    "depreciation_percentage": null,
    "depreciated_cost": 250001,
    "cost_approach_value": 585000
  },
  "reconciliation": {
    "cost_approach_value": 585000,
    "sales_comparison_value": 490000,
    "income_approach_value": null,
    "land_value": 335000,
    "final_reconciled_value": 510000,
    "primary_approach": "Sales Comparison"
  }
}

RULES:
- Parse ALL comps from the COMPARABLE LAND SALES SUMMARY CHART and COMPARABLE SALES SUMMARY CHART tables (not just comp detail cards).
- For adjustment grids (LAND SALES ADJUSTMENT CHART / SALES ADJUSTMENT CHART): extract each named adjustment row (Property Rights, Financing Terms, Market Conditions, Location, Size, Surface, Utilities, Frontage, Age/Condition, Office %, Zoning, etc.). Use the percentage column values — include the sign (positive for upward, negative for downward).
- Strip $ and commas from dollar values: "$510,000" → 510000, "$1.13" → 1.13
- Strip % from percentages: "35%" → 35, "-15%" → -15
- For "corner" and "highway_frontage" in land_comps: parse "Yes"/"No"/"yes"/"no" → boolean, or the frontage/corner column value if boolean isn't clear use null.
- Use null for any field not found in the report.
- Use empty arrays [] if a comp type doesn't exist in this report.
- Use null for adjustment grids and cost_approach if those sections don't exist.
- Do NOT extract narratives or descriptions — only structured numeric/categorical table data.
- Respond with ONLY valid JSON, no trailing commentary.`;


/**
 * Pass 2: Extracts structured comp data, adjustment grids, cost approach, and reconciliation
 * from the same sanitized report markdown. Uses gemini-3.1-pro-preview for superior table parsing.
 * On any failure returns safe empty defaults — Pass 1 results are never blocked by Pass 2 failures.
 */
export async function extractCompAndValuationData(
  sanitizedMarkdown: string,
  apiKey: string,
  sourceFileName: string,
): Promise<{
  land_comps: ExtractedLandComp[];
  sale_comps: ExtractedSaleComp[];
  rental_comps: ExtractedRentalComp[];
  land_adjustments: ExtractedAdjustmentGrid | null;
  sale_adjustments: ExtractedAdjustmentGrid | null;
  rental_adjustments: ExtractedAdjustmentGrid | null;
  cost_approach: ExtractedCostApproach | null;
  reconciliation: ExtractedReconciliation | null;
}> {
  const empty = {
    land_comps: [] as ExtractedLandComp[],
    sale_comps: [] as ExtractedSaleComp[],
    rental_comps: [] as ExtractedRentalComp[],
    land_adjustments: null,
    sale_adjustments: null,
    rental_adjustments: null,
    cost_approach: null,
    reconciliation: null,
  };

  try {
    const ai = new GoogleGenAI({ apiKey });
    const userPayload = `${PASS2_EXTRACTION_PROMPT}\n\n---\n\n# REPORT MARKDOWN\n\n${sanitizedMarkdown}`;

    const t0 = Date.now();
    const response = await ai.models.generateContent({
      model: MODEL_PASS2,
      contents: [{ text: userPayload }],
      config: {
        temperature: 0.1,
        maxOutputTokens: 32768,
        responseMimeType: "application/json",
      },
    });
    const responseText = response.text ?? "";
    console.log(
      TAG,
      `Pass 2 Gemini (${sourceFileName}) completed in ${Date.now() - t0}ms, response ${responseText.length} chars`,
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      console.warn(
        TAG,
        `Pass 2 JSON parse failed for "${sourceFileName}". First 400 chars:`,
        responseText.slice(0, 400),
      );
      return empty;
    }

    const raw = parsed as Record<string, unknown>;

    const land_comps = normalizeLandComps(raw.land_comps);
    const sale_comps = normalizeSaleComps(raw.sale_comps);
    const rental_comps = normalizeRentalComps(raw.rental_comps);
    const land_adjustments = normalizeAdjustmentGrid(raw.land_adjustments, "land");
    const sale_adjustments = normalizeAdjustmentGrid(raw.sale_adjustments, "sales");
    const rental_adjustments = normalizeAdjustmentGrid(raw.rental_adjustments, "rental");
    const cost_approach = normalizeCostApproach(raw.cost_approach);
    const reconciliation = normalizeReconciliation(raw.reconciliation);

    console.log(
      TAG,
      `Pass 2 "${sourceFileName}" — land_comps: ${land_comps.length}, sale_comps: ${sale_comps.length}, rental_comps: ${rental_comps.length}, land_adj_rows: ${land_adjustments?.rows.length ?? 0}, sale_adj_rows: ${sale_adjustments?.rows.length ?? 0}`,
    );

    return {
      land_comps,
      sale_comps,
      rental_comps,
      land_adjustments,
      sale_adjustments,
      rental_adjustments,
      cost_approach,
      reconciliation,
    };
  } catch (err) {
    console.warn(
      TAG,
      `Pass 2 failed for "${sourceFileName}" (non-fatal):`,
      err instanceof Error ? err.message : err,
    );
    return empty;
  }
}

function normalizeLandComps(input: unknown): ExtractedLandComp[] {
  if (!Array.isArray(input)) return [];
  const out: ExtractedLandComp[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    out.push({
      index: numOrDefault(r.index, out.length + 1),
      address: typeof r.address === "string" ? r.address : "",
      date_of_sale: strOrNull(r.date_of_sale),
      sale_price: strOrNullUnknown(r.sale_price),
      land_size_ac: numOrNull(r.land_size_ac),
      land_size_sf: numOrNull(r.land_size_sf),
      sale_price_per_ac: numOrNull(r.sale_price_per_ac),
      sale_price_per_sf: numOrNull(r.sale_price_per_sf),      corner: boolOrNull(r.corner),
      highway_frontage: boolOrNull(r.highway_frontage),
      zoning: strOrNull(r.zoning),
      utilities: strOrNull(r.utilities),
      surface: strOrNull(r.surface),
      comments: strOrNull(r.comments),
    });
  }
  return out;
}

function normalizeSaleComps(input: unknown): ExtractedSaleComp[] {
  if (!Array.isArray(input)) return [];
  const out: ExtractedSaleComp[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    out.push({
      index: numOrDefault(r.index, out.length + 1),
      address: typeof r.address === "string" ? r.address : "",
      date_of_sale: strOrNull(r.date_of_sale),
      sale_price: strOrNullUnknown(r.sale_price),
      building_size_sf: numOrNull(r.building_size_sf),
      land_size_ac: numOrNull(r.land_size_ac),
      sale_price_per_sf: numOrNull(r.sale_price_per_sf),
      year_built: numOrNull(r.year_built),
      condition: strOrNull(r.condition),
      construction: strOrNull(r.construction),
      property_type: strOrNull(r.property_type),
      comments: strOrNull(r.comments),
    });
  }
  return out;
}

function normalizeRentalComps(input: unknown): ExtractedRentalComp[] {
  if (!Array.isArray(input)) return [];
  const out: ExtractedRentalComp[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    out.push({
      index: numOrDefault(r.index, out.length + 1),
      address: typeof r.address === "string" ? r.address : "",
      rent_per_sf_year: numOrNull(r.rent_per_sf_year),
      building_size_sf: numOrNull(r.building_size_sf),
      lease_date: strOrNull(r.lease_date),
      lease_terms: strOrNull(r.lease_terms),
      expense_structure: strOrNull(r.expense_structure),
      condition: strOrNull(r.condition),
      comments: strOrNull(r.comments),
    });
  }
  return out;
}

function normalizeAdjustmentGrid(
  input: unknown,
  defaultApproach: "land" | "sales" | "rental",
): ExtractedAdjustmentGrid | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;

  const approach =
    r.approach === "land" || r.approach === "sales" || r.approach === "rental"
      ? r.approach
      : defaultApproach;

  const rows: AdjustmentRow[] = [];
  if (Array.isArray(r.rows)) {
    for (const row of r.rows) {
      if (!row || typeof row !== "object") continue;
      const rowObj = row as Record<string, unknown>;
      const category = typeof rowObj.category === "string" ? rowObj.category : "";
      if (!category) continue;
      const comp_adjustments: AdjustmentRow["comp_adjustments"] = [];
      if (Array.isArray(rowObj.comp_adjustments)) {
        for (const adj of rowObj.comp_adjustments) {
          if (!adj || typeof adj !== "object") continue;
          const a = adj as Record<string, unknown>;
          comp_adjustments.push({
            comp_index: numOrDefault(a.comp_index, 0),
            percentage: numOrNull(a.percentage),
            dollar_amount: numOrNull(a.dollar_amount),
            rationale: strOrNull(a.rationale),
          });
        }
      }
      rows.push({ category, comp_adjustments });
    }
  }

  const total_adjustments: ExtractedAdjustmentGrid["total_adjustments"] = [];
  if (Array.isArray(r.total_adjustments)) {
    for (const ta of r.total_adjustments) {
      if (!ta || typeof ta !== "object") continue;
      const t = ta as Record<string, unknown>;
      total_adjustments.push({
        comp_index: numOrDefault(t.comp_index, 0),
        total_percent: numOrNull(t.total_percent),
        adjusted_value: numOrNull(t.adjusted_value),
      });
    }
  }

  return {
    approach,
    subject_price_unit: typeof r.subject_price_unit === "string" ? r.subject_price_unit : "",
    rows,
    total_adjustments,
  };
}

function normalizeCostApproach(input: unknown): ExtractedCostApproach | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  return {
    land_value: numOrNull(r.land_value),
    replacement_cost_new: numOrNull(r.replacement_cost_new),
    total_depreciation: numOrNull(r.total_depreciation),
    depreciation_percentage: numOrNull(r.depreciation_percentage),
    depreciated_cost: numOrNull(r.depreciated_cost),
    cost_approach_value: numOrNull(r.cost_approach_value),
  };
}

function normalizeReconciliation(input: unknown): ExtractedReconciliation | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  return {
    cost_approach_value: numOrNull(r.cost_approach_value),
    sales_comparison_value: numOrNull(r.sales_comparison_value),
    income_approach_value: numOrNull(r.income_approach_value),
    land_value: numOrNull(r.land_value),
    final_reconciled_value: numOrNull(r.final_reconciled_value),
    primary_approach: strOrNull(r.primary_approach),
  };
}

/**
 * Google Docs → Markdown often inlines every photo as `data:image/...;base64,...`
 * on single lines (reference definitions or inline URLs). That can be 10MB+
 * and exceeds Gemini input limits. Strip payloads; keep labels so `![x][image1]` still parses as “there was an image”.
 */
export function stripEmbeddedImagesFromReportMarkdown(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let strippedLines = 0;
  for (const line of lines) {
    const isDataImageLine =
      line.includes("data:image") &&
      (line.includes("base64") || line.includes("charset"));
    if (isDataImageLine) {
      strippedLines++;
      const refPrefix = /^\[[^\]]+\]:\s*/.exec(line);
      if (refPrefix) {
        out.push(`${refPrefix[0]}<embedded-image-omitted>`);
      } else {
        out.push("<!-- embedded-image-omitted -->");
      }
      continue;
    }
    out.push(line);
  }
  if (strippedLines > 0) {
    console.log(
      TAG,
      `Stripped ${strippedLines} line(s) containing embedded data:image payloads`,
    );
  }

  let joined = out.join("\n");
  // Inline `![](data:image...)` or `[text](data:image...)` if present
  joined = joined.replace(
    /!\[([^\]]*)\]\(data:image\/[^)]+\)/g,
    "![$1](<embedded-inline-image>)",
  );
  joined = joined.replace(
    /\[([^\]]+)\]\(data:image\/[^)]+\)/g,
    "[$1](<embedded-inline-image>)",
  );
  return joined;
}

const IMAGE_CELL_RE = /!\[[^\]]*\]\[[^\]]*image\d+[^\]]*\]/i;

/** Table row with only alignment dashes / colons */
function isMarkdownTableSeparatorRow(cells: string[]): boolean {
  return cells.every(
    (c) =>
      c === "" ||
      /^:?\s*-{2,}\s*:?$/.test(c) ||
      /^:?-{3,}:?$/.test(c.replace(/\s/g, "")),
  );
}

function splitMarkdownTableRow(line: string): string[] {
  const t = line.trim();
  if (!t.startsWith("|")) return [];
  const inner = t.endsWith("|") ? t.slice(1, -1) : t.slice(1);
  return inner.split("|").map((c) => c.trim());
}

function isImageTableCell(cell: string): boolean {
  return IMAGE_CELL_RE.test(cell);
}

function cleanReportPhotoLabel(raw: string): string {
  return raw
    .replace(/\\-/g, "-")
    .replace(/\\\//g, "/")
    .replace(/\u000b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts the ordered list of photo caption labels from the **SUBJECT PHOTOS** section
 * of a past-report markdown export (Google Docs style with `![][imageN]` placeholders).
 *
 * Parses until the next top-level `# ` heading (not `##`). Strips embedded images first
 * so the slice stays small. Supports:
 * - First-page rows: `| ![][imageN] | Label |`
 * - Grid rows: `| ![][imageN] | ![][imageM] |` then `| Label A | Label B |`
 */
export function parsePhotoLabelsFromReportMarkdown(mdContent: string): string[] {
  if (!mdContent.trim()) return [];

  const stripped = stripEmbeddedImagesFromReportMarkdown(mdContent);
  const headingRe = /^## \*\*SUBJECT PHOTOS\*\*[^\n]*/im;
  const hm = headingRe.exec(stripped);
  if (!hm) {
    console.log(TAG, "parsePhotoLabelsFromReportMarkdown: SUBJECT PHOTOS heading not found");
    return [];
  }

  const afterHeading = stripped.slice(hm.index + hm[0].length);
  const nextTop = /^# (?!\#)/m.exec(afterHeading);
  const section = nextTop ? afterHeading.slice(0, nextTop.index) : afterHeading;

  const labels: string[] = [];
  for (const line of section.split("\n")) {
    if (!line.trim().startsWith("|")) continue;

    const cells = splitMarkdownTableRow(line);
    if (cells.length < 2) continue;

    if (isMarkdownTableSeparatorRow(cells)) continue;

    const imageFlags = cells.map(isImageTableCell);

    if (cells.length === 2) {
      // | image | label |
      if (imageFlags[0] && !imageFlags[1]) {
        const lb = cleanReportPhotoLabel(cells[1] ?? "");
        if (lb.length > 0) labels.push(lb);
        continue;
      }
      // | image | image | — caption row follows
      if (imageFlags[0] && imageFlags[1]) continue;
      // | label | label |
      if (!imageFlags[0] && !imageFlags[1]) {
        for (const c of cells) {
          const lb = cleanReportPhotoLabel(c);
          if (lb.length > 0) labels.push(lb);
        }
        continue;
      }
      // | image | empty |
      continue;
    }

    // Rare wider rows: collect non-image non-empty cells as labels in visual order
    for (let i = 0; i < cells.length; i++) {
      if (imageFlags[i]) continue;
      const lb = cleanReportPhotoLabel(cells[i] ?? "");
      if (lb.length > 0) labels.push(lb);
    }
  }

  console.log(TAG, `parsePhotoLabelsFromReportMarkdown: extracted ${labels.length} label(s)`);
  return labels;
}

/**
 * Sends full report markdown to Gemini and returns structured extraction for DB backfill.
 */
export async function parseReportMarkdown(
  mdContent: string,
  apiKey: string,
  sourceFileName: string,
): Promise<ReportMarkdownParseResult> {
  const t0 = Date.now();
  if (!mdContent.trim()) {
    throw new Error("parseReportMarkdown: empty markdown content");
  }

  const rawCharCount = mdContent.length;
  const sanitized = stripEmbeddedImagesFromReportMarkdown(mdContent);
  const lineApprox = sanitized.split("\n").length;
  console.log(
    TAG,
    `Parsing "${sourceFileName}" — raw ${rawCharCount} chars → after image strip ${sanitized.length} chars, ~${lineApprox} lines`,
  );

  const ai = new GoogleGenAI({ apiKey });

  const userPayload = `${EXTRACTION_PROMPT}\n\n---\n\n# REPORT MARKDOWN\n\n${sanitized}`;

  const geminiT0 = Date.now();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ text: userPayload }],
    config: {
      temperature: 0.1,
      maxOutputTokens: 32768,
      responseMimeType: "application/json",
    },
  });
  const responseText = response.text ?? "";
  console.log(
    TAG,
    `Gemini completed in ${Date.now() - geminiT0}ms, response ${responseText.length} chars`,
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText) as unknown;
  } catch {
    console.error(
      TAG,
      "JSON parse failed. First 400 chars:",
      responseText.slice(0, 400),
    );
    throw new Error("parseReportMarkdown: Gemini response was not valid JSON");
  }

  const raw = parsed as Record<string, unknown>;
  const cover = normalizeCover(raw.cover);
  const subject_core =
    raw.subject_core && typeof raw.subject_core === "object"
      ? (raw.subject_core as Record<string, unknown>)
      : {};
  const improvement_analysis = normalizeImprovementAnalysis(
    raw.improvement_analysis,
  );
  const taxes = normalizeTaxes(raw.taxes);
  const tax_entities = normalizeTaxEntities(raw.tax_entities);
  const fema = normalizeFema(raw.fema);
  const sections = normalizeSections(raw.sections);

  const pass1Ms = Date.now() - geminiT0;
  console.log(
    TAG,
    `Pass 1 done in ${pass1Ms}ms — sections with text: ${countNonEmptySections(sections)}, improvement rows: ${improvement_analysis.length}`,
  );

  // Pass 2: extract structured comp/adjustment/cost/reconciliation data.
  // Runs sequentially after Pass 1 to avoid hitting Gemini rate limits.
  // On failure, returns safe empty defaults — Pass 1 results are never blocked.
  const pass2T0 = Date.now();
  const pass2 = await extractCompAndValuationData(sanitized, apiKey, sourceFileName);
  const pass2Ms = Date.now() - pass2T0;

  console.log(
    TAG,
    `Done in ${Date.now() - t0}ms — Pass 1: ${pass1Ms}ms, Pass 2: ${pass2Ms}ms`,
  );

  return {
    cover,
    subject_core,
    improvement_analysis,
    taxes,
    tax_entities,
    fema,
    sections,
    ...pass2,
  };
}

function normalizeCover(input: unknown): ReportCoverExtraction {
  const empty: ReportCoverExtraction = {
    client_name: null,
    client_company: null,
    effective_date: null,
    report_date: null,
    property_address: null,
    final_value: null,
    property_rights: null,
    property_type: null,
  };
  if (!input || typeof input !== "object") return empty;
  const o = input as Record<string, unknown>;
  return {
    client_name: strOrNull(o.client_name),
    client_company: strOrNull(o.client_company),
    effective_date: strOrNull(o.effective_date),
    report_date: strOrNull(o.report_date),
    property_address: strOrNull(o.property_address),
    final_value: strOrNull(o.final_value),
    property_rights: strOrNull(o.property_rights),
    property_type: strOrNull(o.property_type),
  };
}

const ALLOWED_IMPROVEMENT_CATEGORIES = new Set<string>([
  "Improvement Characteristics",
  "Ratios & Parking",
  "Age/Life",
  "Structural Characteristics",
  "Interior Characteristics",
  "Mechanical Systems",
  "Site Improvements",
  "Legal/Conforming Status",
]);

function normalizeImprovementAnalysis(input: unknown): ImprovementAnalysisRow[] {
  if (!Array.isArray(input)) return [];
  const out: ImprovementAnalysisRow[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label : "";
    let category =
      typeof r.category === "string" ? r.category : "Improvement Characteristics";
    if (!ALLOWED_IMPROVEMENT_CATEGORIES.has(category)) {
      const mapped = category.replace(/\s*\/\s*/g, "/").trim();
      if (mapped === "Age / Life" || mapped === "Age/Life")
        category = "Age/Life";
      else if (!ALLOWED_IMPROVEMENT_CATEGORIES.has(category))
        category = "Improvement Characteristics";
    }
    const include = typeof r.include === "boolean" ? r.include : true;
    const rawVal = r.value;
    const value =
      typeof rawVal === "string"
        ? rawVal
        : rawVal === null || rawVal === undefined
          ? ""
          : typeof rawVal === "number" || typeof rawVal === "boolean"
            ? String(rawVal)
            : JSON.stringify(rawVal);
    if (!label && !value) continue;
    out.push({
      label,
      category: category as ImprovementCategory,
      include,
      value,
    });
  }
  return out;
}

function normalizeTaxes(input: unknown): SubjectTax[] {
  if (!Array.isArray(input)) return [];
  const out: SubjectTax[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const Entity = typeof r.Entity === "string" ? r.Entity : "";
    const Amount = typeof r.Amount === "number" ? r.Amount : Number(r.Amount);
    if (!Entity || Number.isNaN(Amount)) continue;
    out.push({ Entity, Amount });
  }
  return out;
}

function normalizeTaxEntities(input: unknown): TaxEntity[] {
  if (!Array.isArray(input)) return [];
  const out: TaxEntity[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const Entity = typeof r.Entity === "string" ? r.Entity : "";
    const Rate = typeof r.Rate === "number" ? r.Rate : Number(r.Rate);
    if (!Entity || Number.isNaN(Rate)) continue;
    out.push({ Entity, Rate });
  }
  return out;
}

function normalizeFema(input: unknown): FemaData {
  const empty: FemaData = {};
  if (!input || typeof input !== "object") return empty;
  const o = input as Record<string, unknown>;
  return {
    FemaMapNum: strOrNull(o.FemaMapNum),
    FemaZone: strOrNull(o.FemaZone),
    FemaIsHazardZone:
      typeof o.FemaIsHazardZone === "boolean"
        ? o.FemaIsHazardZone
        : o.FemaIsHazardZone === null
          ? null
          : undefined,
    FemaMapDate: strOrNull(o.FemaMapDate),
  };
}

function normalizeSections(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const o =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  for (const key of REPORT_MD_SECTION_KEYS) {
    const v = o[key];
    out[key] = typeof v === "string" ? v : "";
  }
  return out;
}

function countNonEmptySections(sections: Record<string, string>): number {
  return Object.values(sections).filter((s) => s.trim().length > 0).length;
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/**
 * Like strOrNull but also handles numeric sale_price values (e.g. 510000 → "510000").
 * Avoids no-base-to-string lint errors when stringifying unknown values.
 */
function strOrNullUnknown(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return String(v);
  return null;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,%\s]/g, "");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function numOrDefault(v: unknown, fallback: number): number {
  const n = numOrNull(v);
  return n ?? fallback;
}

function boolOrNull(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const lower = v.toLowerCase().trim();
    if (lower === "yes" || lower === "true") return true;
    if (lower === "no" || lower === "false") return false;
  }
  return null;
}

/** Merge AI patch into minimal valid subject core defaults for reference projects. */
export function normalizeSubjectCoreForDb(
  patch: Record<string, unknown>,
  cover: ReportCoverExtraction,
): Record<string, unknown> {
  const patchAddr =
    typeof patch.Address === "string" ? patch.Address.trim() : "";
  const addr =
    patchAddr.length > 0
      ? patchAddr
      : (cover.property_address?.trim() ?? "");

  const city =
    typeof patch.City === "string" && patch.City.length > 0
      ? patch.City
      : "";
  const state =
    typeof patch.State === "string" && patch.State.length > 0
      ? patch.State
      : "TX";
  const zip =
    typeof patch.Zip === "string" && patch.Zip.length > 0 ? patch.Zip : "";
  const county =
    typeof patch.County === "string" && patch.County.length > 0
      ? patch.County
      : "";

  const defaults: Record<string, unknown> = {
    Address: addr,
    Type: patch.Type ?? "Improvements",
    APN: patch.APN ?? null,
    Legal: patch.Legal ?? null,
    "Property Rights": patch["Property Rights"] ?? "Fee Simple",
    instrumentNumber: patch.instrumentNumber ?? null,
    "Date of Sale": patch["Date of Sale"] ?? "Current",
    "Market Conditions": patch["Market Conditions"] ?? null,
    "Land Size (AC)": patch["Land Size (AC)"] ?? null,
    "Land Size (SF)": patch["Land Size (SF)"] ?? null,
    "Parking (SF)": patch["Parking (SF)"] ?? null,
    "Building Size (SF)": patch["Building Size (SF)"] ?? null,
    "Office Area (SF)": patch["Office Area (SF)"] ?? null,
    "Warehouse Area (SF)": patch["Warehouse Area (SF)"] ?? null,
    "Office %": patch["Office %"] ?? null,
    "Land / Bld Ratio": patch["Land / Bld Ratio"] ?? null,
    "Total Taxes": patch["Total Taxes"] ?? null,
    City: city,
    State: state,
    County: county,
    Zip: zip,
    AddressLabel: patch.AddressLabel ?? null,
    AddressLocal: patch.AddressLocal ?? null,
    "Zoning Area": parseZoningLocation(patch["Zoning Area"]) ?? null,
    "Zoning Description": patch["Zoning Description"] ?? "",
    Zoning: patch.Zoning ?? null,
    "Other Features": patch["Other Features"] ?? null,
    Hoisting: patch.Hoisting ?? null,
    "Wash Bay": patch["Wash Bay"] ?? null,
    Corner: patch.Corner ?? false,
    "Highway Frontage": patch["Highway Frontage"] ?? false,
    "Utils - Electricity": patch["Utils - Electricity"] ?? null,
    "Utils - Water": patch["Utils - Water"] ?? null,
    "Utils - Sewer": patch["Utils - Sewer"] ?? null,
    Surface: patch.Surface ?? null,
    Construction: patch.Construction ?? null,
    Condition: patch.Condition ?? "Average",
    "Year Built": patch["Year Built"] ?? null,
    Age: patch.Age ?? null,
    "Effective Age": patch["Effective Age"] ?? null,
    "Est Insurance": patch["Est Insurance"] ?? null,
    "Est Expences": patch["Est Expences"] ?? null,
  };

  const merged: Record<string, unknown> = { ...defaults, ...patch, Address: addr };
  merged["Zoning Area"] = parseZoningLocation(merged["Zoning Area"]);
  return merged;
}
