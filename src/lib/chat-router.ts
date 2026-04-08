import "server-only";

import { GoogleGenAI } from "@google/genai";

const CLASSIFIER_MODEL = "gemini-3.1-flash-lite-preview";
const CHAT_MODEL = "gemini-3-flash-preview";
const PRO_MODEL = "gemini-3.1-pro-preview";

export type QueryCategory = "data_lookup" | "analysis" | "update";

export interface ClassificationResult {
  category: QueryCategory;
  model: string;
}

let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not set");
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

/**
 * Classify the user's query into one of three categories and return the
 * appropriate Gemini model ID to handle it.
 *
 * - data_lookup: Simple factual retrieval → Thinking model (gemini-3-flash-preview)
 * - update:      User wants to save/change a value → Thinking model
 * - analysis:    Multi-step reasoning, comparisons, narratives → Pro model
 *
 * Uses the Fast (flash-lite) classifier model — low latency, low cost.
 * Falls back to the Thinking model on any failure.
 */
export async function classifyQuery(
  userMessage: string,
  subjectAddress?: string,
): Promise<ClassificationResult> {
  try {
    const contextHint = subjectAddress
      ? `The project subject property is at: ${subjectAddress}.`
      : "";

    const prompt = `You are a query classifier for a commercial real estate appraisal assistant.

${contextHint}

Classify the following user message into exactly one category:

- "data_lookup": The user wants to retrieve or verify a specific data value (e.g. land size, zoning, sale price, year built, tax info, flood zone, building size). These are factual questions with a direct answer from project data.
- "update": The user explicitly wants to save, set, update, or change a value in the project data.
- "analysis": The user wants multi-step reasoning, comparisons across multiple comps, calculations, narrative generation, or explanations that require synthesizing multiple pieces of information.

When in doubt between data_lookup and analysis, prefer data_lookup.

User message: "${userMessage.slice(0, 500)}"

Respond with JSON only: {"category": "<data_lookup|analysis|update>"}`;

    const response = await getAI().models.generateContent({
      model: CLASSIFIER_MODEL,
      contents: prompt,
      config: {
        temperature: 0,
        maxOutputTokens: 32,
        responseMimeType: "application/json",
      },
    });

    const text = (response.text ?? "").trim();
    const parsed = JSON.parse(text) as { category?: string };
    const category = parsed.category as QueryCategory | undefined;

    if (category === "data_lookup" || category === "update") {
      return { category, model: CHAT_MODEL };
    }
    if (category === "analysis") {
      return { category, model: PRO_MODEL };
    }

    // Unknown category — fall back to Thinking model
    return { category: "data_lookup", model: CHAT_MODEL };
  } catch {
    // On any error (parse failure, API error, timeout) default to Thinking model
    return { category: "data_lookup", model: CHAT_MODEL };
  }
}
