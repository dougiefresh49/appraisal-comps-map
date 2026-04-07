import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServiceClient } from "~/utils/supabase/server";
import { buildSubjectCorePatch } from "~/lib/subject-core-synthesizer";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { projectId: string };
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId is required" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    const { currentCore, proposedPatch, error } = await buildSubjectCorePatch(
      projectId,
      supabase,
    );

    if (error) {
      return NextResponse.json({ success: false, error }, { status: 422 });
    }

    // Build proposedCore = currentCore with patch applied (for DataMergeDialog)
    const proposedCore = { ...currentCore, ...proposedPatch };

    return NextResponse.json({
      success: true,
      currentCore,
      proposedCore,
    });
  } catch (error) {
    console.error("Error building synthesis preview:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to build synthesis preview",
      },
      { status: 500 },
    );
  }
}
