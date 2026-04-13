/**
 * Paid tier, Standard column — USD per 1M tokens (text / image / video input where applicable).
 * Source: https://ai.google.dev/gemini-api/docs/pricing (review periodically).
 * Last aligned: 2026-04 (Gemini 3 family preview rates).
 */

export const GEMINI_PRICING_DOC_URL =
  "https://ai.google.dev/gemini-api/docs/pricing";

/** Models we persist on chat turns today; extend as you add presets. */
export interface GeminiModelPricing {
  /** Gemini API model id */
  modelId: string;
  /** USD per 1M input (prompt) tokens */
  inputPerMillionUsd: number;
  /** USD per 1M output (candidates) tokens — includes thinking per Google’s table */
  outputPerMillionUsd: number;
  /** e.g. Gemini 3.1 Pro: higher rates when the prompt exceeds this many tokens */
  longContext?: {
    promptTokenThreshold: number;
    inputPerMillionUsd: number;
    outputPerMillionUsd: number;
  };
}

/**
 * Single source of truth for estimated chat billing (Standard / paid list prices).
 * Unknown models return `null` from {@link estimateGeminiChatTurnUsd}.
 */
export const GEMINI_PRICING_PAID_STANDARD: Record<string, GeminiModelPricing> = {
  "gemini-3-flash-preview": {
    modelId: "gemini-3-flash-preview",
    inputPerMillionUsd: 0.5,
    outputPerMillionUsd: 3.0,
  },
  "gemini-3.1-flash-lite-preview": {
    modelId: "gemini-3.1-flash-lite-preview",
    inputPerMillionUsd: 0.25,
    outputPerMillionUsd: 1.5,
  },
  "gemini-3.1-pro-preview": {
    modelId: "gemini-3.1-pro-preview",
    inputPerMillionUsd: 2.0,
    outputPerMillionUsd: 12.0,
    longContext: {
      promptTokenThreshold: 200_000,
      inputPerMillionUsd: 4.0,
      outputPerMillionUsd: 18.0,
    },
  },
};

export function estimateGeminiChatTurnUsd(opts: {
  model: string;
  promptTokens: number | null | undefined;
  candidatesTokens: number | null | undefined;
}): number | null {
  const tier = GEMINI_PRICING_PAID_STANDARD[opts.model];
  if (!tier) return null;

  const p = Number(opts.promptTokens ?? 0);
  const c = Number(opts.candidatesTokens ?? 0);

  let inRate = tier.inputPerMillionUsd;
  let outRate = tier.outputPerMillionUsd;
  if (tier.longContext && p > tier.longContext.promptTokenThreshold) {
    inRate = tier.longContext.inputPerMillionUsd;
    outRate = tier.longContext.outputPerMillionUsd;
  }

  return (p / 1_000_000) * inRate + (c / 1_000_000) * outRate;
}

export function formatUsd(amount: number | null): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}
