import "server-only";

import type { PostgrestResponse } from "@supabase/supabase-js";
import { generateEmbedding } from "~/lib/embeddings";
import { createClient } from "~/utils/supabase/server";

export type SectionKey =
  | "neighborhood"
  | "zoning"
  | "subject-site-summary"
  | "highest-best-use"
  | "ownership"
  | "discussion-of-land-sales"
  | "discussion-of-improved-sales";

const GEM_NAME_BY_SECTION: Record<SectionKey, string> = {
  neighborhood: "Neighborhood",
  zoning: "Zoning",
  ownership: "Ownership",
  "subject-site-summary": "Subject Site Summary",
  "highest-best-use": "Highest and Best Use",
  "discussion-of-land-sales": "Discussion of Land Sales",
  "discussion-of-improved-sales": "Discussion of Improved Sales",
};

const ADJUSTMENT_PATTERN_GEM_NAMES = [
  "Land Adjustment Patterns",
  "Sales Adjustment Patterns",
  "Rental Adjustment Patterns",
  "Cost Approach Patterns",
  "Reconciliation Patterns",
] as const;

const DEFAULT_PAST_SECTION_LIMIT = 3;
const DEFAULT_PAST_SECTION_SIMILARITY = 0.5;
const DEFAULT_VECTOR_LIMIT = 5;
const DEFAULT_DOC_KNOWLEDGE_SIMILARITY = 0.3;

export interface SectionKnowledge {
  systemPrompt: string;
  examples: string[];
  knowledge: string[];
}

export interface PastSectionMatch {
  content: string;
  subjectAddress: string | null;
  propertyType: string | null;
  similarity: number;
}

export interface DocumentMatch {
  documentType: string;
  documentLabel: string | null;
  extractedText: string | null;
  similarity: number;
}

export interface KnowledgeMatch {
  gemName: string;
  contentType: string;
  output: string;
  similarity: number;
}

export interface AggregatedKnowledge {
  sectionKnowledge: SectionKnowledge;
  similarPastSections: PastSectionMatch[];
  similarKnowledge: KnowledgeMatch[];
  adjustmentPatterns: string[];
}

async function buildGroundedSectionQueryText(
  sectionKey: SectionKey,
  projectId: string,
): Promise<string> {
  const supabase = await createClient();
  const { data: subjectRow, error } = await supabase
    .from("subject_data")
    .select("core")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    console.error(
      "[knowledge-retrieval] subject_data lookup failed:",
      error.message,
    );
  }

  const core = (subjectRow?.core ?? {}) as Record<string, unknown>;
  const address = (core.Address as string) ?? "";
  const propertyType = (core["Property Type"] as string) ?? "";
  const city = (core.City as string) ?? "";
  const county = (core.County as string) ?? "";

  const queryParts = [
    `${sectionKey.replace(/-/g, " ")} section`,
    propertyType && `for ${propertyType} property`,
    city && `in ${city}`,
    county && `${county} County`,
    address && `near ${address}`,
  ].filter(Boolean);

  return queryParts.join(" ");
}

export async function getKnowledgeForSection(
  sectionKey: SectionKey,
): Promise<SectionKnowledge> {
  const supabase = await createClient();
  const gemName = GEM_NAME_BY_SECTION[sectionKey];

  const result = (await supabase
    .from("knowledge_base")
    .select("content_type, input, output")
    .eq("gem_name", gemName)) as PostgrestResponse<{
    content_type: string;
    input: string | null;
    output: string;
  }>;

  if (result.error) {
    console.error(
      "[knowledge-retrieval] getKnowledgeForSection:",
      result.error.message,
    );
    return { systemPrompt: "", examples: [], knowledge: [] };
  }

  if (!result.data) {
    return { systemPrompt: "", examples: [], knowledge: [] };
  }

  const rows = result.data;

  const systemPrompt =
    rows
      .filter((r) => r.content_type === "system_prompt")
      .map((r) => r.output)
      .join("\n\n") || "";

  const examples = rows
    .filter((r) => r.content_type === "example")
    .map((r) => {
      if (r.input) {
        return `**Input:**\n${r.input}\n\n**Output:**\n${r.output}`;
      }
      return r.output;
    });

  const knowledge = rows
    .filter((r) => r.content_type === "knowledge")
    .map((r) => r.output);

  return { systemPrompt, examples, knowledge };
}

