"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DRIVE_REAUTH_STORAGE_KEY,
  emitDriveAuthRestored,
  onDriveAuthError,
} from "~/lib/drive-auth-event";
import { useAuth } from "~/hooks/useAuth";

type DriveAuthContextValue = {
  /** True while the re-auth modal is visible. */
  needsReauth: boolean;
  /** Programmatically open the re-auth modal (optional message). */
  triggerReauth: (message?: string) => void;
};

const DriveAuthContext = createContext<DriveAuthContextValue>({
  needsReauth: false,
  triggerReauth: () => {
    void 0;
  },
});

export function useDriveAuth() {
  return useContext(DriveAuthContext);
}

const REAUTH_NEXT = "/auth/drive-reauth-done";

function clearReauthSignal(): void {
  try {
    localStorage.removeItem(DRIVE_REAUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function readReauthSignal(): string | null {
  try {
    return localStorage.getItem(DRIVE_REAUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function DriveReauthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { signIn, signInGooglePopup } = useAuth();
  const [needsReauth, setNeedsReauth] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWaitingPopup, setIsWaitingPopup] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const finishRestored = useCallback(() => {
    clearReauthSignal();
    setNeedsReauth(false);
    setErrorMessage(null);
    setIsWaitingPopup(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    emitDriveAuthRestored();
  }, []);

  const triggerReauth = useCallback((message?: string) => {
    setErrorMessage(
      message ??
        "Your Google Drive connection expired. Re-authenticate to continue.",
    );
    setNeedsReauth(true);
    setIsWaitingPopup(false);
  }, []);

  useEffect(() => {
    return onDriveAuthError(({ error }) => {
      setErrorMessage(error);
      setNeedsReauth(true);
      setIsWaitingPopup(false);
    });
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== DRIVE_REAUTH_STORAGE_KEY || e.newValue == null) return;
      finishRestored();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [finishRestored]);

  useEffect(() => {
    if (!isWaitingPopup) return;

    if (pollRef.current) {
      clearInterval(pollRef.current);
    }

    pollRef.current = setInterval(() => {
      if (readReauthSignal()) {
        finishRestored();
      }
    }, 800);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isWaitingPopup, finishRestored]);

  const handleReauthenticate = useCallback(async () => {
    setIsWaitingPopup(true);

    const opened = await signInGooglePopup(REAUTH_NEXT);
    if (opened) {
      return;
    }

    const returnTo =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/projects";
    const nextWithReturn = `${REAUTH_NEXT}?return=${encodeURIComponent(returnTo)}`;
    await signIn(nextWithReturn);
  }, [signIn, signInGooglePopup]);

  const handleDismiss = useCallback(() => {
    setNeedsReauth(false);
    setErrorMessage(null);
    setIsWaitingPopup(false);
    clearReauthSignal();
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const contextValue = useMemo<DriveAuthContextValue>(
    () => ({ needsReauth, triggerReauth }),
    [needsReauth, triggerReauth],
  );

  return (
    <DriveAuthContext.Provider value={contextValue}>
      {children}

      {needsReauth ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm dark:bg-black/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drive-reauth-title"
        >
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <h2
              id="drive-reauth-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Google Drive needs attention
            </h2>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              {errorMessage ??
                "Your Google session for Drive may have expired. Re-authenticate to load files and folders again."}
            </p>

            {isWaitingPopup ? (
              <p className="mt-4 text-sm text-amber-800 dark:text-amber-200/90">
                Waiting for you to finish signing in in the popup… This page
                stays open so your work is not lost.
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-950/50 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => void handleReauthenticate()}
                disabled={isWaitingPopup}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isWaitingPopup
                  ? "Complete sign-in in popup…"
                  : "Re-authenticate with Google"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DriveAuthContext.Provider>
  );
}
