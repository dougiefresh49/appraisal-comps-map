import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";
import { getGoogleToken } from "~/utils/supabase/server";
import { writeSubjectToSheet } from "~/lib/sheets-api";

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
    };

    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing required field: projectId" },
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

    // Get subject data
    const { data: subjectData, error: subjectError } = await supabase
      .from("subject_data")
      .select("core")
      .eq("project_id", projectId)
      .maybeSingle();

    if (subjectError) {
      return NextResponse.json(
        { error: "Failed to load subject data" },
        { status: 500 },
      );
    }

    if (!subjectData?.core) {
      return NextResponse.json(
        { error: "No subject data found for this project" },
        { status: 404 },
      );
    }

    const opts = { spreadsheetId, token: tokenResult.token };
    await writeSubjectToSheet(opts, subjectData.core as Record<string, unknown>);

    return NextResponse.json({
      success: true,
      message: "Subject data written to spreadsheet row 2",
    });
  } catch (err) {
    console.error("[push-subject] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
