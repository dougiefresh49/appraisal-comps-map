import { GoogleGenAI, type Part, type Content } from "@google/genai";
import type { ChatMessage } from "~/lib/chat-context";
import {
  toolConfig,
  executeToolCall,
  type ToolCallResult,
} from "~/lib/chat-tools";

const GENERATION_MODEL = "gemini-3.1-flash-lite-preview";
const CHAT_MODEL = "gemini-3-flash-preview";
const PRO_MODEL = "gemini-3.1-pro-preview";

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
 * Pass `usePro: true` for heavyweight sections like comp discussion narratives.
 */
export async function generateReportSection(
  prompt: string,
  options?: { usePro?: boolean },
): Promise<string> {
  const model = options?.usePro ? PRO_MODEL : GENERATION_MODEL;
  const response = await getAI().models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.7,
      maxOutputTokens: options?.usePro ? 8192 : 4096,
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

/**
 * Stream a chat response from Gemini with function calling support.
 *
 * Flow:
 * 1. Send messages + tool declarations to Gemini (non-streaming first call
 *    so we can detect function calls).
 * 2. If Gemini returns function calls, execute them, send status SSE events
 *    to the client for write tools (silent for read tools), feed results
 *    back to Gemini, and repeat.
 * 3. Once Gemini returns text (no more function calls), stream that final
 *    response to the client.
 *
 * @param model - Gemini model ID to use (defaults to CHAT_MODEL / Thinking tier)
 */
export async function generateChatStream(
  systemPrompt: string,
  messages: ChatMessage[],
  projectId: string,
  model: string = CHAT_MODEL,
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();

  const contents: Content[] = messages.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let loopCount = 0;
        const maxLoops = 5;

        while (loopCount < maxLoops) {
          loopCount++;

          const response = await getAI().models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.7,
              maxOutputTokens: 8192,
              tools: [toolConfig],
            },
          });

          const candidate = response.candidates?.[0];
          if (!candidate) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify("No response from AI.")}\n\n`),
            );
            break;
          }

          const functionCalls = candidate.content?.parts?.filter(
            (p) => p.functionCall,
          );

          if (!functionCalls || functionCalls.length === 0) {
            const text = response.text ?? "";
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(text)}\n\n`));
            }
            break;
          }

          // Execute function calls and collect results
          contents.push({
            role: "model",
            parts: functionCalls,
          });

          const functionResponses: Content["parts"] = [];

          for (const part of functionCalls) {
            const fc = part.functionCall!;
            const args = (fc.args ?? {}) as Record<string, string>;

            const result: ToolCallResult = await executeToolCall(
              fc.name!,
              args,
              projectId,
            );

            // Only send UI event for write tools; read tools are silent
            if (!result.silent) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ toolResult: result })}\n\n`,
                ),
              );
            }

            functionResponses.push({
              functionResponse: {
                name: fc.name!,
                response: {
                  success: result.success,
                  message: result.message,
                  // Include retrieved data so the model can use it in its answer
                  ...(result.data !== undefined ? { data: result.data } : {}),
                },
              },
            });
          }

          contents.push({
            role: "user",
            parts: functionResponses,
          });
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`),
        );
        controller.close();
      }
    },
  });
}
