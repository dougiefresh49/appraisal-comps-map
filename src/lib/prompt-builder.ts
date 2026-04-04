import type { PostgrestResponse } from "@supabase/supabase-js";
import {
  getKnowledgeForSection,
  getSimilarPastSections,
  type SectionKey,
} from "~/lib/knowledge-retrieval";
import { createClient } from "~/utils/supabase/server";

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
    excludedDocIds?: string[];
    excludePhotoContext?: boolean;
  },
): Promise<string> {
  const supabase = await createClient();

  const context = await gatherContext(
    supabase,
    sectionKey,
    projectId,
    options?.excludedDocIds,
    options?.excludePhotoContext,
  );

  if (options?.previousContent) {
    context.previousContent = options.previousContent;
  }
  if (options?.regenerationContext) {
    context.regenerationContext = options.regenerationContext;
  }

  return assemblePrompt(context);
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

async function gatherContext(
  supabase: ServerSupabase,
  sectionKey: SectionKey,
  projectId: string,
  excludedDocIds?: string[],
  excludePhotoContext?: boolean,
): Promise<PromptContext> {
  const [knowledgeBase, projectData, documents, photoAnalyses, relatedSections, similarPast] =
    await Promise.all([
      getKnowledgeForSection(sectionKey),
      fetchProjectData(supabase, projectId),
      fetchRelevantDocuments(supabase, projectId, sectionKey, excludedDocIds),
      excludePhotoContext ? Promise.resolve("") : fetchPhotoContext(supabase, projectId),
      fetchRelatedSections(supabase, projectId, sectionKey),
      getSimilarPastSections(sectionKey, projectId),
    ]);

  const formattedSimilarPast = similarPast
    .filter((r) => r.content.trim().length > 100)
    .map(
      (r) =>
        `[Past example${r.subjectAddress ? ` — ${r.subjectAddress}` : ""}]\n${r.content.substring(0, 2000)}`,
    );

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
    similarPastSections: formattedSimilarPast,
  };
}

async function fetchProjectData(
  supabase: ServerSupabase,
  projectId: string,
): Promise<Record<string, unknown>> {
  const [projectResult, subjectResult] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("subject_data").select("core, fema").eq("project_id", projectId).maybeSingle(),
  ]);

  const projectRow = (projectResult.data ?? {}) as Record<string, unknown>;
  const subjectCore = (subjectResult.data?.core ?? {}) as Record<string, unknown>;
  const subjectFema = (subjectResult.data?.fema ?? {}) as Record<string, unknown>;
  projectRow.subject = subjectCore;
  projectRow.subjectFema = subjectFema;

  return projectRow;
}

async function fetchRelevantDocuments(
  supabase: ServerSupabase,
  projectId: string,
  sectionKey: SectionKey,
  excludedDocIds?: string[],
): Promise<{ type: string; text: string; structured: Record<string, unknown> }[]> {
  const docTypes = SECTION_DOCUMENT_MAP[sectionKey];

  if (!docTypes || docTypes.length === 0) return [];

  const result = (await supabase
    .from("project_documents")
    .select("id, document_type, extracted_text, structured_data")
    .eq("project_id", projectId)
    .in("document_type", docTypes)
    .not("extracted_text", "is", null)) as PostgrestResponse<{
    id: string;
    document_type: string;
    extracted_text: string | null;
    structured_data: Record<string, unknown>;
  }>;

  if (!result.data) return [];

  const excludedSet = new Set(excludedDocIds ?? []);

  return result.data
    .filter((d) => !excludedSet.has(d.id))
    .map((d) => ({
      type: d.document_type,
      text: d.extracted_text ?? "",
      structured: d.structured_data ?? {},
    }));
}

async function fetchPhotoContext(
  supabase: ServerSupabase,
  projectId: string,
): Promise<string> {
  const result = (await supabase
    .from("photo_analyses")
    .select("label, description, improvements_observed")
    .eq("project_id", projectId)
    .eq("is_included", true)
    .order("sort_order")) as PostgrestResponse<{
    label: string;
    description: string | null;
    improvements_observed: Record<string, string>;
  }>;

  if (!result.data || result.data.length === 0) return "";

  const photos = result.data;

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
  supabase: ServerSupabase,
  projectId: string,
  sectionKey: SectionKey,
): Promise<Record<string, string>> {
  if (sectionKey !== "highest-best-use") return {};

  const prerequisiteSections = ["zoning", "ownership", "subject-site-summary"];

  const result = (await supabase
    .from("report_sections")
    .select("section_key, content")
    .eq("project_id", projectId)
    .in("section_key", prerequisiteSections)) as PostgrestResponse<{
    section_key: string;
    content: string;
  }>;

  if (!result.data) return {};

  const sections: Record<string, string> = {};
  for (const row of result.data) {
    sections[row.section_key] = row.content;
  }
  return sections;
}

const NEIGHBORHOOD_BOUNDARY_SIDES = [
  { key: "north", label: "North" },
  { key: "south", label: "South" },
  { key: "east", label: "East" },
  { key: "west", label: "West" },
] as const;

/** Reads `subject_data.core.neighborhoodBoundaries` (subject is core in projectData). */
function formatNeighborhoodBoundariesForPrompt(
  core: Record<string, unknown>,
): string {
  const raw = core.neighborhoodBoundaries;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const parts: string[] = [];
    for (const { key, label } of NEIGHBORHOOD_BOUNDARY_SIDES) {
      const val = o[key];
      if (typeof val === "string" && val.trim().length > 0) {
        parts.push(`${label}: ${val.trim()}`);
      }
    }
    if (parts.length > 0) {
      return `Neighborhood Boundaries: ${parts.join(", ")}`;
    }
  }

  const legacy = core.neighborhoodBounds;
  if (typeof legacy === "string" && legacy.trim().length > 0) {
    return `Neighborhood Boundaries: ${legacy.trim()}`;
  }

  return "";
}

function buildSectionPrompt(
  sectionKey: SectionKey,
  projectData: Record<string, unknown>,
  documents: { type: string; text: string; structured: Record<string, unknown> }[],
  photoContext: string,
  relatedSections: Record<string, string>,
): string {
  const subject = (projectData.subject ?? {}) as Record<string, unknown>;
  const address =
    (subject.Address as string) ??
    (subject.AddressLocal as string) ??
    "";

  let prompt = `## Subject Property\n\nAddress: ${address}\n\n`;

  switch (sectionKey) {
    case "ownership": {
      const legalDesc = (subject.Legal as string) ?? "";
      const instrumentNumber = (subject.instrumentNumber as string) ?? "";
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
      const zoning = (subject.Zoning as string) ?? "";
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
      const boundsLine = formatNeighborhoodBoundariesForPrompt(subject);
      if (boundsLine) {
        prompt += `${boundsLine}\n\n`;
      }
      break;
    }

    case "subject-site-summary": {
      prompt += `## Subject Data\n\n\`\`\`json\n${JSON.stringify(subject, null, 2)}\n\`\`\`\n\n`;

      const femaData = (projectData.subjectFema ?? {}) as Record<string, unknown>;
      if (Object.keys(femaData).length > 0) {
        prompt += `## FEMA Flood Data\n\n\`\`\`json\n${JSON.stringify(femaData, null, 2)}\n\`\`\`\n\n`;
      }

      const floodDoc = documents.find((d) => d.type === "flood_map");
      if (floodDoc) {
        prompt += `## FEMA Flood Map Document\n\n${floodDoc.text}\n\n`;
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
      prompt += `## Subject Data\n\n\`\`\`json\n${JSON.stringify(subject, null, 2)}\n\`\`\`\n\n`;

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
