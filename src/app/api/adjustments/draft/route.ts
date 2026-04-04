import { NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

/**
 * GET /api/adjustments/draft?project_id=UUID&comp_type=land|sales
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id")?.trim() ?? "";
    const compType = searchParams.get("comp_type")?.trim().toLowerCase() ?? "";

    if (!projectId || !isUuid(projectId)) {
      return NextResponse.json(
        { error: "project_id is required and must be a valid UUID" },
        { status: 400 },
      );
    }

    if (compType !== "land" && compType !== "sales") {
      return NextResponse.json(
        { error: "comp_type must be \"land\" or \"sales\"" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_adjustment_drafts")
      .select("grid_data")
      .eq("project_id", projectId)
      .eq("comp_type", compType)
      .maybeSingle();

    if (error) {
      console.error("[adjustments/draft GET]", error.message);
      return NextResponse.json(
        { error: "Failed to load draft" },
        { status: 500 },
      );
    }

    const draft: unknown = data?.grid_data ?? null;
    return NextResponse.json({ draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[adjustments/draft GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/adjustments/draft
 * Body: { project_id, comp_type, grid_data }
 */
export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const rec = body as Record<string, unknown>;
    const projectId =
      typeof rec.project_id === "string" ? rec.project_id.trim() : "";
    const compTypeRaw =
      typeof rec.comp_type === "string" ? rec.comp_type.trim().toLowerCase() : "";
    const gridData = rec.grid_data;

    if (!projectId || !isUuid(projectId)) {
      return NextResponse.json(
        { error: "project_id is required and must be a valid UUID" },
        { status: 400 },
      );
    }

    if (compTypeRaw !== "land" && compTypeRaw !== "sales") {
      return NextResponse.json(
        { error: "comp_type must be \"land\" or \"sales\"" },
        { status: 400 },
      );
    }

    if (gridData === undefined) {
      return NextResponse.json(
        { error: "grid_data is required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.from("project_adjustment_drafts").upsert(
      {
        project_id: projectId,
        comp_type: compTypeRaw,
        grid_data:
          gridData !== null && typeof gridData === "object"
            ? gridData
            : {},
      },
      { onConflict: "project_id,comp_type" },
    );

    if (error) {
      console.error("[adjustments/draft PATCH]", error.message);
      return NextResponse.json(
        { error: "Failed to save draft" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[adjustments/draft PATCH]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
