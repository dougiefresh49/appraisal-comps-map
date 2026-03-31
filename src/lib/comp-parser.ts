import "server-only";

import { GoogleGenAI, type Part } from "@google/genai";
import { createClient } from "~/utils/supabase/server";
import { downloadFile } from "~/lib/drive-api";
import { buildCompExtractionPrompt } from "~/lib/parsing-prompts";
import type { LandSaleData, SaleData, RentalData, CompType } from "~/types/comp-data";

const GENERATION_MODEL = "gemini-3.1-pro-preview";

function getAI(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey });
}

export interface ParseCompInput {
  compId: string;
  projectId: string;
  type: CompType;
  fileBuffers: { buffer: Buffer; mimeType: string; name: string }[];
  extraContext?: string;
  driveToken?: string;
}

export interface ParseCompResult {
  ok: boolean;
  data?: LandSaleData | SaleData | RentalData;
  error?: string;
}

/**
 * Parse comp files using Gemini AI and save structured data to Supabase.
 */
export async function parseCompFiles(
  input: ParseCompInput,
): Promise<ParseCompResult> {
  const supabase = await createClient();

  // Mark as processing
  await supabase
    .from("comparables")
    .update({ parsed_data_status: "processing" })
    .eq("id", input.compId);

  try {
    const ai = getAI();
    const prompt = buildCompExtractionPrompt(input.type, input.extraContext);

    const parts: Part[] = [];

    for (const file of input.fileBuffers) {
      parts.push({
        inlineData: {
          data: file.buffer.toString("base64"),
          mimeType: file.mimeType,
        },
      });
    }

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: parts,
      config: {
        temperature: 0.1,
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
      },
    });

    const text = response.text ?? "";
    let responseData: Record<string, unknown>;

    try {
      responseData = JSON.parse(text) as Record<string, unknown>;
    } catch {
      const jsonMatch = /\{[\s\S]*\}/.exec(text);
      if (!jsonMatch) {
        throw new Error("Gemini did not return valid JSON");
      }
      responseData = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    }

    // The new prompt returns { compData, parcelData, parcelImprovements }.
    // Fall back to treating the whole response as comp data for backward compat.
    const compData = (responseData.compData ?? responseData) as LandSaleData | SaleData | RentalData;
    const parcelData = (responseData.parcelData ?? []) as Record<string, unknown>[];
    const parcelImprovements = (responseData.parcelImprovements ?? []) as Record<string, unknown>[];

    // Store the full response (comp + parcels + improvements) in raw_data
    const fullRawData: Record<string, unknown> = {
      ...(compData as unknown as Record<string, unknown>),
      _parcelData: parcelData,
      _parcelImprovements: parcelImprovements,
    };

    const { error: upsertError } = await supabase
      .from("comp_parsed_data")
      .upsert(
        {
          comp_id: input.compId,
          project_id: input.projectId,
          raw_data: fullRawData,
          source: "parser",
          parsed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "comp_id" },
      );

    if (upsertError) {
      throw new Error(`Failed to save parsed data: ${upsertError.message}`);
    }

    await supabase
      .from("comparables")
      .update({ parsed_data_status: "parsed" })
      .eq("id", input.compId);

    return { ok: true, data: compData };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown parsing error";

    // Mark as error
    await supabase
      .from("comparables")
      .update({ parsed_data_status: "error" })
      .eq("id", input.compId);

    return { ok: false, error: errorMessage };
  }
}

/**
 * Download multiple files from Drive and parse them.
 */
export async function parseCompFromDrive(input: {
  compId: string;
  projectId: string;
  type: CompType;
  fileIds: string[];
  driveToken: string;
  extraContext?: string;
}): Promise<ParseCompResult> {
  const fileBuffers: { buffer: Buffer; mimeType: string; name: string }[] = [];

  for (const fileId of input.fileIds) {
    const arrayBuffer = await downloadFile(input.driveToken, fileId);
    fileBuffers.push({
      buffer: Buffer.from(arrayBuffer),
      mimeType: "application/pdf",
      name: fileId,
    });
  }

  return parseCompFiles({
    compId: input.compId,
    projectId: input.projectId,
    type: input.type,
    fileBuffers,
    extraContext: input.extraContext,
    driveToken: input.driveToken,
  });
}
