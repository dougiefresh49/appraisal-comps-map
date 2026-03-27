import { NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/projects";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`);

      // Persist Google provider tokens in HTTP-only cookies so server-side
      // route handlers can make Drive API calls on behalf of the user.
      // Supabase only includes these in the initial exchangeCodeForSession
      // response — they're NOT included in the regular session cookie.
      if (data.session?.provider_token) {
        response.cookies.set(
          "google_provider_token",
          data.session.provider_token,
          {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 3500, // ~1 hour (slightly less than Google's 3600s expiry)
          },
        );
      }

      if (data.session?.provider_refresh_token) {
        response.cookies.set(
          "google_provider_refresh_token",
          data.session.provider_refresh_token,
          {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 365, // 1 year
          },
        );
      }

      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
