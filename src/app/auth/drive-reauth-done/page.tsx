"use client";

import { useEffect, useState } from "react";
import { DRIVE_REAUTH_STORAGE_KEY } from "~/lib/drive-auth-event";

/** Internal path + query only; blocks open redirects. */
function safeReturnPath(raw: string | null): string | null {
  if (!raw?.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export default function DriveReauthDonePage() {
  const [status, setStatus] = useState<"working" | "redirect" | "done">(
    "working",
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnTo = safeReturnPath(params.get("return"));

    try {
      localStorage.setItem(DRIVE_REAUTH_STORAGE_KEY, String(Date.now()));
    } catch {
      // Private mode / blocked storage
    }

    try {
      window.close();
    } catch {
      // ignore
    }

    const t = window.setTimeout(() => {
      if (returnTo) {
        window.location.replace(returnTo);
        setStatus("redirect");
        return;
      }
      setStatus("done");
    }, 450);

    return () => window.clearTimeout(t);
  }, []);

  const title =
    status === "redirect"
      ? "Returning you to the app…"
      : status === "done"
        ? "You can close this tab"
        : "Authentication updated";

  const body =
    status === "redirect"
      ? "If nothing happens, use your browser’s back button or open the report tab again."
      : status === "done"
        ? "If this window did not close automatically, close it manually and return to your report."
        : "Finishing sign-in…";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gray-950 px-6 text-center text-gray-100">
      <h1 className="mb-2 text-lg font-semibold text-white">{title}</h1>
      <p className="max-w-md text-sm text-gray-400">{body}</p>
    </div>
  );
}
