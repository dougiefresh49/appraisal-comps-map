import "server-only";

import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";

const SYNTHESIS_MODEL = "gemini-3-flash-preview";

/**
 * Non-Generated SubjectData keys that Gemini can populate from photo + doc observations.
 * Formula-calculated fields (marked Generated in parser-type-defs.md) are excluded —
 * those are handled by the improvement analysis populate module's calculated fields logic.
 */
const SUBJECT_CORE_SCHEMA = `interface SubjectCoreFields {
  // Identity
  Address?: string;
  City?: string;
  State?: string;
  County?: string;
  Zip?: string;
  instrumentNumber?: string | null;

  // Property Classification
  "Property Type"?: string | null;
  "Property Type Long"?: string | null;

  // Physical / Structural
  Construction?: string | null;   // e.g. "Steel beam frame", "Wood frame", "CMU block"
  Condition?: "Good" | "Average" | "Fair" | "Poor";

  // Site characteristics
  Corner?: boolean;
  "Highway Frontage"?: boolean;
  Frontage?: "Highway" | "Main" | "Secondary" | "Dirt" | "None" | "Yes" | "No" | null;
  Surface?: "Cleared" | "Caliche" | "Raw" | null;

  // Utilities
  "Utils - Electricity"?: boolean | null;
  "Utils - Water"?: "Public" | "Well" | "None" | "Unk";
  "Utils - Sewer"?: "Public" | "Septic" | "None" | "Unk";

  // Parking
  "Parking Spaces"?: number | null;
  "Parking Spaces Details"?: string | null;  // e.g. "10 Regular, 2 Handicap"

  // Industrial / special features
  "Other Features"?: string | null;  // combine: overhead doors, special features
  "Wash Bay"?: boolean | null;
  Hoisting?: string | null;          // e.g. "5T (x2)", "None"

  // Zoning
  "Zoning Area"?: "Inside City Limits" | "Inside & Outside City Limits" | "Inside ETJ" | "Outside ETJ" | "None" | null;
  "Zoning Description"?: string;

  // Rental / occupancy (if observable)
  Tenant?: string | null;
  "Occupancy %"?: string | null;

  // Number of improvements
  "Number of Buildings"?: number | null;
}`;

function getAI(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GEMINI_API_KEY is not set — Gemini synthesis requires an API key",
    );
  }
  return new GoogleGenAI({ apiKey });
}

interface PhotoRow {
  label: string;
  description: string | null;
  improvements_observed: Record<string, string> | null;
}

interface DocumentRow {
  document_type: string;
  document_label: string | null;
  extracted_text: string | null;
  structured_data: Record<string, unknown> | null;
}

/**
 * Aggregate first-non-empty value per improvements_observed key across all photos.
 * Same logic as fetchAggregatedPhotoImprovements but operates on in-memory rows.
 */
function aggregatePhotoImprovements(
  photos: PhotoRow[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const photo of photos) {
    const obs = photo.improvements_observed;
    if (!obs) continue;
    for (const [k, v] of Object.entries(obs)) {
      if (v?.trim() && !(k in result)) result[k] = v.trim();
    }
  }
  return result;
}

/** Build a readable summary of photo descriptions grouped by category keyword. */
function buildPhotoSummary(photos: PhotoRow[]): string {
  if (photos.length === 0) return "No photos available.";
  return photos
    .filter((p) => p.description?.trim())
    .map((p) => `[${p.label}]: ${p.description!.trim()}`)
    .join("\n");
}

/** Render structured document data as compact JSON, truncated for prompt safety. */
function buildDocSummary(docs: DocumentRow[]): string {
  if (docs.length === 0) return "No documents available.";
  return docs
    .map((d) => {
      const label = d.document_label ?? d.document_type;
      const structured = d.structured_data
        ? JSON.stringify(d.structured_data).slice(0, 2000)
        : null;
      const extracted = d.extracted_text?.slice(0, 1000);
      const content = structured ?? extracted ?? "(no content)";
      return `[${label} (${d.document_type})]:\n${content}`;
    })
    .join("\n\n");
}

export interface SubjectCorePatchResult {
  currentCore: Record<string, unknown>;
  proposedPatch: Record<string, unknown>;
  error?: string;
}

/**
 * Builds a subject_data.core patch from photo observations and documents using Gemini.
 * Returns the currentCore and the proposed patch WITHOUT applying any merge.
 *
 * Flow:
 * 1. Fetch all included photo_analyses (descriptions + improvements_observed)
 * 2. Fetch project_documents (CAD, deed, engagement, title)
 * 3. Fetch current subject_data.core
 * 4. Build a structured prompt with type definitions and all evidence
 * 5. Call Gemini with responseMimeType: "application/json"
 * 6. Return { currentCore, proposedPatch } — caller decides whether to auto-merge or show preview
 */
