/**
 * Centralized, gem-aligned parsing prompts for Gemini extraction.
 *
 * Based on: docs/n8n/gemini-node-prompts/extract-realestate-data-parser.md
 * Type defs: docs/report-data-spreadsheet/parser-type-defs.md
 *
 * Use gemini-3.1-pro-preview for these prompts (thinking model).
 */

import type { CompType } from "~/types/comp-data";

const TYPE_DEFINITIONS = `
// --- UTILITY TYPES ---
type Generated = "GENERATED" | "BLANK" | null;
type Condition = "Good" | "Average" | "Fair" | "Poor";
type YesNoUnknown = boolean | null;

// --- ENUMERATED TYPES ---
type UseType = "Sale" | "Extra" | "Rental";
type SubjectParcelType = "Improvements" | "Excess Land";
type ZoningLocation = "Inside City Limits" | "Inside & Outside City Limits" | "Inside ETJ" | "Outside ETJ" | "None";
type ExpenceStructure = "NNN" | "NN" | "N" | "None";
type TenantStructure = "Individual" | "Multiple";
type VerificationType = "Appraiser" | "Broker" | "Realtor" | "Crexi" | "MLS/CAD/Deeds" | "Other" | "Buyer" | "Seller" | "Owner";
type UtilsWater = "Public" | "Well" | "None";
type UtilsSewer = "Public" | "Septic" | "None";
type LandSurface = "Cleared" | "Caliche" | "Raw";
type HvacOptions = "Yes" | "Office Only" | "No";

interface LandSaleData {
  "#": number;
  Address: string;
  "Use Type": UseType;
  Grantor: string;
  Grantee: string;
  Recording: string;
  "Date of Sale": string;
  "Market Conditions": Generated;
  "Sale Price": string;
  "Financing Terms": string;
  "Property Rights": string;
  "Conditions of Sale": string;
  "Sale Price / AC": Generated;
  "Sale Price / SF": Generated;
  "Land Size (AC)": number | null;
  "Land Size (SF)": number | null;
  APN: string | null;
  Legal: string | null;
  Corner: boolean;
  "Highway Frontage": boolean;
  "Utils - Electricity": YesNoUnknown;
  "Utils - Water": UtilsWater | null;
  "Utils - Sewer": UtilsSewer | null;
  Surface: LandSurface | null;
  "Zoning Location": string;
  "Zoning Description": string;
  Zoning: string | null;
  Taxes: number | null;
  "MLS #": string | null;
  "Verification Type": VerificationType | null;
  "Verified By": string | null;
  Verification: Generated;
  Comments: string | null;
}

interface SaleData {
  "#": number;
  Address: string;
  "Use Type": UseType;
  Grantor: string;
  Grantee: string;
  Recording: string;
  "Date of Sale": string;
  "Market Conditions": Generated;
  "Sale Price": string;
  "Financing Terms": string;
  "Property Rights": string;
  "Conditions of Sale": string;
  "Sale Price / SF": Generated;
  "Improvements / SF": Generated;
  "Land Size (AC)": number | null;
  "Land Size (SF)": number | null;
  "Land Value": number | null;
  APN: string | null;
  Legal: string | null;
  "Building Size (SF)": number | null;
  "Occupancy %": string | null;
  "Land / Bld Ratio": number | null;
  "Property Type": string | null;
  Construction: string | null;
  "Other Features": string | null;
  "Parking (SF)": number | null;
  Buildings: number | null;
  "Year Built": number | string | null;
  "Effective Age": Generated;
  Condition: Condition | null;
  HVAC: HvacOptions;
  "Overhead Doors": string | null; // format: WxH (xQuantity). Ex: 14x12 (x6)
  "Wash Bay": YesNoUnknown;
  Hoisting: string | null; // None, Unknown, or xT. Multiple: 2T (x2), 5T (x3)
  "Zoning Location": string;
  "Zoning Description": string;
  Zoning: string | null;
  "Rent / SF": Generated;
  "Potential Gross Income": Generated;
  "Vacancy %": string;
  Vacancy: string | null;
  "Effective Gross Income": string | null;
  Taxes: string | null;
  Insurance: string | null;
  Expenses: string | null;
  "Net Operating Income": string | null;
  "Overall Cap Rate": string | null;
  GPI: string | null;
  "Gross Income Multiplier": number | null;
  "Potential Value": string | null;
  "MLS #": string | null;
  "Verification Type": VerificationType | null;
  "Verified By": string | null;
  Verification: Generated;
  Comments: string | null;
}

interface RentalData {
  "#": number;
  Address: string;
  "Use Type": string;
  Lessor: string;
  Tenant: string | null;
  Recording: string | null;
  APN: string | null;
  Legal: string | null;
  "Zoning Location": ZoningLocation;
  "Zoning Description": string;
  Zoning: string | null;
  "Land Size (AC)": number | null;
  "Land Size (SF)": number | null;
  "Rentable SF": number | null;
  "Office %": Generated;
  "Land / Bld Ratio": number | null;
  "Occupancy %": string;
  "Property Type": string;
  "Lease Start": string | null;
  "Rent / Month Start": number;
  "Lease Term": string | null;
  "% Increase / Year": number;
  "Rent / Month": number | null;
  "Expense Structure": ExpenceStructure;
  "Rent / SF / Year": Generated;
  "Tenant Structure": TenantStructure;
  "Year Built": number | null;
  Age: number | null;
  "Effective Age": Generated;
  Condition: Condition;
  HVAC: HvacOptions;
  "Overhead Doors": string | null; // format: WxH (xQuantity). Ex: 14x12 (x6)
  "Wash Bay": YesNoUnknown;
  Hoisting: string | null; // None, Unknown, or xT. Multiple: 2T (x2), 5T (x3)
  Construction: string | null;
  "Other Features": string;
  "MLS #": string | null;
  "Verification Type": VerificationType | null;
  "Verified By": string | null;
  Verification: Generated;
  Comments: string;
}

interface ParcelData {
  instrumentNumber: string | null;
  APN: string;
  "APN Link": string;
  Location: string;
  Legal: string;
  "Lot #": string | null;
  "Size (AC)": number | null;
  "Size (SF)": number | null;
  "Building Size (SF)": number | null;
  "Parking (SF)": number | null;
  "Storage Area (SF)": number | null;
  Buildings: number | null;
  "Total Tax Amount": string | null;
  "County Appraised Value"?: string;
}

interface ParcelImprovement {
  instrumentNumber: string | null;
  APN: string;
  "Building #": number;
  "Section #": number;
  "Year Built": number | null;
  "Gross Building Area (SF)": number | null;
  "Office Area (SF)": number | null;
  "Warehouse Area (SF)": number | null;
  "Parking (SF)": number | null;
  "Storage Area (SF)": number | null;
  "Is GLA": boolean;
  Construction: string;
  Comments: string | null;
}
`.trim();

