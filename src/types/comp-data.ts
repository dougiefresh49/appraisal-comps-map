// ============================================================
// Utility Types
// ============================================================

import type {
  FrontageType,
  ZoningLocation,
  HasFencing,
  FenceType,
  UtilitiesStatus,
  OverallLocation,
} from "./comp-field-options";

export type { ZoningLocation } from "./comp-field-options";

export type Generated = "GENERATED" | "BLANK" | null;

export type Condition = "Good" | "Average" | "Fair" | "Poor";

export type YesNoUnknown = boolean | null;

export type UseType = "Sale" | "Extra" | "Rental";

export type SubjectParcelType = "Improvements" | "Excess Land";

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
  Frontage: FrontageType | null;
  "Has Fencing": HasFencing | null;
  "Fence Type": FenceType | null;
  Fencing: string | null;
  "Utils - Electricity": YesNoUnknown;
  "Utils - Water": UtilsWater | null;
  "Utils - Sewer": UtilsSewer | null;
  Utilities: UtilitiesStatus | null;
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
  "Adj Sale Price": Generated;
  "Financing Terms": string;
  "Property Rights": string;
  "Conditions of Sale": string;
  "Renovation Cost": number | null;
  "Sale Price / SF": Generated;
  "Sale Price / SF (Adj)": Generated;
  "Improvements / SF": Generated;
  "Land Size (AC)": Generated;
  "Land Size (SF)": Generated;
  "Excess Land Size (AC)": number | null;
  "Excess Land Value / AC": number | null;
  "Excess Land Value": Generated;
  APN: Generated;
  Legal: Generated;
  "Parking (SF)": Generated;
  "Building Size (SF)": Generated;
  "Office Area (SF)": Generated;
  "Warehouse Area (SF)": Generated;
  "Office %": Generated;
  "Warehouse %": Generated;
  "Occupancy %": string | null;
  "Land / Bld Ratio": Generated;
  "Land / Bld Ratio (Adj)": Generated;
  "Property Type": string | null;
  Construction: string | null;
  "Other Features Description": string | null;
  "Other Features": Generated;
  HVAC: HvacOptions;
  "Overhead Doors": string | null;
  "Wash Bay": YesNoUnknown;
  Hoisting: string | null;
  "Has Fencing": string | null;
  Buildings: Generated;
  "Year Built": Generated;
  "Effective Age": Generated;
  Age: Generated;
  Condition: Condition | null;
  "Zoning Location": string;
  "Zoning Description": string;
  Zoning: Generated;
  "Rent / Month": number | null;
  "Rent / SF": Generated;
  "Potential Gross Income": Generated;
  "Vacancy %": Generated;
  Vacancy: Generated;
  "Effective Gross Income": Generated;
  Taxes: Generated;
  Insurance: Generated;
  Expenses: Generated;
  "Net Operating Income": Generated;
  "Overall Cap Rate": Generated;
  GPI: Generated;
  "Gross Income Multiplier": Generated;
  "Potential Value": Generated;
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
  /** Jurisdiction for zoning (matches comp "Zoning Location" options). */
  "Zoning Area": ZoningLocation | null;
  "Zoning Description": string;
  Zoning: string | null;
  "Other Features": string | null;
  Hoisting: YesNoUnknown;
  "Wash Bay": YesNoUnknown;
  "Overall Location": OverallLocation | null;
  Corner: boolean;
  Frontage: FrontageType | null;
  "Utils - Electricity": YesNoUnknown;
  "Utils - Water": UtilsWater | null;
  "Utils - Sewer": UtilsSewer | null;
  Utilities: UtilitiesStatus | null;
  Surface: LandSurface | null;
  Construction: string | null;
  Condition: Condition;
  /** Comma-separated years when multiple buildings (e.g. "2021, 2010"); single year as number or string ok */
  "Year Built": number | string | null;
  /** When true, `Age` is user-entered; when false/omitted, age is derived from Year Built + effective date */
  "Age Override"?: boolean;
  Age: number | null;
  /** Sheet may store a computed number or Generated sentinels */
  "Effective Age": Generated | number | null;
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
  "Flood Zone": string | null;
  "Building Size (SF)": number | null;
  "Office Area (SF)": number | null;
  "Warehouse Area (SF)": number | null;
  "Storage Area (SF)": number | null;
  "Parking (SF)": number | null;
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
