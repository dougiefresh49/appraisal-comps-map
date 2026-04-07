import "server-only";

import * as fs from "node:fs";
import * as path from "node:path";
import { NextResponse } from "next/server";
import { createServiceClient, getGoogleToken } from "~/utils/supabase/server";
import { downloadFile } from "~/lib/drive-api";
import {
  matchPhotoToReportLabel,
  resizeForGemini,
  resolveImageMimeType,
} from "~/lib/photo-analyzer";
import { parsePhotoLabelsFromReportMarkdown } from "~/lib/report-md-parser";

const TAG = "[backfill-photo-labels]";

interface ProjectRow {
  id: string;
  name: string;
}

interface RequestBody {
  project_id?: string;
  dry_run?: boolean;
  /** When counts match, still call Gemini per photo. */
  force_gemini?: boolean;
  /**
   * When true (default) and parsed label count equals photo count,
   * assign labels[i] to sort_order i without Gemini.
   */
  use_positional_when_counts_match?: boolean;
  /** Defaults to docs/past-reports/projects_rows.json */
  projects_map_path?: string;
}

interface PhotoRow {
  id: string;
  file_id: string | null;
  file_name: string;
  sort_order: number;
  category: string;
  description: string | null;
  label: string;
}

/** Alphanumeric-only fold for robust basename ↔ project name matching */
function compactAlnum(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.md$/i, "")
    .replace(/\s+report(?:\s*-\s*corrected)?$/i, "")
    .replace(/^(appraisal|apprisal)\s+report\s+for\s+/i, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function findMarkdownBasenameForProject(
  projectName: string,
  mdBasenames: string[],
): string | null {
  const pn = compactAlnum(projectName);
  if (!pn) return null;

  for (const base of mdBasenames) {
    const bn = compactAlnum(base);
    if (bn.includes(pn) || pn.includes(bn)) {
      return base;
    }
  }

  const words = projectName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  let best: string | null = null;
  let bestScore = 0;
  for (const base of mdBasenames) {
    const bn = base.toLowerCase();
    const score = words.filter((w) => bn.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = base;
    }
  }
  if (best !== null && bestScore >= Math.min(2, words.length)) {
    return best;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_GEMINI_API_KEY is required" },
        { status: 500 },
      );
    }

    let body: RequestBody = {};
    try {
      const text = await request.text();
      if (text.trim()) body = JSON.parse(text) as RequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const {
      project_id: filterProjectId,
      dry_run = false,
      force_gemini = false,
      use_positional_when_counts_match = true,
      projects_map_path,
    } = body;

    const reportsDir = path.join(process.cwd(), "docs", "past-reports");
    if (!fs.existsSync(reportsDir)) {
      return NextResponse.json(
        { error: "docs/past-reports directory not found" },
        { status: 404 },
      );
    }

    const mapPath =
      projects_map_path ??
      path.join(reportsDir, "projects_rows.json");
    if (!fs.existsSync(mapPath)) {
      return NextResponse.json(
        { error: `Project map not found: ${mapPath}` },
        { status: 404 },
      );
    }

    const projectRows = JSON.parse(
      fs.readFileSync(mapPath, "utf-8"),
    ) as ProjectRow[];

    const mdBasenames = fs
      .readdirSync(reportsDir)
      .filter((f) => f.endsWith(".md"));

    const supabase = createServiceClient();

    const { token, error: tokenError } = await getGoogleToken();
    if (!token) {
      return NextResponse.json(
        {
          error:
            tokenError ??
            "Google Drive token required — sign in with Google OAuth",
        },
        { status: 401 },
      );
    }

    const results: {
      project_id: string;
      project_name: string;
      md_file: string | null;
      label_count: number;
      photo_count: number;
      mode: "positional" | "gemini" | "skipped";
      updated: number;
      errors?: string[];
    }[] = [];

    const toProcess = filterProjectId
      ? projectRows.filter((r) => r.id === filterProjectId)
      : projectRows;

    if (toProcess.length === 0) {
      return NextResponse.json(
        { error: "No projects matched project_id filter" },
        { status: 404 },
      );
    }

    for (const proj of toProcess) {
      const errors: string[] = [];
      const mdBase = findMarkdownBasenameForProject(proj.name, mdBasenames);
      if (!mdBase) {
        results.push({
          project_id: proj.id,
          project_name: proj.name,
          md_file: null,
          label_count: 0,
          photo_count: 0,
          mode: "skipped",
          updated: 0,
          errors: [`No markdown file matched project name "${proj.name}"`],
        });
        continue;
      }

      const mdPath = path.join(reportsDir, mdBase);
      const mdContent = fs.readFileSync(mdPath, "utf-8");
      const labels = parsePhotoLabelsFromReportMarkdown(mdContent);

      if (labels.length === 0) {
        results.push({
          project_id: proj.id,
          project_name: proj.name,
          md_file: mdBase,
          label_count: 0,
          photo_count: 0,
          mode: "skipped",
          updated: 0,
          errors: [
            "No labels parsed from SUBJECT PHOTOS section — check markdown format",
          ],
        });
        continue;
      }

      const { data: photoData, error: photoErr } = await supabase
        .from("photo_analyses")
        .select(
          "id, file_id, file_name, sort_order, category, description, label",
        )
        .eq("project_id", proj.id)
        .eq("is_included", true)
        .order("sort_order", { ascending: true });

      if (photoErr) {
        errors.push(photoErr.message);
        results.push({
          project_id: proj.id,
          project_name: proj.name,
          md_file: mdBase,
          label_count: labels.length,
          photo_count: 0,
          mode: "skipped",
          updated: 0,
          errors,
        });
        continue;
      }

      const photos = (photoData ?? []) as PhotoRow[];
      const usePositional =
        use_positional_when_counts_match &&
        !force_gemini &&
        labels.length === photos.length &&
        photos.length > 0;

      let updated = 0;
      const mode: "positional" | "gemini" = usePositional ? "positional" : "gemini";

      if (usePositional) {
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          const newLabel = labels[i] ?? "";
          if (!newLabel || !photo?.id) continue;
          if (dry_run) {
            updated++;
            continue;
          }
          const { error: upErr } = await supabase
            .from("photo_analyses")
            .update({
              label: newLabel,
              updated_at: new Date().toISOString(),
            })
            .eq("id", photo.id);
          if (upErr) errors.push(`${photo.file_name}: ${upErr.message}`);
          else updated++;
        }
      } else if (dry_run) {
        updated = photos.length;
      } else {
        const concurrency = 2;
        for (let i = 0; i < photos.length; i += concurrency) {
          const batch = photos.slice(i, i + concurrency);
          await Promise.all(
            batch.map(async (photo) => {
              if (!photo.file_id) {
                errors.push(`${photo.id}: missing file_id`);
                return;
              }
              let newLabel = "";
              try {
                const arrayBuffer = await downloadFile(token, photo.file_id);
                const rawBuffer = Buffer.from(arrayBuffer);
                const mimeType = resolveImageMimeType(photo.file_name, "");
                const { buffer: resized, mimeType: resMime } =
                  await resizeForGemini(rawBuffer, mimeType);
                newLabel = await matchPhotoToReportLabel(
                  resized,
                  resMime,
                  labels,
                  photo.category,
                  photo.description ?? "",
                );
              } catch (e) {
                errors.push(
                  `${photo.file_name}: ${e instanceof Error ? e.message : String(e)}`,
                );
                return;
              }
              if (!newLabel) return;
              if (dry_run) {
                updated++;
                return;
              }
              const { error: upErr } = await supabase
                .from("photo_analyses")
                .update({
                  label: newLabel,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", photo.id);
              if (upErr) errors.push(`${photo.file_name}: ${upErr.message}`);
              else updated++;
            }),
          );
        }
      }

      console.log(
        TAG,
        proj.name,
        mdBase,
        "labels",
        labels.length,
        "photos",
        photos.length,
        mode,
        "updated",
        updated,
        dry_run ? "(dry_run)" : "",
      );

      results.push({
        project_id: proj.id,
        project_name: proj.name,
        md_file: mdBase,
        label_count: labels.length,
        photo_count: photos.length,
        mode: photos.length === 0 ? "skipped" : mode,
        updated,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    return NextResponse.json({
      success: true,
      dry_run,
      results,
    });
  } catch (err) {
    console.error(TAG, err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/** Lists projects from `docs/past-reports/projects_rows.json` for the seed UI dropdown. */
export async function GET() {
  try {
    const reportsDir = path.join(process.cwd(), "docs", "past-reports");
    const mapPath = path.join(reportsDir, "projects_rows.json");
    if (!fs.existsSync(reportsDir)) {
      return NextResponse.json(
        { error: "docs/past-reports directory not found", projects: [] },
        { status: 404 },
      );
    }
    if (!fs.existsSync(mapPath)) {
      return NextResponse.json(
        { error: "projects_rows.json not found", projects: [] },
        { status: 404 },
      );
    }
    const projectRows = JSON.parse(
      fs.readFileSync(mapPath, "utf-8"),
    ) as ProjectRow[];
    return NextResponse.json({ projects: projectRows });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
        projects: [],
      },
      { status: 500 },
    );
  }
}
