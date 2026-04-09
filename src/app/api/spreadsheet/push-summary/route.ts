import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";
import { getGoogleToken } from "~/utils/supabase/server";
import { writeSummaryLabels, type CompType } from "~/lib/sheets-api";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      projectId: string;
      type: CompType;
      labels: string[];
    };

    const { projectId, type, labels } = body;

    if (!projectId || !type || !Array.isArray(labels)) {
      return NextResponse.json(
        { error: "Missing required fields: projectId, type, labels" },
        { status: 400 },
      );
    }

    if (!["Land", "Sales", "Rentals"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be Land, Sales, or Rentals" },
        { status: 400 },
      );
    }

    // Get Google token
    const tokenResult = await getGoogleToken();
    if (!tokenResult.token) {
      return NextResponse.json(
        {
          error: tokenResult.error ?? "No Google token available",
          code: tokenResult.code,
        },
        { status: 401 },
      );
    }

    // Get spreadsheet ID from projects table
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("spreadsheet_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 },
      );
    }

    const spreadsheetId = project.spreadsheet_id as string | null;
    if (!spreadsheetId) {
      return NextResponse.json(
        {
          error:
            "No spreadsheet linked to this project. Set spreadsheet_id in project settings.",
        },
        { status: 400 },
      );
    }

    const opts = { spreadsheetId, token: tokenResult.token };
    await writeSummaryLabels(opts, labels, type);

    return NextResponse.json({
      success: true,
      message: `Wrote ${labels.length} label(s) to ${type} summary chart sheet`,
    });
  } catch (err) {
    console.error("[push-summary] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
