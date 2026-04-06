/**
 * Export builder for the AppScript JSON importer.
 *
 * Transforms DB row shapes (SubjectDataRow, CompParsedDataRow) into the
 * OutputData structure consumed by:
 * https://github.com/dougiefresh49/appraisal-bot/blob/main/app-scripts/apbot-report-data/drive-importer/json-parser.js
 *
 * Generated fields (formula-computed in the spreadsheet) are stripped so that
 * the sheet formulas calculate them after import.
 */

import type {
  OutputData,
  LandSaleData,
  SaleData,
  RentalData,
  SubjectData,
  ParcelData,
  ParcelImprovement,
  SubjectDataRow,
  CompParsedDataRow,
} from "~/types/comp-data";

// ---------------------------------------------------------------------------
// Generated field maps
// Source of truth: docs/report-data-spreadsheet/parser-type-defs.md
// These fields have type "Generated" in the type defs and are formula-computed
// in the spreadsheet — they must be omitted from the export.
// ---------------------------------------------------------------------------

const LAND_GENERATED_FIELDS: ReadonlySet<string> = new Set([
  "Market Conditions",
  "Sale Price / AC",
  "Sale Price / SF",
  "Verification",
]);

const SALE_GENERATED_FIELDS: ReadonlySet<string> = new Set([
  "Market Conditions",
  "Sale Price / SF",
  "Sale Price / SF (Adj)",
  "Improvements / SF",
  "Office %",
  "Warehouse %",
  "Effective Age",
  "Rent / SF",
  "Potential Gross Income",
  "Verification",
]);

const RENTAL_GENERATED_FIELDS: ReadonlySet<string> = new Set([
  "Office %",
  "Rent / SF / Year",
  "Effective Age",
  "Verification",
]);

const SUBJECT_GENERATED_FIELDS: ReadonlySet<string> = new Set([
  "APN",
  "Legal",
  "Market Conditions",
  "Rent / SF / Year",
  "Land Size (AC)",
  "Land Size (SF)",
  "Parking (SF)",
  "Parking Ratio",
  "Building Size (SF)",
  "Office Area (SF)",
  "Warehouse Area (SF)",
  "Office %",
  "Floor Area Ratio",
  "Land / Bld Ratio",
  "Total Taxes",
  "County Appraised Value",
  "AddressLabel",
  "AddressLocal",
  "Zoning",
  "Year Built",
  "Age",
  "Effective Age",
  "Est Insurance",
  "Est Expences",
  "Size Multiplier",
]);

// ---------------------------------------------------------------------------
// Section types and labels
// ---------------------------------------------------------------------------

export type ExportSection = keyof OutputData;

/** Human-readable label mapping section key → spreadsheet tab name */
export const EXPORT_SECTION_LABELS: Record<ExportSection, string> = {
  landSaleData: "Land Comps → land comps",
  saleData: "Sales Comps → sale comps",
  rentalData: "Rental Comps → rental comps",
  parcelData: "Parcels → comp-parcels",
  parcelImprovements: "Parcel Improvements → comp-parcel-improvements",
  subject: "Subject → subject",
  subjectTaxes: "Subject Taxes → subject-taxes",
  taxEntities: "Tax Entities → report-inputs",
};

/** Ordered list for display */
export const EXPORT_SECTION_ORDER: ExportSection[] = [
  "subject",
  "subjectTaxes",
  "taxEntities",
  "landSaleData",
  "saleData",
  "rentalData",
  "parcelData",
  "parcelImprovements",
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function stripGenerated(
  data: Record<string, unknown>,
  generatedFields: ReadonlySet<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!generatedFields.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

function stripInternalKeys(
  rawData: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawData)) {
    if (!key.startsWith("_")) {
      result[key] = value;
    }
  }
  return result;
}

function extractCompParcels(rawData: Record<string, unknown>): ParcelData[] {
  const parcels = rawData._parcelData;
  if (!Array.isArray(parcels)) return [];
  return parcels as ParcelData[];
}

function extractCompImprovements(
  rawData: Record<string, unknown>,
): ParcelImprovement[] {
  const improvements = rawData._parcelImprovements;
  if (!Array.isArray(improvements)) return [];
  return improvements as ParcelImprovement[];
}

function mapCompRawDataToExport(
  rawData: Record<string, unknown>,
  generatedFields: ReadonlySet<string>,
  index: number,
): Record<string, unknown> {
  const clean = stripInternalKeys(rawData);
  const stripped = stripGenerated(clean, generatedFields);
  stripped["#"] ??= index + 1;
  return stripped;
}

// ---------------------------------------------------------------------------
// Main export builder
// ---------------------------------------------------------------------------

export interface BuildOutputDataOptions {
  subjectDataRow: SubjectDataRow | null;
  compParsedDataRows: CompParsedDataRow[];
  selectedSections: Set<ExportSection>;
  /** The comp type stored on the comparables table */
  compType?: "Land" | "Sales" | "Rentals";
}

