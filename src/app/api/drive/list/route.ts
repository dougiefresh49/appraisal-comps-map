import { type NextRequest, NextResponse } from "next/server";
import { getGoogleToken } from "~/utils/supabase/server";
import { listFolderChildren, type DriveListOptions } from "~/lib/drive-api";

export async function POST(request: NextRequest) {
  try {
    const { token, error: driveAuthError, code } = await getGoogleToken();
    if (!token) {
      return NextResponse.json(
        {
          error:
            driveAuthError ??
            "Not authenticated — please sign in to grant Drive access",
          code,
        },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      folderId: string;
      foldersOnly?: boolean;
      filesOnly?: boolean;
    };

    if (!body.folderId) {
      return NextResponse.json(
        { error: "folderId is required" },
        { status: 400 },
      );
    }

    const options: DriveListOptions = {};
    if (body.foldersOnly) options.foldersOnly = true;
    if (body.filesOnly) options.filesOnly = true;

    const files = await listFolderChildren(token, body.folderId, options);
    return NextResponse.json({ files });
  } catch (err) {
    console.error("Drive list error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list folder" },
      { status: 500 },
    );
  }
}
