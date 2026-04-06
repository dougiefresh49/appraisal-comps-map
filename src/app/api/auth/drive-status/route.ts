import { NextResponse } from "next/server";
import { getGoogleToken } from "~/utils/supabase/server";

/**
 * GET /api/auth/drive-status
 * Returns whether the current session can obtain a Google Drive access token.
 */
export async function GET() {
  const { token, error, code } = await getGoogleToken();

  if (token) {
    return NextResponse.json({ authenticated: true });
  }

  return NextResponse.json({
    authenticated: false,
    error:
      error ??
      "Not authenticated — please sign in again to grant Drive access",
    code,
  });
}
