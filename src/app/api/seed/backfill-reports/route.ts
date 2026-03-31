import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "~/utils/supabase/server";
import { generateEmbedding } from "~/lib/embeddings";
import { GoogleGenAI } from "@google/genai";

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

export async function POST() {
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_GEMINI_API_KEY is required for backfill" },
        { status: 500 },
      );
    }

    const reportsDir = path.join(process.cwd(), "docs", "prior-reports");
    if (!fs.existsSync(reportsDir)) {
      return NextResponse.json(
        { error: "docs/prior-reports directory not found" },
        { status: 404 },
      );
    }

    const pdfFiles = fs
      .readdirSync(reportsDir)
      .filter((f) => f.endsWith(".pdf"))
      .sort();

    if (pdfFiles.length === 0) {
      return NextResponse.json(
        { error: "No PDF files found in docs/prior-reports" },
        { status: 404 },
      );
    }

    const supabase = await createClient();

    const { count } = await supabase
      .from("report_sections")
      .select("id", { count: "exact", head: true })
      .is("project_id", null);

    if (count && count > 0) {
      return NextResponse.json({
        message: `Backfill already contains ${count} orphan report sections. Skipping.`,
        existingCount: count,
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const results: {
      file: string;
      sectionsExtracted: number;
      error?: string;
    }[] = [];

    for (const pdfFile of pdfFiles) {
      try {
        const filePath = path.join(reportsDir, pdfFile);
        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString("base64");

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

        const responseText = response.text ?? "";
        let parsed: Record<string, string>;

        try {
          parsed = JSON.parse(responseText) as Record<string, string>;
        } catch {
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

        let sectionsInserted = 0;

        for (const key of SECTION_KEYS) {
          const content = parsed[key];
          if (!content || content.trim().length < 50) continue;

          const insertPayload: Record<string, unknown> = {
            project_id: null,
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
            const embedding = await generateEmbedding(content.trim());
            insertPayload.embedding = JSON.stringify(embedding);
          } catch {
            // Continue without embedding
          }

          const { error } = await supabase
            .from("report_sections")
            .insert(insertPayload);

          if (!error) sectionsInserted++;
        }

        results.push({
          file: pdfFile,
          sectionsExtracted: sectionsInserted,
        });
      } catch (err) {
        results.push({
          file: pdfFile,
          sectionsExtracted: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const totalSections = results.reduce(
      (sum, r) => sum + r.sectionsExtracted,
      0,
    );

    return NextResponse.json({
      message: `Processed ${results.length} PDFs, extracted ${totalSections} total sections`,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to backfill reports",
      },
      { status: 500 },
    );
  }
}
