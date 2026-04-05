import "server-only";

import type {
  ExtractedLandComp,
  ExtractedRentalComp,
  ExtractedSaleComp,
} from "~/lib/report-md-parser";
import type { ExpenseStructure, LandSaleData } from "~/types/comp-data";

function parseUtilsFromLandUtilities(utilities: string | null): Pick<
  LandSaleData,
  "Utils - Electricity" | "Utils - Water" | "Utils - Sewer"
> {
  const base = {
    "Utils - Electricity": null as LandSaleData["Utils - Electricity"],
    "Utils - Water": null as LandSaleData["Utils - Water"],
    "Utils - Sewer": null as LandSaleData["Utils - Sewer"],
  };
  if (utilities == null || utilities.trim() === "") {
    return base;
  }
  const u = utilities.toLowerCase();
  if (u.includes("electric")) {
    base["Utils - Electricity"] = true;
  }
  if (u.includes("well")) {
    base["Utils - Water"] = "Well";
  } else if (u.includes("water")) {
    base["Utils - Water"] = "Public";
  }
  if (u.includes("septic")) {
    base["Utils - Sewer"] = "Septic";
  } else if (u.includes("sewer")) {
    base["Utils - Sewer"] = "Public";
  }
  return base;
}

function parseExpenseStructure(s: string | null): ExpenseStructure {
  if (s == null || s.trim() === "") {
    return "NNN";
  }
  const u = s.trim().toUpperCase();
  if (u === "NNN") {
    return "NNN";
  }
  if (u === "NN") {
    return "NN";
  }
  if (u === "N") {
    return "N";
  }
  if (u === "NONE") {
    return "None";
  }
  return "NNN";
}

export function mapExtractedLandToRawData(comp: ExtractedLandComp): Record<string, unknown> {
  const utils = parseUtilsFromLandUtilities(comp.utilities);
  return {
    "#": comp.index,
    Address: comp.address,
    "Use Type": "Sale",
    Grantor: "",
    Grantee: "",
    Recording: "",
    "Date of Sale": comp.date_of_sale ?? "",
    "Market Conditions": "GENERATED",
    "Sale Price": comp.sale_price ?? "",
    "Financing Terms": "",
    "Property Rights": "",
    "Conditions of Sale": "",
    "Sale Price / AC": comp.sale_price_per_ac ?? "GENERATED",
    "Sale Price / SF": comp.sale_price_per_sf ?? "GENERATED",
    "Land Size (AC)": comp.land_size_ac,
    "Land Size (SF)": comp.land_size_sf,
    APN: null,
    Legal: null,
    Corner: comp.corner ?? false,
    "Highway Frontage": comp.highway_frontage ?? false,
    "Utils - Electricity": utils["Utils - Electricity"],
    "Utils - Water": utils["Utils - Water"],
    "Utils - Sewer": utils["Utils - Sewer"],
    Surface: comp.surface ?? null,
    "Zoning Location": "",
    "Zoning Description": "",
    Zoning: comp.zoning ?? null,
    Taxes: null,
    "MLS #": null,
    "Verification Type": null,
    "Verified By": null,
    Verification: "GENERATED",
    Comments: comp.comments ?? null,
    _source: "extracted",
  };
}

export function mapExtractedSaleToRawData(comp: ExtractedSaleComp): Record<string, unknown> {
  return {
    "#": comp.index,
    Address: comp.address,
    "Use Type": "Sale",
    Grantor: "",
    Grantee: "",
    Recording: "",
    "Date of Sale": comp.date_of_sale ?? "",
    "Market Conditions": "GENERATED",
    "Sale Price": comp.sale_price ?? "",
    "Financing Terms": "",
    "Property Rights": "",
    "Conditions of Sale": "",
    "Sale Price / SF": comp.sale_price_per_sf ?? "GENERATED",
    "Improvements / SF": "GENERATED",
    "Land Size (AC)": comp.land_size_ac,
    "Land Size (SF)": null,
    "Land Value": null,
    APN: null,
    Legal: null,
    "Building Size (SF)": comp.building_size_sf,
    "Occupancy %": null,
    "Land / Bld Ratio": null,
    "Property Type": comp.property_type ?? null,
    Construction: comp.construction ?? null,
    "Other Features": null,
    "Parking (SF)": null,
    Buildings: null,
    "Year Built": comp.year_built,
    "Effective Age": "GENERATED",
    Condition: comp.condition ?? null,
    HVAC: "Yes",
    "Overhead Doors": null,
    "Wash Bay": null,
    Hoisting: null,
    "Zoning Location": "",
    "Zoning Description": "",
    Zoning: null,
    "Rent / SF": "GENERATED",
    "Potential Gross Income": "GENERATED",
    "Vacancy %": "",
    Vacancy: null,
    "Effective Gross Income": null,
    Taxes: null,
    Insurance: null,
    Expenses: null,
    "Net Operating Income": null,
    "Overall Cap Rate": null,
    GPI: null,
    "Gross Income Multiplier": null,
    "Potential Value": null,
    "MLS #": null,
    "Verification Type": null,
    "Verified By": null,
    Verification: "GENERATED",
    Comments: comp.comments ?? null,
    _source: "extracted",
  };
}

/** Defaults for every `RentalData` key not supplied by `ExtractedRentalComp`. */
export function mapExtractedRentalToRawData(comp: ExtractedRentalComp): Record<string, unknown> {
  const row: Record<string, unknown> = {
    "#": comp.index,
    Address: comp.address,
    "Use Type": "Rental",
    Lessor: "",
    Tenant: null,
    Recording: null,
    APN: null,
    Legal: null,
    "Zoning Location": "None",
    "Zoning Description": "",
    Zoning: null,
    "Land Size (AC)": null,
    "Land Size (SF)": null,
    "Rentable SF": comp.building_size_sf,
    "Office %": "GENERATED",
    "Land / Bld Ratio": null,
    "Occupancy %": "",
    "Property Type": "",
    "Lease Start": comp.lease_date ?? null,
    "Rent / Month Start": 0,
    "Lease Term": comp.lease_terms ?? null,
    "% Increase / Year": 0,
    "Rent / Month": null,
    "Expense Structure": parseExpenseStructure(comp.expense_structure),
    "Rent / SF / Year": comp.rent_per_sf_year ?? "GENERATED",
    "Tenant Structure": "Individual",
    "Year Built": null,
    Age: null,
    "Effective Age": "GENERATED",
    Condition: comp.condition ?? null,
    HVAC: "Yes",
    "Overhead Doors": null,
    "Wash Bay": null,
    Hoisting: null,
    Construction: null,
    "Other Features": "",
    "MLS #": null,
    "Verification Type": null,
    "Verified By": null,
    Verification: "GENERATED",
    Comments: comp.comments ?? "",
    _source: "extracted",
  };
  return row;
}

export function mapExtractedToRawData(
  comp: ExtractedLandComp | ExtractedSaleComp | ExtractedRentalComp,
  type: "Land" | "Sales" | "Rentals",
): Record<string, unknown> {
  if (type === "Land") {
    return mapExtractedLandToRawData(comp as ExtractedLandComp);
  }
  if (type === "Sales") {
    return mapExtractedSaleToRawData(comp as ExtractedSaleComp);
  }
  return mapExtractedRentalToRawData(comp as ExtractedRentalComp);
}
