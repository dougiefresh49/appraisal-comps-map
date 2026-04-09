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
  if (officeAreaSf == null || !buildingSizeSf || buildingSizeSf === 0)
    return null;
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
  if (parkingSpaces == null || !buildingSizeSf || buildingSizeSf === 0)
    return null;
  return parkingSpaces / (buildingSizeSf / 1000);
}

/**
 * Parse comma-separated construction years (spreadsheet: SPLIT + MIN on "Year Built").
 */
export function parseYearsBuiltList(
  yearBuilt: number | string | null | undefined,
): number[] {
  if (yearBuilt == null || yearBuilt === "") return [];
  if (typeof yearBuilt === "number" && !Number.isNaN(yearBuilt)) {
    const y = Math.trunc(yearBuilt);
    return y > 1000 && y < 3000 ? [y] : [];
  }
  const s = String(yearBuilt).trim();
  if (!s) return [];
  const parts = s
    .split(/[,;/|]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const years: number[] = [];
  for (const p of parts) {
    const m = /^(\d{4})/.exec(p);
    if (m) {
      const y = parseInt(m[1]!, 10);
      if (y > 1000 && y < 3000) years.push(y);
    }
  }
  return years;
}

/** First 4-digit year from project effective date string, else current year. */
export function reportEffectiveYear(
  effectiveDateStr: string | null | undefined,
): number {
  if (effectiveDateStr?.trim()) {
    const m = /(\d{4})/.exec(effectiveDateStr);
    if (m) {
      const y = parseInt(m[1]!, 10);
      if (y > 1800 && y < 3000) return y;
    }
  }
  return new Date().getFullYear();
}

/**
 * Weighted effective age by building SF (ApBot2/getEffectiveAge).
 * When only one year is listed, returns chronological age.
 * When multiple years are listed without per-building sizes, splits total GBA evenly.
 */
export function calcEffectiveAgeWeighted(
  yearsBuilt: number[],
  refYear: number,
  buildingSizesPerBuilding: number[] | null | undefined,
  totalBuildingSf: number | null | undefined,
): number | null {
  if (yearsBuilt.length === 0) return null;
  const n = yearsBuilt.length;

  if (n === 1) {
    const age = refYear - yearsBuilt[0]!;
    if (age < 0 || age > 200) return null;
    return age;
  }

  let sizes: number[];
  if (
    buildingSizesPerBuilding &&
    buildingSizesPerBuilding.length === n &&
    buildingSizesPerBuilding.every((s) => typeof s === "number" && s > 0)
  ) {
    sizes = buildingSizesPerBuilding;
  } else if (
    totalBuildingSf != null &&
    !Number.isNaN(totalBuildingSf) &&
    totalBuildingSf > 0
  ) {
    const each = totalBuildingSf / n;
    sizes = yearsBuilt.map(() => each);
  } else {
    return null;
  }

  const totalSize = sizes.reduce((a, b) => a + b, 0);
  if (totalSize <= 0) return null;

  let weighted = 0;
  for (let i = 0; i < n; i++) {
    const pct = sizes[i]! / totalSize;
    const age = Math.max(0, refYear - yearsBuilt[i]!);
    weighted += age * pct;
  }
  return Math.round(weighted * 10) / 10;
}

/**
 * Chronological age: report year minus oldest year in "Year Built" list
 * (matches formulas.json Age = report_year - MIN(SPLIT(...))).
 */
export function calcAge(
  yearBuilt: number | string | null | undefined,
  effectiveDateYear?: number,
): number | null {
  const refYear = effectiveDateYear ?? new Date().getFullYear();
  const years = parseYearsBuiltList(yearBuilt);
  if (years.length === 0) return null;
  const oldest = Math.min(...years);
  const age = refYear - oldest;
  if (age < 0 || age > 200) return null;
  return age;
}

export function rentPerSfPerYear(
  rentPerMonth: number | null | undefined,
  buildingSizeSf: number | null | undefined,
): number | null {
  if (!rentPerMonth || !buildingSizeSf || buildingSizeSf === 0) return null;
  return (rentPerMonth / buildingSizeSf) * 12;
}

export function excessLandValue(
  excessLandSizeAc: number | null | undefined,
  excessLandValuePerAc: number | null | undefined,
): number | null {
  if (!excessLandSizeAc || !excessLandValuePerAc) return null;
  return excessLandSizeAc * excessLandValuePerAc;
}

export function adjSalePrice(
  salePrice: number | null | undefined,
  excessLandVal: number | null | undefined,
): number | null {
  if (salePrice == null || isNaN(salePrice)) return null;
  return salePrice - (excessLandVal ?? 0);
}

export function warehousePercent(
  warehouseAreaSf: number | null | undefined,
  buildingSizeSf: number | null | undefined,
): number | null {
  if (
    warehouseAreaSf == null ||
    buildingSizeSf == null ||
    isNaN(warehouseAreaSf) ||
    isNaN(buildingSizeSf) ||
    buildingSizeSf === 0
  ) {
    return null;
  }
  return (warehouseAreaSf / buildingSizeSf) * 100;
}

export function landBldRatioAdj(
  landSizeSf: number | null | undefined,
  excessLandSizeAc: number | null | undefined,
  buildingSizeSf: number | null | undefined,
): number | null {
  if (
    landSizeSf == null ||
    buildingSizeSf == null ||
    isNaN(landSizeSf) ||
    isNaN(buildingSizeSf) ||
    buildingSizeSf === 0
  ) {
    return null;
  }
  const excessSf =
    excessLandSizeAc != null && !isNaN(excessLandSizeAc)
      ? (acToSf(excessLandSizeAc) ?? 0)
      : 0;
  return (landSizeSf - excessSf) / buildingSizeSf;
}

/**
 * Mirrors sale comp “Other Features” TEXTJOIN: overhead doors, wash bay,
 * hoisting, then optional description.
 */
export function buildOtherFeatures(
  overheadDoors: string | number | null | undefined,
  washBay: string | boolean | null | undefined,
  hoisting: string | null | undefined,
  description: string | null | undefined,
): string {
  const parts: string[] = [];
  if (overheadDoors != null && overheadDoors !== "") {
    parts.push(`${overheadDoors} Overhead Doors`);
  }
  if (washBay === true || washBay === "Yes") {
    parts.push("Wash Bay");
  } else if (washBay === false || washBay === "No") {
    parts.push("No Wash Bay");
  }
  if (hoisting && hoisting.trim() !== "") {
    parts.push(hoisting === "None" ? "No Hoisting" : `${hoisting} Hoisting`);
  }
  let result = parts.join(", ");
  const desc =
    typeof description === "string" && description.trim() !== ""
      ? description.trim()
      : "";
  if (desc) {
    result = result ? `${result}. ${desc}` : desc;
  }
  return result;
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
  const parts = [address, city, [state, zip].filter(Boolean).join(" ")].filter(
    Boolean,
  );
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
 * Mirrors the spreadsheet named function:
 *   month_diff = (YEAR(effectiveDate) - YEAR(saleDate)) * 12
 *              + (MONTH(effectiveDate) - MONTH(saleDate))
 *   result = ROUND(month_diff * percentIncPerMonth, 0) / 100
 *
 * Only the calendar month and year are used; day is intentionally ignored.
 */
export function calcMonthlyIncrease(
  pastDate: Date | string | null | undefined,
  reportEffectiveDate: Date | string | null | undefined,
  percentIncPerMonth: number | null | undefined,
): number {
  if (!pastDate || !reportEffectiveDate || !percentIncPerMonth) return 0;

  /** Extract [year, month (1-12)] from a date without timezone distortion. */
  function toYearMonth(d: Date | string): [number, number] | null {
    if (typeof d === "string") {
      // Try to parse year + month directly from the string so that day and
      // timezone information have no effect on the result.
      // Handles ISO ("2025-06-17"), US short ("Jun 17, 2025"), slash ("6/17/2025"), etc.
      const isoMatch = /^(\d{4})-(\d{2})/.exec(d.trim());
      if (isoMatch) return [parseInt(isoMatch[1]!, 10), parseInt(isoMatch[2]!, 10)];
      const parsed = new Date(d);
      if (isNaN(parsed.getTime())) return null;
      // Fall back to getFullYear/getMonth — but normalise to local first-of-month
      // so UTC-midnight strings don't bleed into the previous month.
      return [parsed.getFullYear(), parsed.getMonth() + 1];
    }
    return [d.getFullYear(), d.getMonth() + 1];
  }

  const ym1 = toYearMonth(pastDate);
  const ym2 = toYearMonth(reportEffectiveDate);
  if (!ym1 || !ym2) return 0;

  const monthDiff = (ym2[0] - ym1[0]) * 12 + (ym2[1] - ym1[1]);
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
// Parcel rollup: mirrors spreadsheet SUMIFS/FILTER formulas
// ---------------------------------------------------------------------------

/**
 * Aggregates ParcelImprovement entries into a parcel's size fields.
 * Mirrors the Parcels table SUMIFS formulas in the spreadsheet:
 *   Building Size (SF) = SUMIFS(ParcelImprovements[Gross Building Area (SF)], APN, Is GLA=TRUE)
 *   Office Area (SF)   = SUMIFS(ParcelImprovements[Office Area (SF)], APN)
 *   Warehouse Area (SF)= SUMIFS(ParcelImprovements[Warehouse Area (SF)], APN)
 *   Storage Area (SF)  = SUMIFS(ParcelImprovements[Storage Area (SF)], APN)
 *   Parking (SF)       = SUMIFS(ParcelImprovements[Parking (SF)], APN)
 *   Buildings          = MAX(ParcelImprovements[Building #] WHERE Is GLA=TRUE)
 */
export function rollupImprovementsToParcel(
  parcel: RawData,
  improvements: RawData[],
): RawData {
  const apn = parcel.APN as string | null | undefined;
  if (!apn) return parcel;

  const parcelImps = improvements.filter(
    (imp) => (imp.APN as string | undefined) === apn,
  );

  const num = (v: unknown): number => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };

  const isGla = (imp: RawData): boolean => imp["Is GLA"] === true;

  const buildingSf = parcelImps
    .filter(isGla)
    .reduce((sum, imp) => sum + num(imp["Gross Building Area (SF)"]), 0);

  const officeSf = parcelImps.reduce(
    (sum, imp) => sum + num(imp["Office Area (SF)"]),
    0,
  );
  const warehouseSf = parcelImps.reduce(
    (sum, imp) => sum + num(imp["Warehouse Area (SF)"]),
    0,
  );
  const storageSf = parcelImps.reduce(
    (sum, imp) => sum + num(imp["Storage Area (SF)"]),
    0,
  );
  const parkingSf = parcelImps.reduce(
    (sum, imp) => sum + num(imp["Parking (SF)"]),
    0,
  );

  const glaBuildings = parcelImps.filter(isGla).map((imp) => {
    const v = imp["Building #"];
    return typeof v === "number" ? v : 0;
  });
  const buildingsCount =
    glaBuildings.length > 0 ? Math.max(...glaBuildings) : 0;

  const result = { ...parcel };
  if (buildingSf > 0) result["Building Size (SF)"] = buildingSf;
  if (officeSf > 0) result["Office Area (SF)"] = officeSf;
  if (warehouseSf > 0) result["Warehouse Area (SF)"] = warehouseSf;
  if (storageSf > 0) result["Storage Area (SF)"] = storageSf;
  if (parkingSf > 0) result["Parking (SF)"] = parkingSf;
  if (buildingsCount > 0) result.Buildings = buildingsCount;

  return result;
}

/**
 * Aggregates parcel-level data (after improvements have been rolled up) into
 * comp-level fields. Mirrors the CompsSales table FILTER/SUM formulas:
 *   Building Size (SF)  = SUM(Parcels[Building Size (SF)])
 *   Office Area (SF)    = SUM(Parcels[Office Area (SF)])
 *   Warehouse Area (SF) = SUM(Parcels[Warehouse Area (SF)])
 *   Parking (SF)        = SUM(Parcels[Parking (SF)])
 *   Land Size (AC)      = SUM(Parcels[Size (AC)])
 *   Land Size (SF)      = AC_TO_SF(Land Size (AC))
 *   Year Built          = JOIN(UNIQUE(ParcelImprovements[Year Built] WHERE Is GLA))
 *   Effective Age       = weighted by building SF
 *   Buildings           = SUM(Parcels[Buildings])
 *   Taxes               = SUMIF(Parcels[Total Tax Amount])
 *   APN                 = JOIN(Parcels[APN], " & ")
 *   Legal               = JOIN(Parcels[Legal], "\n")
 *
 * Only fills fields that are currently null/undefined/empty so that
 * user-provided values are not overwritten.
 *
 * Mutates compData in place and returns it for chaining.
 */
export function rollupParcelsToComp(
  compData: RawData,
  parcels: RawData[],
  improvements: RawData[],
  refYear?: number,
): RawData {
  if (parcels.length === 0) return compData;

  const year = refYear ?? new Date().getFullYear();

  const num = (v: unknown): number => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v.replace(/[$,]/g, ""));
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };

  const emptyComp = (key: string) =>
    compData[key] == null || compData[key] === "" || compData[key] === 0;

  // --- Size rollup from parcels ---
  const totalBuildingSf = parcels.reduce(
    (s, p) => s + num(p["Building Size (SF)"]),
    0,
  );
  const totalOfficeSf = parcels.reduce(
    (s, p) => s + num(p["Office Area (SF)"]),
    0,
  );
  const totalWarehouseSf = parcels.reduce(
    (s, p) => s + num(p["Warehouse Area (SF)"]),
    0,
  );
  const totalParkingSf = parcels.reduce(
    (s, p) => s + num(p["Parking (SF)"]),
    0,
  );
  const totalLandAc = parcels.reduce((s, p) => s + num(p["Size (AC)"]), 0);
  const totalBuildings = parcels.reduce(
    (s, p) => s + num(p.Buildings),
    0,
  );

  if (emptyComp("Building Size (SF)") && totalBuildingSf > 0)
    compData["Building Size (SF)"] = totalBuildingSf;
  if (emptyComp("Office Area (SF)") && totalOfficeSf > 0)
    compData["Office Area (SF)"] = totalOfficeSf;
  if (emptyComp("Warehouse Area (SF)") && totalWarehouseSf > 0)
    compData["Warehouse Area (SF)"] = totalWarehouseSf;
  if (emptyComp("Parking (SF)") && totalParkingSf > 0)
    compData["Parking (SF)"] = totalParkingSf;
  if (emptyComp("Land Size (AC)") && totalLandAc > 0)
    compData["Land Size (AC)"] = Math.round(totalLandAc * 1000) / 1000;
  if (emptyComp("Land Size (SF)") && totalLandAc > 0)
    compData["Land Size (SF)"] = acToSf(totalLandAc);
  if (emptyComp("Buildings") && totalBuildings > 0)
    compData.Buildings = totalBuildings;

  // --- Tax rollup from parcels ---
  if (emptyComp("Taxes")) {
    const totalTaxAmount = parcels.reduce((s, p) => {
      const v = p["Total Tax Amount"];
      if (v == null || v === "") return s;
      return s + num(v);
    }, 0);
    if (totalTaxAmount > 0)
      compData.Taxes = totalTaxAmount;
  }

  // --- APN and Legal from parcels ---
  if (emptyComp("APN")) {
    const apns = parcels
      .map((p) => (typeof p.APN === "string" ? p.APN.trim() : ""))
      .filter(Boolean);
    if (apns.length > 0) compData.APN = apns.join(" & ");
  }
  if (emptyComp("Legal")) {
    const legals = parcels
      .map((p) => (typeof p.Legal === "string" ? p.Legal.trim() : ""))
      .filter(Boolean);
    if (legals.length > 0) compData.Legal = legals.join("\n");
  }

  // --- Year Built and Effective Age from parcel improvements (Is GLA only) ---
  const glaImps = improvements.filter((imp) => imp["Is GLA"] === true);
  if (glaImps.length > 0) {
    if (emptyComp("Year Built")) {
      const uniqueYears = Array.from(
        new Set(
          glaImps
            .map((imp) => imp["Year Built"])
            .filter((y): y is number => typeof y === "number" && y > 1000),
        ),
      ).sort();
      if (uniqueYears.length > 0)
        compData["Year Built"] = uniqueYears.join(", ");
    }

    if (emptyComp("Effective Age")) {
      const glaSizes = glaImps
        .map((imp) => num(imp["Gross Building Area (SF)"]))
        .filter((s) => s > 0);
      const glaYears = glaImps
        .map((imp) => imp["Year Built"])
        .filter((y): y is number => typeof y === "number" && y > 1000);
      if (glaYears.length > 0 && glaSizes.length === glaYears.length) {
        const effAge = calcEffectiveAgeWeighted(
          glaYears,
          year,
          glaSizes,
          totalBuildingSf > 0 ? totalBuildingSf : null,
        );
        if (effAge != null) compData["Effective Age"] = effAge;
      }
    }
  }

  return compData;
}

