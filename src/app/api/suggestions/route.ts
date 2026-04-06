import { NextResponse } from "next/server";
import {
  generateSuggestions,
  SUGGESTION_CATEGORY_KEYS,
  type SuggestionCategoryKey,
} from "~/lib/suggestions";
import { createClient } from "~/utils/supabase/server";

function parseCategory(raw: string | null): SuggestionCategoryKey | undefined {
  if (raw == null || raw.trim() === "") {
    return undefined;
  }
  const k = raw.trim();
  if ((SUGGESTION_CATEGORY_KEYS as readonly string[]).includes(k)) {
    return k as SuggestionCategoryKey;
  }
  return undefined;
}

/**
 * GET /api/suggestions?project_id=UUID
 * GET /api/suggestions?project_id=UUID&category=adjustment_categories
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id")?.trim() ?? "";
    const categoryRaw = searchParams.get("category");

    if (!projectId) {
      return NextResponse.json(
        { error: "project_id is required" },
        { status: 400 },
      );
    }

    if (categoryRaw != null && categoryRaw.trim() !== "") {
      const parsed = parseCategory(categoryRaw);
      if (parsed === undefined) {
        return NextResponse.json(
          {
            error: `Invalid category. Use one of: ${SUGGESTION_CATEGORY_KEYS.join(", ")}`,
          },
          { status: 400 },
        );
      }
    }

    const categoryFilter = parseCategory(categoryRaw);

    const supabase = await createClient();
    const { data: project, error } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      console.error("[suggestions-api]", error.message);
      return NextResponse.json(
        { error: "Failed to verify project" },
        { status: 500 },
      );
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const payload = await generateSuggestions(projectId, categoryFilter);
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[suggestions-api]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
