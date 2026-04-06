/**
 * Dropdown options for comp detail forms — mirrors enumerated types in
 * docs/report-data-spreadsheet/parser-type-defs.md (lines 23–68).
 */

export const FRONTAGE_OPTIONS = [
  "Highway",
  "Main",
  "Secondary",
  "Dirt",
  "None",
  "Yes",
  "No",
] as const;

export const HAS_FENCING_OPTIONS = ["Yes", "Partial", "No"] as const;

export const FENCE_TYPE_OPTIONS = [
  "Wood",
  "Barbed Wire",
  "Chainlink",
  "Metal",
  "Unk",
] as const;

export const UTILS_ELECTRICITY_OPTIONS = ["Yes", "No", "Unk"] as const;

export const UTILS_WATER_OPTIONS = ["Public", "Well", "None", "Unk"] as const;

export const UTILS_SEWER_OPTIONS = ["Public", "Septic", "None", "Unk"] as const;

export const UTILITIES_STATUS_OPTIONS = [
  "Available",
  "Part. Available",
  "None",
] as const;

export const SURFACE_OPTIONS = ["Cleared", "Caliche", "Raw"] as const;

export const ZONING_LOCATION_OPTIONS = [
  "Inside City Limits",
  "Inside & Outside City Limits",
  "Inside ETJ",
  "Outside ETJ",
  "None",
] as const;

export const CONDITIONS_OF_SALE_OPTIONS = [
  "Arm's Length",
  "Owner Finance",
  "Sale-Leaseback",
  "Listing",
  "Not Arm's Length",
  "Other",
] as const;

export const VERIFICATION_TYPE_OPTIONS = [
  "Appraiser",
  "Broker",
  "Realtor",
  "Crexi",
  "MLS/CAD/Deeds",
  "Owner",
  "Other",
  "Buyer",
  "Seller",
] as const;

export const FINANCING_TERMS_OPTIONS = [
  "Cash to Seller",
  "Conventional",
  "Owner Finance",
  "SBA Loan",
  "Other",
] as const;

export const PROPERTY_RIGHTS_OPTIONS = [
  "Fee Simple",
  "Leased Fee",
  "Leasehold",
  "Life Estate",
  "Other",
] as const;

export const CONDITION_OPTIONS = ["Good", "Average", "Fair", "Poor"] as const;

export const USE_TYPE_OPTIONS = ["Sale", "Extra", "Rental"] as const;

export const HVAC_OPTIONS = ["Yes", "Office Only", "No"] as const;

export const WASH_BAY_OPTIONS = ["Yes", "No"] as const;

export const EXPENSE_STRUCTURE_OPTIONS = ["NNN", "NN", "N", "None"] as const;
