import "server-only";

import { createClient } from "~/utils/supabase/server";

type StructuredData = Record<string, unknown>;

/**
 * After a document is processed by Gemini, merge the extracted
 * structured data into the project's `subject_data` row.
 *
 * Uses an atomic Postgres function (`merge_subject_core`) so that
 * concurrent document processors never overwrite each other's fields.
 * Only empty/null/0 fields in `core` are filled — user-edited values
 * are never clobbered.
 */
export async function mergeDocumentIntoSubjectData(
  projectId: string,
  documentType: string,
  structuredData: StructuredData,
): Promise<void> {
  if (!projectId || !structuredData || typeof structuredData !== "object") {
    return;
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

  const supabase = await createClient();

  const { error } = await supabase.rpc("merge_subject_core", {
    p_project_id: projectId,
    p_patch: cleanPatch,
  });

  if (error) {
    console.error("[mergeDocumentIntoSubjectData] rpc merge_subject_core failed:", error);

    // Fallback: read-then-write (original behaviour, still better than nothing)
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
}

// ------------------------------------------------------------------
// Per-document-type field mappers
// ------------------------------------------------------------------

type CorePatch = Record<string, unknown>;

const MERGE_MAP: Record<string, (data: StructuredData) => CorePatch> = {
  deed: (d) => ({
    Legal: str(d.legal_description),
    Address: str(d.property_address),
    instrumentNumber: str(d.instrument_number),
  }),

  cad: (d) => ({
    APN: str(d.property_id),
    Legal: str(d.legal_description),
    "Land Size (AC)": num(d.lot_area_acres),
    "Land Size (SF)": num(d.lot_area_sqft),
    "Year Built": num(d.year_built),
  }),

  flood_map: (d) => ({
    FemaMapNum: str(d.fema_map_number),
    FemaZone: str(d.flood_zone),
    FemaIsHazardZone:
      d.in_special_flood_hazard_area === true
        ? true
        : d.in_special_flood_hazard_area === false
          ? false
          : d.in_special_flood_hazard_area === "true"
            ? true
            : d.in_special_flood_hazard_area === "false"
              ? false
              : null,
    FemaMapDate: str(d.map_effective_date),
  }),

  engagement: (d) => ({
    Address: str(d.property_address),
  }),
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
