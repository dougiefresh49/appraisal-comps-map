# Parser Type Definitions

TypeScript interfaces used when prompting Gemini to parse comp/subject documents. The parsed output matches the column headers in the Google Spreadsheet and is consumed by the [Apps Script JSON importer](https://github.com/dougiefresh49/appraisal-bot/blob/main/app-scripts/apbot-report-data/drive-importer/json-parser.js) to populate sheet tabs.

**Spreadsheet tab → interface mapping:**

| Interface           | Target Sheet Tab                   |
| ------------------- | ---------------------------------- |
| `LandSaleData`      | `land comps`                       |
| `SaleData`          | `sale comps`                       |
| `RentalData`        | `rental comps`                     |
| `SubjectData`       | `subject`                          |
| `SubjectTax`        | `subject-taxes`                    |
| `TaxEntity`         | `report-inputs` (TaxEntitiesRange) |
| `ParcelData`        | `comp-parcels`                     |
| `ParcelImprovement` | `comp-parcel-improvements`         |

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
type FrontageType =
  | "Highway"
  | "Main"
  | "Secondary"
  | "Dirt"
  | "None"
  | "Yes"
  | "No";
type HasFencing = "Yes" | "Partial" | "No";
type FenceType = "Wood" | "Barbed Wire" | "Chainlink" | "Metal" | "Unk";
type UtilitiesStatus = "Available" | "Part. Available" | "None";
type UtilsElectricity = "Yes" | "No" | "Unk";
type UtilsWater = "Public" | "Well" | "None" | "Unk";
type UtilsSewer = "Public" | "Septic" | "None" | "Unk";
type LandSurface = "Cleared" | "Caliche" | "Raw";
type ConditionsOfSaleType =
  | "Arm's Length"
  | "Owner Finance"
  | "Sale-Leaseback"
  | "Listing"
  | "Not Arm's Length"
  | "Other";
type VerificationType =
  | "Appraiser"
  | "Broker"
  | "Realtor"
  | "Crexi"
  | "MLS/CAD/Deeds"
  | "Owner"
  | "Other"
  | "Buyer"
  | "Seller";

type ExpenceStructure = "NNN" | "NN" | "N" | "None";
type TenantStructure = "Individual" | "Multiple";
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
  "Conditions of Sale": ConditionsOfSaleType;
  "Sale Price / AC": Generated;
  "Sale Price / SF": Generated;
  "Land Size (AC)": number | null;
  "Land Size (SF)": number | null;
  APN: string | null;
  Legal: string | null;
  Corner: boolean;
  Frontage: FrontageType;
  "Has Fencing": HasFencing;
  "Fence Type": FenceType;
  Fencing: string | null; // Not actually currently used
  "Utils - Electricity": UtilsElectricity;
  "Utils - Water": UtilsWater | null;
  "Utils - Sewer": UtilsSewer | null;
  Utilities: UtilitiesStatus;
  Surface: LandSurface | null;
  "Zoning Location": ZoningLocation;
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
  /** Formula: =G30 */
  "Market Conditions": Generated;
  "Sale Price": string;
  /** Formula: =I30-V30 */
  "Adj Sale Price": string; // Missing from webapp
  "Financing Terms": string;
  "Property Rights": string;
  "Conditions of Sale": ConditionsOfSaleType;
  "Renovation Cost": number | null; // Missing from webapp
  /** Formula: =I30/Z30 */
  "Sale Price / SF": Generated;
  /** Formula: =J30/Z30 */
  "Sale Price / SF (Adj)": Generated; // Missing from webapp
  /** Formula: =(I30 - V30)/Z30 */
  "Improvements / SF": Generated; // Missing from webapp
  /** Formula: =SUM(FILTER(Parcels[Size (AC)], Parcels[instrumentNumber] = F30)) */
  "Land Size (AC)": number | null;
  /** Formula: =AC_TO_SF(R30) */
  "Land Size (SF)": number | null;
  /** Formula: =R30 */
  "Excess Land Size (AC)": number | null; // Missing from webapp
  "Excess Land Value / AC": number | null; // Missing from webapp
  /** Formula: =T30*U30 */
  "Excess Land Value": number | null; // Missing from webapp
  /** Formula: =ARRAYFORMULA(JOIN(CHAR(10), FILTER(Parcels[APN], Parcels[instrumentNumber] = F30))) */
  APN: string | null;
  /** Formula: =ARRAYFORMULA(JOIN(CHAR(10), FILTER(Parcels[Legal], Parcels[instrumentNumber] = F30))) */
  Legal: string | null;
  /** Formula: =SUM(FILTER(Parcels[Parking (SF)], Parcels[instrumentNumber] = F30)) */
  "Parking (SF)": number | null;
  /** Formula: =SUM(FILTER(Parcels[Building Size (SF)], Parcels[instrumentNumber] = F30)) */
  "Building Size (SF)": number | null;
  /** Formula: =SUM(FILTER(Parcels[Office Area (SF)], Parcels[instrumentNumber] = F30)) */
  "Office Area (SF)": number | null; // Missing from webapp
  /** Formula: =SUM(FILTER(Parcels[Warehouse Area (SF)], Parcels[instrumentNumber] = F30)) */
  "Warehouse Area (SF)": number | null; // Missing from webapp
  /** Formula: =(AA30/Z30) */
  "Office %": Generated; // Missing from webapp
  /** Formula: =(AB30/Z30)*100 */
  "Warehouse %": Generated; // Missing from webapp
  "Occupancy %": string | null;
  /** Formula: =S30/Z30 */
  "Land / Bld Ratio": number | null;
  /** Formula: =(S30-AC_TO_SF(T30))/Z30 */
  "Land / Bld Ratio (Adj)": number | null; // Missing from webapp
  "Property Type": string | null;
  Construction: string | null;
  "Other Features Description": string | null; // Missing from webapp
  /** Formula: =TEXTJOIN(". ", TRUE, TEXTJOIN(", ", TRUE, IF(AM30<>"", AM30 & " Overhead Doors", ""), IF(AN30="Yes", "Wash Bay", IF(AN30="No", "No Wash Bay", "")), IF(AO30<>"", IF(AO30="None", "No Hoisting", AO30 & " Hoisting"), "")), AJ30) */
  "Other Features": string | null;
  HVAC: HvacOptions;
  "Overhead Doors": string | null;
  "Wash Bay": YesNoUnknown;
  Hoisting: string | null;
  "Has Fencing": HasFencing; // Missing from webapp
  /** Formula: =SUM(FILTER(Parcels[Buildings], Parcels[instrumentNumber] = F30)) */
  Buildings: number | null;
  /** Formula: =JOIN(", ", UNIQUE(FILTER(ParcelImprovements[Year Built], ParcelImprovements[instrumentNumber] = F30, ParcelImprovements[Is GLA] = TRUE))) */
  "Year Built": number | string | null;
  /** Formula: =getEffectiveAge(...) */
  "Effective Age": Generated;
  /** Formula: =CALCULATE_AGE(F30, AR30, ReportInputs, ParcelImprovements) */
  Age: number | null; // Missing from webapp
  Condition: Condition | null;
  "Zoning Location": ZoningLocation;
  "Zoning Description": string;
  /** Formula: =GET_ZONE_VAL(AU30,AV30) */
  Zoning: string | null;
  "Rent / Month": number | null; // Missing from webapp
  /** Formula: =AX30*12/Z30 */
  "Rent / SF": Generated;
  /** Formula: =AY30*Z30 */
  "Potential Gross Income": Generated;
  /** Formula: =FILTER(ReportInputs[value], ReportInputs[variableName] = "VacancyRate") */
  "Vacancy %": string;
  /** Formula: =AZ30*BA30 */
  Vacancy: string | null;
  /** Formula: =AZ30-BB30 */
  "Effective Gross Income": string | null;
  /** Formula: =SUMIF(Parcels[instrumentNumber], F30, Parcels[Total Tax Amount]) */
  Taxes: string | null;
  /** Formula: =Z30*FILTER(ReportInputs[value], ReportInputs[variableName] = "InsurancePricePerSf") */
  Insurance: string | null;
  /** Formula: =BD30+BE30 */
  Expenses: string | null;
  /** Formula: =BC30-BF30 */
  "Net Operating Income": string | null;
  /** Formula: =BG30/I30 */
  "Overall Cap Rate": string | null;
  /** Formula: =AZ30/J30 */
  GPI: string | null;
  /** Formula: =I30/BC30 */
  "Gross Income Multiplier": number | null;
  /** Formula: =BJ30*BC30 */
  "Potential Value": string | null;
  "MLS #": string | null;
  "Verification Type": VerificationType | null;
  "Verified By": string | null;
  /** Formula: =GET_VERIFICATION_VAL(BM30, BN30, BL30) */
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
  /** Formula: =ARRAYFORMULA(JOIN(CHAR(10), FILTER(Parcels[APN], Parcels[instrumentNumber] = F2))) */
  APN: Generated;
  /** Formula: =FILTER(Parcels[Legal], Parcels[instrumentNumber] = F2) */
  Legal: Generated;
  "Property Rights": string;
  instrumentNumber: string | null;
  "Date of Sale": string; // always "Current" for subject
  /** Formula: =G2 */
  "Market Conditions": Generated;
  "Post Sale Renovation Cost": number | null;
  Tenant: string | null;
  "Lease Start": string | null;
  "Rent / Month": number | null;
  /** Formula: =L2/V2*12 */
  "Rent / SF / Year": Generated;
  "Expense Structure": ExpenceStructure | null;
  "Occupancy %": string | null;
  /** Formula: =SUM(FILTER(Parcels[Size (AC)], Parcels[instrumentNumber] = F2)) */
  "Land Size (AC)": Generated;
  /** Formula: =AC_TO_SF(P2) */
  "Land Size (SF)": Generated;
  /** Formula: =SUM(FILTER(Parcels[Parking (SF)], Parcels[instrumentNumber] = F2)) */
  "Parking (SF)": Generated;
  "Parking Spaces": number | null;
  "Parking Spaces Details": string | null;
  /** Formula: =S2/(V2/1000) */
  "Parking Ratio": Generated;
  /** Formula: =SUM(FILTER(Parcels[Building Size (SF)], Parcels[instrumentNumber] = F2)) */
  "Building Size (SF)": Generated;
  /** Formula: =SUM(FILTER(Parcels[Office Area (SF)], Parcels[instrumentNumber] = F2)) */
  "Office Area (SF)": Generated;
  /** Formula: =SUM(FILTER(Parcels[Warehouse Area (SF)], Parcels[instrumentNumber] = F2)) */
  "Warehouse Area (SF)": Generated;
  /** Formula: =W2/V2 */
  "Office %": Generated;
  /** Formula: =V2/Q2 */
  "Floor Area Ratio": Generated;
  /** Formula: =Q2/V2 */
  "Land / Bld Ratio": Generated;
  /** Formula: =SUM(FILTER(Parcels[Total Tax Amount], ...)) * BF2 */
  "Total Taxes": Generated;
  /** Formula: =SUM(FILTER(Parcels[County Appraised Value], ...)) * BF2 */
  "County Appraised Value": Generated;
  City: string;
  State: string;
  County: string;
  Zip: string;
  /** Formula: =A2 &", "& AD2 &", "& AE2 &" "& AG2 */
  AddressLabel: Generated;
  /** Formula: =A2 &", "& AD2 &", "& AF2 &" County" &", " & AE2 &" "& AG2 */
  AddressLocal: Generated;
  "Zoning Area": string;
  "Zoning Description": string;
  /** Formula: =GET_ZONE_VAL(AJ2,AK2) */
  Zoning: Generated;
  "Other Features": string | null;
  Wash Bay: YesNoUnknown;
  Hoisting: string | null;
  Corner: boolean;
  "Highway Frontage": boolean;
  Frontage: FrontageType | null;
  "Utils - Electricity": YesNoUnknown;
  "Utils - Water": UtilsWater;
  "Utils - Sewer": UtilsSewer;
  Utilities: UtilitiesStatus | null;
  Surface: LandSurface | null;
  "Property Type": string | null;
  "Property Type Long": string | null;
  Construction: string | null;
  Condition: Condition;
  /** Formula: =JOIN(", ", UNIQUE(FILTER(ParcelImprovements[Year Built], ...))) */
  "Year Built": Generated;
  /** Formula: =IFERROR(report_year - oldest_built_year) */
  Age: Generated;
  /** Formula: =getEffectiveAge(...) */
  "Effective Age": Generated;
  /** Formula: =FILTER(ReportInputs[value], ...) * Subject[Building Size (SF)] */
  "Est Insurance": Generated;
  /** Formula: =Subject[Est Insurance]+Subject[Total Taxes] */
  "Est Expences": Generated;
  "Size Multiplier": Generated;
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

## FORMULA CALCULATIONS SUMMARY

NOTE ON (Adj) FIELDS:

> Any field with "(Adj)" in the heading is NOT an appraisal adjustment. It indicates an adjustment made to remove Excess Land from the property data. This ensures the comparable data is specifically aligned with the subject's primary improvements.

## Comp Formulas

- Adj Sale Price  
  `= salePrice - excessLandValue`
- Sale Price / SF (Adj)  
  `= adjSalePrice / buildingSizeSf`
- Improvements / SF  
  `= (salePrice - excessLandValue) / buildingSizeSf`
- Land Size (SF)  
  `= AC_TO_SF(landSizeAc)`
- Excess Land Value  
  `= excessLandSizeAc * excessLandValuePerAc`
- Office %  
  `= (officeAreaSf / buildingSizeSf)`
- Warehouse %  
  `= (warehouseAreaSf / buildingSizeSf) * 100`
- Land / Bld Ratio  
  `= landSizeSf / buildingSizeSf`
- Land / Bld Ratio (Adj)  
  `= (landSizeSf - AC_TO_SF(excessLandSizeAc)) / buildingSizeSf`
- Other Features

  ```excel
   = CombineStrings([
  overheadDoors ? overheadDoors + " Overhead Doors" : "",
  washBay == "Yes" ? "Wash Bay" : (washBay == "No" ? "No Wash Bay" : ""),
  hoisting ? (hoisting == "None" ? "No Hoisting" : hoisting + " Hoisting") : ""
  ], delimiter=", ") + ". " + otherFeaturesDescription
  ```

- Rent / SF  
  `= (rentPerMonth * 12) / buildingSizeSf`
- Potential Gross Income  
  `= rentPerSf * buildingSizeSf`
- Vacancy  
  `= potentialGrossIncome * vacancyRate`
- Effective Gross Income  
  `= potentialGrossIncome - vacancy`
- Insurance  
  `= buildingSizeSf * insuranceRatePerSf`
- Expenses  
  `= taxes + insurance`
- Net Operating Income  
  `= effectiveGrossIncome - expenses`
- Overall Cap Rate  
  `= netOperatingIncome / salePrice`
- GPI (Gross Price Index)  
  `= potentialGrossIncome / adjSalePrice`
- Gross Income Multiplier  
  `= salePrice / effectiveGrossIncome`
- Potential Value  
  `= grossIncomeMultiplier * effectiveGrossIncome`

### Subject Formulas

```
Rent / SF / Year = (rentPerMonth / buildingSizeSf) \* 12
Parking Ratio = parkingSf / (buildingSizeSf / 1000)
Office % = officeAreaSf / buildingSizeSf
Floor Area Ratio = buildingSizeSf / landSizeSf
Land / Bld Ratio = landSizeSf / buildingSizeSf
Total Taxes = sum(parcelTaxes) \* sizeMultiplier
County Appraised Value = sum(parcelAppraisal) \* sizeMultiplier
Est Insurance = insuranceRatePerSf \* buildingSizeSf
Est Expenses = estInsurance + totalTaxes
Age = reportEffectiveYear - oldestImprovementYearBuilt
```
