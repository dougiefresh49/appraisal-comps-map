import { NextResponse } from "next/server";

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { env } from "~/env";

interface FolderDetailsRequest {
  type: string;
  projectFolderId: string;
  folderId: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FolderDetailsRequest;
    const { projectFolderId, folderId, type } = body;

    const n8nUrl = `${env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL}/comps-folder-details`;

    console.log("Fetching folder details from n8n:", n8nUrl);

    const n8nResponse = await fetch(n8nUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectFolderId,
        folderId,
        type,
      }),
    });

    if (!n8nResponse.ok) {
       console.error("n8n response error:", n8nResponse.status, n8nResponse.statusText);
       throw new Error(`Failed to fetch from n8n: ${n8nResponse.statusText}`);
    }

    const data = await n8nResponse.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching folder details:", error);
    return NextResponse.json(
      { error: "Failed to fetch folder details" },
      { status: 500 }
    );
  }
}
