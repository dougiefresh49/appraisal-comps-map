import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      projectId: string;
      spreadsheetId: string;
    };

    if (!body.projectId || !body.spreadsheetId) {
      return NextResponse.json(
        { error: "projectId and spreadsheetId are required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from("projects")
      .update({ spreadsheet_id: body.spreadsheetId })
      .eq("id", body.projectId);

    if (updateError) {
      console.error("Failed to save spreadsheet selection:", updateError);
      return NextResponse.json(
        { error: "Failed to save spreadsheet selection" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Select spreadsheet error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Selection failed" },
      { status: 500 },
    );
  }
}
