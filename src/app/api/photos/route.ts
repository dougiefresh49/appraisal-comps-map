import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  fetchInputsJson,
  saveChanges,
  listAllFilesInFolder,
  type PhotoInputs,
} from "~/server/photos/actions";

export async function GET(request: NextRequest) {
  console.log("🚀 API GET /api/photos called");

  const { searchParams } = new URL(request.url);
  const debug = searchParams.get("debug");

  if (debug === "list") {
    console.log("🔍 Debug list requested");
    try {
      const files = await listAllFilesInFolder();
      console.log("📁 Files found:", files);
      return NextResponse.json({ success: true, data: files });
    } catch (error) {
      console.error("❌ Error listing files:", error);
      return NextResponse.json(
        { success: false, error: "Failed to list files" },
        { status: 500 },
      );
    }
  }

  try {
    console.log("📥 Fetching inputs from server action...");
    const { photos, fileId } = await fetchInputsJson();
    console.log("📦 Photos received from server action:", photos.length);
    console.log("📦 Sample photos:", photos.slice(0, 2));

    // Photos now come with webViewUrl already included
    const response = { success: true, data: photos, fileId };
    console.log("📤 Sending API response:", {
      success: response.success,
      dataCount: response.data?.length,
      fileId: response.fileId,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error in API route:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch photos" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      photos: PhotoInputs;
      fileId?: string;
    };
    const { photos, fileId } = body;

    if (!photos || !Array.isArray(photos)) {
      return NextResponse.json(
        { success: false, error: "Invalid photos data" },
        { status: 400 },
      );
    }

    const result = await saveChanges(photos, fileId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error saving photos:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save photos" },
      { status: 500 },
    );
  }
}
