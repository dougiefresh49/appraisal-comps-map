
import { NextResponse } from "next/server";
import { env } from "~/env";

interface CompsDataRequest {
  projectFolderId: string;
  type: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CompsDataRequest;
    const { projectFolderId, type } = body;

    const n8nUrl = `${env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL}/comps-data`;
    console.log("Fetching comps data via n8n:", n8nUrl);

    if (!env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL) {
         console.error("NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL is not set");
         return NextResponse.json(
            { error: "Configuration error: N8N_WEBHOOK_BASE_URL not set" },
            { status: 500 }
         );
    }

    const response = await fetch(n8nUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectFolderId,
        type: type.toLowerCase(),
      }),
    });

    if (!response.ok) {
        throw new Error(`n8n webhook failed: ${response.statusText}`);
    }
    const data = (await response.json()) as {comps: unknown[], imageMap: Record<string, ImageData[]>};
    return NextResponse.json(data);

  } catch (error) {
    console.error("Error fetching comps data:", error);
    return NextResponse.json(
      { error: "Failed to fetch comps data" },
      { status: 500 }
    );
  }
}
