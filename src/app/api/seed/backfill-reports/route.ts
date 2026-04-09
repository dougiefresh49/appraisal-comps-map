import "server-only";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { format } from "date-fns";
import { createClient, createServiceClient } from "~/utils/supabase/server";
import { generateEmbedding } from "~/lib/embeddings";
import { GoogleGenAI } from "@google/genai";
import {
  parseReportMarkdown,
  normalizeSubjectCoreForDb,
  REPORT_MD_SECTION_KEYS,
} from "~/lib/report-md-parser";
import { parseEngagementDateToDate } from "~/utils/parse-engagement-date";

const TAG = "[backfill-reports]";

const PDF_SECTION_KEYS = [
  "neighborhood",
  "zoning",
  "subject-site-summary",
  "highest-best-use",
  "ownership",
] as const;

const PDF_EXTRACTION_PROMPT = `You are analyzing a commercial real estate appraisal report PDF. 
Extract the following sections if they exist in the document. Return a JSON object with these exact keys:

{
  "neighborhood": "the full text of the neighborhood description section",
  "zoning": "the full text of the zoning analysis section",
  "subject-site-summary": "the full text of the subject/site description section (may include improvements, utilities, flood zone, etc.)",
  "highest-best-use": "the full text of the highest and best use analysis section",
  "ownership": "the full text of the ownership/sales history section",
  "property_type": "the property type (e.g., Commercial, Industrial, Vacant Land)",
  "city": "the city of the subject property",
  "county": "the county of the subject property",
  "subject_address": "the full address of the subject property"
}

For each section key, return the full extracted text. If a section is not found, return an empty string for that key.
Only return the JSON object, nothing else.`;

const MIN_SECTION_CHARS = 40;
const MODEL_PDF = "gemini-3.1-flash-lite-preview";

interface BackfillRequestBody {
  project_id?: string;
  /** Preferred: markdown export path under docs/past-reports/ */
  md_filename?: string;
  /** Legacy fallback when no .md is available */
  pdf_filename?: string;
}

