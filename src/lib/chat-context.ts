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
  address?: string;
  propertyType?: string;
  city?: string;
  county?: string;
  state?: string;
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
    .select("core")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!data?.core) return null;
  const core = data.core as Record<string, unknown>;
  return {
    address: core.Address as string | undefined,
    propertyType: core["Property Type"] as string | undefined,
    city: core.City as string | undefined,
    county: core.County as string | undefined,
    state: core.State as string | undefined,
  };
}

// ---------------------------------------------------------------------------
// Build the Gemini prompt from chat context
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
    "## Data Update Tools",
    "You have tools to update project data when the user asks you to save, set, or update values:",
    "- update_subject_field: Update fields on the subject property (section 'core' for most fields, 'fema' for flood data).",
    "- update_comp_field: Update fields on a comparable's parsed data. You must use the comp's UUID as comp_id.",
    "- update_parcel_field: Update parcel-level data by APN (e.g. County Appraised Value, Total Tax Amount).",
    "",
    "IMPORTANT: Only call these tools when the user explicitly asks to save/update/set a value.",
    "Do NOT call tools when the user is just asking a question.",
    "After a successful update, confirm what was changed in your response.",
  ];

  if (subject) {
    const subjectLines = ["", "## Current Project - Subject Property"];
    if (subject.address) subjectLines.push(`Address: ${subject.address}`);
    if (subject.propertyType) subjectLines.push(`Property Type: ${subject.propertyType}`);
    if (subject.city) subjectLines.push(`City: ${subject.city}`);
    if (subject.county) subjectLines.push(`County: ${subject.county}`);
    if (subject.state) subjectLines.push(`State: ${subject.state}`);
    systemParts.push(subjectLines.join("\n"));
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
