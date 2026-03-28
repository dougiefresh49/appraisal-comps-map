import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";
import { parseCompFromDrive, parseCompFiles } from "~/lib/comp-parser";
import type { CompType } from "~/types/comp-data";

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
      compId: string;
      projectId: string;
      type: CompType;
      fileIds?: string[];
      extraContext?: string;
    };

    const { compId, projectId, type, fileIds, extraContext } = body;

    if (!compId || !projectId || !type) {
      return NextResponse.json(
        { error: "Missing required fields: compId, projectId, type" },
        { status: 400 },
      );
    }

    if (!["land", "sales", "rentals"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be land, sales, or rentals" },
        { status: 400 },
      );
    }

    const driveToken = session.provider_token;

    if (fileIds && fileIds.length > 0) {
      if (!driveToken) {
        return NextResponse.json(
          {
            error:
              "No Drive token available. Please re-authenticate with Google.",
          },
          { status: 401 },
        );
      }

      const result = await parseCompFromDrive({
        compId,
        projectId,
        type,
        fileIds,
        driveToken,
        extraContext,
      });

      if (!result.ok) {
        return NextResponse.json(
          { error: result.error ?? "Parsing failed" },
          { status: 500 },
        );
      }

      return NextResponse.json({ ok: true, data: result.data });
    }

    // If no fileIds, check for uploaded file in form data
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const files = formData.getAll("files") as File[];

      if (files.length === 0) {
        return NextResponse.json(
          { error: "No files provided" },
          { status: 400 },
        );
      }

      const fileBuffers = await Promise.all(
        files.map(async (file) => ({
          buffer: Buffer.from(await file.arrayBuffer()),
          mimeType: file.type || "application/pdf",
          name: file.name,
        })),
      );

      const result = await parseCompFiles({
        compId,
        projectId,
        type,
        fileBuffers,
        extraContext,
      });

      if (!result.ok) {
        return NextResponse.json(
          { error: result.error ?? "Parsing failed" },
          { status: 500 },
        );
      }

      return NextResponse.json({ ok: true, data: result.data });
    }

    return NextResponse.json(
      { error: "No files provided. Include fileIds or upload files." },
      { status: 400 },
    );
  } catch (err) {
    console.error("Parse comp error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
