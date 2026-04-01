import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { triggerPhotoAnalysis } from "~/server/photos/actions";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      projectFolderId: string;
      projectId?: string;
    };
    const { projectFolderId, projectId } = body;

    if (!projectFolderId) {
      return NextResponse.json(
        { success: false, error: "projectFolderId is required" },
        { status: 400 },
      );
    }

    const result = await triggerPhotoAnalysis(projectFolderId, projectId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error processing images:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to process images",
      },
      { status: 500 },
    );
  }
}
