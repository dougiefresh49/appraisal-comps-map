import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "~/utils/supabase/server";
import { parseZoningLocation } from "~/types/comp-field-options";

type StructuredData = Record<string, unknown>;

/**
 * After a document is processed by Gemini, merge the extracted
 * structured data into the project's `subject_data` row.
 *
 * Uses atomic Postgres functions (`merge_subject_core`, `merge_subject_core_force_keys`)
 * so concurrent document processors do not race. Location fields from cad/notes/deed use
 * the force merge path; other keys use fill-empty-only behavior.
 * Only empty/null/0 fields in `core` are filled by default — user-edited values
 * are not clobbered. For cad, notes, and deed documents, City, State, Zip, and
 * County from the document always overwrite (more reliable than regex-parsed address).
 *
 * flood_map documents are routed to the dedicated `fema` JSONB column.
 *
 * Accepts an optional pre-built SupabaseClient; when omitted a
 * service-role client is created so this works outside request context.
 */
export async function mergeDocumentIntoSubjectData(
  projectId: string,
  documentType: string,
  structuredData: StructuredData,
  injectedClient?: SupabaseClient,
): Promise<void> {
  if (!projectId || !structuredData || typeof structuredData !== "object") {
    return;
  }

  const supabase = injectedClient ?? createServiceClient();

  if (documentType === "flood_map") {
    return mergeFemaData(projectId, structuredData, supabase);
  }

  const mapper = MERGE_MAP[documentType];
  if (!mapper) return;

  const fields = (
    typeof structuredData.structured_data === "object" &&
    structuredData.structured_data !== null
      ? structuredData.structured_data
      : structuredData
  ) as StructuredData;

  const patch = mapper(fields);

  const cleanPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value != null && value !== "") {
      cleanPatch[key] = value;
    }
  }

  if (Object.keys(cleanPatch).length === 0) return;

  const forceKeys = DOCUMENT_FORCE_OVERWRITE_KEYS[documentType];
  const fillOnlyPatch: Record<string, unknown> = {};
  const forcePatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cleanPatch)) {
    if (forceKeys?.has(key)) forcePatch[key] = value;
    else fillOnlyPatch[key] = value;
  }

  if (Object.keys(forcePatch).length > 0) {
    const { error: forceErr } = await supabase.rpc("merge_subject_core_force_keys", {
      p_project_id: projectId,
      p_patch: forcePatch,
    });
    if (forceErr) {
      console.error(
        "[mergeDocumentIntoSubjectData] rpc merge_subject_core_force_keys failed:",
        forceErr,
      );
    }
  }

  const { error } =
    Object.keys(fillOnlyPatch).length > 0
      ? await supabase.rpc("merge_subject_core", {
          p_project_id: projectId,
          p_patch: fillOnlyPatch,
        })
      : { error: null };

  if (!error) {
    await backfillAddressParts(projectId, supabase);
    return;
  }

  if (error) {
    console.error("[mergeDocumentIntoSubjectData] rpc merge_subject_core failed:", error);

    const { data: existing } = await supabase
      .from("subject_data")
      .select("core")
      .eq("project_id", projectId)
      .maybeSingle();

    const currentCore = (existing?.core ?? {}) as Record<string, unknown>;
    const mergedCore = { ...currentCore };
    for (const [key, value] of Object.entries(cleanPatch)) {
      const cur = mergedCore[key];
      const overwrite = forceKeys?.has(key) ?? false;
      if (overwrite || cur == null || cur === "" || cur === 0) {
        mergedCore[key] = value;
      }
    }

    const { error: upsertError } = await supabase
      .from("subject_data")
      .upsert(
        {
          project_id: projectId,
          core: mergedCore,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id" },
      );

    if (upsertError) {
      console.error("[mergeDocumentIntoSubjectData] fallback upsert failed:", upsertError);
    }
  }

  await backfillAddressParts(projectId, supabase);
}

/**
 * If Address is set but City/State/Zip are empty, attempt to parse them out.
 */
