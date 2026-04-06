import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { exportInputJson } from "~/server/photos/actions";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      projectId: string;
      projectFolderId: string;
      subjectPhotosFolderId?: string;
    };
    const { projectId, projectFolderId, subjectPhotosFolderId } = body;

    if (!projectId || !projectFolderId) {
      return NextResponse.json(
        {
          success: false,
          error: "projectId and projectFolderId are required",
        },
        { status: 400 },
      );
    }

    const result = await exportInputJson(
      projectId,
      projectFolderId,
      subjectPhotosFolderId,
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error exporting photos:", error);
    return NextResponse.json(
      { success: false, error: "Failed to export photos" },
      { status: 500 },
    );
  }
}
