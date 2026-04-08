import "server-only";

import { createClient } from "~/utils/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMention {
  type: "doc" | "comp";
  id: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface DocumentContext {
  id: string;
  fileName: string | null;
  documentType: string;
  extractedText: string | null;
  structuredData: Record<string, unknown> | null;
}

interface CompContext {
  id: string;
  address: string;
  type: string;
  number: string | null;
  rawData: Record<string, unknown> | null;
}

interface SubjectContext {
  core: Record<string, unknown> | null;
  taxes: unknown | null;
  parcels: unknown | null;
  improvements: unknown | null;
  fema: unknown | null;
  improvement_analysis: unknown | null;
}

// ---------------------------------------------------------------------------
// Load mentioned entities from Supabase
// ---------------------------------------------------------------------------

async function loadDocuments(ids: string[]): Promise<DocumentContext[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_documents")
    .select("id, file_name, document_type, extracted_text, structured_data")
    .in("id", ids);
  return (data ?? []).map((d) => ({
    id: d.id as string,
    fileName: d.file_name as string | null,
    documentType: d.document_type as string,
    extractedText: d.extracted_text as string | null,
    structuredData: d.structured_data as Record<string, unknown> | null,
  }));
}

async function loadComps(ids: string[]): Promise<CompContext[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const { data: comps } = await supabase
    .from("comparables")
    .select("id, address, address_for_display, type, number")
    .in("id", ids);

  const { data: parsed } = await supabase
    .from("comp_parsed_data")
    .select("comp_id, raw_data")
    .in("comp_id", ids);

  const parsedMap = new Map(
    (parsed ?? []).map((p) => [p.comp_id as string, p.raw_data]),
  );

  return (comps ?? []).map((c) => ({
    id: c.id as string,
    address: (c.address_for_display as string) || (c.address as string),
    type: c.type as string,
    number: c.number as string | null,
    rawData: (parsedMap.get(c.id as string) as Record<string, unknown>) ?? null,
  }));
}

async function loadSubjectContext(
  projectId: string,
): Promise<SubjectContext | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subject_data")
    .select("core, taxes, parcels, improvements, fema, improvement_analysis")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!data) return null;

  return {
    core: (data.core as Record<string, unknown>) ?? null,
    taxes: data.taxes ?? null,
    parcels: data.parcels ?? null,
    improvements: data.improvements ?? null,
    fema: data.fema ?? null,
    improvement_analysis: data.improvement_analysis ?? null,
  };
}

// ---------------------------------------------------------------------------
// Context serialization helpers
// ---------------------------------------------------------------------------

const MAX_CONTEXT_CHARS = 30_000;

function serializeSection(label: string, data: unknown): string {
  if (!data) return "";
  const json = JSON.stringify(data, null, 2);
  return `### ${label}\n${json}`;
}

function formatSubjectBlock(subject: SubjectContext): string {
  const parts: string[] = ["## Current Project - Subject Property"];

  // Core is always present — serialize all fields as a key-value block
  if (subject.core && Object.keys(subject.core).length > 0) {
    const coreLines = Object.entries(subject.core)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `  ${k}: ${String(v)}`);
    parts.push("### Core Data\n" + coreLines.join("\n"));
  }

  // Build remaining sections
  const optionalSections: string[] = [];
  if (subject.taxes) {
    optionalSections.push(serializeSection("Tax Data", subject.taxes));
  }
  if (subject.fema) {
    optionalSections.push(serializeSection("FEMA Flood Data", subject.fema));
  }
  if (subject.parcels) {
    optionalSections.push(serializeSection("Parcels", subject.parcels));
  }
  if (subject.improvements) {
    optionalSections.push(serializeSection("Improvements", subject.improvements));
  }
  if (subject.improvement_analysis) {
    optionalSections.push(
      serializeSection("Improvement Analysis", subject.improvement_analysis),
    );
  }

  // Add optional sections, respecting the total context budget
  let block = parts.join("\n");
  for (const section of optionalSections) {
    if (block.length + section.length < MAX_CONTEXT_CHARS) {
      block += "\n" + section;
    } else {
      block +=
        "\n[Note: Additional subject data sections omitted due to context size limits. Use query_subject_data tool to retrieve them.]";
      break;
    }
  }

  return block;
}

