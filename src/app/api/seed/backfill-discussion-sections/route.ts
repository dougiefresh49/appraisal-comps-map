import "server-only";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { createClient, createServiceClient } from "~/utils/supabase/server";
import { generateEmbedding } from "~/lib/embeddings";
import { stripEmbeddedImagesFromReportMarkdown } from "~/lib/report-md-parser";

const TAG = "[backfill-discussion-sections]";
const MIN_SECTION_CHARS = 100;

const SECTION_LAND = "discussion-of-land-sales" as const;
const SECTION_IMPROVED = "discussion-of-improved-sales" as const;

type DiscussionKind = "land" | "improved";

interface BackfillDiscussionBody {
  /** Single file (legacy) */
  md_filename?: string;
  /** One or more files; takes precedence over md_filename when non-empty */
  md_filenames?: string[];
  /** When true, upsert even if a row already exists (re-extract after markdown fixes) */
  force?: boolean;
}

function parseBackfillDiscussionBody(rawText: string): BackfillDiscussionBody {
  if (!rawText.trim()) return {};
  try {
    const raw: unknown = JSON.parse(rawText);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return {};
    }
    const o = raw as Record<string, unknown>;
    const md_filenames = Array.isArray(o.md_filenames)
      ? o.md_filenames.filter((x): x is string => typeof x === "string")
      : undefined;
    return {
      md_filename: typeof o.md_filename === "string" ? o.md_filename : undefined,
      md_filenames,
      force: o.force === true,
    };
  } catch {
    return {};
  }
}

function resolveMdFilenames(
  reportsDir: string,
  body: BackfillDiscussionBody,
):
  | { ok: true; files: string[] }
  | { ok: false; response: NextResponse } {
  const allowed = new Set(listMdFiles(reportsDir));

  const namesFromBody =
    body.md_filenames && body.md_filenames.length > 0
      ? [...new Set(body.md_filenames)]
      : body.md_filename
        ? [body.md_filename]
        : null;

  if (namesFromBody !== null) {
    for (const name of namesFromBody) {
      if (
        typeof name !== "string" ||
        name.includes("..") ||
        name.includes("/") ||
        name.includes("\\")
      ) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: `Invalid markdown filename: ${name}` },
            { status: 400 },
          ),
        };
      }
      if (!allowed.has(name)) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: `Markdown file not in docs/past-reports (or excluded): ${name}`,
            },
            { status: 404 },
          ),
        };
      }
    }
    return { ok: true, files: [...namesFromBody].sort() };
  }

  const all = listMdFiles(reportsDir);
  return { ok: true, files: all };
}

function listMdFiles(reportsDir: string): string[] {
  return fs
    .readdirSync(reportsDir)
    .filter(
      (f) =>
        f.endsWith(".md") &&
        f !== "project-folder-ids.md" &&
        !f.startsWith("."),
    )
    .sort();
}

function isStopLine(line: string, kind: DiscussionKind): boolean {
  const t = line.trim();
  if (kind === "land") {
    if (/\*\*LAND SALES ADJUSTMENT CHART\*\*/i.test(t)) return true;
    if (/\*\*COMPARABLE LAND SALES ADJUSTMENT\*\*/i.test(t)) return true;
    if (/^\|[^\n]*\bLAND SALES ADJUSTMENT CHART\b[^\n]*\|/i.test(t))
      return true;
  } else {
    if (/\*\*SALES ADJUSTMENT CHART\*\*/i.test(t)) return true;
    if (/\*\*COMPARABLE SALES ADJUSTMENT\*\*/i.test(t)) return true;
    if (/^\|[^\n]*\bSALES ADJUSTMENT CHART\b[^\n]*\|/i.test(t)) return true;
  }
  if (/^#{1,3}\s*\*{2}[A-Z]/.test(t)) {
    if (kind === "land" && /\*{2}Discussion of Land Sales\*{2}/i.test(t))
      return false;
    if (
      kind === "improved" &&
      /\*{2}Discussion of Improved Sales\*{2}/i.test(t)
    )
      return false;
    return true;
  }
  return false;
}

