import "server-only";
import * as fs from "fs";
import * as path from "path";
import { NextResponse } from "next/server";
import { createServiceClient } from "~/utils/supabase/server";
import { triggerPhotoAnalysis } from "~/server/photos/actions";

const TAG = "[reference-photo-analysis]";

type MappingRow = {
  "Project Name": string;
  "Google Drive Folder ID": string;
};

function loadMapping(): MappingRow[] {
  const mdPath = path.join(
    process.cwd(),
    "docs",
    "past-reports",
    "project-folder-ids.md",
  );
  if (!fs.existsSync(mdPath)) {
    throw new Error("docs/past-reports/project-folder-ids.md not found");
  }
  const content = fs.readFileSync(mdPath, "utf8");
  const m = /```json\s*([\s\S]*?)```/.exec(content);
  if (!m?.[1]) throw new Error("No JSON block in project-folder-ids.md");
  return JSON.parse(m[1]) as MappingRow[];
}

/**
 * Dev-only: run in-app Gemini photo analysis (`photo_analyses`) for reference
 * projects listed in project-folder-ids.md — same Drive traversal as the
 * subject photos UI (`/api/photos/process`), not n8n.
 *
 * Requires a signed-in Google session (Drive token cookie), same as other
 * seed tools that touch Drive.
 *
 * POST body (optional): `{ "execute_once"?: true }` — only first mapping row
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  let executeOnce = false;
  try {
    const body = (await req.json()) as { execute_once?: boolean };
    executeOnce = body.execute_once === true;
  } catch {
    // empty
  }

  const supabase = createServiceClient();
  let rows = loadMapping();
  if (executeOnce) rows = rows.slice(0, 1);

  const results: {
    projectName: string;
    project_id: string | null;
    folderId: string;
    success: boolean;
    totalPhotos?: number;
    error?: string;
  }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const projectName = row["Project Name"];
    const folderId = row["Google Drive Folder ID"]?.trim();
    if (!folderId) {
      results.push({
        projectName,
        project_id: null,
        folderId: "",
        success: false,
        error: "missing Google Drive Folder ID",
      });
      continue;
    }

    const { data: proj, error: lookupErr } = await supabase
      .from("projects")
      .select("id")
      .eq("name", projectName)
      .eq("is_reference", true)
      .maybeSingle();

    if (lookupErr) {
      console.error(TAG, lookupErr.message);
      results.push({
        projectName,
        project_id: null,
        folderId,
        success: false,
        error: lookupErr.message,
      });
      continue;
    }

    const projectId = (proj as { id: string } | null)?.id ?? null;
    if (!projectId) {
      results.push({
        projectName,
        project_id: null,
        folderId,
        success: false,
        error: "no reference project with this name in Supabase",
      });
      continue;
    }

    console.log(TAG, `[${i + 1}/${rows.length}] ${projectName} (${projectId})`);
    const r = await triggerPhotoAnalysis(folderId, projectId);
    results.push({
      projectName,
      project_id: projectId,
      folderId,
      success: r.success,
      totalPhotos: r.totalPhotos,
      error: r.error,
    });

    if (i < rows.length - 1) {
      await new Promise((res) => setTimeout(res, 2500));
    }
  }

  const ok = results.filter((x) => x.success).length;
  return NextResponse.json({
    message: `Queued photo analysis for ${ok}/${results.length} project(s) (runs in background; watch Realtime on photo_analyses)`,
    execute_once: executeOnce,
    results,
  });
}
