import type { GenerateContentResponse } from "@google/genai";

/** One `generateContent` round-trip (tool loops produce multiple). */
export interface GeminiUsageCallSnapshot {
  responseId?: string;
  modelVersion?: string;
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  cachedContentTokenCount?: number;
}

/** Sent on SSE as `{ geminiUsage: payload }` before `[DONE]`. */
export interface GeminiChatUsagePayload {
  model: string;
  calls: GeminiUsageCallSnapshot[];
  totals: {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
  };
}

export function snapshotUsageFromResponse(
  response: GenerateContentResponse,
): GeminiUsageCallSnapshot {
  const u = response.usageMetadata;
  return {
    responseId: response.responseId,
    modelVersion: response.modelVersion,
    promptTokenCount: u?.promptTokenCount,
    candidatesTokenCount: u?.candidatesTokenCount,
    totalTokenCount: u?.totalTokenCount,
    thoughtsTokenCount: u?.thoughtsTokenCount,
    toolUsePromptTokenCount: u?.toolUsePromptTokenCount,
    cachedContentTokenCount: u?.cachedContentTokenCount,
  };
}

export function aggregateUsageTotals(
  calls: GeminiUsageCallSnapshot[],
): GeminiChatUsagePayload["totals"] {
  let promptTokens = 0;
  let candidatesTokens = 0;
  let totalTokens = 0;
  for (const c of calls) {
    promptTokens += c.promptTokenCount ?? 0;
    candidatesTokens += c.candidatesTokenCount ?? 0;
    totalTokens += c.totalTokenCount ?? 0;
  }
  return { promptTokens, candidatesTokens, totalTokens };
}
