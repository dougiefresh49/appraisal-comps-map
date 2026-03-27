import { createClient } from "~/utils/supabase/server";
import { generateEmbedding } from "~/lib/embeddings";

type SectionKey =
  | "neighborhood"
  | "zoning"
  | "subject-site-summary"
  | "highest-best-use"
  | "ownership";

interface PromptContext {
  systemPrompt: string;
  examples: string[];
  extraKnowledge: string[];
  sectionPrompt: string;
  similarPastSections: string[];
  regenerationContext?: string;
  previousContent?: string;
}

const SECTION_DOCUMENT_MAP: Record<SectionKey, string[]> = {
  ownership: ["deed"],
  zoning: ["zoning_map"],
  neighborhood: ["neighborhood_map"],
  "subject-site-summary": ["flood_map", "deed"],
  "highest-best-use": [],
};

/**
 * Build the full prompt for a given report section by querying Supabase
 * for knowledge base, project data, documents, photos, and similar past sections.
 */
export async function buildReportPrompt(
  sectionKey: SectionKey,
  projectId: string,
  options?: {
    regenerationContext?: string;
    previousContent?: string;
  },
): Promise<string> {
  const supabase = await createClient();

  const context = await gatherContext(supabase, sectionKey, projectId);

  if (options?.previousContent) {
    context.previousContent = options.previousContent;
  }
  if (options?.regenerationContext) {
    context.regenerationContext = options.regenerationContext;
  }

  return assemblePrompt(context);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

async function gatherContext(
  supabase: SupabaseClient,
  sectionKey: SectionKey,
  projectId: string,
): Promise<PromptContext> {
  const [knowledgeBase, projectData, documents, photoAnalyses, relatedSections, similarPast] =
    await Promise.all([
      fetchKnowledgeForSection(supabase, sectionKey),
      fetchProjectData(supabase, projectId),
      fetchRelevantDocuments(supabase, projectId, sectionKey),
      fetchPhotoContext(supabase, projectId),
      fetchRelatedSections(supabase, projectId, sectionKey),
      fetchSimilarPastSections(sectionKey, projectId),
    ]);

  const sectionPrompt = buildSectionPrompt(
    sectionKey,
    projectData,
    documents,
    photoAnalyses,
    relatedSections,
  );

  return {
    systemPrompt: knowledgeBase.systemPrompt,
    examples: knowledgeBase.examples,
    extraKnowledge: knowledgeBase.knowledge,
    sectionPrompt,
    similarPastSections: similarPast,
  };
}

async function fetchKnowledgeForSection(
  supabase: SupabaseClient,
  sectionKey: SectionKey,
): Promise<{
  systemPrompt: string;
  examples: string[];
  knowledge: string[];
}> {
  const gemNameMap: Record<SectionKey, string> = {
    neighborhood: "Neighborhood",
    zoning: "Zoning",
    ownership: "Ownership",
    "subject-site-summary": "Subject Site Summary",
    "highest-best-use": "Highest and Best Use",
  };

  const gemName = gemNameMap[sectionKey];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("content_type, input, output")
    .eq("gem_name", gemName);

  if (error || !data) {
    return { systemPrompt: "", examples: [], knowledge: [] };
  }

  const rows = data as {
    content_type: string;
    input: string | null;
    output: string;
  }[];

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

async function fetchProjectData(
  supabase: SupabaseClient,
  projectId: string,
): Promise<Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  return (data as Record<string, unknown>) ?? {};
}

async function fetchRelevantDocuments(
  supabase: SupabaseClient,
  projectId: string,
  sectionKey: SectionKey,
): Promise<{ type: string; text: string; structured: Record<string, unknown> }[]> {
  const docTypes = SECTION_DOCUMENT_MAP[sectionKey];

  if (!docTypes || docTypes.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const { data } = await supabase
    .from("project_documents")
    .select("document_type, extracted_text, structured_data")
    .eq("project_id", projectId)
    .in("document_type", docTypes)
    .not("extracted_text", "is", null);

  if (!data) return [];

  return (
    data as {
      document_type: string;
      extracted_text: string | null;
      structured_data: Record<string, unknown>;
    }[]
  ).map((d) => ({
    type: d.document_type,
    text: d.extracted_text ?? "",
    structured: d.structured_data ?? {},
  }));
}

async function fetchPhotoContext(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const { data } = await supabase
    .from("photo_analyses")
    .select("label, description, improvements_observed")
    .eq("project_id", projectId)
    .eq("is_included", true)
    .order("sort_order");

  if (!data || data.length === 0) return "";

  const photos = data as {
    label: string;
    description: string | null;
    improvements_observed: Record<string, string>;
  }[];

  const improvementsMap = new Map<string, string>();
  for (const photo of photos) {
    if (photo.improvements_observed) {
      for (const [key, value] of Object.entries(photo.improvements_observed)) {
        if (value && !improvementsMap.has(key)) {
          improvementsMap.set(key, value);
        }
      }
    }
  }

  if (improvementsMap.size === 0) return "";

  let text = "## Subject Improvements (from photo analysis)\n\n";
  for (const [key, value] of improvementsMap.entries()) {
    text += `- **${key}**: ${value}\n`;
  }

  return text;
}

async function fetchRelatedSections(
  supabase: SupabaseClient,
  projectId: string,
  sectionKey: SectionKey,
): Promise<Record<string, string>> {
  if (sectionKey !== "highest-best-use") return {};

  const prerequisiteSections = ["zoning", "ownership", "subject-site-summary"];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const { data } = await supabase
    .from("report_sections")
    .select("section_key, content")
    .eq("project_id", projectId)
    .in("section_key", prerequisiteSections);

  if (!data) return {};

  const sections: Record<string, string> = {};
  for (const row of data as { section_key: string; content: string }[]) {
    sections[row.section_key] = row.content;
  }
  return sections;
}

async function fetchSimilarPastSections(
  sectionKey: SectionKey,
  _projectId: string,
): Promise<string[]> {
  if (!process.env.GOOGLE_GEMINI_API_KEY) return [];

  try {
    const queryText = `Commercial appraisal ${sectionKey.replace(/-/g, " ")} section`;
    const embedding = await generateEmbedding(queryText);

    const serverSupabase = await createClient();

    const { data } = await serverSupabase.rpc("search_similar_report_sections", {
      query_embedding: JSON.stringify(embedding),
      match_section_key: sectionKey,
      match_limit: 3,
      similarity_threshold: 0.5,
    });

    if (!data) return [];

    return (data as { content: string; subject_address: string | null }[])
      .filter((r) => r.content.trim().length > 100)
      .map(
        (r) =>
          `[Past example${r.subject_address ? ` — ${r.subject_address}` : ""}]\n${r.content.substring(0, 2000)}`,
      );
  } catch {
    return [];
  }
}

function buildSectionPrompt(
  sectionKey: SectionKey,
  projectData: Record<string, unknown>,
  documents: { type: string; text: string; structured: Record<string, unknown> }[],
  photoContext: string,
  relatedSections: Record<string, string>,
): string {
  const subject = (projectData.subject ?? {}) as Record<string, unknown>;
  const rawData = (subject.rawData ?? subject) as Record<string, unknown>;
  const address =
    (rawData.AddressLocal as string) ??
    (rawData.address as string) ??
    (subject.address as string) ??
    "";

  let prompt = `## Subject Property\n\nAddress: ${address}\n\n`;

  switch (sectionKey) {
    case "ownership": {
      const legalDesc = (rawData.legalDescription as string) ?? "";
      const instrumentNumber = (rawData.instrumentNumber as string) ?? "";
      prompt += `Legal Description: ${legalDesc}\n`;
      prompt += `Deed Record: ${instrumentNumber}\n\n`;

      const deedDoc = documents.find((d) => d.type === "deed");
      if (deedDoc) {
        prompt += `## Deed Record Context\n\n${deedDoc.text}\n\n`;
        if (Object.keys(deedDoc.structured).length > 0) {
          prompt += `### Structured Data\n\n${JSON.stringify(deedDoc.structured, null, 2)}\n\n`;
        }
      }
      break;
    }

    case "zoning": {
      const zoning = (rawData.Zoning as string) ?? "";
      prompt += `Zoning: ${zoning}\n\n`;
      const zoningDoc = documents.find((d) => d.type === "zoning_map");
      if (zoningDoc) {
        prompt += `## Zoning Map Context\n\n${zoningDoc.text}\n\n`;
      }
      break;
    }

    case "neighborhood": {
      const neighborhoodDoc = documents.find(
        (d) => d.type === "neighborhood_map",
      );
      if (neighborhoodDoc) {
        prompt += `## Neighborhood Map Context\n\n${neighborhoodDoc.text}\n\n`;
      }
      const bounds = (rawData.neighborhoodBounds as string) ?? "";
      if (bounds) {
        prompt += `Neighborhood Boundaries:\n${bounds}\n\n`;
      }
      break;
    }

    case "subject-site-summary": {
      prompt += `## Subject Data\n\n\`\`\`json\n${JSON.stringify(rawData, null, 2)}\n\`\`\`\n\n`;

      const floodDoc = documents.find((d) => d.type === "flood_map");
      if (floodDoc) {
        prompt += `## FEMA Flood Map Info\n\n${floodDoc.text}\n\n`;
        if (Object.keys(floodDoc.structured).length > 0) {
          prompt += `${JSON.stringify(floodDoc.structured, null, 2)}\n\n`;
        }
      }

      const deedDoc = documents.find((d) => d.type === "deed");
      if (deedDoc) {
        prompt += `## Deed Context\n\n${deedDoc.text}\n\n`;
      }

      if (photoContext) {
        prompt += `${photoContext}\n\n`;
      }
      break;
    }

    case "highest-best-use": {
      prompt += `## Subject Data\n\n\`\`\`json\n${JSON.stringify(rawData, null, 2)}\n\`\`\`\n\n`;

      if (photoContext) {
        prompt += `${photoContext}\n\n`;
      }

      if (relatedSections.zoning) {
        prompt += `## Previously Generated: Zoning\n\n${relatedSections.zoning}\n\n`;
      }
      if (relatedSections.ownership) {
        prompt += `## Previously Generated: Ownership\n\n${relatedSections.ownership}\n\n`;
      }
      if (relatedSections["subject-site-summary"]) {
        prompt += `## Previously Generated: Subject Site Summary\n\n${relatedSections["subject-site-summary"]}\n\n`;
      }
      break;
    }
  }

  return prompt;
}

function assemblePrompt(context: PromptContext): string {
  const parts: string[] = [];

  if (context.systemPrompt) {
    parts.push(`# System Instructions\n\n${context.systemPrompt}`);
  }

  if (context.extraKnowledge.length > 0) {
    parts.push(
      `# Additional Knowledge\n\n${context.extraKnowledge.join("\n\n---\n\n")}`,
    );
  }

  if (context.examples.length > 0) {
    parts.push(
      `# Examples\n\n${context.examples.map((e, i) => `### Example ${i + 1}\n\n${e}`).join("\n\n---\n\n")}`,
    );
  }

  if (context.similarPastSections.length > 0) {
    parts.push(
      `# Similar Past Report Sections (for reference)\n\n${context.similarPastSections.join("\n\n---\n\n")}`,
    );
  }

  parts.push(`# Current Task\n\n${context.sectionPrompt}`);

  if (context.previousContent) {
    parts.push(
      `# Previous Content (to revise)\n\n${context.previousContent}`,
    );
  }

  if (context.regenerationContext) {
    parts.push(
      `# Revision Instructions\n\n${context.regenerationContext}`,
    );
  }

  return parts.join("\n\n---\n\n");
}
