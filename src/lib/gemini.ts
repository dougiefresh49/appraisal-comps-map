import { GoogleGenAI, type Part } from "@google/genai";

const GENERATION_MODEL = "gemini-3.1-flash-lite-preview";

let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GOOGLE_GEMINI_API_KEY is not set — Gemini generation requires an API key",
      );
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

/**
 * Generate report section text from a prompt string.
 */
export async function generateReportSection(prompt: string): Promise<string> {
  const response = await getAI().models.generateContent({
    model: GENERATION_MODEL,
    contents: prompt,
    config: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  });
  return response.text ?? "";
}

/**
 * Generate text with an image/PDF attachment for multimodal prompting
 * (e.g., zoning map image, neighborhood map image).
 */
export async function generateWithAttachment(
  prompt: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const parts: Part[] = [
    {
      inlineData: {
        data: fileBuffer.toString("base64"),
        mimeType,
      },
    },
    { text: prompt },
  ];

  const response = await getAI().models.generateContent({
    model: GENERATION_MODEL,
    contents: parts,
    config: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  });
  return response.text ?? "";
}

/**
 * Extract text and structured data from a document (deed PDF, flood map, etc.)
 * using Gemini multimodal capabilities.
 */
export async function extractDocumentContent(
  fileBuffer: Buffer,
  mimeType: string,
  extractionPrompt: string,
): Promise<{ extractedText: string; structuredData: Record<string, unknown> }> {
  const parts: Part[] = [
    {
      inlineData: {
        data: fileBuffer.toString("base64"),
        mimeType,
      },
    },
    { text: extractionPrompt },
  ];

  const response = await getAI().models.generateContent({
    model: GENERATION_MODEL,
    contents: parts,
    config: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });
  const text = response.text ?? "";

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      extractedText:
        typeof parsed.extracted_text === "string"
          ? parsed.extracted_text
          : text,
      structuredData: parsed,
    };
  } catch (err) {
    console.warn("[extractDocumentContent] Failed to parse Gemini JSON response:", err);
    return { extractedText: text, structuredData: {} };
  }
}