function extractDiscussionNarrative(
  content: string,
  kind: DiscussionKind,
): string | null {
  const headingRe =
    kind === "land"
      ? /\*{2}Discussion of Land Sales\*{2}/i
      : /\*{2}Discussion of Improved Sales\*{2}/i;
  const lines = content.split("\n");
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (headingRe.test(line)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return null;

  const bodyLines: string[] = [];
  for (let j = startIdx; j < lines.length; j++) {
    const line = lines[j] ?? "";
    if (j > startIdx && isStopLine(line, kind)) break;
    bodyLines.push(line);
  }

  const text = bodyLines.join("\n").trim();
  if (text.length < MIN_SECTION_CHARS) return null;
  return text;
}

async function rowExistsForSection(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string | null,
  sectionKey: string,
): Promise<boolean> {
  let q = supabase
    .from("report_sections")
    .select("id")
    .eq("section_key", sectionKey)
    .limit(1);
  if (projectId === null) {
    q = q.is("project_id", null);
  } else {
    q = q.eq("project_id", projectId);
  }
  const { data, error } = await q;
  if (error) {
    console.warn(TAG, "exists check failed:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Lists processable `.md` report filenames under docs/past-reports (for UI selection).
 */
export async function GET() {
  const reportsDir = path.join(process.cwd(), "docs", "past-reports");
  if (!fs.existsSync(reportsDir)) {
    return NextResponse.json(
      { error: "docs/past-reports directory not found", files: [] },
      { status: 404 },
    );
  }
  return NextResponse.json({ files: listMdFiles(reportsDir) });
}

export async function POST(request: Request) {
  const t0 = Date.now();
  const skipped: string[] = [];
  const errors: string[] = [];
  const inserted: Record<string, number> = {
    [SECTION_LAND]: 0,
    [SECTION_IMPROVED]: 0,
  };
  let mdFiles: string[] = [];

  try {
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      console.error(TAG, "GOOGLE_GEMINI_API_KEY is missing");
      return NextResponse.json(
        { error: "GOOGLE_GEMINI_API_KEY is required for embeddings" },
        { status: 500 },
      );
    }

    let body: BackfillDiscussionBody = {};
    try {
      const text = await request.text();
      body = parseBackfillDiscussionBody(text);
    } catch {
      // empty body ok
    }
    const force = body.force === true;

    const reportsDir = path.join(process.cwd(), "docs", "past-reports");
    if (!fs.existsSync(reportsDir)) {
      return NextResponse.json(
        { error: "docs/past-reports directory not found" },
        { status: 404 },
      );
    }

    const supabase =
      process.env.NODE_ENV === "development"
        ? createServiceClient()
        : await createClient();

    const { data: extractedRows, error: extractErr } = await supabase
      .from("report_extracted_data")
      .select("project_id, source_filename");

    if (extractErr) {
      console.error(TAG, "report_extracted_data select failed:", extractErr);
      return NextResponse.json(
        { error: extractErr.message },
        { status: 500 },
      );
    }

    const filenameToProjectId = new Map<string, string | null>();
    const extractedFilenameRows = (extractedRows ?? []) as {
      project_id: string | null;
      source_filename: string | null;
    }[];
    for (const row of extractedFilenameRows) {
      const fn = row.source_filename;
      if (typeof fn === "string" && fn.length > 0) {
        const pid =
          typeof row.project_id === "string" ? row.project_id : null;
        filenameToProjectId.set(fn, pid);
      }
    }

    const resolved = resolveMdFilenames(reportsDir, body);
    if (!resolved.ok) {
      return resolved.response;
    }
    mdFiles = resolved.files;

    if (mdFiles.length === 0) {
      return NextResponse.json(
        { error: "No .md files to process in docs/past-reports" },
        { status: 404 },
      );
    }

    for (const mdFilename of mdFiles) {
      const projectId = filenameToProjectId.get(mdFilename);
      if (projectId === undefined) {
        const msg = `${mdFilename} (no report_extracted_data row for source_filename)`;
        console.warn(TAG, msg);
        skipped.push(msg);
        continue;
      }

      const filePath = path.join(reportsDir, mdFilename);
      let raw: string;
      try {
        raw = fs.readFileSync(filePath, "utf-8");
      } catch (e) {
        const msg = `${mdFilename}: ${e instanceof Error ? e.message : "read failed"}`;
        errors.push(msg);
        continue;
      }

      const content = stripEmbeddedImagesFromReportMarkdown(raw);

      const landText = extractDiscussionNarrative(content, "land");
      const improvedText = extractDiscussionNarrative(content, "improved");

      if (!landText) {
        skipped.push(`${mdFilename} (no land discussion found)`);
      }
      if (!improvedText) {
        skipped.push(`${mdFilename} (no improved discussion found)`);
      }

      const sections: { key: typeof SECTION_LAND | typeof SECTION_IMPROVED; text: string }[] =
        [];
      if (landText) sections.push({ key: SECTION_LAND, text: landText });
      if (improvedText)
        sections.push({ key: SECTION_IMPROVED, text: improvedText });

      for (const { key, text } of sections) {
        if (!force) {
          const exists = await rowExistsForSection(supabase, projectId, key);
          if (exists) {
            skipped.push(`${mdFilename} (${key} already exists)`);
            continue;
          }
        }

        let embedding: number[];
        try {
          embedding = await generateEmbedding(text);
        } catch (e) {
          const msg = `${mdFilename} (${key} embedding): ${e instanceof Error ? e.message : String(e)}`;
          errors.push(msg);
          continue;
        }

        const generationContext = {
          source: "discussion-backfill",
          source_filename: mdFilename,
          extracted_at: new Date().toISOString(),
          char_count: text.length,
        };

        const { error: upErr } = await supabase.from("report_sections").upsert(
          {
            project_id: projectId,
            section_key: key,
            content: text,
            embedding: JSON.stringify(embedding),
            version: 1,
            generation_context: generationContext,
          },
          { onConflict: "project_id,section_key" },
        );

        if (upErr) {
          errors.push(`${mdFilename} (${key}): ${upErr.message}`);
        } else {
          inserted[key] = (inserted[key] ?? 0) + 1;
        }
      }
    }

    const elapsed = Date.now() - t0;
    console.log(
      TAG,
      `Done in ${elapsed}ms — inserted land=${inserted[SECTION_LAND]}, improved=${inserted[SECTION_IMPROVED]}`,
    );

    return NextResponse.json({
      processed: mdFiles.length,
      inserted,
      skipped,
      errors,
      elapsed_ms: elapsed,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(TAG, msg);
    return NextResponse.json(
      {
        processed: mdFiles.length,
        inserted,
        skipped,
        errors: [...errors, msg],
      },
      { status: 500 },
    );
  }
}
