import { createServerClient } from "@supabase/ssr";
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
            // setAll can be called from a Server Component where cookies
            // can't be set. This is safe to ignore because the middleware
            // will refresh the session.
          }
        },
      },
    },
  );
}

/**
 * Retrieves a valid Google OAuth access token for Drive API calls.
 *
 * Token resolution order:
 * 1. Read `google_provider_token` cookie (set during auth callback)
 * 2. If missing/expired, use `google_provider_refresh_token` cookie + Google
 *    OAuth to mint a fresh access token (requires GOOGLE_CLIENT_ID/SECRET)
 * 3. Falls back to Supabase session.provider_token (only works right after login)
 */
export async function getGoogleToken(): Promise<string | null> {
  const cookieStore = await cookies();

  // 1. Try the access token cookie
  const accessToken = cookieStore.get("google_provider_token")?.value;
  if (accessToken) return accessToken;

  // 2. Try refreshing with the refresh token
  const refreshToken = cookieStore.get("google_provider_refresh_token")?.value;
  if (refreshToken) {
    const refreshed = await refreshGoogleAccessToken(refreshToken);
    if (refreshed) {
      // Persist the new access token in a cookie for subsequent requests
      try {
        cookieStore.set("google_provider_token", refreshed, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 3500,
        });
      } catch {
        // Can't set cookies in some contexts (e.g. Server Component)
      }
      return refreshed;
    }
  }

  // 3. Last resort: Supabase session (only has provider_token right after login)
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.provider_token ?? null;
}

async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required to refresh Google tokens. " +
        "Set these env vars to enable automatic token refresh.",
    );
    return null;
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

    if (!res.ok) return null;

    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}
