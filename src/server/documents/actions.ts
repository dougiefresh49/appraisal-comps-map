import "server-only";

import type { PostgrestResponse, SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "~/utils/supabase/server";
import { extractDocumentContent } from "~/lib/gemini";
import { generateEmbedding } from "~/lib/embeddings";
import { getExtractionPrompt } from "~/lib/document-prompts";
import { downloadDriveFile } from "~/lib/drive-download";
import { mergeDocumentIntoSubjectData } from "~/server/subject-data/merge";

export interface AddDocumentInput {
  projectId: string;
  documentType: string;
  documentLabel?: string;
  sectionTag?: string;
  fileId?: string;
  fileName?: string;
  mimeType?: string;
  fileBuffer?: Buffer;
}

export interface DocumentActionResult {
  ok: boolean;
  documentId?: string;
  error?: string;
}

export async function addDocument(
  input: AddDocumentInput,
): Promise<DocumentActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_documents")
    .insert({
      project_id: input.projectId,
      document_type: input.documentType,
      document_label: input.documentLabel ?? null,
      section_tag: input.sectionTag ?? null,
      file_id: input.fileId ?? null,
      file_name: input.fileName ?? null,
      mime_type: input.mimeType ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  const documentId = (data as { id: string }).id;

  if (input.fileBuffer || input.fileId) {
    const serviceClient = createServiceClient();
    void processDocument(
      serviceClient,
      documentId,
      input.projectId,
      input.documentType,
      input.fileBuffer,
      input.fileId,
      input.mimeType ?? "application/octet-stream",
    );
  }

  return { ok: true, documentId };
}

async function processDocument(
  supabase: SupabaseClient,
  documentId: string,
  projectId: string,
  documentType: string,
  fileBuffer?: Buffer,
  fileId?: string,
  mimeType?: string,
): Promise<void> {
  try {
    let buffer: Buffer;
    let resolvedMimeType: string;

    if (fileBuffer) {
      buffer = fileBuffer;
      resolvedMimeType = mimeType ?? "application/octet-stream";
    } else if (fileId) {
      const downloaded = await downloadDriveFile(fileId);
      buffer = downloaded.buffer;
      resolvedMimeType = downloaded.mimeType;
    } else {
      return;
    }

    const prompt = getExtractionPrompt(documentType);
    const { extractedText, structuredData } = await extractDocumentContent(
      buffer,
      resolvedMimeType,
      prompt,
    );

    let embeddingJson: string | null = null;
    if (extractedText.trim() && process.env.GOOGLE_GEMINI_API_KEY) {
      try {
        const embedding = await generateEmbedding(extractedText);
        embeddingJson = JSON.stringify(embedding);
      } catch {
        // Non-fatal — continue without embedding
      }
    }

    const updatePayload: Record<string, unknown> = {
      extracted_text: extractedText,
      structured_data: structuredData,
      processed_at: new Date().toISOString(),
    };

    if (embeddingJson) {
      updatePayload.embedding = embeddingJson;
    }

    const { error } = await supabase
      .from("project_documents")
      .update(updatePayload)
      .eq("id", documentId);

    if (error) {
      console.error("Failed to save document processing result", error);
    }

    if (structuredData && typeof structuredData === "object") {
      try {
        await mergeDocumentIntoSubjectData(
          projectId,
          documentType,
          structuredData,
          supabase,
        );
      } catch (mergeErr) {
        console.error("Failed to merge document data into subject_data", mergeErr);
      }
    }

    if (documentType === "deed") {
      void autoGenerateOwnership(projectId);
    }
  } catch (err) {
    console.error("Document processing failed", err);

    try {
      await supabase
        .from("project_documents")
        .update({
          structured_data: {
            processing_error:
              err instanceof Error ? err.message : "Unknown error",
          },
        })
        .eq("id", documentId);
    } catch {
      // Best effort error recording
    }
  }
}

export async function reprocessDocument(
  documentId: string,
): Promise<DocumentActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_documents")
    .select("project_id, document_type, file_id, mime_type")
    .eq("id", documentId)
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Document not found" };
  }

  const row = data as {
    project_id: string;
    document_type: string;
    file_id: string | null;
    mime_type: string | null;
  };

  if (!row.file_id) {
    return {
      ok: false,
      error: "No file ID associated with this document — re-upload to reprocess",
    };
  }

  await supabase
    .from("project_documents")
    .update({ processed_at: null, extracted_text: null, structured_data: {} })
    .eq("id", documentId);

  const serviceClient = createServiceClient();
  void processDocument(
    serviceClient,
    documentId,
    row.project_id,
    row.document_type,
    undefined,
    row.file_id,
    row.mime_type ?? "application/octet-stream",
  );

  return { ok: true, documentId };
}

export async function listProjectDocuments(
  projectId: string,
): Promise<Record<string, unknown>[]> {
  const supabase = await createClient();

  const listResult = (await supabase
    .from("project_documents")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })) as PostgrestResponse<
    Record<string, unknown>
  >;

  if (listResult.error) throw listResult.error;
  return listResult.data ?? [];
}

/**
 * After a deed document is processed, auto-generate the ownership
 * analysis section if it doesn't already exist. Fire-and-forget.
 */
async function autoGenerateOwnership(projectId: string): Promise<void> {
  try {
    const { runReportAction } = await import("~/server/reports/actions");

    const existing = await runReportAction({
      projectId,
      action: "get",
      section: "ownership",
    });

    if (existing.ok && existing.content && existing.content.trim().length > 0) {
      return;
    }

    await runReportAction({
      projectId,
      action: "generate",
      section: "ownership",
    });
    console.log(`[autoGenerateOwnership] Generated ownership for project ${projectId}`);
  } catch (err) {
    console.error("[autoGenerateOwnership] Failed:", err);
  }
}
