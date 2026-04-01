import "server-only";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { createClient, createServiceClient } from "~/utils/supabase/server";
import { generateEmbedding } from "~/lib/embeddings";
import { GoogleGenAI } from "@google/genai";

const TAG = "[backfill-reports]";

const SECTION_KEYS = [
  "neighborhood",
  "zoning",
  "subject-site-summary",
  "highest-best-use",
  "ownership",
] as const;

const EXTRACTION_PROMPT = `You are analyzing a commercial real estate appraisal report PDF. 
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

interface BackfillRequestBody {
  project_id?: string;
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
      // Empty body or non-JSON is fine — treat as no-op body
    }

    const { project_id, pdf_filename } = body;
    console.log(TAG, "Starting backfill", { project_id, pdf_filename });

    const reportsDir = path.join(process.cwd(), "docs", "past-reports");
    if (!fs.existsSync(reportsDir)) {
      console.error(TAG, "docs/past-reports directory not found");
      return NextResponse.json(
        { error: "docs/past-reports directory not found" },
        { status: 404 },
      );
    }

    let pdfFiles: string[];
    if (pdf_filename) {
      if (!fs.existsSync(path.join(reportsDir, pdf_filename))) {
        console.error(TAG, `PDF file not found: ${pdf_filename}`);
        return NextResponse.json(
          { error: `PDF file not found: ${pdf_filename}` },
          { status: 404 },
        );
      }
      pdfFiles = [pdf_filename];
    } else {
      pdfFiles = fs
        .readdirSync(reportsDir)
        .filter((f) => f.endsWith(".pdf"))
        .sort();
    }

    if (pdfFiles.length === 0) {
      console.error(TAG, "No PDF files found in docs/past-reports");
      return NextResponse.json(
        { error: "No PDF files found in docs/past-reports" },
        { status: 404 },
      );
    }

    console.log(TAG, `Found ${pdfFiles.length} PDF(s) to process`);

    const supabase =
      process.env.NODE_ENV === "development"
        ? createServiceClient()
        : await createClient();

    console.log(
      TAG,
      `Using ${process.env.NODE_ENV === "development" ? "service-role" : "cookie-based"} Supabase client`,
    );

    // Only skip if doing a bulk run without a specific project_id (legacy orphan check)
    if (!project_id && !pdf_filename) {
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

    console.log(TAG, "Initializing Gemini client...");
    const ai = new GoogleGenAI({ apiKey });

    const results: {
      file: string;
      sectionsExtracted: number;
      metadata?: Record<string, string | null>;
      error?: string;
    }[] = [];

    for (let i = 0; i < pdfFiles.length; i++) {
      const pdfFile = pdfFiles[i]!;
      console.log(
        TAG,
        `\n--- [${i + 1}/${pdfFiles.length}] Processing: ${pdfFile} ---`,
      );

      try {
        const filePath = path.join(reportsDir, pdfFile);
        const fileBuffer = fs.readFileSync(filePath);
        const fileSizeKB = Math.round(fileBuffer.length / 1024);
        const base64Data = fileBuffer.toString("base64");
        console.log(TAG, `  File size: ${fileSizeKB} KB`);

        console.log(TAG, `  Calling Gemini (gemini-3.1-flash-lite-preview)...`);
        const geminiT0 = Date.now();
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite-preview",
          contents: [
            {
              inlineData: {
                data: base64Data,
                mimeType: "application/pdf",
              },
            },
            { text: EXTRACTION_PROMPT },
          ],
          config: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          },
        });
        const geminiElapsed = Date.now() - geminiT0;

        const responseText = response.text ?? "";
        console.log(
          TAG,
          `  Gemini responded in ${geminiElapsed}ms (${responseText.length} chars)`,
        );

        let parsed: Record<string, string>;
        try {
          parsed = JSON.parse(responseText) as Record<string, string>;
        } catch {
          console.error(
            TAG,
            `  FAILED to parse Gemini response as JSON. First 200 chars:`,
            responseText.slice(0, 200),
          );
          results.push({
            file: pdfFile,
            sectionsExtracted: 0,
            error: "Failed to parse Gemini response as JSON",
          });
          continue;
        }

        const metadata = {
          property_type: parsed.property_type ?? null,
          city: parsed.city ?? null,
          county: parsed.county ?? null,
          subject_address: parsed.subject_address ?? null,
        };
        console.log(TAG, `  Metadata:`, metadata);

        let sectionsInserted = 0;

        for (const key of SECTION_KEYS) {
          const content = parsed[key];
          const contentLen = content?.trim().length ?? 0;

          if (!content || contentLen < 50) {
            console.log(
              TAG,
              `  Section "${key}": skipped (${contentLen} chars, min 50)`,
            );
            continue;
          }

          console.log(
            TAG,
            `  Section "${key}": ${contentLen} chars — inserting...`,
          );

          const insertPayload: Record<string, unknown> = {
            project_id: project_id ?? null,
            section_key: key,
            content: content.trim(),
            version: 1,
            generation_context: {
              source: "backfill",
              sourceFile: pdfFile,
            },
            property_type: metadata.property_type,
            city: metadata.city,
            county: metadata.county,
            subject_address: metadata.subject_address,
          };

          try {
            const embT0 = Date.now();
            const embedding = await generateEmbedding(content.trim());
            insertPayload.embedding = JSON.stringify(embedding);
            console.log(
              TAG,
              `    Embedding generated in ${Date.now() - embT0}ms`,
            );
          } catch (embErr) {
            console.warn(
              TAG,
              `    Embedding failed (continuing without):`,
              embErr instanceof Error ? embErr.message : embErr,
            );
          }

          const { error } = await supabase
            .from("report_sections")
            .insert(insertPayload);

          if (error) {
            console.error(TAG, `    DB insert FAILED:`, error.message);
          } else {
            sectionsInserted++;
            console.log(TAG, `    Inserted OK`);
          }
        }

        console.log(
          TAG,
          `  Done — ${sectionsInserted}/${SECTION_KEYS.length} sections inserted`,
        );
        results.push({
          file: pdfFile,
          sectionsExtracted: sectionsInserted,
          metadata,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(TAG, `  EXCEPTION processing ${pdfFile}:`, msg);
        results.push({
          file: pdfFile,
          sectionsExtracted: 0,
          error: msg,
        });
      }
    }

    const totalSections = results.reduce(
      (sum, r) => sum + r.sectionsExtracted,
      0,
    );
    const elapsed = Date.now() - t0;

    console.log(
      TAG,
      `\nDone — ${results.length} PDFs processed, ${totalSections} sections extracted in ${elapsed}ms`,
    );

    return NextResponse.json({
      message: `Processed ${results.length} PDFs, extracted ${totalSections} total sections`,
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
