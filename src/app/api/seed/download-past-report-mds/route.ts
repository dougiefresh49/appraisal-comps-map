import "server-only";
import { NextResponse } from "next/server";
import { runPastReportMdDownload } from "~/lib/past-report-md-download";
import { getGoogleToken } from "~/utils/supabase/server";

/**
 * Dev-only: uses the logged-in user’s Google OAuth token (httpOnly cookie set at
 * auth callback — same as other Drive routes). No `GOOGLE_DRIVE_ACCESS_TOKEN`
 * in .env required.
 *
 * **curl from a terminal does not send browser cookies.** Use the Seed page
 * button while logged in, or pass a `Cookie:` header copied from the browser.
 *
 * POST /api/seed/download-past-report-mds
 * Body (optional JSON): { "dryRun"?: boolean, "only"?: number, "linksOnly"?: boolean }
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  let dryRun = false;
  let linksOnly = false;
  let only: number | null = null;
  try {
    const body = (await req.json()) as {
      dryRun?: boolean;
      only?: number;
      linksOnly?: boolean;
    };
    dryRun = body.dryRun === true;
    linksOnly = body.linksOnly === true;
    if (typeof body.only === "number" && Number.isFinite(body.only)) {
      only = body.only;
    }
  } catch {
    // empty body
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

  try {
    const { results } = await runPastReportMdDownload(
      { type: "oauth", token },
      {
        repoRoot: process.cwd(),
        dryRun,
        linksOnly,
        onlyIndex: only,
      },
    );

    const ok = results.filter((r) => r.status === "ok").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const errors = results.filter((r) => r.status === "error").length;

    return NextResponse.json({
      message: `Processed ${results.length} mapping row(s): ${ok} ok, ${skipped} skipped, ${errors} error(s)`,
      dryRun,
      linksOnly,
      results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
