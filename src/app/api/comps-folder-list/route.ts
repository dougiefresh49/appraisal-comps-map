import { NextResponse } from "next/server";
import { env } from "~/env";

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

    const n8nUrl = `${env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL}/comps-folder-list`;

    console.log("Fetching folders from n8n:", n8nUrl);

    const n8nResponse = await fetch(n8nUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectFolderId,
        type,
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const rawData = await n8nResponse.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let foldersRaw: any[] | undefined = [];

    // Handle n8n returning an array (common) or single object
    if (Array.isArray(rawData)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (rawData.length > 0 && rawData[0].folders) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        foldersRaw = rawData[0].folders;
      }
    } else if (rawData && typeof rawData === "object") {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const rawObj = rawData;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (rawObj.folders) {
             // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            foldersRaw = rawObj.folders;
        }
    }
    
    if (!foldersRaw || !Array.isArray(foldersRaw)) {
        foldersRaw = [];
    }

    // Map to internal format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const folders: Folder[] = foldersRaw.map((f: any) => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      folderId: f.id ?? f.folderId ?? "",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      name: f.name ?? "Unnamed Folder",

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      isParsed: !!f.isParsed,
    })).filter(f => f.folderId); // Filter out invalid items

    return NextResponse.json({ folders });
  } catch (error) {
    console.error("Error fetching folder list:", error);
    return NextResponse.json(
      { error: "Failed to fetch folder list" },
      { status: 500 }
    );
  }
}
