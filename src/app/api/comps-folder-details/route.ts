import { NextResponse } from "next/server";
import { getGoogleToken } from "~/utils/supabase/server";
import {
  getFolderMetadata,
  listFolderChildren,
  downloadFile,
} from "~/lib/drive-api";

interface FolderDetailsRequest {
  type: string;
  projectFolderId: string;
  folderId: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FolderDetailsRequest;
    const { folderId } = body;

    if (!folderId) {
      return NextResponse.json(
        { error: "folderId is required" },
        { status: 400 },
      );
    }

    const token = await getGoogleToken();
    if (!token) {
      return NextResponse.json(
        { error: "Not authenticated — please sign in again to grant Drive access" },
        { status: 401 },
      );
    }

    // Get the folder name
    const metadata = await getFolderMetadata(token, folderId);

    // List files in the folder
    const files = await listFolderChildren(token, folderId, { filesOnly: true });

    // Find parsed.json if it exists
    const parsedJsonFile = files.find((f) => f.name === "parsed.json");

    let parsedContent: unknown = null;
    if (parsedJsonFile) {
      const buffer = await downloadFile(token, parsedJsonFile.id);
      const text = new TextDecoder().decode(buffer);
      try {
        parsedContent = JSON.parse(text) as unknown;
      } catch {
        parsedContent = null;
      }
    }

    return NextResponse.json({ name: metadata.name, parsedContent });
  } catch (error) {
    console.error("Error fetching folder details:", error);
    return NextResponse.json(
      { error: "Failed to fetch folder details" },
      { status: 500 },
    );
  }
}
