import { NextResponse } from "next/server";

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { env } from "~/env";

interface ParserRequest {
  type: string;
  folderId: string;
  projectFolderId: string;
  extraContext?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prevParsedContent?: any;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ParserRequest;
    const { type, folderId, projectFolderId, extraContext, prevParsedContent } =
      body;

    const n8nUrl = `${env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL}/comps-parser`;

    console.log("Triggering parser via n8n:", n8nUrl);

    const n8nResponse = await fetch(n8nUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        folderId,
        projectFolderId,
        extraContext,
        prevParsedContent,
      }),
    });

    if (!n8nResponse.ok) {
       console.error("n8n response error:", n8nResponse.status, n8nResponse.statusText);
       throw new Error(`Failed to trigger parser via n8n: ${n8nResponse.statusText}`);
    }

    const data = await n8nResponse.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error triggering parser:", error);
    return NextResponse.json(
      { error: "Failed to trigger parser" },
      { status: 500 }
    );
  }
}
