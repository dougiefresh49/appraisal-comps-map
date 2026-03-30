# Parser Type Definitions

TypeScript interfaces used when prompting Gemini to parse comp/subject documents. The parsed output matches the column headers in the Google Spreadsheet and is consumed by the [Apps Script JSON importer](https://github.com/dougiefresh49/appraisal-bot/blob/main/app-scripts/apbot-report-data/drive-importer/json-parser.js) to populate sheet tabs.

**Spreadsheet tab → interface mapping:**

| Interface | Target Sheet Tab |
|-----------|-----------------|
| `LandSaleData` | `land comps` |
| `SaleData` | `sale comps` |
| `RentalData` | `rental comps` |
| `SubjectData` | `subject` |
| `SubjectTax` | `subject-taxes` |
| `TaxEntity` | `report-inputs` (TaxEntitiesRange) |
| `ParcelData` | `comp-parcels` |
| `ParcelImprovement` | `comp-parcel-improvements` |

**See also:** [Apps Script project](https://github.com/dougiefresh49/appraisal-bot/tree/main/app-scripts/apbot-report-data) for the full Google Sheets automation codebase.

---

```ts
// --- UTILITY TYPES ---

type Generated = "GENERATED" | "BLANK" | null;

type Condition = "Good" | "Average" | "Fair" | "Poor";

type YesNoUnknown = boolean | null;

// --- ENUMERATED TYPES ---

type UseType = "Sale" | "Extra" | "Rental";

type SubjectParcelType = "Improvements" | "Excess Land";

type ZoningLocation =
  | "Inside City Limits"
  | "Inside & Outside City Limits"
  | "Inside ETJ"
  | "Outside ETJ"
  | "None";

type ExpenceStructure = "NNN" | "NN" | "N" | "None";

type TenantStructure = "Individual" | "Multiple";

type VerificationType =
  | "Appraiser"
  | "Broker"
  | "Realtor"
  | "Crexi"
  | "MLS/CAD/Deeds"
  | "Other"
  | "Buyer"
  | "Seller"
  | "Owner";

type UtilsWater = "Public" | "Well" | "None";

type UtilsSewer = "Public" | "Septic" | "None";

type LandSurface = "Cleared" | "Caliche" | "Raw";

type HvacOptions = "Yes" | "Office Only" | "No";

// --- MAIN OUTPUT STRUCTURE ---

interface OutputData {
  landSaleData: LandSaleData[];

  saleData: SaleData[];

  rentalData: RentalData[];

  parcelData: ParcelData[];

  parcelImprovements: ParcelImprovement[];

  subject: SubjectData[];

  subjectTaxes: SubjectTax[];

  taxEntities: TaxEntity[];
}

// --- DATA INTERFACES ---

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

  "Overhead Doors": string | null; // if size is known, put in the format of WxH (xQuantity). Ex: 14x12 (x6)

  "Wash Bay": YesNoUnknown;

  Hoisting: string | null; // None, Unknown, xT (where x is the tonage of the crane). if there are multiple cranes, list all of them. Ex: 2T (x2),5T (x3)

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

  "Overhead Doors": string | null; // if size is known, put in the format of WxH (xQuantity). Ex: 14x12 (x6)

  "Wash Bay": YesNoUnknown;

  Hoisting: string | null; // None, Unknown, xT (where x is the tonage of the crane). if there are multiple cranes, list all of them. Ex: 2T (x2),5T (x3)

  Construction: string | null;

  "Other Features": string;

  "MLS #": string | null;

  "Verification Type": VerificationType | null;

  "Verified By": string | null;

  Verification: Generated;

  Comments: string;
}

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

interface SubjectTax {
  Entity: string;

  Amount: number;
}

interface TaxEntity {
  Entity: string;

  Rate: number;
}
```
