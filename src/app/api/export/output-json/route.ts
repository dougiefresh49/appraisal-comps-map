import { type NextRequest, NextResponse } from "next/server";
import { createClient, getGoogleToken } from "~/utils/supabase/server";
import {
  DriveAuthError,
  findOrCreateFolder,
  uploadOrUpdateFile,
} from "~/lib/drive-api";

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
      projectId: string;
      jsonContent: string;
      fileName: string;
    };

    const { projectId, jsonContent, fileName } = body;

    if (!projectId || !jsonContent || !fileName) {
      return NextResponse.json(
        { error: "Missing required fields: projectId, jsonContent, fileName" },
        { status: 400 },
      );
    }

    const tokenResult = await getGoogleToken();
    if (!tokenResult.token) {
      return NextResponse.json(
        { error: tokenResult.error ?? "No Google token available" },
        { status: 401 },
      );
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("folder_structure")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const folderStructure = project.folder_structure as Record<
      string,
      unknown
    > | null;
    const reportsFolderId =
      typeof folderStructure?.reportsFolderId === "string"
        ? folderStructure.reportsFolderId
        : null;

    if (!reportsFolderId) {
      return NextResponse.json(
        {
          error:
            "No reports folder found for this project. Run project discovery first.",
        },
        { status: 400 },
      );
    }

    // Ensure reports/data subfolder exists
    const dataFolder = await findOrCreateFolder(
      tokenResult.token,
      reportsFolderId,
      "data",
    );

    // Each export has a unique timestamped name — no upsert/overwrite by design
    const driveFile = await uploadOrUpdateFile(
      tokenResult.token,
      dataFolder.id,
      fileName,
      jsonContent,
      "application/json",
    );

    return NextResponse.json({
      success: true,
      fileId: driveFile.id,
      fileName: driveFile.name,
    });
  } catch (err) {
    if (err instanceof DriveAuthError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 401 },
      );
    }
    console.error("[export/output-json] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