const OPERATIONAL_RULES = `
## Data Handling Rules

1. **Generated/BLANK fields**: Any field typed as \`Generated\` must be set to \`null\`. Do not output "N/A", "GENERATED", or "BLANK" as strings.

2. **YesNoUnknown fields**: Return \`true\` for yes, \`false\` for no, \`null\` if unknown or not mentioned. These include: Corner, Highway Frontage, Utils - Electricity, Wash Bay.

3. **Calculated fields**: If Land Size (AC) is available, calculate Land Size (SF) = acres * 43560. For Age, calculate as the current year minus Year Built. For Land / Bld Ratio, calculate as Land Size (SF) / Building Size (SF). All other Generated fields should be null.

4. **Overhead Doors format**: If the size is known, use the format WxH (xQuantity). Example: "14x12 (x6)".

5. **Hoisting format**: Use "None" if no cranes. Otherwise: "xT" where x is tonnage. Multiple: "2T (x2), 5T (x3)". Include type: "5T Overhead, 3T Jib (x2)".

6. **Dates**: Format as "Mon DD, YYYY" (e.g., "Jun 17, 2025"). For subjects, Date of Sale is always "Current".

7. **Sale Prices**: Include $ and commas for string price fields (e.g., "$700,000"). Numeric fields like Taxes should be plain numbers.

8. **Zoning Location**: Must be one of the enum values. Default to "None" if unknown.

9. **Parking**: Always include parking improvements (paved lots, asphalt) in parcelImprovements with Is GLA = false.

10. **Canopies/Awnings**: Do NOT include canopies, carports, or awnings in parcelImprovements unless specifically instructed.

11. **User-provided data**: Always prioritize data explicitly provided in the prompt over document data. Note the source in Comments.

12. **Combining parcels**: If multiple parcels for one property, sum numerical values (Land Size, Building Size, Parking SF, Taxes) and concatenate strings (APN with " & ", Legal descriptions).

13. **Unknown values**: Return null, not empty strings. Exception: string fields that are part of a required structure can be "".

14. **Address**: Full address including city, state, zip. Format: "123 Main St, Odessa, TX 79766".
`.trim();

const COMP_TYPE_LABELS: Record<CompType, string> = {
  land: "Land Sale",
  sales: "Sale (improved property)",
  rentals: "Rental",
};

const COMP_INTERFACE: Record<CompType, string> = {
  land: "LandSaleData",
  sales: "SaleData",
  rentals: "RentalData",
};