async function backfillAddressParts(
  projectId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { data } = await supabase
    .from("subject_data")
    .select("core")
    .eq("project_id", projectId)
    .maybeSingle();

  const core = (data?.core ?? {}) as Record<string, unknown>;
  const address = typeof core.Address === "string" ? core.Address : "";
  if (!address) return;

  const hasCity = core.City != null && core.City !== "";
  const hasState = core.State != null && core.State !== "";
  const hasZip = core.Zip != null && core.Zip !== "";

  if (hasCity && hasState && hasZip) return;

  const parts = parseAddressComponents(address);
  const backfill: Record<string, unknown> = {};
  if (!hasCity && parts.city) backfill.City = parts.city;
  if (!hasState && parts.state) backfill.State = parts.state;
  if (!hasZip && parts.zip) backfill.Zip = parts.zip;

  if (Object.keys(backfill).length === 0) return;

  const { error: rpcErr } = await supabase.rpc("merge_subject_core", {
    p_project_id: projectId,
    p_patch: backfill,
  });

  if (rpcErr) {
    const merged = { ...core, ...backfill };
    await supabase
      .from("subject_data")
      .upsert(
        { project_id: projectId, core: merged, updated_at: new Date().toISOString() },
        { onConflict: "project_id" },
      );
  }
}