export async function getSimilarPastSections(
  sectionKey: SectionKey,
  projectId: string,
  limit = DEFAULT_PAST_SECTION_LIMIT,
): Promise<PastSectionMatch[]> {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    return [];
  }

  try {
    const queryText = await buildGroundedSectionQueryText(
      sectionKey,
      projectId,
    );
    const embedding = await generateEmbedding(queryText);

    const supabase = await createClient();
    const rpcResult = (await supabase.rpc("search_similar_report_sections", {
      query_embedding: JSON.stringify(embedding),
      match_section_key: sectionKey,
      match_limit: limit,
      similarity_threshold: DEFAULT_PAST_SECTION_SIMILARITY,
    })) as PostgrestResponse<{
      content: string;
      subject_address: string | null;
      property_type: string | null;
      similarity: number;
    }>;

    if (rpcResult.error) {
      console.error(
        "[knowledge-retrieval] getSimilarPastSections RPC:",
        rpcResult.error.message,
      );
      return [];
    }

    return (rpcResult.data ?? []).map((r) => ({
      content: r.content,
      subjectAddress: r.subject_address,
      propertyType: r.property_type,
      similarity: r.similarity,
    }));
  } catch (err) {
    console.error(
      "[knowledge-retrieval] getSimilarPastSections:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function getSimilarDocuments(
  queryText: string,
  documentType?: string,
  limit = DEFAULT_VECTOR_LIMIT,
): Promise<DocumentMatch[]> {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    return [];
  }

  try {
    const embedding = await generateEmbedding(queryText);
    const supabase = await createClient();
    const rpcResult = (await supabase.rpc("search_similar_documents", {
      query_embedding: JSON.stringify(embedding),
      match_document_type: documentType ?? null,
      match_limit: limit,
      similarity_threshold: DEFAULT_DOC_KNOWLEDGE_SIMILARITY,
    })) as PostgrestResponse<{
      document_type: string;
      document_label: string | null;
      extracted_text: string | null;
      similarity: number;
    }>;

    if (rpcResult.error) {
      console.error(
        "[knowledge-retrieval] getSimilarDocuments RPC:",
        rpcResult.error.message,
      );
      return [];
    }

    return (rpcResult.data ?? []).map((r) => ({
      documentType: r.document_type,
      documentLabel: r.document_label,
      extractedText: r.extracted_text,
      similarity: r.similarity,
    }));
  } catch (err) {
    console.error(
      "[knowledge-retrieval] getSimilarDocuments:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function getSimilarKnowledge(
  queryText: string,
  gemName?: string,
  contentType?: string,
  limit = DEFAULT_VECTOR_LIMIT,
): Promise<KnowledgeMatch[]> {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    return [];
  }

  try {
    const embedding = await generateEmbedding(queryText);
    const supabase = await createClient();
    const rpcResult = (await supabase.rpc("search_similar_knowledge", {
      query_embedding: JSON.stringify(embedding),
      match_gem_name: gemName ?? null,
      match_content_type: contentType ?? null,
      match_limit: limit,
      similarity_threshold: DEFAULT_DOC_KNOWLEDGE_SIMILARITY,
    })) as PostgrestResponse<{
      gem_name: string;
      content_type: string;
      output: string;
      similarity: number;
    }>;

    if (rpcResult.error) {
      console.error(
        "[knowledge-retrieval] getSimilarKnowledge RPC:",
        rpcResult.error.message,
      );
      return [];
    }

    return (rpcResult.data ?? []).map((r) => ({
      gemName: r.gem_name,
      contentType: r.content_type,
      output: r.output,
      similarity: r.similarity,
    }));
  } catch (err) {
    console.error(
      "[knowledge-retrieval] getSimilarKnowledge:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function getAdjustmentPatterns(): Promise<string[]> {
  const supabase = await createClient();
  const result = (await supabase
    .from("knowledge_base")
    .select("output")
    .eq("content_type", "knowledge")
    .in("gem_name", [...ADJUSTMENT_PATTERN_GEM_NAMES])) as PostgrestResponse<{
    output: string;
  }>;

  if (result.error) {
    console.error(
      "[knowledge-retrieval] getAdjustmentPatterns:",
      result.error.message,
    );
    return [];
  }

  const rows = result.data ?? [];
  return rows.map((row) => row.output).filter((o) => o.trim().length > 0);
}

export async function getAllKnowledgeForSection(
  sectionKey: SectionKey,
  projectId: string,
): Promise<AggregatedKnowledge> {
  const gemName = GEM_NAME_BY_SECTION[sectionKey];

  const similarKnowledgePromise = buildGroundedSectionQueryText(
    sectionKey,
    projectId,
  ).then((queryText) =>
    getSimilarKnowledge(queryText, gemName, undefined, DEFAULT_VECTOR_LIMIT),
  );

  const [sectionKnowledge, similarPastSections, adjustmentPatterns, similarKnowledge] =
    await Promise.all([
      getKnowledgeForSection(sectionKey),
      getSimilarPastSections(sectionKey, projectId),
      getAdjustmentPatterns(),
      similarKnowledgePromise,
    ]);

  return {
    sectionKnowledge,
    similarPastSections,
    similarKnowledge,
    adjustmentPatterns,
  };
}
