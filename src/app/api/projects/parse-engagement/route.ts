import { type NextRequest, NextResponse } from "next/server";
import { getGoogleToken } from "~/utils/supabase/server";
import { downloadFile } from "~/lib/drive-api";
import { parseEngagementDoc } from "~/lib/engagement-parser";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    let fileBuffer: Buffer;
    let mimeType: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "No file provided" },
          { status: 400 },
        );
      }
      fileBuffer = Buffer.from(await file.arrayBuffer());
      mimeType = file.type || "application/pdf";
    } else {
      const body = (await request.json()) as { fileId?: string };
      if (!body.fileId) {
        return NextResponse.json(
          { error: "fileId is required when not uploading a file" },
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
      fileBuffer = Buffer.from(arrayBuffer);
      mimeType = "application/pdf";
    }

    const data = await parseEngagementDoc(fileBuffer, mimeType);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("Engagement parse error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Parse failed" },
      { status: 500 },
    );
  }
}
