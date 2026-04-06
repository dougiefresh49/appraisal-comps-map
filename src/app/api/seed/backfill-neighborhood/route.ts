import "server-only";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { GoogleGenAI } from "@google/genai";
import { createClient, createServiceClient } from "~/utils/supabase/server";
import { generateEmbedding } from "~/lib/embeddings";
import { stripEmbeddedImagesFromReportMarkdown } from "~/lib/report-md-parser";

const TAG = "[backfill-neighborhood]";
const SECTION_NEIGHBORHOOD = "neighborhood" as const;
const BOUNDARY_MODEL = "gemini-3.1-flash-lite-preview";

interface BackfillNeighborhoodBody {
  md_filenames?: string[];
  force?: boolean;
}

function parseBody(rawText: string): BackfillNeighborhoodBody {
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
  body: BackfillNeighborhoodBody,
):
  | { ok: true; files: string[] }
  | { ok: false; response: NextResponse } {
  const allowed = new Set(listMdFiles(reportsDir));

  const namesFromBody =
    body.md_filenames && body.md_filenames.length > 0
      ? [...new Set(body.md_filenames)]
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

function extractNeighborhoodSection(markdown: string): string | null {
  const startRe = /^#{3,4}\s*\*{0,2}Boundaries\*{0,2}\s*$/im;
  const match = startRe.exec(markdown);
  if (!match) return null;

  const afterHeading = markdown.slice(match.index + match[0].length);
  const lines = afterHeading.split("\n");
  const collected: string[] = [];

  for (const line of lines) {
    if (/^####\s*$/.test(line.trim())) continue;
    if (/^#{3,4}\s*\*{0,2}[A-Z]/.test(line)) break;
    collected.push(line);
  }

  return collected.join("\n").trim() || null;
}

function hasNeighborhoodBoundaries(core: Record<string, unknown>): boolean {
  const nb = core.neighborhoodBoundaries;
  if (nb === null || nb === undefined) return false;
  if (typeof nb !== "object" || Array.isArray(nb)) return false;
  return Object.keys(nb).length > 0;
}

async function extractBoundaryDirections(
  boundariesText: string,
): Promise<{ north: string; south: string; east: string; west: string }> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY required");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: BOUNDARY_MODEL,
    contents: `Given this neighborhood boundaries description from a commercial appraisal report, extract ONLY the road/street names that form each cardinal boundary.

Return ONLY a JSON object with this exact shape:
{ "north": "...", "south": "...", "east": "...", "west": "..." }

Each value must be ONLY the road or street name(s) — no descriptions, no characterizations, no narrative. Use " / " to separate multiple roads for one direction.

Examples of CORRECT values:
- "Business Interstate 20 (BI-20)"
- "SE Loop 338 / Cities Service Rd"
- "FM 1787"

Examples of WRONG values (too long):
- "Business Interstate 20 (BI-20), also known as E 2nd Street, serves as the northern boundary. It is a multi-lane..."

If a direction is not explicitly described, use "".

Text:
${boundariesText}`,
    config: {
      temperature: 0.1,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
    },
  });

  const text = cleanJsonCandidate(response.text ?? "");

  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Gemini returned non-object JSON for boundaries");
  }
  const p = parsed as Record<string, unknown>;
  const pick = (k: string): string =>
    typeof p[k] === "string" ? p[k] : "";

  return {
    north: pick("north"),
    south: pick("south"),
    east: pick("east"),
    west: pick("west"),
  };
}

