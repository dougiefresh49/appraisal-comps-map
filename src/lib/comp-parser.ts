import "server-only";

import { GoogleGenAI, type Part } from "@google/genai";
import { createClient } from "~/utils/supabase/server";
import { downloadFile } from "~/lib/drive-api";
import type { LandSaleData, SaleData, RentalData, CompType } from "~/types/comp-data";

const GENERATION_MODEL = "gemini-2.5-flash-lite";

function getAI(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey });
}

const COMP_TYPE_SCHEMA: Record<CompType, string> = {
  land: `LandSaleData {
  "#": number,
  Address: string,
  "Use Type": "Sale" | "Extra" | "Rental",
  Grantor: string,
  Grantee: string,
  Recording: string,
  "Date of Sale": string (format: "Mon DD, YYYY"),
  "Sale Price": string (format: "$X,XXX"),
  "Financing Terms": string,
  "Property Rights": string,
  "Conditions of Sale": string,
  "Land Size (AC)": number | null,
  "Land Size (SF)": number | null,
  APN: string | null,
  Legal: string | null,
  Corner: boolean,
  "Highway Frontage": boolean,
  "Utils - Electricity": boolean | null,
  "Utils - Water": "Public" | "Well" | "None" | null,
  "Utils - Sewer": "Public" | "Septic" | "None" | null,
  Surface: "Cleared" | "Caliche" | "Raw" | null,
  "Zoning Location": string,
  "Zoning Description": string,
  Zoning: string | null,
  Taxes: number | null,
  "MLS #": string | null,
  "Verification Type": "Appraiser"|"Broker"|"Realtor"|"Crexi"|"MLS/CAD/Deeds"|"Other"|"Buyer"|"Seller"|"Owner" | null,
  "Verified By": string | null,
  Comments: string | null,
  "Market Conditions": null,
  "Sale Price / AC": null,
  "Sale Price / SF": null,
  Verification: null
}`,
  sales: `SaleData {
  "#": number,
  Address: string,
  "Use Type": "Sale" | "Extra" | "Rental",
  Grantor: string,
  Grantee: string,
  Recording: string,
  "Date of Sale": string (format: "Mon DD, YYYY"),
  "Sale Price": string (format: "$X,XXX"),
  "Financing Terms": string,
  "Property Rights": string,
  "Conditions of Sale": string,
  "Land Size (AC)": number | null,
  "Land Size (SF)": number | null,
  "Land Value": number | null,
  APN: string | null,
  Legal: string | null,
  "Building Size (SF)": number | null,
  "Occupancy %": string | null,
  "Land / Bld Ratio": number | null,
  "Property Type": string | null,
  Construction: string | null,
  "Other Features": string | null,
  "Parking (SF)": number | null,
  Buildings: number | null,
  "Year Built": number | null,
  Condition: "Good" | "Average" | "Fair" | "Poor" | null,
  HVAC: "Yes" | "Office Only" | "No",
  "Overhead Doors": string | null,
  "Wash Bay": boolean | null,
  Hoisting: string | null,
  "Zoning Location": string,
  "Zoning Description": string,
  Zoning: string | null,
  "Vacancy %": string,
  Vacancy: string | null,
  "Effective Gross Income": string | null,
  Taxes: string | null,
  Insurance: string | null,
  Expenses: string | null,
  "Net Operating Income": string | null,
  "Overall Cap Rate": string | null,
  GPI: string | null,
  "Gross Income Multiplier": number | null,
  "Potential Value": string | null,
  "MLS #": string | null,
  "Verification Type": "Appraiser"|"Broker"|"Realtor"|"Crexi"|"MLS/CAD/Deeds"|"Other"|"Buyer"|"Seller"|"Owner" | null,
  "Verified By": string | null,
  Comments: string | null,
  "Market Conditions": null,
  "Sale Price / SF": null,
  "Improvements / SF": null,
  "Effective Age": null,
  "Rent / SF": null,
  "Potential Gross Income": null,
  Verification: null
}`,
  rentals: `RentalData {
  "#": number,
  Address: string,
  "Use Type": string,
  Lessor: string,
  Tenant: string | null,
  Recording: string | null,
  APN: string | null,
  Legal: string | null,
  "Zoning Location": "Inside City Limits"|"Inside & Outside City Limits"|"Inside ETJ"|"Outside ETJ"|"None",
  "Zoning Description": string,
  Zoning: string | null,
  "Land Size (AC)": number | null,
  "Land Size (SF)": number | null,
  "Rentable SF": number | null,
  "Land / Bld Ratio": number | null,
  "Occupancy %": string,
  "Property Type": string,
  "Lease Start": string | null,
  "Rent / Month Start": number,
  "Lease Term": string | null,
  "% Increase / Year": number,
  "Rent / Month": number | null,
  "Expense Structure": "NNN" | "NN" | "N" | "None",
  "Tenant Structure": "Individual" | "Multiple",
  "Year Built": number | null,
  Age: number | null,
  Condition: "Good" | "Average" | "Fair" | "Poor",
  HVAC: "Yes" | "Office Only" | "No",
  "Overhead Doors": string | null,
  "Wash Bay": boolean | null,
  Hoisting: string | null,
  Construction: string | null,
  "Other Features": string,
  "MLS #": string | null,
  "Verification Type": "Appraiser"|"Broker"|"Realtor"|"Crexi"|"MLS/CAD/Deeds"|"Other"|"Buyer"|"Seller"|"Owner" | null,
  "Verified By": string | null,
  Comments: string,
  "Office %": null,
  "Effective Age": null,
  "Rent / SF / Year": null,
  Verification: null
}`,
};

