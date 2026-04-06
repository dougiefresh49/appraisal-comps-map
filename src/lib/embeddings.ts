import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GOOGLE_GEMINI_API_KEY is not set — embedding generation requires a Gemini API key",
      );
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

/**
 * Generate a 768-dimension embedding vector for a text string using gemini-embedding-001.
 * Intended for server-side use only.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text.trim()) {
    return new Array(EMBEDDING_DIMENSIONS).fill(0) as number[];
  }

  const result = await getAI().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
  });
  return result.embeddings?.[0]?.values ?? [];
}

/**
 * Batch-generate embeddings for multiple texts.
 * Returns an array of number[] in the same order as the input.
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const results = await Promise.all(
    texts.map((text) =>
      text.trim()
        ? getAI()
            .models.embedContent({
              model: EMBEDDING_MODEL,
              contents: text,
              config: { outputDimensionality: EMBEDDING_DIMENSIONS },
            })
            .then((r) => r.embeddings?.[0]?.values ?? [])
        : Promise.resolve(new Array(EMBEDDING_DIMENSIONS).fill(0) as number[]),
    ),
  );
  return results;
}
