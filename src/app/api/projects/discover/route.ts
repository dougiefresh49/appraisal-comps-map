import { type NextRequest, NextResponse } from "next/server";
import { createClient, getGoogleToken } from "~/utils/supabase/server";
import { DriveAuthError } from "~/lib/drive-api";
import {
  discoverFolderStructure,
  findSpreadsheetCandidates,
} from "~/lib/project-discovery";

export async function POST(request: NextRequest) {
  try {
    const { token, error: driveAuthError, code } = await getGoogleToken();
    if (!token) {
      return NextResponse.json(
        {
          error:
            driveAuthError ??
            "Not authenticated — please sign in again to grant Drive access",
          code,
        },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      projectId: string;
      projectFolderId: string;
    };

    if (!body.projectId || !body.projectFolderId) {
      return NextResponse.json(
        { error: "projectId and projectFolderId are required" },
        { status: 400 },
      );
    }

    const folderStructure = await discoverFolderStructure(token, body.projectFolderId);

    const spreadsheetCandidates = await findSpreadsheetCandidates(
      token,
      folderStructure.reportsFolderId,
      body.projectFolderId,
    );

    const spreadsheetId =
      spreadsheetCandidates.length === 1
        ? spreadsheetCandidates[0]!.id
        : null;

    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        folder_structure: folderStructure,
        spreadsheet_id: spreadsheetId,
      })
      .eq("id", body.projectId);

    if (updateError) {
      console.error("Failed to save folder structure:", updateError);
      return NextResponse.json(
        { error: "Failed to save folder structure" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      folderStructure,
      spreadsheetId,
      spreadsheetCandidates,
    });
  } catch (err) {
    if (err instanceof DriveAuthError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 401 },
      );
    }
    console.error("Project discovery error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Discovery failed" },
      { status: 500 },
    );
  }
}
