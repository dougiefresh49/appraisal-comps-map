import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { redescribePhotos } from "~/server/photos/actions";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      projectId: string;
      photoIds: string[];
    };
    const { projectId, photoIds } = body;

    if (!projectId || !Array.isArray(photoIds) || photoIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "projectId and photoIds (non-empty array) are required",
        },
        { status: 400 },
      );
    }

    const result = await redescribePhotos(projectId, photoIds);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error redescribing photos:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to redescribe photos",
      },
      { status: 500 },
    );
  }
}