function cleanJsonCandidate(text: string): string {
  const t = text.trim();
  if (t.startsWith("{")) return t;
  const unfenced = t
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/u, "")
    .trim();
  return unfenced;
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
  let boundaries_updated = 0;
  let sections_updated = 0;
  let mdFiles: string[] = [];

  try {
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      console.error(TAG, "GOOGLE_GEMINI_API_KEY is missing");
      return NextResponse.json(
        { error: "GOOGLE_GEMINI_API_KEY is required" },
        { status: 500 },
      );
    }

    let body: BackfillNeighborhoodBody = {};
    try {
      const text = await request.text();
      body = parseBody(text);
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

    for (const mdFilename of mdFiles) {
      const projectId = filenameToProjectId.get(mdFilename);
      if (projectId === undefined) {
        skipped.push(
          `${mdFilename} (no report_extracted_data row for source_filename)`,
        );
        continue;
      }
      if (projectId === null) {
        skipped.push(`${mdFilename} (report_extracted_data has null project_id)`);
        continue;
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
      const fullBoundariesText = extractNeighborhoodSection(content);
      if (!fullBoundariesText) {
        errors.push(`${mdFilename} (no #### Boundaries section found)`);
        continue;
      }

      const { data: subjectRow } = await supabase
        .from("subject_data")
        .select("core")
        .eq("project_id", projectId)
        .maybeSingle();

      const existingCore = (subjectRow?.core ?? {}) as Record<string, unknown>;

      let directions:
        | { north: string; south: string; east: string; west: string }
        | undefined;

      if (!force && hasNeighborhoodBoundaries(existingCore)) {
        skipped.push(`${mdFilename} (boundaries already exist in subject_data.core)`);
      } else {
        try {
          directions = await extractBoundaryDirections(fullBoundariesText);
        } catch (e) {
          errors.push(
            `${mdFilename} (Gemini boundaries parse): ${e instanceof Error ? e.message : String(e)}`,
          );
        }

        if (directions !== undefined) {
          const updatedCore = {
            ...existingCore,
            neighborhoodBoundaries: directions,
          };

          const { error: subErr } = await supabase.from("subject_data").upsert(
            {
              project_id: projectId,
              core: updatedCore,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "project_id" },
          );

          if (subErr) {
            errors.push(`${mdFilename} (subject_data): ${subErr.message}`);
          } else {
            boundaries_updated++;
          }
        }
      }

      const { data: existingSection } = await supabase
        .from("report_sections")
        .select("content")
        .eq("project_id", projectId)
        .eq("section_key", SECTION_NEIGHBORHOOD)
        .maybeSingle();

      const sectionRow = existingSection as { content?: unknown } | null;
      const existingContent: unknown = sectionRow?.content;
      const existingLen =
        typeof existingContent === "string" ? existingContent.length : 0;
      if (!force && existingLen >= fullBoundariesText.length) {
        skipped.push(
          `${mdFilename} (neighborhood section already has ${String(existingLen)} chars)`,
        );
      } else {
        let embedding: number[];
        try {
          embedding = await generateEmbedding(fullBoundariesText);
        } catch (e) {
          errors.push(
            `${mdFilename} (embedding): ${e instanceof Error ? e.message : String(e)}`,
          );
          continue;
        }

        const { error: upErr } = await supabase.from("report_sections").upsert(
          {
            project_id: projectId,
            section_key: SECTION_NEIGHBORHOOD,
            content: fullBoundariesText,
            embedding: JSON.stringify(embedding),
            version: 1,
            generation_context: {
              source: "neighborhood-backfill",
              source_filename: mdFilename,
              extracted_at: new Date().toISOString(),
              char_count: fullBoundariesText.length,
            },
          },
          { onConflict: "project_id,section_key" },
        );

        if (upErr) {
          errors.push(`${mdFilename} (report_sections): ${upErr.message}`);
        } else {
          sections_updated++;
        }
      }
    }

    const elapsed_ms = Date.now() - t0;
    console.log(
      TAG,
      `Done in ${String(elapsed_ms)}ms — boundaries=${String(boundaries_updated)}, sections=${String(sections_updated)}`,
    );

    return NextResponse.json({
      processed: mdFiles.length,
      boundaries_updated,
      sections_updated,
      skipped,
      errors,
      elapsed_ms,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(TAG, msg);
    return NextResponse.json(
      {
        processed: mdFiles.length,
        boundaries_updated,
        sections_updated,
        skipped,
        errors: [...errors, msg],
        elapsed_ms: Date.now() - t0,
      },
      { status: 500 },
    );
  }
}
