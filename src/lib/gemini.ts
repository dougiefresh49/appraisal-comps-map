import {
  GoogleGenerativeAI,
  type Part,
} from "@google/generative-ai";

const GENERATION_MODEL = "gemini-3.1-flash-lite-preview";

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GOOGLE_GEMINI_API_KEY is not set — Gemini generation requires an API key",
      );
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * Generate report section text from a prompt string.
 */
export async function generateReportSection(prompt: string): Promise<string> {
  const model = getGenAI().getGenerativeModel({
    model: GENERATION_MODEL,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  });

  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
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
  const model = getGenAI().getGenerativeModel({
    model: GENERATION_MODEL,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  });

  const parts: Part[] = [
    {
      inlineData: {
        data: fileBuffer.toString("base64"),
        mimeType,
      },
    },
    { text: prompt },
  ];

  const result = await model.generateContent(parts);
  const response = result.response;
  return response.text();
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
  const model = getGenAI().getGenerativeModel({
    model: GENERATION_MODEL,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const parts: Part[] = [
    {
      inlineData: {
        data: fileBuffer.toString("base64"),
        mimeType,
      },
    },
    { text: extractionPrompt },
  ];

  const result = await model.generateContent(parts);
  const response = result.response;
  const text = response.text();

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      extractedText:
        typeof parsed.extracted_text === "string"
          ? parsed.extracted_text
          : text,
      structuredData: parsed,
    };
  } catch {
    return { extractedText: text, structuredData: {} };
  }
}
