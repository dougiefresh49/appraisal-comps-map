import { NextResponse } from "next/server";
import { generateAdjustmentSuggestions } from "~/lib/adjustment-suggestions";
import { createClient } from "~/utils/supabase/server";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

/**
 * GET /api/adjustments/suggest?project_id=UUID&type=land|sales
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id")?.trim() ?? "";
    const typeRaw = searchParams.get("type")?.trim().toLowerCase() ?? "";

    if (!projectId || !isUuid(projectId)) {
      return NextResponse.json(
        { error: "project_id is required and must be a valid UUID" },
        { status: 400 },
      );
    }

    if (typeRaw !== "land" && typeRaw !== "sales") {
      return NextResponse.json(
        { error: "type is required and must be \"land\" or \"sales\"" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: project, error } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      console.error("[adjustments/suggest]", error.message);
      return NextResponse.json(
        { error: "Failed to verify project" },
        { status: 500 },
      );
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const compType: "land" | "sales" = typeRaw === "land" ? "land" : "sales";
    const payload = await generateAdjustmentSuggestions(projectId, compType);
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[adjustments/suggest]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
