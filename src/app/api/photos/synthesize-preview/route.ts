import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServiceClient } from "~/utils/supabase/server";
import { buildSubjectCorePatch } from "~/lib/subject-core-synthesizer";
import { populateImprovementRowsFromSources } from "~/lib/improvement-analysis-populate";
import {
  buildDefaultImprovementAnalysisRows,
  normalizeImprovementAnalysisFromDb,
} from "~/lib/improvement-analysis-default-rows";

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
    const { currentCore, proposedPatch, aggregatedPhotoImprovements, error } =
      await buildSubjectCorePatch(projectId, supabase);

    if (error) {
      return NextResponse.json({ success: false, error }, { status: 422 });
    }

    // Build proposedCore = currentCore with patch applied (for DataMergeDialog)
    const proposedCore = { ...currentCore, ...proposedPatch };

    const photoAgg = aggregatedPhotoImprovements ?? {};

    const [{ data: subjectRow }, { data: projectRow }, docsResult] = await Promise.all([
      supabase
        .from("subject_data")
        .select("improvement_analysis")
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase.from("projects").select("property_type").eq("id", projectId).maybeSingle(),
      supabase
        .from("project_documents")
        .select("document_type, structured_data")
        .eq("project_id", projectId)
        .in("document_type", ["cad", "deed", "engagement"]),
    ]);

    if (docsResult.error) throw docsResult.error;

    const docStructuredSlices = (docsResult.data ?? []).map((row) => ({
      structured_data: row.structured_data,
    }));

    const propertyType =
      typeof projectRow?.property_type === "string"
        ? projectRow.property_type
        : undefined;

    const rawAnalysis = subjectRow?.improvement_analysis;
    const normalized = rawAnalysis
      ? normalizeImprovementAnalysisFromDb(rawAnalysis)
      : [];
    const improvementBaseRows =
      normalized.length > 0 ? normalized : buildDefaultImprovementAnalysisRows();

    const proposedImprovementAnalysis = populateImprovementRowsFromSources(
      improvementBaseRows,
      proposedCore,
      propertyType,
      docStructuredSlices,
      photoAgg,
    );

    return NextResponse.json({
      success: true,
      currentCore,
      proposedCore,
      improvementBaseRows,
      proposedImprovementAnalysis,
      aggregatedPhotoImprovements: photoAgg,
      docStructuredSlices,
      projectPropertyType: propertyType ?? null,
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
