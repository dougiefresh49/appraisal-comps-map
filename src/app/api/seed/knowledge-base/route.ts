import { NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";
import { generateEmbedding } from "~/lib/embeddings";
import * as fs from "fs";
import * as path from "path";

interface KnowledgeBaseRow {
  gem_name: string;
  content_type: string;
  input: string | null;
  output: string;
}

function parseCSV(raw: string): KnowledgeBaseRow[] {
  const rows: KnowledgeBaseRow[] = [];
  const lines = raw.split("\n");
  let i = 1; // skip header

  while (i < lines.length) {
    const row = consumeRow(lines, i);
    if (!row) break;
    i = row.nextLine;

    if (row.fields.length >= 4) {
      const gemName = row.fields[0]!.trim();
      const contentType = row.fields[1]!.trim().toLowerCase().replace(/\s+/g, "_");
      const input = row.fields[2]?.trim() || null;
      const output = row.fields[3]!.trim();

      if (gemName && contentType && output) {
        rows.push({ gem_name: gemName, content_type: contentType, input, output });
      }
    }
  }

  return rows;
}

function consumeRow(
  lines: string[],
  startLine: number,
): { fields: string[]; nextLine: number } | null {
  if (startLine >= lines.length) return null;

  let combined = lines[startLine]!;
  let currentLine = startLine + 1;

  while (countQuotes(combined) % 2 !== 0 && currentLine < lines.length) {
    combined += "\n" + lines[currentLine]!;
    currentLine++;
  }

  return { fields: splitCSVLine(combined), nextLine: currentLine };
}

function countQuotes(s: string): number {
  let count = 0;
  for (const ch of s) {
    if (ch === '"') count++;
  }
  return count;
}

function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

export async function POST() {
  try {
    const csvPath = path.join(
      process.cwd(),
      "docs",
      "n8n-gemini-prompts",
      "AI Appraiser Knowledge Base - Sheet1.csv",
    );

    if (!fs.existsSync(csvPath)) {
      return NextResponse.json(
        { error: "CSV file not found at " + csvPath },
        { status: 404 },
      );
    }

    const rawCSV = fs.readFileSync(csvPath, "utf-8");
    const rows = parseCSV(rawCSV);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows parsed from CSV" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { count } = await supabase
      .from("knowledge_base")
      .select("id", { count: "exact", head: true });

    if (count && count > 0) {
      return NextResponse.json({
        message: `Knowledge base already has ${count} rows. Skipping import.`,
        rowCount: count,
      });
    }

    let imported = 0;
    const hasGeminiKey = !!process.env.GOOGLE_GEMINI_API_KEY;

    for (const row of rows) {
      const insertPayload: Record<string, unknown> = {
        gem_name: row.gem_name,
        content_type: row.content_type,
        input: row.input,
        output: row.output,
      };

      if (hasGeminiKey && row.output.trim()) {
        try {
          const embedding = await generateEmbedding(row.output);
          insertPayload.embedding = JSON.stringify(embedding);
        } catch {
          // Continue without embedding
        }
      }

      const { error } = await supabase
        .from("knowledge_base")
        .insert(insertPayload);

      if (error) {
        console.error(`Failed to insert row: ${row.gem_name} / ${row.content_type}`, error);
      } else {
        imported++;
      }
    }

    return NextResponse.json({
      message: `Imported ${imported} of ${rows.length} rows`,
      imported,
      total: rows.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to import knowledge base",
      },
      { status: 500 },
    );
  }
}
