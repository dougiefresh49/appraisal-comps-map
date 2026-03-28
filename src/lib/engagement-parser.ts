import "server-only";

import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash-lite";

export interface EngagementData {
  clientName: string;
  clientCompanyName: string;
  propertyAddress: string;
  propertyType: string;
  effectiveDate: string;
  reportDueDate: string;
  scopeOfWork: string;
  additionalNotes: string;
}

const EXTRACTION_PROMPT = `You are an expert commercial real estate appraiser's assistant.
Extract the following information from this engagement letter / document.
Return ONLY valid JSON matching this exact schema — no markdown fences, no extra text:

{
  "clientName": "string — the individual client name",
  "clientCompanyName": "string — the client's company name",
  "propertyAddress": "string — the property address being appraised",
  "propertyType": "string — the property type (e.g. Industrial, Commercial, Warehouse, Office, Retail, Mixed Use)",
  "effectiveDate": "string — the effective date of appraisal (ISO date or descriptive)",
  "reportDueDate": "string — the due date for the report (ISO date or descriptive)",
  "scopeOfWork": "string — brief description of the scope of work",
  "additionalNotes": "string — any other relevant details (interest appraised, intended use, etc.)"
}

If a field cannot be determined from the document, use an empty string.`;

/**
 * Parse an engagement document (PDF or image) using Gemini to extract
 * client info, property details, and engagement scope.
 */
export async function parseEngagementDoc(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<EngagementData> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });

  const base64 = fileBuffer.toString("base64");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: EXTRACTION_PROMPT },
        ],
      },
    ],
    config: { temperature: 0.1, maxOutputTokens: 2048 },
  });

  const raw = response.text ?? "";

  const jsonExec = /\{[\s\S]*\}/.exec(raw);
  if (!jsonExec) {
    throw new Error("Gemini did not return valid JSON from engagement document");
  }

  return JSON.parse(jsonExec[0]) as EngagementData;
}
