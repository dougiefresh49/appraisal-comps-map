import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "~/utils/supabase/server";

type StructuredData = Record<string, unknown>;

/**
 * After a document is processed by Gemini, merge the extracted
 * structured data into the project's `subject_data` row.
 *
 * Uses an atomic Postgres function (`merge_subject_core`) so that
 * concurrent document processors never overwrite each other's fields.
 * Only empty/null/0 fields in `core` are filled — user-edited values
 * are never clobbered.
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

  const { error } = await supabase.rpc("merge_subject_core", {
    p_project_id: projectId,
    p_patch: cleanPatch,
  });

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
      if (cur == null || cur === "" || cur === 0) {
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

  const p2 = /\s+(\w[\w\s]*?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i.exec(address);
  if (p2) return { city: p2[1]?.trim(), state: p2[2]?.toUpperCase(), zip: p2[3] };

  const p3 = /,\s*([^,]+),\s*([A-Z]{2})\s*$/i.exec(address);
  if (p3) return { city: p3[1]?.trim(), state: p3[2]?.toUpperCase() };

  const p4 = /\s+(\w[\w\s]*?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i.exec(address);
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

const MERGE_MAP: Record<string, (data: StructuredData) => CorePatch> = {
  deed: (d) => ({
    Address: str(d.property_address),
    instrumentNumber: str(d.instrument_number),
    County: str(d.county),
    purchasePrice: str(d.consideration),
    purchaseDate: str(d.recording_date),
    loanAmount: str(d.loan_amount),
    deedType: str(d.deed_type),
    grantor: str(d.grantor),
    grantee: str(d.grantee),
    ownershipSummary: str(d.ownership_summary),
  }),

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
    if (str(d.zoning_area)) patch["Zoning Area"] = str(d.zoning_area);
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
    if (d.highway_frontage === true) patch["Highway Frontage"] = true;
    else if (d.highway_frontage === false) patch["Highway Frontage"] = false;
    return patch;
  },

  sketch: (d) => {
    const patch: CorePatch = {};
    if (num(d.total_living_area_sf)) patch["Building Size (SF)"] = num(d.total_living_area_sf);
    return patch;
  },
};

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
