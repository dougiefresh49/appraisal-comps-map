import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";
import {
  computeProposedCoreFromDocuments,
  computeProposedFemaFromDocuments,
} from "~/server/subject-data/merge";

const SUBJECT_DOCUMENT_TYPES = new Set([
  "cad",
  "deed",
  "notes",
  "engagement",
  "sketch",
  "flood_map",
]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { projectId?: string };
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 },
      );
    }

    // 1. Fetch all processed subject-relevant documents for the project
    const { data: documents, error: docsError } = await supabase
      .from("project_documents")
      .select("id, document_type, structured_data, processed_at")
      .eq("project_id", projectId)
      .not("processed_at", "is", null)
      .order("processed_at", { ascending: true });

    if (docsError) {
      return NextResponse.json(
        { error: `Failed to load documents: ${docsError.message}` },
        { status: 500 },
      );
    }

    const subjectDocs = (documents ?? []).filter((d) =>
      typeof d.document_type === "string" && SUBJECT_DOCUMENT_TYPES.has(d.document_type),
    ) as Array<{
      id: string;
      document_type: string;
      structured_data: unknown;
      processed_at: string;
    }>;

    // 2. Fetch current subject_data
    const { data: subjectRow, error: subjectError } = await supabase
      .from("subject_data")
      .select("core, fema")
      .eq("project_id", projectId)
      .maybeSingle();

    if (subjectError) {
      return NextResponse.json(
        { error: `Failed to load subject data: ${subjectError.message}` },
        { status: 500 },
      );
    }

    const currentCore = (subjectRow?.core ?? {}) as Record<string, unknown>;
    const currentFema = (subjectRow?.fema ?? {}) as Record<string, unknown>;

    // 3. Compute proposed values by re-applying MERGE_MAP (no fill-empty-only)
    const proposedCore = computeProposedCoreFromDocuments(subjectDocs);
    const proposedFema = computeProposedFemaFromDocuments(subjectDocs);

    return NextResponse.json({
      ok: true,
      currentCore,
      proposedCore,
      currentFema,
      proposedFema,
      documentCount: subjectDocs.length,
    });
  } catch (err) {
    console.error("[reparse-preview] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