export function buildOutputData(
  options: BuildOutputDataOptions,
): Partial<OutputData> {
  const { subjectDataRow, compParsedDataRows, selectedSections, compType } =
    options;

  const result: Partial<OutputData> = {};

  // --- Land sale data ---
  if (selectedSections.has("landSaleData") && compType === "Land") {
    result.landSaleData = compParsedDataRows.map((row, i) => {
      const raw = row.raw_data as Record<string, unknown>;
      return mapCompRawDataToExport(
        raw,
        LAND_GENERATED_FIELDS,
        i,
      ) as unknown as LandSaleData;
    });
  }

  // --- Sale data ---
  if (selectedSections.has("saleData") && compType === "Sales") {
    result.saleData = compParsedDataRows.map((row, i) => {
      const raw = row.raw_data as Record<string, unknown>;
      return mapCompRawDataToExport(
        raw,
        SALE_GENERATED_FIELDS,
        i,
      ) as unknown as SaleData;
    });
  }

  // --- Rental data ---
  if (selectedSections.has("rentalData") && compType === "Rentals") {
    result.rentalData = compParsedDataRows.map((row, i) => {
      const raw = row.raw_data as Record<string, unknown>;
      return mapCompRawDataToExport(
        raw,
        RENTAL_GENERATED_FIELDS,
        i,
      ) as unknown as RentalData;
    });
  }

  // --- Subject ---
  if (selectedSections.has("subject") && subjectDataRow) {
    const core = subjectDataRow.core as Record<string, unknown>;
    const stripped = stripGenerated(core, SUBJECT_GENERATED_FIELDS);
    result.subject = [stripped as unknown as SubjectData];
  }

  // --- Subject taxes ---
  if (selectedSections.has("subjectTaxes") && subjectDataRow) {
    result.subjectTaxes = subjectDataRow.taxes ?? [];
  }

  // --- Tax entities ---
  if (selectedSections.has("taxEntities") && subjectDataRow) {
    result.taxEntities = subjectDataRow.tax_entities ?? [];
  }

  // Determine whether comp type data is included (drives parcel sourcing)
  const compDataSelected =
    (selectedSections.has("landSaleData") && compType === "Land") ||
    (selectedSections.has("saleData") && compType === "Sales") ||
    (selectedSections.has("rentalData") && compType === "Rentals");

  const subjectSelected =
    selectedSections.has("subject") && subjectDataRow != null;

  // --- Parcel data ---
  if (selectedSections.has("parcelData")) {
    const parcels: ParcelData[] = [];
    if (subjectSelected) {
      parcels.push(...(subjectDataRow.parcels ?? []));
    }
    if (compDataSelected) {
      for (const row of compParsedDataRows) {
        const raw = row.raw_data as Record<string, unknown>;
        parcels.push(...extractCompParcels(raw));
      }
    }
    result.parcelData = parcels;
  }

  // --- Parcel improvements ---
  if (selectedSections.has("parcelImprovements")) {
    const improvements: ParcelImprovement[] = [];
    if (subjectSelected) {
      improvements.push(...(subjectDataRow.improvements ?? []));
    }
    if (compDataSelected) {
      for (const row of compParsedDataRows) {
        const raw = row.raw_data as Record<string, unknown>;
        improvements.push(...extractCompImprovements(raw));
      }
    }
    result.parcelImprovements = improvements;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Default section selections by context
// ---------------------------------------------------------------------------

export function defaultSelectedSections(
  context: "subject" | "land" | "sales" | "rentals",
): Set<ExportSection> {
  switch (context) {
    case "subject":
      return new Set<ExportSection>([
        "subject",
        "subjectTaxes",
        "taxEntities",
        "parcelData",
        "parcelImprovements",
      ]);
    case "land":
      return new Set<ExportSection>([
        "landSaleData",
        "parcelData",
        "parcelImprovements",
      ]);
    case "sales":
      return new Set<ExportSection>([
        "saleData",
        "parcelData",
        "parcelImprovements",
      ]);
    case "rentals":
      return new Set<ExportSection>([
        "rentalData",
        "parcelData",
        "parcelImprovements",
      ]);
  }
}

// ---------------------------------------------------------------------------
// Context → ComparableType mapping
// ---------------------------------------------------------------------------

export function contextToCompType(
  context: "subject" | "land" | "sales" | "rentals",
): "Land" | "Sales" | "Rentals" | undefined {
  switch (context) {
    case "land":
      return "Land";
    case "sales":
      return "Sales";
    case "rentals":
      return "Rentals";
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// File naming helpers
// ---------------------------------------------------------------------------

export function exportTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export function exportFileName(): string {
  return `parsed-export-${exportTimestamp()}.json`;
}
