import "server-only";
import { NextResponse } from "next/server";
import { createServiceClient, getGoogleToken } from "~/utils/supabase/server";
import { triggerPhotoAnalysis } from "~/server/photos/actions";
import { listFolderChildren, findChildByName } from "~/lib/drive-api";

const TAG = "[reference-photo-analysis]";

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "heif",
  "tif",
  "tiff",
]);

type RefProjectRow = {
  id: string;
  name: string;
  project_folder_id: string | null;
};

async function countAnalysesForProject(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("photo_analyses")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (error) {
    console.error(TAG, "countAnalysesForProject", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Counts image files in project Drive folder → subject → photos (same rules as photo analysis). */
async function countSubjectPhotoFiles(
  token: string,
  projectFolderId: string,
): Promise<number | null> {
  try {
    const projectChildren = await listFolderChildren(token, projectFolderId, {
      foldersOnly: true,
    });
    const subjectFolder = projectChildren.find(
      (f) => f.name.toLowerCase() === "subject",
    );
    if (!subjectFolder) {
      return null;
    }

    const photosFolder = await findChildByName(
      token,
      subjectFolder.id,
      "photos",
      "application/vnd.google-apps.folder",
    );
    if (!photosFolder) {
      return null;
    }

    const allFiles = await listFolderChildren(token, photosFolder.id, {
      filesOnly: true,
    });
    const imageFiles = allFiles.filter((f) => {
      if (f.mimeType?.startsWith("image/")) return true;
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      return IMAGE_EXTENSIONS.has(ext);
    });
    return imageFiles.length;
  } catch (e) {
    console.warn(TAG, "countSubjectPhotoFiles", e);
    return null;
  }
}

/**
 * Dev-only: in-app Gemini photo analysis for `is_reference` projects (Supabase).
 *
 * GET no params — summary list + optional Drive image counts when signed in with Google.
 * GET ?project_id= — per-project progress for polling.
 *
 * POST — queue analysis for one project (`project_id`) or all reference projects.
 * Skip when `photo_analyses` rows exist unless `force: true`.
 */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const projectIdFilter = searchParams.get("project_id");

  const { token } = await getGoogleToken();
  const driveAuthenticated = Boolean(token);

  if (projectIdFilter) {
    const { data: proj, error } = await supabase
      .from("projects")
      .select("id, name, project_folder_id, is_reference")
      .eq("id", projectIdFilter)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = proj as {
      id: string;
      name: string;
      project_folder_id: string | null;
      is_reference: boolean;
    } | null;

    if (!row) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (!row.is_reference) {
      return NextResponse.json({ error: "Not a reference project" }, { status: 400 });
    }

    const analyzed = await countAnalysesForProject(supabase, row.id);
    let total_photos: number | null = null;
    if (token && row.project_folder_id) {
      total_photos = await countSubjectPhotoFiles(token, row.project_folder_id);
    }

    const is_complete =
      total_photos !== null ? analyzed >= total_photos : false;

    return NextResponse.json({
      project_id: row.id,
      project_name: row.name,
      analyzed_photos: analyzed,
      analyzed_count: analyzed,
      total_photos,
      pending_photos:
        total_photos !== null ? Math.max(0, total_photos - analyzed) : null,
      is_complete,
      drive_authenticated: driveAuthenticated,
    });
  }

  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("id, name, project_folder_id")
    .eq("is_reference", true)
    .order("name", { ascending: true });

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  const projectRows = (projects ?? []) as RefProjectRow[];

  const { data: analysisRows, error: paErr } = await supabase
    .from("photo_analyses")
    .select("project_id");

  if (paErr) {
    return NextResponse.json({ error: paErr.message }, { status: 500 });
  }

  const countByProject = new Map<string, number>();
  for (const r of analysisRows ?? []) {
    const pid = (r as { project_id: string | null }).project_id;
    if (!pid) continue;
    countByProject.set(pid, (countByProject.get(pid) ?? 0) + 1);
  }

  type SummaryStatus = "none" | "partial" | "complete";

  const summaries: {
    project_id: string;
    project_name: string;
    total_in_db: number;
    drive_image_count: number | null;
    has_photos: boolean;
    status: SummaryStatus;
  }[] = [];

  for (const p of projectRows) {
    const total_in_db = countByProject.get(p.id) ?? 0;
    let drive_image_count: number | null = null;
    if (driveAuthenticated && p.project_folder_id) {
      drive_image_count = await countSubjectPhotoFiles(
        token!,
        p.project_folder_id,
      );
    }

    const has_photos = total_in_db > 0;

    let status: SummaryStatus;
    if (total_in_db === 0) {
      status = "none";
    } else if (
      drive_image_count !== null &&
      drive_image_count > 0 &&
      total_in_db >= drive_image_count
    ) {
      status = "complete";
    } else {
      status = "partial";
    }

    summaries.push({
      project_id: p.id,
      project_name: p.name,
      total_in_db,
      drive_image_count,
      has_photos,
      status,
    });
  }

  return NextResponse.json({
    projects: summaries,
    drive_authenticated: driveAuthenticated,
  });
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  let body: {
    project_id?: string;
    force?: boolean;
    execute_once?: boolean;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // empty body
  }

  const supabase = createServiceClient();
  const force = body.force === true;
  const singleId =
    typeof body.project_id === "string" ? body.project_id.trim() : "";

  let projectRows: RefProjectRow[] = [];

  if (singleId) {
    const { data: proj, error } = await supabase
      .from("projects")
      .select("id, name, project_folder_id, is_reference")
      .eq("id", singleId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = proj as {
      id: string;
      name: string;
      project_folder_id: string | null;
      is_reference: boolean;
    } | null;

    if (!row) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (!row.is_reference) {
      return NextResponse.json({ error: "Not a reference project" }, { status: 400 });
    }

    projectRows = [row];
  } else {
    const { data: projects, error } = await supabase
      .from("projects")
      .select("id, name, project_folder_id")
      .eq("is_reference", true)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    projectRows = (projects ?? []) as RefProjectRow[];
    if (body.execute_once === true) {
      projectRows = projectRows.slice(0, 1);
    }
  }

  const results: {
    project_name: string;
    project_id: string;
    folder_id?: string;
    success: boolean;
    skipped?: boolean;
    totalPhotos?: number;
    error?: string;
    existing_analyses?: number;
  }[] = [];

  let skippedCount = 0;
  let queuedCount = 0;

  for (let i = 0; i < projectRows.length; i++) {
    const row = projectRows[i]!;
    const existing = await countAnalysesForProject(supabase, row.id);

    if (!force && existing > 0) {
      skippedCount++;
      results.push({
        project_name: row.name,
        project_id: row.id,
        success: true,
        skipped: true,
        existing_analyses: existing,
        error: `Skipped: ${existing} photo_analyses row(s) already exist (use force to re-run).`,
      });
      continue;
    }

    const folderId = row.project_folder_id?.trim() ?? "";
    if (!folderId) {
      results.push({
        project_name: row.name,
        project_id: row.id,
        success: false,
        error: "missing project_folder_id on project row",
      });
      continue;
    }

    console.log(TAG, `queue [${i + 1}/${projectRows.length}] ${row.name} (${row.id})`);
    const r = await triggerPhotoAnalysis(folderId, row.id);
    if (r.success) {
      queuedCount++;
    }
    results.push({
      project_name: row.name,
      project_id: row.id,
      folder_id: folderId,
      success: r.success,
      totalPhotos: r.totalPhotos,
      error: r.error,
    });

    const isBatch = !singleId && projectRows.length > 1;
    if (isBatch && i < projectRows.length - 1) {
      await new Promise((res) => setTimeout(res, 2500));
    }
  }

  console.log(
    TAG,
    `POST done: queued=${queuedCount} skipped=${skippedCount} (force=${force})`,
  );

  return NextResponse.json({
    message: `Photo analysis: ${queuedCount} queued, ${skippedCount} skipped (runs in background).`,
    force,
    skipped_count: skippedCount,
    queued_count: queuedCount,
    results,
  });
}
