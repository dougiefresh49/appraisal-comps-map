import { type NextRequest, NextResponse } from "next/server";
import { getGoogleToken } from "~/utils/supabase/server";
import { downloadFile } from "~/lib/drive-api";
import { extractDocumentContent } from "~/lib/gemini";
import { getExtractionPrompt } from "~/lib/document-prompts";

interface FloodMapData {
  flood_zone?: string;
  fema_map_number?: string;
  map_effective_date?: string;
  community_number?: string;
  in_special_flood_hazard_area?: string;
  base_flood_elevation?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { fileId?: string };
    if (!body.fileId) {
      return NextResponse.json(
        { error: "fileId is required" },
        { status: 400 },
      );
    }

    const { token, error: driveAuthError, code } = await getGoogleToken();
    if (!token) {
      return NextResponse.json(
        {
          error:
            driveAuthError ??
            "Not authenticated — please sign in to grant Drive access",
          code,
        },
        { status: 401 },
      );
    }

    const arrayBuffer = await downloadFile(token, body.fileId);
    const fileBuffer = Buffer.from(arrayBuffer);

    const prompt = getExtractionPrompt("flood_map");
    const { structuredData } = await extractDocumentContent(
      fileBuffer,
      "image/png",
      prompt,
    );

    const fields = (
      typeof structuredData.structured_data === "object" &&
      structuredData.structured_data !== null
        ? structuredData.structured_data
        : structuredData
    ) as Record<string, unknown>;

    const data: FloodMapData = {
      flood_zone: typeof fields.flood_zone === "string" ? fields.flood_zone : "",
      fema_map_number: typeof fields.fema_map_number === "string" ? fields.fema_map_number : "",
      map_effective_date: typeof fields.map_effective_date === "string" ? fields.map_effective_date : "",
      community_number: typeof fields.community_number === "string" ? fields.community_number : "",
      in_special_flood_hazard_area:
        fields.in_special_flood_hazard_area === true
          ? "true"
          : fields.in_special_flood_hazard_area === false
            ? "false"
            : typeof fields.in_special_flood_hazard_area === "string"
              ? fields.in_special_flood_hazard_area
              : "",
      base_flood_elevation: typeof fields.base_flood_elevation === "string" ? fields.base_flood_elevation : "",
    };

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("Flood map parse error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Parse failed" },
      { status: 500 },
    );
  }
}
