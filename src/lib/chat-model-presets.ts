/**
 * User-selectable chat model presets for the project assistant.
 * "auto" runs the lightweight router (`classifyQuery`) to pick Fast vs Thinking vs Pro.
 */

export type ChatModelPresetId = "auto" | "fast" | "thinking" | "pro";

export const CHAT_MODEL_PRESET_IDS: readonly ChatModelPresetId[] = [
  "auto",
  "fast",
  "thinking",
  "pro",
];

export const CHAT_MODEL_PRESET_LABELS: Record<ChatModelPresetId, string> = {
  auto: "Auto",
  fast: "Fast",
  thinking: "Thinking",
  pro: "Pro",
};

/** Short hint for native option titles / tooltips */
export const CHAT_MODEL_PRESET_HINTS: Record<ChatModelPresetId, string> = {
  auto: "Picks the best model from your message (recommended)",
  fast: "gemini-3.1-flash-lite-preview — quickest responses",
  thinking: "gemini-3-flash-preview — balanced reasoning",
  pro: "gemini-3.1-pro-preview — deeper analysis",
};

/** Direct Gemini model when preset is not Auto */
export const PRESET_TO_GEMINI_MODEL: Record<
  Exclude<ChatModelPresetId, "auto">,
  string
> = {
  fast: "gemini-3.1-flash-lite-preview",
  thinking: "gemini-3-flash-preview",
  pro: "gemini-3.1-pro-preview",
};

export const DEFAULT_CHAT_MODEL_PRESET: ChatModelPresetId = "auto";

export function isChatModelPresetId(v: unknown): v is ChatModelPresetId {
  return (
    typeof v === "string" &&
    (CHAT_MODEL_PRESET_IDS as readonly string[]).includes(v)
  );
}

/** Human-readable label for Gemini model IDs shown under assistant messages */
export function getGeminiModelDisplayName(modelId: string): string {
  const labels: Record<string, string> = {
    "gemini-3.1-flash-lite-preview": "Gemini 3.1 Flash Lite",
    "gemini-3-flash-preview": "Gemini 3 Flash",
    "gemini-3.1-pro-preview": "Gemini 3.1 Pro",
  };
  return labels[modelId] ?? modelId;
}
