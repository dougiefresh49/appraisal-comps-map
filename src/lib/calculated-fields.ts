/**
 * Calculated fields for comp and subject data.
 *
 * Mirrors the Google Sheets formulas from the appraisal spreadsheet.
 * Source: docs/report-data-spreadsheet/formulas.json
 *        docs/report-data-spreadsheet/named-functions.md
 *        https://github.com/dougiefresh49/appraisal-bot/blob/main/app-scripts/apbot-report-data/ap-bot-utils.js
 */

type RawData = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Utility conversions
// ---------------------------------------------------------------------------

export function acToSf(acres: number | null | undefined): number | null {
  if (acres == null || isNaN(acres)) return null;
  return acres * 43560;
}

export function sfToAc(sf: number | null | undefined): number | null {
  if (sf == null || isNaN(sf)) return null;
  return sf / 43560;
}

// ---------------------------------------------------------------------------
// Price & ratio calculations
// ---------------------------------------------------------------------------

export function salePricePerAc(
  salePrice: number | null | undefined,
  landSizeAc: number | null | undefined,
): number | null {
  if (!salePrice || !landSizeAc || landSizeAc === 0) return null;
  return salePrice / landSizeAc;
}

export function salePricePerSf(
  salePrice: number | null | undefined,
  landSizeSf: number | null | undefined,
): number | null {
  if (!salePrice || !landSizeSf || landSizeSf === 0) return null;
  return salePrice / landSizeSf;
}

export function landBldRatio(
  landSizeSf: number | null | undefined,
  buildingSizeSf: number | null | undefined,
): number | null {
  if (!landSizeSf || !buildingSizeSf || buildingSizeSf === 0) return null;
  return landSizeSf / buildingSizeSf;
}

export function officePercent(
  officeAreaSf: number | null | undefined,
  buildingSizeSf: number | null | undefined,
): number | null {
  if (officeAreaSf == null || !buildingSizeSf || buildingSizeSf === 0) return null;
  return officeAreaSf / buildingSizeSf;
}

export function floorAreaRatio(
  buildingSizeSf: number | null | undefined,
  landSizeSf: number | null | undefined,
): number | null {
  if (!buildingSizeSf || !landSizeSf || landSizeSf === 0) return null;
  return buildingSizeSf / landSizeSf;
}

export function parkingRatio(
  parkingSpaces: number | null | undefined,
  buildingSizeSf: number | null | undefined,
): number | null {
  if (parkingSpaces == null || !buildingSizeSf || buildingSizeSf === 0) return null;
  return parkingSpaces / (buildingSizeSf / 1000);
}

export function calcAge(
  yearBuilt: number | string | null | undefined,
  effectiveDateYear?: number,
): number | null {
  const yb = typeof yearBuilt === "string" ? parseInt(yearBuilt, 10) : yearBuilt;
  if (!yb || isNaN(yb)) return null;
  const refYear = effectiveDateYear ?? new Date().getFullYear();
  return refYear - yb;
}

export function rentPerSfPerYear(
  rentPerMonth: number | null | undefined,
  buildingSizeSf: number | null | undefined,
): number | null {
  if (!rentPerMonth || !buildingSizeSf || buildingSizeSf === 0) return null;
  return (rentPerMonth / buildingSizeSf) * 12;
}

// ---------------------------------------------------------------------------
// String formatting (mirrors named functions)
// ---------------------------------------------------------------------------

/**
 * GET_ZONE_VAL: format zoning text from location + description.
 * Ref: docs/report-data-spreadsheet/named-functions.md
 */
export function getZoneVal(
  location: string | null | undefined,
  desc: string | null | undefined,
): string {
  if (!location && !desc) return "";
  if (location !== "Inside City Limits" && !desc) return `None (${location})`;
  if (location === "Inside City Limits" && desc && desc !== "None") return desc;
  if (desc === "None") return "None (Inside City Limits)";
  if (desc) return `${desc} (${location})`;
  return "";
}

/**
 * GET_VERIFICATION_VAL: format verification string.
 * Ref: docs/report-data-spreadsheet/named-functions.md
 */
export function getVerificationVal(
  type: string | null | undefined,
  by: string | null | undefined,
  mlsNumber: string | number | null | undefined,
): string {
  if (!type && !by) return "";
  const mlsSuffix = mlsNumber ? `MLS #${mlsNumber}` : "";
  if (type === "Other" && by) return `Verified by ${by}`;
  let result = `Verified by ${type}`;
  if (by) {
    result += ` (${by}${mlsSuffix ? `, ${mlsSuffix}` : ""})`;
  } else if (mlsSuffix) {
    result += ` (${mlsSuffix})`;
  }
  return result;
}

/**
 * Format an address label: "123 Main St, Odessa, TX 79766"
 */
export function formatAddressLabel(
  address: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | number | null | undefined,
): string {
  const parts = [address, city, [state, zip].filter(Boolean).join(" ")]
    .filter(Boolean);
  return parts.join(", ");
}

/**
 * Format a local address: "123 Main St, Odessa, Ector County, TX 79766"
 */