function parseAddressComponents(address: string): {
  city?: string;
  state?: string;
  zip?: string;
} {
  if (!address) return {};

  const p1 = /,\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i.exec(address);
  if (p1) return { city: p1[1]?.trim(), state: p1[2]?.toUpperCase(), zip: p1[3] };

  const p2 = /\s+(\S+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i.exec(address);
  if (p2) return { city: p2[1]?.trim(), state: p2[2]?.toUpperCase(), zip: p2[3] };

  const p3 = /,\s*([^,]+),\s*([A-Z]{2})\s*$/i.exec(address);
  if (p3) return { city: p3[1]?.trim(), state: p3[2]?.toUpperCase() };

  const p4 = /\s+(\S+)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i.exec(address);
  if (p4) return { city: p4[1]?.trim(), state: p4[2]?.toUpperCase(), zip: p4[3] };

  return {};
}

/**
 * Merge FEMA-specific fields into the dedicated `subject_data.fema` column.
 * Only fills keys whose current value is null/empty — user-edited values
 * are never clobbered.
 */
async function mergeFemaData(
  projectId: string,
  structuredData: StructuredData,
  supabase: SupabaseClient,
): Promise<void> {
  if (!projectId || !structuredData) return;

  const fields = (
    typeof structuredData.structured_data === "object" &&
    structuredData.structured_data !== null
      ? structuredData.structured_data
      : structuredData
  ) as StructuredData;

  const femaPayload: Record<string, unknown> = {};
  const mapNum = str(fields.fema_map_number);
  const zone = str(fields.flood_zone);
  const mapDate = str(fields.map_effective_date);
  const hazard = fields.in_special_flood_hazard_area;

  if (mapNum) femaPayload.FemaMapNum = mapNum;
  if (zone) femaPayload.FemaZone = zone;
  if (mapDate) femaPayload.FemaMapDate = mapDate;
  if (hazard === true || hazard === "true") femaPayload.FemaIsHazardZone = true;
  else if (hazard === false || hazard === "false") femaPayload.FemaIsHazardZone = false;

  if (Object.keys(femaPayload).length === 0) return;

  const { data: existing } = await supabase
    .from("subject_data")
    .select("fema")
    .eq("project_id", projectId)
    .maybeSingle();

  const currentFema = (existing?.fema ?? {}) as Record<string, unknown>;
  const merged = { ...currentFema };
  for (const [key, value] of Object.entries(femaPayload)) {
    const cur = merged[key];
    if (cur == null || cur === "" || cur === 0) {
      merged[key] = value;
    }
  }

  const { error } = await supabase
    .from("subject_data")
    .upsert(
      {
        project_id: projectId,
        fema: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );

  if (error) {
    console.error("[mergeFemaData] upsert failed:", error);
  }
}

// ------------------------------------------------------------------
// Per-document-type field mappers
// ------------------------------------------------------------------

type CorePatch = Record<string, unknown>;

/** Document-sourced location fields: always overwrite (beat regex-parsed address). */
const LOCATION_FORCE_KEYS = new Set(["City", "State", "Zip", "County"]);

const DOCUMENT_FORCE_OVERWRITE_KEYS: Record<string, Set<string>> = {
  cad: LOCATION_FORCE_KEYS,
  notes: LOCATION_FORCE_KEYS,
  deed: LOCATION_FORCE_KEYS,
};

const MERGE_MAP: Record<string, (data: StructuredData) => CorePatch> = {
  deed: (d) => {
    const address = str(d.property_address);
    const fromAddr = address ? parseAddressComponents(address) : {};
    return {
      Address: address,
      ...(fromAddr.city ? { City: fromAddr.city } : {}),
      ...(fromAddr.state ? { State: fromAddr.state } : {}),
      ...(fromAddr.zip ? { Zip: fromAddr.zip } : {}),
      instrumentNumber: str(d.instrument_number),
      County: str(d.county),
      purchasePrice: str(d.consideration),
      purchaseDate: str(d.recording_date),
      loanAmount: str(d.loan_amount),
      deedType: str(d.deed_type),
      grantor: str(d.grantor),
      grantee: str(d.grantee),
      ownershipSummary: str(d.ownership_summary),
    };
  },

  cad: (d) => ({
    APN: str(d.property_id),
    Legal: str(d.legal_description),
    "Land Size (AC)": num(d.lot_area_acres),
    "Land Size (SF)": num(d.lot_area_sqft),
    "Year Built": num(d.year_built),
    City: str(d.city),
    County: str(d.county),
    Zoning: str(d.zoning),
    "Building Size (SF)": num(d.building_size_sf ?? d.total_building_sf),
    Construction: str(d.construction_type ?? d.construction),
    Condition: str(d.condition),
  }),

  engagement: (d) => ({
    Address: str(d.property_address),
  }),

  notes: (d) => {
    const patch: CorePatch = {};
    if (str(d.property_address)) patch.Address = str(d.property_address);
    if (str(d.city)) patch.City = str(d.city);
    if (str(d.state)) patch.State = str(d.state);
    if (str(d.zip)) patch.Zip = str(d.zip);
    if (str(d.county)) patch.County = str(d.county);
    if (str(d.client_name)) patch.clientName = str(d.client_name);
    if (str(d.client_company)) patch.clientCompany = str(d.client_company);
    if (num(d.purchase_price)) patch.purchasePrice = num(d.purchase_price);
    if (str(d.purchase_date)) patch.purchaseDate = str(d.purchase_date);
    if (str(d.deed_number)) patch.instrumentNumber = str(d.deed_number);
    if (num(d.land_size_ac)) patch["Land Size (AC)"] = num(d.land_size_ac);
    if (num(d.land_size_sf)) patch["Land Size (SF)"] = num(d.land_size_sf);
    if (str(d.zoning)) patch.Zoning = str(d.zoning);
    const zArea = parseZoningLocation(str(d.zoning_area));
    if (zArea != null) patch["Zoning Area"] = zArea;
    if (num(d.year_built)) patch["Year Built"] = num(d.year_built);
    if (num(d.building_size_sf)) patch["Building Size (SF)"] = num(d.building_size_sf);
    if (str(d.construction)) patch.Construction = str(d.construction);
    if (str(d.condition)) patch.Condition = str(d.condition);
    if (str(d.site_improvements)) patch["Other Features"] = str(d.site_improvements);
    if (str(d.utilities_electricity)) patch["Utils - Electricity"] = str(d.utilities_electricity);
    if (str(d.utilities_water)) patch["Utils - Water"] = str(d.utilities_water);
    if (str(d.utilities_sewer)) patch["Utils - Sewer"] = str(d.utilities_sewer);
    if (str(d.overhead_doors)) patch["Overhead Doors"] = str(d.overhead_doors);
    if (str(d.hoisting)) patch.Hoisting = str(d.hoisting);
    if (d.corner_lot === true) patch.Corner = true;
    else if (d.corner_lot === false) patch.Corner = false;
    if (d.highway_frontage === true) patch.Frontage = "Highway";
    return patch;
  },

  sketch: (d) => {
    const patch: CorePatch = {};
    if (num(d.total_living_area_sf)) patch["Building Size (SF)"] = num(d.total_living_area_sf);
    return patch;
  },
};

/**
 * Compute a proposed `core` patch by re-applying the MERGE_MAP to all
 * structured data from the provided documents, treating all fields as fresh
 * proposals (no fill-empty-only constraint). Returns the merged result.
 *
 * This is used for the reparse-preview endpoint to show diffs without writing.
 */
export function computeProposedCoreFromDocuments(
  documents: Array<{ document_type: string; structured_data: unknown }>,
): Record<string, unknown> {
  const proposed: Record<string, unknown> = {};

  for (const doc of documents) {
    const { document_type, structured_data } = doc;

    if (!structured_data || typeof structured_data !== "object") continue;

    const fields = (
      typeof (structured_data as Record<string, unknown>).structured_data === "object" &&
      (structured_data as Record<string, unknown>).structured_data !== null
        ? (structured_data as Record<string, unknown>).structured_data
        : structured_data
    ) as Record<string, unknown>;

    const mapper = MERGE_MAP[document_type];
    if (!mapper) continue;

    const patch = mapper(fields);
    for (const [key, value] of Object.entries(patch)) {
      if (value != null && value !== "") {
        // Later documents overwrite earlier ones (most recent wins)
        proposed[key] = value;
      }
    }
  }

  return proposed;
}

/**
 * Compute a proposed `fema` patch from flood_map documents.
 */
export function computeProposedFemaFromDocuments(
  documents: Array<{ document_type: string; structured_data: unknown }>,
): Record<string, unknown> {
  const proposed: Record<string, unknown> = {};

  for (const doc of documents) {
    if (doc.document_type !== "flood_map") continue;
    const { structured_data } = doc;
    if (!structured_data || typeof structured_data !== "object") continue;

    const fields = (
      typeof (structured_data as Record<string, unknown>).structured_data === "object" &&
      (structured_data as Record<string, unknown>).structured_data !== null
        ? (structured_data as Record<string, unknown>).structured_data
        : structured_data
    ) as Record<string, unknown>;

    const mapNum = str(fields.fema_map_number);
    const zone = str(fields.flood_zone);
    const mapDate = str(fields.map_effective_date);
    const hazard = fields.in_special_flood_hazard_area;

    if (mapNum) proposed.FemaMapNum = mapNum;
    if (zone) proposed.FemaZone = zone;
    if (mapDate) proposed.FemaMapDate = mapDate;
    if (hazard === true || hazard === "true") proposed.FemaIsHazardZone = true;
    else if (hazard === false || hazard === "false") proposed.FemaIsHazardZone = false;
  }

  return proposed;
}

// Re-export MERGE_MAP for use in the reparse-preview route
export { MERGE_MAP };

// ------------------------------------------------------------------
// Parcel & improvement builders from document structured_data
// ------------------------------------------------------------------

/**
 * Build a proposed `ParcelData[]` from processed CAD documents.
 * Each CAD document represents one parcel.
 */
export function computeProposedParcelsFromDocuments(
  documents: Array<{ document_type: string; structured_data: unknown }>,
): import("~/types/comp-data").ParcelData[] {
  const parcels: import("~/types/comp-data").ParcelData[] = [];

  for (const doc of documents) {
    if (doc.document_type !== "cad") continue;
    const { structured_data } = doc;
    if (!structured_data || typeof structured_data !== "object") continue;

    const fields = (
      typeof (structured_data as Record<string, unknown>).structured_data ===
        "object" &&
      (structured_data as Record<string, unknown>).structured_data !== null
        ? (structured_data as Record<string, unknown>).structured_data
        : structured_data
    ) as Record<string, unknown>;

    const apn = str(fields.property_id) ?? "";
    const improvements = Array.isArray(fields.improvements)
      ? (fields.improvements as unknown[])
      : [];

    parcels.push({
      instrumentNumber: null,
      APN: apn,
      "APN Link": "",
      Location: str(fields.property_address) ?? "",
      Legal: str(fields.legal_description) ?? "",
      "Lot #": null,
      "Size (AC)": num(fields.lot_area_acres),
      "Size (SF)": num(fields.lot_area_sqft),
      "Flood Zone": null,
      "Building Size (SF)":
        num(fields.building_size_sf) ?? num(fields.total_building_sf),
      "Office Area (SF)": num(fields.office_area_sf),
      "Warehouse Area (SF)": num(fields.warehouse_area_sf),
      "Storage Area (SF)": num(fields.storage_area_sf),
      "Parking (SF)": num(fields.parking_sf),
      Buildings: improvements.length > 0 ? improvements.length : null,
      "Total Tax Amount": str(fields.total_tax_amount),
      "County Appraised Value":
        str(fields.total_assessed_value) ??
        str(fields.assessed_improvement_value) ??
        undefined,
    });
  }

  return parcels;
}

/**
 * Build a proposed `ParcelImprovement[]` from CAD, notes, and sketch documents.
 * CAD improvements are authoritative; notes/sketch buildings supplement when
 * no CAD improvements exist for a given APN.
 */
export function computeProposedImprovementsFromDocuments(
  documents: Array<{ document_type: string; structured_data: unknown }>,
): import("~/types/comp-data").ParcelImprovement[] {
  const improvements: import("~/types/comp-data").ParcelImprovement[] = [];

  // Track APNs that have been covered by CAD so notes/sketch don't double-add
  const cadApns = new Set<string>();

  for (const doc of documents) {
    if (doc.document_type !== "cad") continue;
    const { structured_data } = doc;
    if (!structured_data || typeof structured_data !== "object") continue;

    const fields = (
      typeof (structured_data as Record<string, unknown>).structured_data ===
        "object" &&
      (structured_data as Record<string, unknown>).structured_data !== null
        ? (structured_data as Record<string, unknown>).structured_data
        : structured_data
    ) as Record<string, unknown>;

    const apn = str(fields.property_id) ?? "";
    const cadImps = Array.isArray(fields.improvements)
      ? (fields.improvements as Record<string, unknown>[])
      : [];

    if (cadImps.length > 0) {
      cadApns.add(apn);
      cadImps.forEach((imp, idx) => {
        improvements.push({
          instrumentNumber: null,
          APN: apn,
          "Building #": num(imp.building_number) ?? idx + 1,
          "Section #": num(imp.section_number) ?? 1,
          "Year Built": num(imp.year_built),
          "Gross Building Area (SF)": num(imp.area_sf),
          "Office Area (SF)": num(imp.office_area_sf),
          "Warehouse Area (SF)": num(imp.warehouse_area_sf),
          "Parking (SF)": num(imp.parking_sf),
          "Storage Area (SF)": num(imp.storage_area_sf),
          "Is GLA": imp.is_gla !== false,
          Construction: str(imp.construction) ?? str(fields.construction_type) ?? "",
          Comments: str(imp.description),
        });
      });
    } else if (apn) {
      // CAD doc exists but no per-section rows — create one from aggregate fields
      const bldSf =
        num(fields.building_size_sf) ?? num(fields.total_building_sf);
      if (bldSf != null && bldSf > 0) {
        cadApns.add(apn);
        improvements.push({
          instrumentNumber: null,
          APN: apn,
          "Building #": 1,
          "Section #": 1,
          "Year Built": num(fields.year_built),
          "Gross Building Area (SF)": bldSf,
          "Office Area (SF)": num(fields.office_area_sf),
          "Warehouse Area (SF)": num(fields.warehouse_area_sf),
          "Parking (SF)": num(fields.parking_sf),
          "Storage Area (SF)": num(fields.storage_area_sf),
          "Is GLA": true,
          Construction:
            str(fields.construction_type) ?? str(fields.construction) ?? "",
          Comments: null,
        });
      }
    }
  }

  // Supplement from notes buildings when CAD produced no improvements
  let notesBldIdx = improvements.length;
  for (const doc of documents) {
    if (doc.document_type !== "notes") continue;
    const { structured_data } = doc;
    if (!structured_data || typeof structured_data !== "object") continue;

    const fields = (
      typeof (structured_data as Record<string, unknown>).structured_data ===
        "object" &&
      (structured_data as Record<string, unknown>).structured_data !== null
        ? (structured_data as Record<string, unknown>).structured_data
        : structured_data
    ) as Record<string, unknown>;

    const buildings = Array.isArray(fields.buildings)
      ? (fields.buildings as Record<string, unknown>[])
      : [];

    // Only add notes buildings if CAD didn't produce any improvements at all
    if (cadApns.size === 0 && buildings.length > 0) {
      buildings.forEach((bld, idx) => {
        improvements.push({
          instrumentNumber: null,
          APN: "",
          "Building #": notesBldIdx + idx + 1,
          "Section #": 1,
          "Year Built": num(bld.year_built),
          "Gross Building Area (SF)": num(bld.size_sf),
          "Office Area (SF)": null,
          "Warehouse Area (SF)": null,
          "Parking (SF)": null,
          "Storage Area (SF)": null,
          "Is GLA": true,
          Construction: str(bld.construction) ?? "",
          Comments: str(bld.name),
        });
      });
      notesBldIdx += buildings.length;
    }
  }

  // Supplement from sketch buildings when still no improvements exist
  if (improvements.length === 0) {
    for (const doc of documents) {
      if (doc.document_type !== "sketch") continue;
      const { structured_data } = doc;
      if (!structured_data || typeof structured_data !== "object") continue;

      const fields = (
        typeof (structured_data as Record<string, unknown>).structured_data ===
          "object" &&
        (structured_data as Record<string, unknown>).structured_data !== null
          ? (structured_data as Record<string, unknown>).structured_data
          : structured_data
      ) as Record<string, unknown>;

      const buildings = Array.isArray(fields.buildings)
        ? (fields.buildings as Record<string, unknown>[])
        : [];

      buildings.forEach((bld, idx) => {
        improvements.push({
          instrumentNumber: null,
          APN: "",
          "Building #": idx + 1,
          "Section #": 1,
          "Year Built": null,
          "Gross Building Area (SF)": num(bld.area_sf),
          "Office Area (SF)": null,
          "Warehouse Area (SF)": null,
          "Parking (SF)": null,
          "Storage Area (SF)": null,
          "Is GLA": bld.type !== "non_living_area",
          Construction: "",
          Comments: str(bld.name),
        });
      });
    }
  }

  return improvements;
}

// ------------------------------------------------------------------
// Value helpers
// ------------------------------------------------------------------

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && !isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (!isNaN(n)) return n;
  }
  return null;
}
