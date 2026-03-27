import "server-only";

import { z } from "zod";
import { createClient } from "~/utils/supabase/server";
import { generateEmbedding } from "~/lib/embeddings";
import { buildReportPrompt } from "~/lib/prompt-builder";
import { generateReportSection } from "~/lib/gemini";

export const reportSectionSchema = z.enum([
  "neighborhood",
  "zoning",
  "subject-site-summary",
  "highest-best-use",
  "ownership",
]);

export const reportActionSchema = z.enum([
  "generate",
  "get",
  "update",
  "regenerate",
]);

export type ReportSection = z.infer<typeof reportSectionSchema>;
export type ReportAction = z.infer<typeof reportActionSchema>;

const ReportRequestSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  projectFolderId: z.string().optional(),
  action: reportActionSchema,
  section: reportSectionSchema,
  content: z.string().optional(),
  previousContent: z.string().optional(),
  regenerationContext: z.string().optional(),
});

export type ReportRequest = z.infer<typeof ReportRequestSchema>;

export interface ReportContentResult {
  ok: boolean;
  content: string | null;
  exists?: boolean | null;
  version?: number;
  status?: number;
  error?: string;
}

async function handleGet(
  projectId: string,
  section: string,
): Promise<ReportContentResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_sections")
    .select("content, version")
    .eq("project_id", projectId)
    .eq("section_key", section)
    .single();

  if (error && error.code !== "PGRST116") {
    return { ok: false, content: null, error: error.message, status: 500 };
  }

  const row = data as { content: string; version: number } | null;
  return {
    ok: true,
    content: row?.content ?? "",
    exists: row !== null && (row.content?.trim().length ?? 0) > 0,
    version: row?.version,
  };
}

async function saveSection(
  projectId: string,
  section: string,
  content: string,
  generationContext?: Record<string, unknown>,
): Promise<ReportContentResult> {
  const supabase = await createClient();

  let embedding: number[] | null = null;
  try {
    if (content.trim() && process.env.GOOGLE_GEMINI_API_KEY) {
      embedding = await generateEmbedding(content);
    }
  } catch {
    // Non-fatal
  }

  const { data: existing } = await supabase
    .from("report_sections")
    .select("id, content, version, generation_context")
    .eq("project_id", projectId)
    .eq("section_key", section)
    .single();

  const existingRow = existing as {
    id: string;
    content: string;
    version: number;
    generation_context: Record<string, unknown>;
  } | null;

  if (existingRow) {
    await supabase.from("report_section_history").insert({
      report_section_id: existingRow.id,
      content: existingRow.content,
      version: existingRow.version,
      generation_context: existingRow.generation_context ?? {},
    });

    const updatePayload: Record<string, unknown> = {
      content,
      version: existingRow.version + 1,
      generation_context: generationContext ?? {},
    };
    if (embedding) {
      updatePayload.embedding = JSON.stringify(embedding);
    }

    const { data, error } = await supabase
      .from("report_sections")
      .update(updatePayload)
      .eq("id", existingRow.id)
      .select("content, version")
      .single();

    if (error) {
      return { ok: false, content: null, error: error.message, status: 500 };
    }
    const updated = data as { content: string; version: number };
    return {
      ok: true,
      content: updated.content,
      exists: true,
      version: updated.version,
    };
  }

  const insertPayload: Record<string, unknown> = {
    project_id: projectId,
    section_key: section,
    content,
    version: 1,
    generation_context: generationContext ?? {},
  };
  if (embedding) {
    insertPayload.embedding = JSON.stringify(embedding);
  }

  const { data, error } = await supabase
    .from("report_sections")
    .insert(insertPayload)
    .select("content, version")
    .single();

  if (error) {
    return { ok: false, content: null, error: error.message, status: 500 };
  }
  const inserted = data as { content: string; version: number };
  return {
    ok: true,
    content: inserted.content,
    exists: true,
    version: inserted.version,
  };
}

async function handleGenerate(
  projectId: string,
  sectionKey: ReportSection,
  regenerationContext?: string,
  previousContent?: string,
): Promise<ReportContentResult> {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    return {
      ok: false,
      content: null,
      error: "GOOGLE_GEMINI_API_KEY is not configured",
      status: 500,
    };
  }

  const prompt = await buildReportPrompt(sectionKey, projectId, {
    regenerationContext,
    previousContent,
  });

  const generatedContent = await generateReportSection(prompt);

  if (!generatedContent.trim()) {
    return {
      ok: false,
      content: null,
      error: "Gemini returned empty content",
      status: 500,
    };
  }

  const result = await saveSection(projectId, sectionKey, generatedContent, {
    action: previousContent ? "regenerate" : "generate",
    regenerationContext: regenerationContext ?? null,
    promptLength: prompt.length,
    generatedAt: new Date().toISOString(),
  });

  return result;
}

export async function runReportAction(
  input: ReportRequest,
): Promise<ReportContentResult> {
  const parsed = ReportRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      content: null,
      error: parsed.error.message,
      status: 400,
    };
  }

  const { projectId, action, section } = parsed.data;

  try {
    switch (action) {
      case "get":
        return await handleGet(projectId, section);

      case "update":
        if (!parsed.data.content) {
          return {
            ok: false,
            content: null,
            error: "Content is required for update",
            status: 400,
          };
        }
        return await saveSection(projectId, section, parsed.data.content);

      case "generate":
        return await handleGenerate(projectId, section);

      case "regenerate":
        return await handleGenerate(
          projectId,
          section,
          parsed.data.regenerationContext,
          parsed.data.previousContent,
        );

      default:
        return { ok: false, content: null, error: "Unknown action", status: 400 };
    }
  } catch (error) {
    return {
      ok: false,
      content: null,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Failed to process report action",
    };
  }
}
