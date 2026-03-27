import { GoogleGenerativeAI } from "@google/generative-ai";

const EMBEDDING_MODEL = "text-embedding-004";
const EMBEDDING_DIMENSIONS = 768;

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GOOGLE_GEMINI_API_KEY is not set — embedding generation requires a Gemini API key",
      );
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * Generate a 768-dimension embedding vector for a text string using Gemini text-embedding-004.
 * Intended for server-side use only.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text.trim()) {
    return new Array(EMBEDDING_DIMENSIONS).fill(0) as number[];
  }

  const model = getGenAI().getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

/**
 * Batch-generate embeddings for multiple texts.
 * Returns an array of number[] in the same order as the input.
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const model = getGenAI().getGenerativeModel({ model: EMBEDDING_MODEL });
  const results = await Promise.all(
    texts.map((text) =>
      text.trim()
        ? model.embedContent(text).then((r) => r.embedding.values)
        : Promise.resolve(new Array(EMBEDDING_DIMENSIONS).fill(0) as number[]),
    ),
  );
  return results;
}
