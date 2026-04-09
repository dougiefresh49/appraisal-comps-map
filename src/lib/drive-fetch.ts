import {
  AUTH_ERROR_CODES,
  emitDriveAuthError,
} from "~/lib/drive-auth-event";

/**
 * Same as `fetch`, but when the response is 401 with a known Drive auth `code`,
 * emits `drive-auth-error` so `DriveReauthProvider` can show re-auth UI.
 * Always returns the original response so callers keep their error handling.
 */
export async function driveFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 401) {
    const clone = res.clone();
    try {
      const body = (await clone.json()) as {
        error?: string;
        code?: string;
      };
      const code = body.code;
      if (code && AUTH_ERROR_CODES.has(code)) {
        emitDriveAuthError(
          body.error ?? "Drive session expired — please sign in again.",
          code,
        );
      }
    } catch {
      // Not JSON — ignore
    }
  }

  return res;
}