export async function POST(request: Request) {
  const t0 = Date.now();
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error(TAG, "GOOGLE_GEMINI_API_KEY is missing");
      return NextResponse.json(
        { error: "GOOGLE_GEMINI_API_KEY is required for backfill" },
        { status: 500 },
      );
    }

    let body: BackfillRequestBody = {};
    try {
      const text = await request.text();
      if (text.trim()) {
        body = JSON.parse(text) as BackfillRequestBody;
      }
    } catch {
      // empty body ok
    }

    const { project_id, md_filename, pdf_filename } = body;
    console.log(TAG, "Starting backfill", {
      project_id,
      md_filename,
      pdf_filename,
    });

    const reportsDir = path.join(process.cwd(), "docs", "past-reports");
    if (!fs.existsSync(reportsDir)) {
      console.error(TAG, "docs/past-reports directory not found");
      return NextResponse.json(
        { error: "docs/past-reports directory not found" },
        { status: 404 },
      );
    }

    const supabase =
      process.env.NODE_ENV === "development"
        ? createServiceClient()
        : await createClient();

    console.log(
      TAG,
      `Using ${process.env.NODE_ENV === "development" ? "service-role" : "cookie-based"} Supabase client`,
    );

    // Legacy orphan guard: bulk run without project and without a specific file
    if (!project_id && !pdf_filename && !md_filename) {
      const { count } = await supabase
        .from("report_sections")
        .select("id", { count: "exact", head: true })
        .is("project_id", null);

      if (count && count > 0) {
        console.log(
          TAG,
          `Skipping — ${count} orphan report sections already exist`,
        );
        return NextResponse.json({
          message: `Backfill already contains ${count} orphan report sections. Skipping.`,
          existingCount: count,
        });
      }
    }

    // --- Resolve file list ---
    let mdFiles: string[] = [];
    let usePdf = false;
    let pdfFiles: string[] = [];

    if (md_filename) {
      const p = path.join(reportsDir, md_filename);
      if (!fs.existsSync(p)) {
        console.error(TAG, `Markdown file not found: ${md_filename}`);
        return NextResponse.json(
          { error: `Markdown file not found: ${md_filename}` },
          { status: 404 },
        );
      }
      mdFiles = [md_filename];
    } else if (pdf_filename) {
      const p = path.join(reportsDir, pdf_filename);
      if (!fs.existsSync(p)) {
        console.error(TAG, `PDF file not found: ${pdf_filename}`);
        return NextResponse.json(
          { error: `PDF file not found: ${pdf_filename}` },
          { status: 404 },
        );
      }
      usePdf = true;
      pdfFiles = [pdf_filename];
    } else {
      mdFiles = fs
        .readdirSync(reportsDir)
        .filter(
          (f) =>
            f.endsWith(".md") &&
            f !== "project-folder-ids.md" &&
            !f.startsWith("."),
        )
        .sort();
      if (mdFiles.length > 0) {
        console.log(TAG, `Bulk mode: ${mdFiles.length} markdown file(s)`);
      } else {
        pdfFiles = fs
          .readdirSync(reportsDir)
          .filter((f) => f.endsWith(".pdf"))
          .sort();
        usePdf = pdfFiles.length > 0;
        if (!usePdf) {
          console.error(TAG, "No .md or .pdf files in docs/past-reports");
          return NextResponse.json(
            {
              error:
                "No report files found in docs/past-reports (.md preferred, .pdf fallback)",
            },
            { status: 404 },
          );
        }
        console.log(TAG, `Bulk mode: ${pdfFiles.length} PDF file(s) (no .md)`);
      }
    }

    const bulkFileCount = usePdf ? pdfFiles.length : mdFiles.length;
    if (!project_id && bulkFileCount > 1) {
      return NextResponse.json(
        {
          error:
            "Bulk backfill without project_id allows at most one report file in docs/past-reports. Use import-old-reports (per-project) or pass md_filename + project_id.",
        },
        { status: 400 },
      );
    }

    const results: {
      file: string;
      mode: "markdown" | "pdf";
      sectionsInserted: number;
      subjectUpserted?: boolean;
      projectUpdated?: boolean;
      extractedDataStored?: boolean;
      error?: string;
    }[] = [];

    if (usePdf) {
      for (const pdfFile of pdfFiles) {
        const r = await runPdfBackfillFile({
          reportsDir,
          pdfFile,
          project_id: project_id ?? null,
          apiKey,
          supabase,
        });
        results.push({ file: pdfFile, mode: "pdf", ...r });
      }
    } else {
      for (const mdFile of mdFiles) {
        const r = await runMarkdownBackfillFile({
          reportsDir,
          mdFile,
          project_id: project_id ?? null,
          apiKey,
          supabase,
        });
        results.push({ file: mdFile, mode: "markdown", ...r });
      }
    }

    const totalSections = results.reduce((s, r) => s + r.sectionsInserted, 0);
    const elapsed = Date.now() - t0;

    console.log(
      TAG,
      `\nDone — ${results.length} file(s), ${totalSections} sections inserted, ${elapsed}ms`,
    );

    return NextResponse.json({
      message: `Processed ${results.length} report file(s), inserted ${totalSections} narrative sections`,
      elapsed_ms: elapsed,
      project_id: project_id ?? null,
      results,
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
          error instanceof Error ? error.message : "Failed to backfill reports",
      },
      { status: 500 },
    );
  }
}