// ---------------------------------------------------------------------------
// Format mentioned entities
// ---------------------------------------------------------------------------

function formatDocumentBlock(doc: DocumentContext): string {
  const label = doc.fileName ?? doc.documentType;
  const lines = [`--- DOCUMENT: ${label} ---`, `Type: ${doc.documentType}`];
  if (doc.extractedText) {
    lines.push(`Extracted Text:\n${doc.extractedText}`);
  }
  if (doc.structuredData && Object.keys(doc.structuredData).length > 0) {
    lines.push(`Structured Data:\n${JSON.stringify(doc.structuredData, null, 2)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function formatCompBlock(comp: CompContext): string {
  const label = comp.number
    ? `${comp.address} (${comp.type} #${comp.number})`
    : `${comp.address} (${comp.type})`;
  const lines = [`--- COMP: ${label} ---`, `Type: ${comp.type}`];
  if (comp.rawData && Object.keys(comp.rawData).length > 0) {
    lines.push(`Parsed Data:\n${JSON.stringify(comp.rawData, null, 2)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Build the Gemini prompt from chat context
// ---------------------------------------------------------------------------

export async function buildChatPrompt(
  projectId: string,
  userMessage: string,
  mentions: ChatMention[],
  history: ChatMessage[],
): Promise<{ systemPrompt: string; contents: ChatMessage[] }> {
  const docIds = mentions.filter((m) => m.type === "doc").map((m) => m.id);
  const compIds = mentions.filter((m) => m.type === "comp").map((m) => m.id);

  const [docs, comps, subject] = await Promise.all([
    loadDocuments(docIds),
    loadComps(compIds),
    loadSubjectContext(projectId),
  ]);

  const systemParts: string[] = [
    "You are an expert commercial real estate appraisal research assistant.",
    "Answer questions accurately and concisely using the provided context.",
    "When performing calculations or analysis, show your work.",
    "Format responses with markdown when helpful (tables, lists, bold for key values).",
    "",
    "## Critical Rules",
    "- NEVER fabricate, estimate, or guess data values. If a value isn't in the context provided, use a query tool to look it up.",
    "- If the user asks for a specific field value and you cannot find it with certainty in the context, call query_subject_data or query_comp_data before answering.",
    "- If you cannot find data even after querying, say so explicitly — do not invent numbers.",
    "",
    "## Available Tools",
    "You have tools to both READ and UPDATE project data:",
    "",
    "**Read tools (use these to look up data before answering questions):**",
    "- query_subject_data: Retrieve a specific section of subject_data (core, taxes, parcels, improvements, fema, improvement_analysis). Use when you need to verify or look up subject property data.",
    "- list_project_comps: List all comparables for this project (id, address, type, number). Use before querying a specific comp.",
    "- query_comp_data: Retrieve the full parsed data for a comparable by comp_id or address substring. Use when asked about a specific comp's data.",
    "",
    "**Write tools (use ONLY when the user explicitly asks to save/update/set a value):**",
    "- update_subject_field: Update a field on the subject property (section 'core' for most fields, 'fema' for flood data).",
    "- update_comp_field: Update a field on a comparable's parsed data. You must use the comp's UUID as comp_id.",
    "- update_parcel_field: Update parcel-level data by APN (e.g. County Appraised Value, Total Tax Amount).",
    "",
    "IMPORTANT: Only call write tools when the user explicitly asks to save/update/set a value.",
    "Do NOT call write tools when the user is just asking a question.",
    "After a successful update, confirm what was changed in your response.",
  ];

  if (subject) {
    systemParts.push("", formatSubjectBlock(subject));
  }

  if (docs.length > 0) {
    systemParts.push(
      "\n## Referenced Documents\n" + docs.map(formatDocumentBlock).join("\n\n"),
    );
  }

  if (comps.length > 0) {
    systemParts.push(
      "\n## Referenced Comparables\n" + comps.map(formatCompBlock).join("\n\n"),
    );
  }

  return {
    systemPrompt: systemParts.join("\n"),
    contents: [...history, { role: "user", content: userMessage }],
  };
}
