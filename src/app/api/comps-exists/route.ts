import { NextResponse } from "next/server";
import { env } from "~/env";

interface ExistsRequest {
  reportFolderId: string;
  type: string;
  query: string;
  instrumentNumber?: string;
  apn?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExistsRequest;
    const { reportFolderId, type, query, instrumentNumber, apn } = body;

    const n8nUrl = `${env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL}/comps-exists`;
    console.log("Checking comp existence via n8n:", n8nUrl);

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
        projectFolderId: reportFolderId,
        type,
        query,
        instrumentNumber,
        apn
      }),
    });

    if (!response.ok) {
        throw new Error(`n8n webhook failed: ${response.statusText}`);
    }

    // Define expected response structure to avoid any
    interface N8nExistsResponse {
        exists: boolean;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        matches: any[];
    }

    const data = (await response.json()) as unknown;
    
    // Normalize response
    let result: N8nExistsResponse[] = [];
    
    if (Array.isArray(data)) {
        result = data as N8nExistsResponse[];
    } else if (typeof data === 'object' && data !== null) {
        result = [data as N8nExistsResponse];
    } else {
        result = [{ exists: false, matches: [] }];
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error("Error checking comp existence:", error);
    return NextResponse.json(
      { error: "Failed to check existence" },
      { status: 500 }
    );
  }
}