export async function buildSubjectCorePatch(
  projectId: string,
  supabase: SupabaseClient,
): Promise<SubjectCorePatchResult> {
  // 1. Fetch photos
  const photosResult = await supabase
    .from("photo_analyses")
    .select("label, description, improvements_observed")
    .eq("project_id", projectId)
    .eq("is_included", true)
    .order("sort_order", { ascending: true });

  if (photosResult.error) throw photosResult.error;
  const photos = (photosResult.data ?? []) as PhotoRow[];

  if (photos.length === 0) {
    return { currentCore: {}, proposedPatch: {}, error: "No photos to synthesize from" };
  }

  // 2. Fetch documents
  const docsResult = await supabase
    .from("project_documents")
    .select("document_type, document_label, extracted_text, structured_data")
    .eq("project_id", projectId)
    .in("document_type", ["cad", "deed", "engagement", "title"]);

  if (docsResult.error) throw docsResult.error;
  const docs = (docsResult.data ?? []) as DocumentRow[];

  // 3. Fetch current core to avoid regression
  const coreResult = await supabase
    .from("subject_data")
    .select("core")
    .eq("project_id", projectId)
    .maybeSingle();

  if (coreResult.error) throw coreResult.error;
  const currentCore =
    (coreResult.data as { core: Record<string, unknown> } | null)?.core ?? {};

  // Build evidence strings
  const aggregatedImprovements = aggregatePhotoImprovements(photos);
  const photoSummary = buildPhotoSummary(photos);
  const docSummary = buildDocSummary(docs);

  const currentCoreStr =
    Object.keys(currentCore).length > 0
      ? JSON.stringify(currentCore, null, 2).slice(0, 3000)
      : "{}";

  const improvementsStr =
    Object.keys(aggregatedImprovements).length > 0
      ? JSON.stringify(aggregatedImprovements, null, 2)
      : "{}";

  const prompt = `You are a commercial real estate appraiser synthesizing property inspection data into a structured database record.

Your task: produce a JSON patch for the subject property's core data record, using evidence from inspection photos and parsed documents.

## Target Schema (populate only keys where you have clear evidence)

${SUBJECT_CORE_SCHEMA}

## Instructions

1. Output ONLY a valid JSON object — no markdown, no explanation, no code fences.
2. Include ONLY keys from the schema above where you have sufficient evidence.
3. Do NOT include keys that are already populated in the CURRENT CORE section unless your evidence clearly provides a more accurate value.
4. Do NOT include formula-calculated fields (APN, Legal, Building Size, Land Size, ratios, etc.) — those come from other sources.
5. Prefer the most specific description available. For "Construction", use the structural frame type (e.g., "Steel beam frame") not just materials.
6. For "Condition", only use: "Good", "Average", "Fair", or "Poor".
7. For "Surface", only use: "Cleared", "Caliche", or "Raw".
8. For boolean fields, output true or false (not strings).
9. Consolidate "Other Features" into a single descriptive string combining overhead doors, wash bays, and other notable features.

## Current Core (already-populated fields — do not regress these)

${currentCoreStr}

## Aggregated Photo Observations (improvements_observed keys across all photos)

${improvementsStr}

## Photo Descriptions (per-photo Gemini observations)

${photoSummary}

## Parsed Documents

${docSummary}

Respond with ONLY the JSON patch object:`;

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: SYNTHESIS_MODEL,
    contents: prompt,
    config: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  });

  const raw = (response.text ?? "").trim();
  let patch: Record<string, unknown>;
  try {
    patch = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.error("[buildSubjectCorePatch] Failed to parse Gemini JSON:", raw.slice(0, 500));
    return { currentCore, proposedPatch: {}, error: "Failed to parse synthesis response" };
  }

  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return { currentCore, proposedPatch: {}, error: "Synthesis returned non-object response" };
  }

  // Remove null/undefined/empty-string values
  const cleanPatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && v !== undefined && v !== "") {
      cleanPatch[k] = v;
    }
  }

  return { currentCore, proposedPatch: cleanPatch };
}

/**
 * Synthesizes a subject_data.core patch from photo observations and documents using Gemini,
 * then auto-merges via the merge_subject_core RPC.
 *
 * Used in the background pipeline after full photo analysis completes.
 * For interactive merge review, use buildSubjectCorePatch + DataMergeDialog instead.
 */
export async function synthesizeSubjectCoreFromPhotos(
  projectId: string,
  supabase: SupabaseClient,
): Promise<{ patchedKeys: string[]; error?: string }> {
  try {
    const { proposedPatch, error } = await buildSubjectCorePatch(
      projectId,
      supabase,
    );

    if (error) return { patchedKeys: [], error };

    if (Object.keys(proposedPatch).length === 0) {
      return { patchedKeys: [] };
    }

    const { error: rpcError } = await supabase.rpc("merge_subject_core", {
      p_project_id: projectId,
      p_patch: proposedPatch,
    });

    if (rpcError) {
      console.error("[synthesizeSubjectCoreFromPhotos] RPC error:", rpcError);
      return { patchedKeys: [], error: rpcError.message };
    }

    const patchedKeys = Object.keys(proposedPatch);
    console.log(
      `[synthesizeSubjectCoreFromPhotos] Patched ${patchedKeys.length} core keys for project ${projectId}:`,
      patchedKeys.join(", "),
    );

    return { patchedKeys };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[synthesizeSubjectCoreFromPhotos] Error:", message);
    return { patchedKeys: [], error: message };
  }
}
