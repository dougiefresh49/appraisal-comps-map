import "server-only";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { createClient, createServiceClient } from "~/utils/supabase/server";
import { GoogleGenAI } from "@google/genai";
import { stripEmbeddedImagesFromReportMarkdown } from "~/lib/report-md-parser";

const TAG = "[annotate-report]";
const MODEL = "gemini-3.1-pro-preview";

interface AnnotateRequestBody {
  md_filename: string;
  project_id?: string;
}

interface PatchRequestBody {
  id?: string;
  content_type?: string;
  extraction_priority?: string;
  variability?: string;
  human_reviewed?: boolean;
  notes?: string;
  source_filename?: string;
  project_id?: string;
  bulk_mark_reviewed?: boolean;
}

interface TaxonomySectionCompact {
  section_key: string;
  label: string;
  parent_group: string;
  content_type: string;
  extraction_priority: string;
  variability: string;
}

interface Taxonomy {
  sections: (TaxonomySectionCompact & {
    data_sources: string[];
    existing_parser_key: string | null;
    notes: string;
  })[];
  parent_groups: { key: string; label: string; order: number }[];
}

interface GeminiAnnotation {
  section_key: string;
  label: string;
  parent_group: string;
  content_type: string;
  extraction_priority: string;
  variability: string;
  confidence: number;
  content_preview: string | null;
  start_line: number | null;
  end_line: number | null;
  notes: string | null;
}

