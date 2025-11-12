// URL lengths well over 10k characters are supported by modern browsers (Chrome/Edge/Firefox).
// Raising our threshold helps ensure shareable links retain the full map state (tail pins, shapes, etc.).
export const MAX_URL_STATE_LENGTH = 12000;

export function encodeState(state: unknown): string {
  if (typeof window === "undefined") return "";
  try {
    const json = JSON.stringify(state);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(json);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return window.btoa(binary);
  } catch (error) {
    console.error("Failed to encode state", error);
    return "";
  }
}

export function decodeState<T>(encoded: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const binary = window.atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoder = new TextDecoder();
    const json = decoder.decode(bytes);
    return JSON.parse(json) as T;
  } catch (error) {
    console.error("Failed to decode state", error);
    return null;
  }
}
