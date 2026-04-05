import "server-only";
import { format, isValid, parse } from "date-fns";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { createClient, createServiceClient } from "~/utils/supabase/server";
import { stripEmbeddedImagesFromReportMarkdown } from "~/lib/report-md-parser";

const TAG = "[backfill-report-due-dates]";

interface BackfillDueDateBody {
  md_filename?: string;
  md_filenames?: string[];
  force?: boolean;
}

function parseBody(rawText: string): BackfillDueDateBody {
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

function resolveMdFilenames(
  reportsDir: string,
  body: BackfillDueDateBody,
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

  return { ok: true, files: listMdFiles(reportsDir) };
}

/** First line of prose after `### **DATE OF REPORT**` inside SIGNIFICANT APPRAISAL DATES. */
function extractDateOfReportRawLine(md: string): string | null {
  const lines = md.split("\n");
  let sigStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (
      /^##\s+/.test(line.trim()) &&
      /SIGNIFICANT APPRAISAL DATES/i.test(line)
    ) {
      sigStart = i;
      break;
    }
  }
  if (sigStart < 0) return null;

  let reportHeadingIdx = -1;
  for (let i = sigStart; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/\*\*DATE OF REPORT\*\*/i.test(line)) {
      reportHeadingIdx = i;
      break;
    }
  }
  if (reportHeadingIdx < 0) return null;

  for (let j = reportHeadingIdx + 1; j < lines.length; j++) {
    const line = (lines[j] ?? "").trim();
    if (line === "") continue;
    if (/^##\s/.test(line)) return null;
    return line;
  }
  return null;
}

const REPORT_DATE_PARSE_FORMATS = [
  "MM/dd/yyyy",
  "M/d/yyyy",
  "M/dd/yyyy",
  "MM/d/yyyy",
  "MMMM d, yyyy",
  "MMM d, yyyy",
] as const;

const PARSE_REFERENCE_DATE = new Date(2020, 0, 1);

function parseReportDueDateToDb(rawLine: string): string | null {
  const trimmed = rawLine.trim();
  for (const fmt of REPORT_DATE_PARSE_FORMATS) {
    const d = parse(trimmed, fmt, PARSE_REFERENCE_DATE);
    if (isValid(d)) {
      return format(d, "MM/dd/yyyy");
    }
  }
  return null;
}

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
  let updated = 0;
  let mdFiles: string[] = [];

  try {
    let body: BackfillDueDateBody = {};
    try {
      body = parseBody(await request.text());
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
        skipped.push(
          `${mdFilename} (no report_extracted_data row for source_filename)`,
        );
        continue;
      }
      if (projectId === null) {
        skipped.push(`${mdFilename} (no linked project_id)`);
        continue;
      }

      if (!force) {
        const { data: proj, error: projErr } = await supabase
          .from("projects")
          .select("report_due_date")
          .eq("id", projectId)
          .maybeSingle();
        if (projErr) {
          errors.push(`${mdFilename} (load project): ${projErr.message}`);
          continue;
        }
        const projRow = proj as { report_due_date: string | null } | null;
        const existing = projRow?.report_due_date;
        if (
          typeof existing === "string" &&
          existing.trim().length > 0
        ) {
          skipped.push(`${mdFilename} (report_due_date already set)`);
          continue;
        }
      }

      const filePath = path.join(reportsDir, mdFilename);
      let raw: string;
      try {
        raw = fs.readFileSync(filePath, "utf-8");
      } catch (e) {
        errors.push(
          `${mdFilename}: ${e instanceof Error ? e.message : "read failed"}`,
        );
        continue;
      }

      const content = stripEmbeddedImagesFromReportMarkdown(raw);
      const rawDateLine = extractDateOfReportRawLine(content);
      if (!rawDateLine) {
        skipped.push(`${mdFilename} (DATE OF REPORT not found or empty)`);
        continue;
      }

      const formatted = parseReportDueDateToDb(rawDateLine);
      if (!formatted) {
        skipped.push(
          `${mdFilename} (could not parse date: "${rawDateLine}")`,
        );
        continue;
      }

      const { error: updErr } = await supabase
        .from("projects")
        .update({ report_due_date: formatted })
        .eq("id", projectId);

      if (updErr) {
        errors.push(`${mdFilename} (update): ${updErr.message}`);
      } else {
        updated++;
        console.log(
          TAG,
          `${mdFilename} → project ${projectId} report_due_date=${formatted}`,
        );
      }
    }

    const elapsed = Date.now() - t0;
    console.log(TAG, `Done in ${elapsed}ms — updated ${updated} project(s)`);

    return NextResponse.json({
      processed: mdFiles.length,
      updated,
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
        updated,
        skipped,
        errors: [...errors, msg],
      },
      { status: 500 },
    );
  }
}