/**
 * Build the full extraction prompt for a single comp parse.
 * Returns the comp data object + associated parcel data + parcel improvements.
 */
export function buildCompExtractionPrompt(
  type: CompType,
  extraContext?: string,
): string {
  const label = COMP_TYPE_LABELS[type];
  const iface = COMP_INTERFACE[type];

  return `You are an expert commercial real estate appraisal data parser.

Your task is to extract structured data from the attached document(s) for a **${label} comparable**. The documents may include deeds, CAD records, MLS listings, CoreLogic files, tax records, or other property records.

Return a JSON object with this structure:
{
  "compData": ${iface},
  "parcelData": ParcelData[],
  "parcelImprovements": ParcelImprovement[]
}

## Type Definitions

\`\`\`typescript
${TYPE_DEFINITIONS}
\`\`\`

${OPERATIONAL_RULES}

## Specific Instructions

- Set "#" to 1 (this is the first/only comp being extracted in this run).
- The "compData" object must conform to the ${iface} interface exactly.
- Create one ParcelData entry per parcel associated with this property.
- Create one ParcelImprovement entry per building/improvement on each parcel. Set "Is GLA" to true for the main building(s) and false for non-GLA items (parking, storage, etc.).
- Link parcelData and parcelImprovements to the comp via the "instrumentNumber" field (use the recording/instrument number from the deed).
${extraContext ? `\n## Additional Context from User\n${extraContext}` : ""}

Return ONLY the JSON object. No markdown code fences, no explanation.`;
}

/**
 * Build extraction prompt for subject property documents.
 */
export function buildSubjectExtractionPrompt(
  extraContext?: string,
): string {
  return `You are an expert commercial real estate appraisal data parser.

Your task is to extract structured data about the **subject property** from the attached document(s). These may include CAD records, deed records, tax documents, field notes, building sketches, or engagement letters.

Return a JSON object with this structure:
{
  "subject": SubjectData,
  "parcelData": ParcelData[],
  "parcelImprovements": ParcelImprovement[],
  "subjectTaxes": SubjectTax[],
  "taxEntities": TaxEntity[]
}

Where SubjectTax is: { Entity: string, Amount: number }
And TaxEntity is: { Entity: string, Rate: number }

## Type Definitions

\`\`\`typescript
${TYPE_DEFINITIONS}

interface SubjectData {
  Address: string;
  Type: SubjectParcelType;
  APN: string | null;
  Legal: string | null;
  "Property Rights": string;
  instrumentNumber: string | null;
  "Date of Sale": string; // always "Current" for subject
  "Market Conditions": Generated;
  "Land Size (AC)": number | null;
  "Land Size (SF)": number | null;
  "Parking (SF)": number | null;
  "Building Size (SF)": number | null;
  "Office Area (SF)": Generated;
  "Warehouse Area (SF)": Generated;
  "Office %": Generated;
  "Land / Bld Ratio": number | null;
  "Total Taxes": number | null;
  City: string;
  State: string;
  County: string;
  Zip: string;
  AddressLabel: Generated;
  AddressLocal: Generated;
  "Zoning Area": string;
  "Zoning Description": string;
  Zoning: string | null;
  "Other Features": string | null;
  Hoisting: YesNoUnknown;
  "Wash Bay": YesNoUnknown;
  Corner: boolean;
  Frontage: "Highway" | "Main" | "Secondary" | "Dirt" | "None" | "Yes" | "No" | null;
  "Utils - Electricity": YesNoUnknown;
  "Utils - Water": UtilsWater | null;
  "Utils - Sewer": UtilsSewer | null;
  Surface: LandSurface | null;
  Construction: string | null;
  Condition: Condition;
  /** One year per building, comma-separated, e.g. "2021, 2010" — also a single number is allowed */
  "Year Built": number | string | null;
  /** When true, Age is explicit; otherwise omit Age (computed from Year Built) */
  "Age Override"?: boolean;
  Age: number | null;
  "Effective Age": Generated | number | null;
  "Est Insurance": number | null;
  "Est Expences": number | null;
}
\`\`\`

${OPERATIONAL_RULES}

## Specific Instructions

- "Date of Sale" for the subject is always "Current".
- If tax data is available, populate subjectTaxes (individual entity amounts) and taxEntities (entity + rate).
- Create ParcelData and ParcelImprovement entries for every parcel and building on the subject.
- Set "Is GLA" appropriately: true for main buildings (heated/usable space), false for canopies, parking, storage.
${extraContext ? `\n## Additional Context from User\n${extraContext}` : ""}

Return ONLY the JSON object. No markdown code fences, no explanation.`;
}
