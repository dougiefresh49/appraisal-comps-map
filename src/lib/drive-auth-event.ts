/**
 * Cross-cutting events for Google Drive OAuth failures and successful re-auth.
 * Used by `driveFetch()` (plain function) and `DriveReauthProvider` (React).
 */

export const DRIVE_REAUTH_STORAGE_KEY = "drive-reauth-complete";

export const DRIVE_AUTH_ERROR_EVENT = "drive-auth-error";
export const DRIVE_AUTH_RESTORED_EVENT = "drive-auth-restored";

export type DriveAuthErrorDetail = {
  error: string;
  code: string;
};

/**
 * Machine-readable codes returned by `getGoogleToken()` and some API routes when Drive access needs attention.
 */
export const AUTH_ERROR_CODES = new Set([
  "invalid_grant",
  "needs_reauth",
  "refresh_failed",
  "oauth_not_configured",
  "missing_refresh_and_oauth_config",
  "refresh_malformed",
  "refresh_network_error",
  /** Drive API rejected the token after it was considered valid at request start */
  "token_expired_mid_request",
]);

export function emitDriveAuthError(error: string, code: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DriveAuthErrorDetail>(DRIVE_AUTH_ERROR_EVENT, {
      detail: { error, code },
    }),
  );
}

export function emitDriveAuthRestored(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DRIVE_AUTH_RESTORED_EVENT));
}

export function onDriveAuthError(
  cb: (detail: DriveAuthErrorDetail) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {
      void 0;
    };
  }

  const handler = (ev: Event): void => {
    const ce = ev as CustomEvent<DriveAuthErrorDetail>;
    if (ce.detail) cb(ce.detail);
  };

  window.addEventListener(DRIVE_AUTH_ERROR_EVENT, handler as EventListener);
  return () =>
    window.removeEventListener(DRIVE_AUTH_ERROR_EVENT, handler as EventListener);
}

export function onDriveAuthRestored(cb: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {
      void 0;
    };
  }

  const handler = (): void => {
    cb();
  };

  window.addEventListener(DRIVE_AUTH_RESTORED_EVENT, handler);
  return () => window.removeEventListener(DRIVE_AUTH_RESTORED_EVENT, handler);
}
