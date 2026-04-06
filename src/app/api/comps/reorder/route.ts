import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";

interface ReorderRequestBody {
  projectId: string;
  compType: "Land" | "Sales" | "Rentals";
  /** Comp IDs in the desired new order (1-based index becomes the new number) */
  orderedIds: string[];
}

/** Maps ComparableType to the draft comp_type key used in project_adjustment_drafts */
function draftCompType(compType: string): "land" | "sales" | null {
  if (compType === "Land") return "land";
  if (compType === "Sales") return "sales";
  return null; // Rentals has no adjustment draft
}

export async function POST(request: Request) {
  try {
    let body: ReorderRequestBody;
    try {
      body = (await request.json()) as ReorderRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { projectId, compType, orderedIds } = body;

    if (!projectId || !compType || !Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json(
        { error: "projectId, compType, and orderedIds are required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // ── 1. Batch-update comparables.number ──────────────────────────────────
    const updateResults = await Promise.all(
      orderedIds.map((id, index) =>
        supabase
          .from("comparables")
          .update({ number: String(index + 1) })
          .eq("id", id)
          .eq("project_id", projectId),
      ),
    );

    const updateError = updateResults.find((r) => r.error)?.error;
    if (updateError) {
      console.error("[comps/reorder] comparables update error:", updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // ── 2. Update adjustment draft display numbers (Land / Sales only) ───────
    const draftType = draftCompType(compType);
    if (draftType) {
      const { data: draftRow, error: draftFetchError } = await supabase
        .from("project_adjustment_drafts")
        .select("grid_data")
        .eq("project_id", projectId)
        .eq("comp_type", draftType)
        .maybeSingle();

      if (draftFetchError) {
        // Non-fatal: log but don't fail the whole request
        console.error("[comps/reorder] draft fetch error:", draftFetchError.message);
      } else if (draftRow?.grid_data) {
        const gridData = draftRow.grid_data as Record<string, unknown>;
        const existingComps = gridData.comps;

        if (Array.isArray(existingComps)) {
          // Build a lookup: comp id → new 1-based number
          const newNumberById = new Map(
            orderedIds.map((id, index) => [id, index + 1]),
          );

          const updatedComps = existingComps.map((c: unknown) => {
            if (c !== null && typeof c === "object" && !Array.isArray(c)) {
              const comp = c as Record<string, unknown>;
              const newNum = newNumberById.get(comp.id as string);
              if (newNum !== undefined) {
                return { ...comp, number: newNum };
              }
            }
            return c;
          });

          const { error: draftUpdateError } = await supabase
            .from("project_adjustment_drafts")
            .update({ grid_data: { ...gridData, comps: updatedComps } })
            .eq("project_id", projectId)
            .eq("comp_type", draftType);

          if (draftUpdateError) {
            console.error("[comps/reorder] draft update error:", draftUpdateError.message);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[comps/reorder] unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reorder failed" },
      { status: 500 },
    );
  }
}
