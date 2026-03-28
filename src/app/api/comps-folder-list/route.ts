import { NextResponse } from "next/server";
import { getGoogleToken } from "~/utils/supabase/server";
import { listFolderChildren } from "~/lib/drive-api";

interface FolderListRequest {
  type: string;
  projectFolderId: string;
}

interface Folder {
  folderId: string;
  name: string;
  isParsed: boolean;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FolderListRequest;
    const { projectFolderId, type } = body;

    if (!projectFolderId || !type) {
      return NextResponse.json(
        { error: "projectFolderId and type are required" },
        { status: 400 },
      );
    }

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

    // Drive structure: projectFolder → comps → {type} → comp subfolders
    // Step 1: Find the "comps" folder in the project root
    const projectChildren = await listFolderChildren(token, projectFolderId, {
      foldersOnly: true,
    });

    const compsFolder = projectChildren.find(
      (f) => f.name.toLowerCase() === "comps",
    );

    if (!compsFolder) {
      return NextResponse.json({ folders: [] });
    }

    // Step 2: Find the type-specific folder inside "comps"
    const compsChildren = await listFolderChildren(token, compsFolder.id, {
      foldersOnly: true,
    });

    const typeFolder = compsChildren.find(
      (f) => f.name.toLowerCase() === type.toLowerCase(),
    );

    if (!typeFolder) {
      return NextResponse.json({ folders: [] });
    }

    // Step 3: List comp subfolders inside the type folder
    const compSubfolders = await listFolderChildren(token, typeFolder.id, {
      foldersOnly: true,
    });

    const folders: Folder[] = compSubfolders
      .filter((f) => !f.name.startsWith("_") && f.name.toLowerCase() !== "data")
      .map((f) => ({
        folderId: f.id,
        name: f.name,
        isParsed: false,
      }));

    return NextResponse.json({ folders });
  } catch (error) {
    console.error("Error fetching folder list:", error);
    return NextResponse.json(
      { error: "Failed to fetch folder list" },
      { status: 500 },
    );
  }
}
