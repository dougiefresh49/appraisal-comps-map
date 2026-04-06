import "server-only";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { stripEmbeddedImagesFromReportMarkdown } from "~/lib/report-md-parser";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filename = url.searchParams.get("filename")?.trim();
    if (!filename) {
      return NextResponse.json(
        { error: "filename query parameter is required" },
        { status: 400 },
      );
    }

    const reportsDir = path.join(process.cwd(), "docs", "past-reports");
    const filePath = path.join(reportsDir, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `File not found: ${filename}` },
        { status: 404 },
      );
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const content = stripEmbeddedImagesFromReportMarkdown(raw);
    const line_count = content.split("\n").length;

    return NextResponse.json({ content, line_count });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to read report source",
      },
      { status: 500 },
    );
  }
}