// ---------------------------------------------------------------------------
// Bulk compute: fill Generated fields for a comp raw_data object
// ---------------------------------------------------------------------------

/**
 * Given a comp's raw_data JSONB, compute all formula-derived fields
 * and return a new object with those fields filled in.
 * Only fills fields that are currently null/undefined/empty.
 *
 * @param compType - "land" | "sales" | "rentals". Affects Sale Price / SF
 *   denominator: for sales comps it divides by Building Size (SF) per the
 *   spreadsheet formula =I/Z (sale price / bldg SF); for land it divides by
 *   Land Size (SF). Defaults to "land" behaviour when omitted for backward compat.
 */
export function computeGeneratedFields(
  rawData: RawData,
  options?: {
    effectiveDateYear?: number;
    reportEffectiveDate?: string;
    percentIncPerMonth?: number;
    compType?: "land" | "sales" | "rentals";
  },
): RawData {
  const d = { ...rawData };
  const n = (key: string) => {
    const v = d[key];
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const p = parseFloat(v.replace(/[$,]/g, ""));
      return isNaN(p) ? null : p;
    }
    return null;
  };
  const s = (key: string) => {
    const v = d[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const empty = (key: string) =>
    d[key] == null || d[key] === "" || d[key] === 0;
  const year = options?.effectiveDateYear ?? new Date().getFullYear();
  const compType = options?.compType;

  if (empty("Land Size (SF)") && n("Land Size (AC)")) {
    d["Land Size (SF)"] = acToSf(n("Land Size (AC)"));
  }
  if (empty("Land Size (AC)") && n("Land Size (SF)")) {
    d["Land Size (AC)"] = sfToAc(n("Land Size (SF)"));
  }
  if (empty("Sale Price / AC")) {
    d["Sale Price / AC"] = salePricePerAc(n("Sale Price"), n("Land Size (AC)"));
  }

  // Sale Price / SF: for sale comps, divide by Building Size (SF);
  // for land comps (or unknown), divide by Land Size (SF).
  if (empty("Sale Price / SF")) {
    if (compType === "sales") {
      d["Sale Price / SF"] = salePricePerSf(
        n("Sale Price"),
        n("Building Size (SF)"),
      );
    } else {
      d["Sale Price / SF"] = salePricePerSf(n("Sale Price"), n("Land Size (SF)"));
    }
  }

  if (empty("Land / Bld Ratio")) {
    d["Land / Bld Ratio"] = landBldRatio(
      n("Land Size (SF)"),
      n("Building Size (SF)"),
    );
  }
  if (empty("Office %")) {
    d["Office %"] = officePercent(
      n("Office Area (SF)"),
      n("Building Size (SF)"),
    );
  }
  if (empty("Floor Area Ratio")) {
    d["Floor Area Ratio"] = floorAreaRatio(
      n("Building Size (SF)"),
      n("Land Size (SF)"),
    );
  }
  if (empty("Parking Ratio")) {
    d["Parking Ratio"] = parkingRatio(
      n("Parking Spaces"),
      n("Building Size (SF)"),
    );
  }
  if (empty("Age")) {
    d.Age = calcAge(d["Year Built"] as string | number | null, year);
  }

  // Effective Age from parcel improvements when not already set
  if (empty("Effective Age")) {
    const rawImps = d._parcelImprovements;
    if (Array.isArray(rawImps) && rawImps.length > 0) {
      const imps = rawImps as RawData[];
      const glaImps = imps.filter((imp) => imp["Is GLA"] === true);
      const glaYears = glaImps
        .map((imp) => imp["Year Built"])
        .filter((y): y is number => typeof y === "number" && y > 1000);
      const glaSizes = glaImps.map((imp) => {
        const v = imp["Gross Building Area (SF)"];
        return typeof v === "number" ? v : 0;
      });
      const totalBldgSf = n("Building Size (SF)");
      if (glaYears.length > 0) {
        const effAge = calcEffectiveAgeWeighted(
          glaYears,
          year,
          glaSizes.every((s) => s > 0) ? glaSizes : null,
          totalBldgSf,
        );
        if (effAge != null) d["Effective Age"] = effAge;
      }
    }
  }

  if (empty("Rent / SF / Year")) {
    d["Rent / SF / Year"] = rentPerSfPerYear(
      n("Rent / Month"),
      n("Building Size (SF)"),
    );
  }
  // Rent / SF (annualized, used on sales comps income section)
  if (empty("Rent / SF")) {
    const rentPerSf = rentPerSfPerYear(
      n("Rent / Month"),
      n("Building Size (SF)"),
    );
    if (rentPerSf != null) d["Rent / SF"] = rentPerSf;
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
    d.AddressLabel = formatAddressLabel(
      s("Address"),
      s("City"),
      s("State"),
      d.Zip as string | number | null,
    );
  }
  if (empty("AddressLocal")) {
    d.AddressLocal = formatAddressLocal(
      s("Address"),
      s("City"),
      s("County"),
      s("State"),
      d.Zip as string | number | null,
    );
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

  const elValForAdj = excessLandValue(
    n("Excess Land Size (AC)"),
    n("Excess Land Value / AC"),
  );
  if (empty("Excess Land Value")) {
    d["Excess Land Value"] = elValForAdj;
  }
  if (empty("Adj Sale Price")) {
    d["Adj Sale Price"] = adjSalePrice(n("Sale Price"), elValForAdj);
  }

  // Sale Price / SF (Adj): adj sale price / building SF
  if (empty("Sale Price / SF (Adj)")) {
    const adjPrice = adjSalePrice(n("Sale Price"), elValForAdj);
    const sfDenominator =
      compType === "sales" ? n("Building Size (SF)") : n("Land Size (SF)");
    if (adjPrice != null && sfDenominator) {
      d["Sale Price / SF (Adj)"] = salePricePerSf(adjPrice, sfDenominator);
    }
  }

  // Improvements / SF = Adj Sale Price / Building Size (SF)
  if (empty("Improvements / SF")) {
    const adjPrice = adjSalePrice(n("Sale Price"), elValForAdj);
    if (adjPrice != null && n("Building Size (SF)")) {
      d["Improvements / SF"] = salePricePerSf(
        adjPrice,
        n("Building Size (SF)"),
      );
    }
  }

  if (empty("Warehouse %")) {
    d["Warehouse %"] = warehousePercent(
      n("Warehouse Area (SF)"),
      n("Building Size (SF)"),
    );
  }
  if (empty("Land / Bld Ratio (Adj)")) {
    d["Land / Bld Ratio (Adj)"] = landBldRatioAdj(
      n("Land Size (SF)"),
      n("Excess Land Size (AC)"),
      n("Building Size (SF)"),
    );
  }
  if (empty("Other Features")) {
    const ohRaw = d["Overhead Doors"];
    let overheadStr: string | null = null;
    if (typeof ohRaw === "number" && !isNaN(ohRaw)) {
      overheadStr = String(ohRaw);
    } else if (typeof ohRaw === "string" && ohRaw.trim() !== "") {
      overheadStr = ohRaw.trim();
    }
    d["Other Features"] = buildOtherFeatures(
      overheadStr,
      d["Wash Bay"] as string | boolean | null | undefined,
      s("Hoisting"),
      s("Other Features Description"),
    );
  }

  return d;
}

// ---------------------------------------------------------------------------
// Number formatting helpers (for display)
// ---------------------------------------------------------------------------

export function formatCurrency(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (value == null) return "--";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatNumber(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (value == null) return "--";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value == null) return "--";
  return (value * 100).toFixed(decimals) + "%";
}

export function formatAcres(value: number | null | undefined): string {
  if (value == null) return "--";
  return value.toFixed(3);
}

export function totalTaxes(
  taxEntities: { Amount: number }[],
  sizeMultiplier: number | null | undefined,
): number | null {
  if (!taxEntities.length) return null;
  const sum = taxEntities.reduce((acc, t) => acc + (t.Amount || 0), 0);
  return sum * (sizeMultiplier ?? 1);
}

export function estExpenses(
  estInsurance: number | null | undefined,
  totalTaxesVal: number | null | undefined,
): number | null {
  if (estInsurance == null && totalTaxesVal == null) return null;
  return (estInsurance ?? 0) + (totalTaxesVal ?? 0);
}
