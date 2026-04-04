import { NextResponse } from "next/server";
import { findSimilarProjects } from "~/lib/similar-projects";
import { createClient } from "~/utils/supabase/server";

/**
 * GET /api/suggestions/similar-projects?project_id=UUID
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id")?.trim() ?? "";

    if (!projectId) {
      return NextResponse.json(
        { error: "project_id is required" },
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
      console.error("[similar-projects-api]", error.message);
      return NextResponse.json(
        { error: "Failed to verify project" },
        { status: 500 },
      );
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const similarProjects = await findSimilarProjects(projectId);

    return NextResponse.json({
      projectId,
      similarProjects,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[similar-projects-api]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
