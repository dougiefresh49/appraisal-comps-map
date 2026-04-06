// ============================================================
// Utility Types
// ============================================================

export type Generated = "GENERATED" | "BLANK" | null;

export type Condition = "Good" | "Average" | "Fair" | "Poor";

export type YesNoUnknown = boolean | null;

export type UseType = "Sale" | "Extra" | "Rental";

export type SubjectParcelType = "Improvements" | "Excess Land";

export type ZoningLocation =
  | "Inside City Limits"
  | "Inside & Outside City Limits"
  | "Inside ETJ"
  | "Outside ETJ"
  | "None";

export type ExpenseStructure = "NNN" | "NN" | "N" | "None";

export type TenantStructure = "Individual" | "Multiple";

export type VerificationType =
  | "Appraiser"
  | "Broker"
  | "Realtor"
  | "Crexi"
  | "MLS/CAD/Deeds"
  | "Other"
  | "Buyer"
  | "Seller"
  | "Owner";

export type UtilsWater = "Public" | "Well" | "None";

export type UtilsSewer = "Public" | "Septic" | "None";

export type LandSurface = "Cleared" | "Caliche" | "Raw";

export type HvacOptions = "Yes" | "Office Only" | "No";

export type CompType = "land" | "sales" | "rentals";

export type ParsedDataStatus = "none" | "processing" | "parsed" | "error";

// ============================================================
// Main Output Structure
// ============================================================

export interface OutputData {
  landSaleData: LandSaleData[];
  saleData: SaleData[];
  rentalData: RentalData[];
  parcelData: ParcelData[];
  parcelImprovements: ParcelImprovement[];
  subject: SubjectData[];
  subjectTaxes: SubjectTax[];
  taxEntities: TaxEntity[];
}

// ============================================================
// Land Sale Data
// ============================================================

export interface LandSaleData {
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

// ============================================================
// Sale Data
// ============================================================

export interface SaleData {
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
  "Overhead Doors": string | null;
  "Wash Bay": YesNoUnknown;
  Hoisting: string | null;
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

// ============================================================
// Rental Data
// ============================================================

export interface RentalData {
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
  "Expense Structure": ExpenseStructure;
  "Rent / SF / Year": Generated;
  "Tenant Structure": TenantStructure;
  "Year Built": number | null;
  Age: number | null;
  "Effective Age": Generated;
  Condition: Condition;
  HVAC: HvacOptions;
  "Overhead Doors": string | null;
  "Wash Bay": YesNoUnknown;
  Hoisting: string | null;
  Construction: string | null;
  "Other Features": string;
  "MLS #": string | null;
  "Verification Type": VerificationType | null;
  "Verified By": string | null;
  Verification: Generated;
  Comments: string;
}

// ============================================================
// Subject Data
// ============================================================

export interface SubjectData {
  Address: string;
  Type: SubjectParcelType;
  APN: string | null;
  Legal: string | null;
  "Property Rights": string;
  instrumentNumber: string | null;
  "Date of Sale": string;
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
  "Highway Frontage": boolean;
  "Utils - Electricity": YesNoUnknown;
  "Utils - Water": UtilsWater | null;
  "Utils - Sewer": UtilsSewer | null;
  Surface: LandSurface | null;
  Construction: string | null;
  Condition: Condition;
  "Year Built": number | null;
  Age: number | null;
  "Effective Age": Generated;
  "Est Insurance": number | null;
  "Est Expences": number | null;
}

// ============================================================
// Parcel Data
// ============================================================

export interface ParcelData {
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

// ============================================================
// Parcel Improvement
// ============================================================

export interface ParcelImprovement {
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

// ============================================================
// Tax Types
// ============================================================

export interface SubjectTax {
  Entity: string;
  Amount: number;
}

export interface TaxEntity {
  Entity: string;
  Rate: number;
}

// ============================================================
// Improvement Analysis (subject_data.improvement_analysis)
// ============================================================

export type ImprovementCategory =
  | "Improvement Characteristics"
  | "Ratios & Parking"
  | "Age/Life"
  | "Structural Characteristics"
  | "Interior Characteristics"
  | "Mechanical Systems"
  | "Site Improvements"
  | "Legal/Conforming Status";

/** One row in subject_data.improvement_analysis (spreadsheet-style). */
export interface ImprovementAnalysisRow {
  label: string;
  category: ImprovementCategory;
  include: boolean;
  value: string;
}

// ============================================================
// FEMA Flood Data (subject_data.fema)
// ============================================================

export interface FemaData {
  FemaMapNum?: string | null;
  FemaZone?: string | null;
  FemaIsHazardZone?: boolean | null;
  FemaMapDate?: string | null;
}

// ============================================================
// Supabase Row Types
// ============================================================

export interface CompParsedDataRow {
  id: string;
  comp_id: string | null;
  project_id: string | null;
  raw_data: LandSaleData | SaleData | RentalData | Record<string, unknown>;
  source: string;
  parsed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubjectDataRow {
  id: string;
  project_id: string;
  core: SubjectData | Record<string, unknown>;
  fema: FemaData;
  taxes: SubjectTax[];
  tax_entities: TaxEntity[];
  parcels: ParcelData[];
  improvements: ParcelImprovement[];
  improvement_analysis?: ImprovementAnalysisRow[] | null;
  updated_at: string;
}