async function runMarkdownBackfillFile(opts: {
  reportsDir: string;
  mdFile: string;
  project_id: string | null;
  apiKey: string;
  supabase: ReturnType<typeof createServiceClient>;
}): Promise<{
  sectionsInserted: number;
  subjectUpserted: boolean;
  projectUpdated: boolean;
  extractedDataStored: boolean;
  error?: string;
}> {
  const { reportsDir, mdFile, project_id, apiKey, supabase } = opts;

  console.log(TAG, `\n--- Markdown: ${mdFile} ---`);

  let sectionsInserted = 0;
  let subjectUpserted = false;
  let projectUpdated = false;
  let extractedDataStored = false;

  try {
    const filePath = path.join(reportsDir, mdFile);
    const mdContent = fs.readFileSync(filePath, "utf-8");
    const parsed = await parseReportMarkdown(mdContent, apiKey, mdFile);

    if (project_id) {
      const core = normalizeSubjectCoreForDb(
        parsed.subject_core,
        parsed.cover,
      );

      const projectPatch: Record<string, string | null> = {};
      if (parsed.cover.client_name)
        projectPatch.client_name = parsed.cover.client_name;
      if (parsed.cover.client_company)
        projectPatch.client_company = parsed.cover.client_company;
      if (parsed.cover.effective_date) {
        const d = parseEngagementDateToDate(parsed.cover.effective_date);
        if (d) projectPatch.effective_date = format(d, "yyyy-MM-dd");
      }
      if (parsed.cover.property_type)
        projectPatch.property_type = parsed.cover.property_type;

      if (Object.keys(projectPatch).length > 0) {
        const { error: projErr } = await supabase
          .from("projects")
          .update(projectPatch)
          .eq("id", project_id);
        if (projErr) {
          console.error(TAG, "projects update failed:", projErr.message);
        } else {
          projectUpdated = true;
          console.log(TAG, "Updated projects row:", projectPatch);
        }
      }

      const { error: subErr } = await supabase.from("subject_data").upsert(
        {
          project_id,
          taxes: parsed.taxes,
          tax_entities: parsed.tax_entities,
          fema: parsed.fema,
          improvement_analysis: parsed.improvement_analysis,
          core,
          parcels: [],
          improvements: [],
        },
        { onConflict: "project_id" },
      );

      if (subErr) {
        console.error(TAG, "subject_data upsert failed:", subErr.message);
      } else {
        subjectUpserted = true;
        console.log(TAG, "Upserted subject_data for project", project_id);
      }

      await supabase
        .from("report_sections")
        .delete()
        .eq("project_id", project_id)
        .in("section_key", [...REPORT_MD_SECTION_KEYS]);
    }

    const cityCore =
      typeof parsed.subject_core.City === "string"
        ? parsed.subject_core.City
        : null;
    const countyCore =
      typeof parsed.subject_core.County === "string"
        ? parsed.subject_core.County
        : null;
    const addressCore =
      typeof parsed.subject_core.Address === "string"
        ? parsed.subject_core.Address
        : null;

    const meta = {
      property_type: parsed.cover.property_type ?? null,
      city: cityCore,
      county: countyCore,
      subject_address: addressCore ?? parsed.cover.property_address ?? null,
    };

    for (const key of REPORT_MD_SECTION_KEYS) {
      const content = parsed.sections[key]?.trim() ?? "";
      if (content.length < MIN_SECTION_CHARS) {
        console.log(
          TAG,
          `  Section "${key}": skip (${content.length} chars < ${MIN_SECTION_CHARS})`,
        );
        continue;
      }

      const insertPayload: Record<string, unknown> = {
        project_id: project_id ?? null,
        section_key: key,
        content,
        version: 1,
        generation_context: {
          source: "backfill-md",
          sourceFile: mdFile,
        },
        property_type: meta.property_type,
        city: meta.city,
        county: meta.county,
        subject_address: meta.subject_address,
      };

      try {
        const embedding = await generateEmbedding(content);
        insertPayload.embedding = JSON.stringify(embedding);
      } catch (embErr) {
        console.warn(
          TAG,
          `  Embedding "${key}" failed:`,
          embErr instanceof Error ? embErr.message : embErr,
        );
      }

      const { error: insErr } = await supabase
        .from("report_sections")
        .insert(insertPayload);

      if (insErr) {
        console.error(TAG, `  Insert "${key}" failed:`, insErr.message);
      } else {
        sectionsInserted++;
        console.log(TAG, `  Inserted section "${key}" (${content.length} chars)`);
      }
    }

    // Store Pass 2 structured extraction (comps, adjustments, cost, reconciliation)
    // in the report_extracted_data table. Using a separate table keeps structured
    // numeric data clearly distinct from RAG narrative content in report_sections.
    const hasPass2Data =
      parsed.land_comps.length > 0 ||
      parsed.sale_comps.length > 0 ||
      parsed.rental_comps.length > 0 ||
      parsed.land_adjustments !== null ||
      parsed.sale_adjustments !== null ||
      parsed.cost_approach !== null ||
      parsed.reconciliation !== null;

    if (hasPass2Data) {
      const extractedPayload = {
        project_id: project_id ?? null,
        source_filename: mdFile,
        land_comps: parsed.land_comps,
        sale_comps: parsed.sale_comps,
        rental_comps: parsed.rental_comps,
        land_adjustments: parsed.land_adjustments ?? null,
        sale_adjustments: parsed.sale_adjustments ?? null,
        rental_adjustments: parsed.rental_adjustments ?? null,
        cost_approach: parsed.cost_approach ?? null,
        reconciliation: parsed.reconciliation ?? null,
      };

      const { error: extractErr } = project_id
        ? await supabase
            .from("report_extracted_data")
            .upsert(extractedPayload, { onConflict: "project_id" })
        : await supabase.from("report_extracted_data").insert(extractedPayload);

      if (extractErr) {
        console.error(
          TAG,
          `  report_extracted_data upsert failed (${mdFile}):`,
          extractErr.message,
        );
      } else {
        extractedDataStored = true;
        console.log(
          TAG,
          `  Stored Pass 2 data: land_comps=${parsed.land_comps.length}, sale_comps=${parsed.sale_comps.length}, rental_comps=${parsed.rental_comps.length}`,
        );
      }
    } else {
      console.log(TAG, `  Pass 2 returned no structured data for "${mdFile}" — skipping insert`);
    }

    return { sectionsInserted, subjectUpserted, projectUpdated, extractedDataStored };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(TAG, `Markdown backfill failed (${mdFile}):`, msg);
    return {
      sectionsInserted: 0,
      subjectUpserted: false,
      projectUpdated: false,
      extractedDataStored: false,
      error: msg,
    };
  }
}

