import "server-only";
import { NextResponse } from "next/server";
import { getGoogleToken } from "~/utils/supabase/server";

/**
 * Dev-only helper: returns a short-lived Google OAuth access token for the
 * **CLI** (`pnpm download:past-report-mds`) when you cannot send browser cookies.
 *
 * Prefer **Project → Seed** “Download past-report .md from Google Drive” — it
 * uses your signed-in session and does not require copying a token.
 *
 * **Do not use in production** — treat the token as a secret; it grants Drive
 * access as you. Opening this route does not invalidate your session; tokens
 * still expire on Google’s schedule (~1h).
 *
 * GET or POST /api/seed/dev-google-access-token (same behavior)
 */
export async function GET() {
  return handle();
}

export async function POST() {
  return handle();
}

async function handle() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const { token, error, code } = await getGoogleToken();
  if (!token) {
    return NextResponse.json(
      {
        error: error ?? "No Google access token — sign in with Google in this app.",
        code: code ?? "needs_reauth",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    access_token: token,
    hint: "export GOOGLE_DRIVE_ACCESS_TOKEN='<paste>' ; pnpm download:past-report-mds",
    expires_note:
      "Short-lived (~1h). Re-open this route or re-run after expiry — no client secret involved.",
  });
}
