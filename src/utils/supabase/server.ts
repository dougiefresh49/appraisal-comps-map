import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll can be called in a Server Component where cookies
            // can't be set. This is safe to ignore because the middleware
            // will refresh the session.
          }
        },
      },
    },
  );
}

/**
 * Creates a Supabase client using the service-role (secret) key.
 * Bypasses RLS — use ONLY for trusted server-side background work
 * that runs outside an HTTP request context (e.g. fire-and-forget
 * document processing).
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set for service-role access",
    );
  }

  return createSupabaseClient(url, secretKey);
}

/** Result of resolving a Google OAuth access token for Drive API calls. */
export type GoogleTokenResult = {
  token: string | null;
  /** Present when `token` is null — safe to show in API error bodies for UX. */
  error?: string;
  /** Optional machine-readable hint for clients (e.g. `needs_reauth`). */
  code?: string;
};

/**
 * Retrieves a valid Google OAuth access token for Drive API calls.
 *
 * Token resolution order:
 * 1. Read `google_provider_token` cookie (set during auth callback)
 * 2. If missing/expired, use `google_provider_refresh_token` cookie + Google
 *    OAuth to mint a fresh access token (requires GOOGLE_CLIENT_ID/SECRET)
 * 3. Falls back to Supabase session.provider_token (only works right after login)
 */
export async function getGoogleToken(): Promise<GoogleTokenResult> {
  const cookieStore = await cookies();

  // 1. Try the access token cookie
  const accessToken = cookieStore.get("google_provider_token")?.value;
  if (accessToken) {
    return { token: accessToken };
  }

  // 2. Try refreshing with the refresh token
  const refreshToken = cookieStore.get("google_provider_refresh_token")?.value;
  if (refreshToken) {
    const refreshed = await refreshGoogleAccessToken(refreshToken);
    if (refreshed.access_token) {
      try {
        cookieStore.set("google_provider_token", refreshed.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 3500,
        });
      } catch {
        // Can't set cookies in some contexts (e.g. Server Component)
      }
      return { token: refreshed.access_token };
    }
    return {
      token: null,
      error:
        refreshed.userMessage ??
        "Could not refresh Google session — try signing in again.",
      code: refreshed.code ?? "refresh_failed",
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return {
      token: null,
      error:
        "No Google Drive session. Sign in with Google again and ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set for token refresh.",
      code: "missing_refresh_and_oauth_config",
    };
  }

  // 3. Last resort: Supabase session (only has provider_token right after login)
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const providerToken = session?.provider_token;
  if (providerToken) {
    return { token: providerToken };
  }

  return {
    token: null,
    error:
      "Not authenticated — please sign in again to grant Drive access. Your session may have expired.",
    code: "needs_reauth",
  };
}

type RefreshResult = {
  access_token: string | null;
  userMessage?: string;
  code?: string;
};

async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<RefreshResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn(
      "[getGoogleToken] GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required to refresh Google tokens.",
    );
    return {
      access_token: null,
      userMessage:
        "Drive token refresh is not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET on the server).",
      code: "oauth_not_configured",
    };
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        bodyText = "";
      }

      let parsed: { error?: string; error_description?: string } = {};
      try {
        parsed = JSON.parse(bodyText) as typeof parsed;
      } catch {
        // not JSON
      }

      const googleError = parsed.error ?? "unknown";
      console.warn(
        "[getGoogleToken] Google token refresh failed:",
        res.status,
        googleError,
        parsed.error_description ?? bodyText,
      );

      if (googleError === "invalid_grant") {
        return {
          access_token: null,
          userMessage:
            "Google access was revoked or expired — please sign out and sign in again with Google.",
          code: "invalid_grant",
        };
      }

      return {
        access_token: null,
        userMessage: `Could not refresh Google session (${googleError}). Try signing in again.`,
        code: "refresh_failed",
      };
    }

    const data = (await res.json()) as { access_token?: string };
    const at = data.access_token ?? null;
    if (!at) {
      console.warn("[getGoogleToken] Refresh OK but no access_token in body");
      return {
        access_token: null,
        userMessage:
          "Invalid response from Google when refreshing — try signing in again.",
        code: "refresh_malformed",
      };
    }
    return { access_token: at };
  } catch (err) {
    console.error("[getGoogleToken] refresh request error:", err);
    return {
      access_token: null,
      userMessage:
        "Failed to reach Google to refresh your session. Check your network and try again.",
      code: "refresh_network_error",
    };
  }
}