function buildAnnotationPrompt(
  taxonomy: Taxonomy,
  reportMarkdown: string,
): string {
  const compactSections: TaxonomySectionCompact[] = taxonomy.sections.map(
    (s) => ({
      section_key: s.section_key,
      label: s.label,
      parent_group: s.parent_group,
      content_type: s.content_type,
      extraction_priority: s.extraction_priority,
      variability: s.variability,
    }),
  );

  return `You are annotating a commercial real estate appraisal report by matching each section to a predefined taxonomy.

## Taxonomy
${JSON.stringify(compactSections, null, 2)}

## Task
For each section in the report markdown below, identify which taxonomy section_key it corresponds to. Return a JSON array of annotations:

[
  {
    "section_key": "letter-of-transmittal",
    "label": "Letter of Transmittal",
    "parent_group": "cover",
    "content_type": "standard-with-tweaks",
    "extraction_priority": "important",
    "variability": "low",
    "confidence": 0.95,
    "content_preview": "First ~800 chars of this section's text...",
    "start_line": 32,
    "end_line": 71,
    "notes": null
  }
]

Rules:
- Use ONLY section_keys from the taxonomy. If a section doesn't match any key, use the closest match and lower the confidence.
- If a section in the report doesn't exist in the taxonomy, add it with section_key prefixed with "unknown-" and confidence 0.0
- content_type, extraction_priority, variability: use the taxonomy defaults but OVERRIDE if this specific report's section clearly differs (e.g. a normally-boilerplate section has unusual content)
- start_line / end_line: approximate line numbers in the markdown
- content_preview: first 800 characters of the section content (not headings). Include enough text to understand the section's substance.
- confidence: 0.0-1.0 how confident you are in the section_key mapping

Return ONLY valid JSON array, no commentary.
---
# REPORT MARKDOWN

${reportMarkdown}`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("project_id");
    const sourceFilename = url.searchParams.get("source_filename");

    const pid = projectId?.trim() ?? "";
    const src = sourceFilename?.trim() ?? "";

    if (!pid && !src) {
      return NextResponse.json(
        { error: "project_id or source_filename is required" },
        { status: 400 },
      );
    }

    const supabase =
      process.env.NODE_ENV === "development"
        ? createServiceClient()
        : await createClient();

    let query = supabase.from("report_section_annotations").select("*");

    if (pid) {
      query = query.eq("project_id", pid);
    } else {
      query = query.eq("source_filename", src).is("project_id", null);
    }

    const { data, error } = await query
      .order("start_line", { ascending: true, nullsFirst: false })
      .order("section_key", { ascending: true });

    if (error) {
      console.error(TAG, "GET failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const annotations = data ?? [];
    const n = annotations.length;

    return NextResponse.json({
      annotations,
      message:
        n > 0
          ? `Loaded ${n} existing annotations`
          : "No existing annotations",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Annotation load failed",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const t0 = Date.now();
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error(TAG, "GOOGLE_GEMINI_API_KEY is missing");
      return NextResponse.json(
        { error: "GOOGLE_GEMINI_API_KEY is required" },
        { status: 500 },
      );
    }

    let body: AnnotateRequestBody;
    try {
      body = (await request.json()) as AnnotateRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { md_filename, project_id } = body;

    if (!md_filename) {
      return NextResponse.json(
        { error: "md_filename is required" },
        { status: 400 },
      );
    }

    const reportsDir = path.join(process.cwd(), "docs", "past-reports");
    const filePath = path.join(reportsDir, md_filename);

    if (!fs.existsSync(filePath)) {
      console.error(TAG, `File not found: ${md_filename}`);
      return NextResponse.json(
        { error: `File not found: ${md_filename}` },
        { status: 404 },
      );
    }

    const taxonomyPath = path.join(
      process.cwd(),
      "src",
      "data",
      "report-section-taxonomy.json",
    );
    if (!fs.existsSync(taxonomyPath)) {
      return NextResponse.json(
        { error: "Taxonomy not found at src/data/report-section-taxonomy.json" },
        { status: 500 },
      );
    }

    const taxonomy = JSON.parse(
      fs.readFileSync(taxonomyPath, "utf-8"),
    ) as Taxonomy;
    const mdContent = fs.readFileSync(filePath, "utf-8");
    const sanitized = stripEmbeddedImagesFromReportMarkdown(mdContent);

    console.log(
      TAG,
      `Annotating "${md_filename}" — ${sanitized.length} chars, ${sanitized.split("\n").length} lines`,
    );

    const ai = new GoogleGenAI({ apiKey });
    const prompt = buildAnnotationPrompt(taxonomy, sanitized);

    const geminiT0 = Date.now();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ text: prompt }],
      config: {
        temperature: 0.2,
        maxOutputTokens: 65536,
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text ?? "";
    console.log(
      TAG,
      `Gemini done in ${Date.now() - geminiT0}ms, response ${responseText.length} chars`,
    );

    let geminiAnnotations: GeminiAnnotation[];
    try {
      let jsonText = responseText.trim();
      // Strip markdown code fences if Gemini wrapped the response
      const fenceMatch = /^```(?:json)?\s*\n?([\s\S]*?)```\s*$/.exec(jsonText);
      if (fenceMatch?.[1]) {
        jsonText = fenceMatch[1].trim();
      }

      // Sanitize raw control characters inside JSON string values.
      // Gemini sometimes emits literal tabs, form feeds, etc. that
      // are invalid in JSON strings per the spec.
      // eslint-disable-next-line no-control-regex
      jsonText = jsonText.replace(/[\x00-\x1f]/g, (ch) => {
        if (ch === "\n" || ch === "\r") return ch;
        if (ch === "\t") return "\\t";
        return "";
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        // Fallback 1: extract outermost [...] in case of trailing junk
        const firstBracket = jsonText.indexOf("[");
        const lastBracket = jsonText.lastIndexOf("]");
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          const extracted = jsonText.slice(firstBracket, lastBracket + 1);
          try {
            parsed = JSON.parse(extracted);
          } catch {
            // Fallback 2: truncated response — find the last complete object
            // and close the array. This salvages partial results when Gemini
            // hits the token limit mid-output.
            const lastCompleteObj = extracted.lastIndexOf("}");
            if (lastCompleteObj > firstBracket) {
              const repaired = extracted.slice(0, lastCompleteObj + 1) + "]";
              console.log(TAG, `Attempting truncation repair (salvaging ${repaired.length} chars)`);
              parsed = JSON.parse(repaired);
            } else {
              throw new Error("Could not repair truncated JSON");
            }
          }
        } else {
          throw new Error("No JSON array brackets found in response");
        }
      }

      if (!Array.isArray(parsed)) {
        throw new Error("Response is not an array");
      }
      geminiAnnotations = parsed as GeminiAnnotation[];
    } catch (parseErr) {
      console.error(
        TAG,
        "JSON parse failed:",
        parseErr instanceof Error ? parseErr.message : parseErr,
        "\nFirst 400 chars:",
        responseText.slice(0, 400),
        "\nLast 400 chars:",
        responseText.slice(-400),
      );
      return NextResponse.json(
        { error: "Gemini response was not a valid JSON array" },
        { status: 500 },
      );
    }

    console.log(TAG, `Parsed ${geminiAnnotations.length} annotations`);

    const supabase =
      process.env.NODE_ENV === "development"
        ? createServiceClient()
        : await createClient();

    // Delete existing annotations for this report
    if (project_id) {
      const { error: delErr } = await supabase
        .from("report_section_annotations")
        .delete()
        .eq("project_id", project_id);
      if (delErr) {
        console.warn(TAG, "Delete by project_id failed:", delErr.message);
      }
    } else {
      const { error: delErr } = await supabase
        .from("report_section_annotations")
        .delete()
        .eq("source_filename", md_filename)
        .is("project_id", null);
      if (delErr) {
        console.warn(TAG, "Delete by source_filename failed:", delErr.message);
      }
    }

    // Insert new annotations
    const rows = geminiAnnotations.map((a) => ({
      project_id: project_id ?? null,
      source_filename: md_filename,
      section_key: String(a.section_key ?? "unknown"),
      label: String(a.label ?? a.section_key ?? "Unknown Section"),
      parent_group: String(a.parent_group ?? "addenda"),
      content_type: String(a.content_type ?? "narrative"),
      extraction_priority: String(a.extraction_priority ?? "reference"),
      variability: String(a.variability ?? "medium"),
      ai_confidence:
        typeof a.confidence === "number"
          ? Math.max(0, Math.min(1, a.confidence))
          : null,
      human_reviewed: false,
      notes: a.notes ? String(a.notes) : null,
      content_preview: a.content_preview
        ? String(a.content_preview).slice(0, 1000)
        : null,
      start_line: typeof a.start_line === "number" ? a.start_line : null,
      end_line: typeof a.end_line === "number" ? a.end_line : null,
    }));

    const { data: insertedRows, error: insertErr } = await supabase
      .from("report_section_annotations")
      .insert(rows)
      .select();

    if (insertErr) {
      console.error(TAG, "Insert failed:", insertErr.message);
      return NextResponse.json(
        { error: `Failed to save annotations: ${insertErr.message}` },
        { status: 500 },
      );
    }

    const elapsed = Date.now() - t0;
    const count = (insertedRows ?? []).length;
    console.log(TAG, `Done — ${count} annotations saved in ${elapsed}ms`);

    return NextResponse.json({
      message: `Annotated ${count} sections from "${md_filename}"`,
      elapsed_ms: elapsed,
      annotations: insertedRows ?? [],
    });
  } catch (error) {
    const elapsed = Date.now() - t0;
    console.error(
      TAG,
      `FATAL ERROR after ${elapsed}ms:`,
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Annotation failed",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as PatchRequestBody;

    const supabase =
      process.env.NODE_ENV === "development"
        ? createServiceClient()
        : await createClient();

    // Bulk mark all annotations for a report as human_reviewed
    if (body.bulk_mark_reviewed) {
      if (!body.source_filename) {
        return NextResponse.json(
          { error: "source_filename is required for bulk_mark_reviewed" },
          { status: 400 },
        );
      }

      let updateError: { message: string } | null = null;

      if (body.project_id) {
        const { error } = await supabase
          .from("report_section_annotations")
          .update({ human_reviewed: true })
          .eq("project_id", body.project_id);
        updateError = error;
      } else {
        const { error } = await supabase
          .from("report_section_annotations")
          .update({ human_reviewed: true })
          .eq("source_filename", body.source_filename)
          .is("project_id", null);
        updateError = error;
      }

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 },
        );
      }

      return NextResponse.json({ updated: true });
    }

    // Single annotation update
    if (!body.id) {
      return NextResponse.json(
        { error: "id is required for single annotation update" },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};
    if (body.content_type !== undefined) updates.content_type = body.content_type;
    if (body.extraction_priority !== undefined)
      updates.extraction_priority = body.extraction_priority;
    if (body.variability !== undefined) updates.variability = body.variability;
    if (body.human_reviewed !== undefined)
      updates.human_reviewed = body.human_reviewed;
    if (body.notes !== undefined) updates.notes = body.notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("report_section_annotations")
      .update(updates)
      .eq("id", body.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ updated: 1 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 },
    );
  }
}