export function formatAddressLocal(
  address: string | null | undefined,
  city: string | null | undefined,
  county: string | null | undefined,
  state: string | null | undefined,
  zip: string | number | null | undefined,
): string {
  const parts = [
    address,
    city,
    county ? `${county} County` : null,
    [state, zip].filter(Boolean).join(" "),
  ].filter(Boolean);
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Market conditions / time adjustment
// ---------------------------------------------------------------------------

/**
 * CALC_MONTHLY_INCREASE: percent adjustment for market conditions.
 */
export function calcMonthlyIncrease(
  pastDate: Date | string | null | undefined,
  reportEffectiveDate: Date | string | null | undefined,
  percentIncPerMonth: number | null | undefined,
): number {
  if (!pastDate || !reportEffectiveDate || !percentIncPerMonth) return 0;
  const d1 = typeof pastDate === "string" ? new Date(pastDate) : pastDate;
  const d2 = typeof reportEffectiveDate === "string" ? new Date(reportEffectiveDate) : reportEffectiveDate;
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  const monthDiff = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (monthDiff < 3) return 0;
  return Math.round(monthDiff * percentIncPerMonth) / 100;
}

/**
 * GET_ELAPSED_TIME: elapsed years between two dates (YEARFRAC equivalent).
 */
export function getElapsedTime(
  date1: Date | string | null | undefined,
  date2: Date | string | null | undefined,
): number {
  if (!date1 || !date2) return 0;
  const d1 = typeof date1 === "string" ? new Date(date1) : date1;
  const d2 = typeof date2 === "string" ? new Date(date2) : date2;
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  const ms = Math.abs(d2.getTime() - d1.getTime());
  const years = ms / (1000 * 60 * 60 * 24 * 365.25);
  return Math.round(years * 100) / 100;
}

// ---------------------------------------------------------------------------
// Bulk compute: fill Generated fields for a comp raw_data object
// ---------------------------------------------------------------------------

/**
 * Given a comp's raw_data JSONB, compute all formula-derived fields
 * and return a new object with those fields filled in.
 * Only fills fields that are currently null/undefined/empty.
 */
export function computeGeneratedFields(
  rawData: RawData,
  options?: {
    effectiveDateYear?: number;
    reportEffectiveDate?: string;
    percentIncPerMonth?: number;
  },
): RawData {
  const d = { ...rawData };
  const n = (key: string) => {
    const v = d[key];
    if (typeof v === "number") return v;
    if (typeof v === "string") { const p = parseFloat(v); return isNaN(p) ? null : p; }
    return null;
  };
  const s = (key: string) => {
    const v = d[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const empty = (key: string) => d[key] == null || d[key] === "" || d[key] === 0;
  const year = options?.effectiveDateYear ?? new Date().getFullYear();

  if (empty("Land Size (SF)") && n("Land Size (AC)")) {
    d["Land Size (SF)"] = acToSf(n("Land Size (AC)"));
  }
  if (empty("Land Size (AC)") && n("Land Size (SF)")) {
    d["Land Size (AC)"] = sfToAc(n("Land Size (SF)"));
  }
  if (empty("Sale Price / AC")) {
    d["Sale Price / AC"] = salePricePerAc(n("Sale Price"), n("Land Size (AC)"));
  }
  if (empty("Sale Price / SF")) {
    d["Sale Price / SF"] = salePricePerSf(n("Sale Price"), n("Land Size (SF)"));
  }
  if (empty("Land / Bld Ratio")) {
    d["Land / Bld Ratio"] = landBldRatio(n("Land Size (SF)"), n("Building Size (SF)"));
  }
  if (empty("Office %")) {
    d["Office %"] = officePercent(n("Office Area (SF)"), n("Building Size (SF)"));
  }
  if (empty("Floor Area Ratio")) {
    d["Floor Area Ratio"] = floorAreaRatio(n("Building Size (SF)"), n("Land Size (SF)"));
  }
  if (empty("Parking Ratio")) {
    d["Parking Ratio"] = parkingRatio(n("Parking Spaces"), n("Building Size (SF)"));
  }
  if (empty("Age")) {
    d.Age = calcAge(d["Year Built"] as string | number | null, year);
  }
  if (empty("Rent / SF / Year")) {
    d["Rent / SF / Year"] = rentPerSfPerYear(n("Rent / Month"), n("Building Size (SF)"));
  }
  if (empty("Zoning") && (s("Zoning Location") ?? s("Zoning Area"))) {
    d.Zoning = getZoneVal(
      s("Zoning Location") ?? s("Zoning Area"),
      s("Zoning Description"),
    );
  }
  if (empty("Verification")) {
    d.Verification = getVerificationVal(
      s("Verification Type"),
      s("Verified By"),
      s("MLS #"),
    );
  }
  if (empty("AddressLabel")) {
    d.AddressLabel = formatAddressLabel(s("Address"), s("City"), s("State"), d.Zip as string | number | null);
  }
  if (empty("AddressLocal")) {
    d.AddressLocal = formatAddressLocal(s("Address"), s("City"), s("County"), s("State"), d.Zip as string | number | null);
  }

  if (options?.reportEffectiveDate && options.percentIncPerMonth) {
    const dateOfSale = s("Date of Sale");
    if (empty("Market Conditions") && dateOfSale) {
      d["Market Conditions"] = calcMonthlyIncrease(
        dateOfSale,
        options.reportEffectiveDate,
        options.percentIncPerMonth,
      );
    }
  }

  return d;
}

// ---------------------------------------------------------------------------
// Number formatting helpers (for display)
// ---------------------------------------------------------------------------

export function formatCurrency(value: number | null | undefined, decimals = 0): string {
  if (value == null) return "--";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null) return "--";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null) return "--";
  return (value * 100).toFixed(decimals) + "%";
}

export function formatAcres(value: number | null | undefined): string {
  if (value == null) return "--";
  return value.toFixed(3);
}
