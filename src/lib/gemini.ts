import {
  GoogleGenAI,
  FinishReason,
  type Part,
  type Content,
} from "@google/genai";
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
        let lastToolName: string | null = null;
        let repeatCount = 0;
        const REPEAT_THRESHOLD = 3;

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
            const finishReason = candidate.finishReason;

            if (!text) {
              console.warn(
                `[generateChatStream] Empty response from model "${model}". finishReason="${finishReason ?? "unknown"}"`,
              );

              let fallback: string;
              if (finishReason === FinishReason.SAFETY) {
                fallback =
                  "The AI model declined to answer this question due to content safety filters. Please try rephrasing your question.";
              } else if (finishReason === FinishReason.RECITATION) {
                fallback =
                  "The AI model blocked this response due to a recitation/copyright concern with the source material. Try asking in a different way or referencing a different part of the document.";
              } else if (finishReason === FinishReason.MAX_TOKENS) {
                fallback =
                  "The response was cut off because it exceeded the maximum length. Try asking a more specific question.";
              } else {
                fallback =
                  `I wasn't able to generate a response${finishReason && finishReason !== FinishReason.STOP ? ` (reason: ${finishReason})` : ""}. Please try rephrasing your question.`;
              }

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(fallback)}\n\n`),
              );
            } else {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(text)}\n\n`));
            }
            break;
          }

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
                  ...(result.data !== undefined ? { data: result.data } : {}),
                },
              },
            });
          }

          contents.push({
            role: "user",
            parts: functionResponses,
          });

          const currentToolNames = functionCalls
            .map((p) => p.functionCall?.name)
            .filter(Boolean)
            .sort()
            .join(",");
          if (currentToolNames === lastToolName) {
            repeatCount++;
          } else {
            lastToolName = currentToolNames;
            repeatCount = 1;
          }

          if (repeatCount >= REPEAT_THRESHOLD) {
            contents.push({
              role: "user",
              parts: [
                {
                  text: "You have called the same tool(s) multiple times with similar arguments. Please stop calling tools and provide your best answer using the data you have already retrieved. If you cannot answer, explain what information is missing.",
                },
              ],
            });
          }
        }

        if (loopCount >= maxLoops) {
          const exhaustedMsg =
            "I wasn't able to complete my response — the AI kept searching for data without producing a final answer. " +
            "This can happen with complex queries that span multiple projects. Please try rephrasing your question or breaking it into smaller parts.";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(exhaustedMsg)}\n\n`),
          );
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