async function runPdfBackfillFile(opts: {
  reportsDir: string;
  pdfFile: string;
  project_id: string | null;
  apiKey: string;
  supabase: ReturnType<typeof createServiceClient>;
}): Promise<{
  sectionsInserted: number;
  subjectUpserted: boolean;
  projectUpdated: boolean;
  extractedDataStored: boolean;
  error?: string;
}> {
  const { reportsDir, pdfFile, project_id, apiKey, supabase } = opts;

  console.log(TAG, `\n--- PDF (legacy): ${pdfFile} ---`);

  const ai = new GoogleGenAI({ apiKey });

  try {
    const filePath = path.join(reportsDir, pdfFile);
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString("base64");

    const response = await ai.models.generateContent({
      model: MODEL_PDF,
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: "application/pdf",
          },
        },
        { text: PDF_EXTRACTION_PROMPT },
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text ?? "";
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(responseText) as Record<string, string>;
    } catch {
      return {
        sectionsInserted: 0,
        subjectUpserted: false,
        projectUpdated: false,
        extractedDataStored: false,
        error: "Failed to parse Gemini PDF response as JSON",
      };
    }

    const metadata = {
      property_type: parsed.property_type ?? null,
      city: parsed.city ?? null,
      county: parsed.county ?? null,
      subject_address: parsed.subject_address ?? null,
    };

    let sectionsInserted = 0;

    if (project_id) {
      await supabase
        .from("report_sections")
        .delete()
        .eq("project_id", project_id)
        .in("section_key", [...PDF_SECTION_KEYS]);
    }

    for (const key of PDF_SECTION_KEYS) {
      const content = parsed[key]?.trim() ?? "";
      if (content.length < MIN_SECTION_CHARS) continue;

      const insertPayload: Record<string, unknown> = {
        project_id: project_id ?? null,
        section_key: key,
        content,
        version: 1,
        generation_context: {
          source: "backfill-pdf",
          sourceFile: pdfFile,
        },
        ...metadata,
      };

      try {
        const embedding = await generateEmbedding(content);
        insertPayload.embedding = JSON.stringify(embedding);
      } catch {
        // continue without embedding
      }

      const { error } = await supabase.from("report_sections").insert(insertPayload);
      if (!error) sectionsInserted++;
    }

    return {
      sectionsInserted,
      subjectUpserted: false,
      projectUpdated: false,
      extractedDataStored: false,
    };
  } catch (err) {
    return {
      sectionsInserted: 0,
      subjectUpserted: false,
      projectUpdated: false,
      extractedDataStored: false,
      error: err instanceof Error ? err.message : "PDF backfill error",
    };
  }
}