function buildExtractionPrompt(type: CompType, extraContext?: string): string {
  const schema = COMP_TYPE_SCHEMA[type];
  const typeName = type === "land" ? "Land Sale" : type === "sales" ? "Sale" : "Rental";

  return `You are an expert commercial real estate appraisal data extractor.

Extract structured comparable data from the attached document(s). The document may be a deed, CAD record, MLS listing, or other property record.

Return a JSON object matching this exact TypeScript interface:
${schema}

Rules:
- Set "#" to 1 (first comp being extracted)
- For fields marked "null" in the schema (Generated fields), always return null — these are calculated by the spreadsheet
- Extract numeric values as numbers, not strings (unless the type says string)
- Dates should be formatted as "Mon DD, YYYY" (e.g., "Jun 17, 2025")
- Sale prices should include $ and commas (e.g., "$700,000")
- If a value is unknown or not mentioned, return null
- For boolean fields (Corner, Highway Frontage, Wash Bay), return true/false
- "Zoning Location" should be one of the enum values, default "None" if unknown
- For ${typeName} comps, extract all relevant property details
${extraContext ? `\nAdditional context from user:\n${extraContext}` : ""}

Return ONLY the JSON object, no markdown code fences, no explanation.`;
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
    const prompt = buildExtractionPrompt(input.type, input.extraContext);

    const parts: Part[] = [];

    // Add file buffers as inline data
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
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const text = response.text ?? "";
    let parsed: LandSaleData | SaleData | RentalData;

    try {
      parsed = JSON.parse(text) as LandSaleData | SaleData | RentalData;
    } catch {
      // Try to extract JSON from the response text
      const jsonMatch = /\{[\s\S]*\}/.exec(text);
      if (!jsonMatch) {
        throw new Error("Gemini did not return valid JSON");
      }
      parsed = JSON.parse(jsonMatch[0]) as LandSaleData | SaleData | RentalData;
    }

    // Upsert into comp_parsed_data
    const { error: upsertError } = await supabase
      .from("comp_parsed_data")
      .upsert(
        {
          comp_id: input.compId,
          project_id: input.projectId,
          raw_data: parsed as unknown as Record<string, unknown>,
          source: "parser",
          parsed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "comp_id" },
      );

    if (upsertError) {
      throw new Error(`Failed to save parsed data: ${upsertError.message}`);
    }

    // Mark as parsed
    await supabase
      .from("comparables")
      .update({ parsed_data_status: "parsed" })
      .eq("id", input.compId);

    return { ok: true, data: parsed };
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
