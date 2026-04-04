import type { PostgrestResponse } from "@supabase/supabase-js";
import {
  getKnowledgeForSection,
  getSimilarPastSections,
  type SectionKey,
} from "~/lib/knowledge-retrieval";
import {
  findSimilarProjects,
  getSimilarProjectContext,
} from "~/lib/similar-projects";
import { createClient } from "~/utils/supabase/server";

interface PromptContext {
  systemPrompt: string;
  examples: string[];
  extraKnowledge: string[];
  sectionPrompt: string;
  similarPastSections: string[];
  similarProjectContext: string[];
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
  const [
    knowledgeBase,
    projectData,
    documents,
    photoAnalyses,
    relatedSections,
    similarPast,
    similarProjectCtx,
  ] = await Promise.all([
    getKnowledgeForSection(sectionKey),
    fetchProjectData(supabase, projectId),
    fetchRelevantDocuments(supabase, projectId, sectionKey, excludedDocIds),
    excludePhotoContext ? Promise.resolve("") : fetchPhotoContext(supabase, projectId),
    fetchRelatedSections(supabase, projectId, sectionKey),
    getSimilarPastSections(sectionKey, projectId),
    fetchSimilarProjectContexts(projectId, sectionKey),
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
    similarProjectContext: similarProjectCtx,
  };
}

function subjectFieldDisplay(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" && !Number.isNaN(v)) {
    return String(v);
  }
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  return null;
}

function appendSubjectComparisonForSection(
  sectionKey: SectionKey,
  subjectData: Record<string, unknown>,
  lines: string[],
): void {
  if (sectionKey === "zoning") {
    const z = subjectData.Zoning;
    if (typeof z === "string" && z.trim()) {
      lines.push(`\nTheir zoning (subject): ${z.trim()}`);
    }
    return;
  }

  if (sectionKey === "ownership") {
    const legal = subjectData.Legal;
    if (typeof legal === "string" && legal.trim()) {
      lines.push(
        `\nTheir legal description (excerpt): ${legal.trim().slice(0, 500)}`,
      );
    }
    const inst = subjectData.instrumentNumber;
    if (typeof inst === "string" && inst.trim()) {
      lines.push(`Instrument: ${inst.trim()}`);
    }
    return;
  }

  if (sectionKey === "subject-site-summary") {
    const keys = [
      "Address",
      "City",
      "County",
      "Zoning",
      "Land Size (AC)",
      "Building Size (SF)",
      "Year Built",
      "Condition",
      "Construction",
    ];
    const parts: string[] = [];
    for (const k of keys) {
      const display = subjectFieldDisplay(subjectData[k]);
      if (display) {
        parts.push(`${k}: ${display}`);
      }
    }
    if (parts.length > 0) {
      const block = `\nTheir subject highlights:\n${parts.join("\n")}`;
      lines.push(block.length > 1200 ? block.slice(0, 1200) : block);
    }
  }
}

async function fetchSimilarProjectContexts(
  projectId: string,
  sectionKey: SectionKey,
): Promise<string[]> {
  const TAG = "[prompt-builder]";
  try {
    const similar = await findSimilarProjects(projectId, { limit: 3 });
    const withData = similar.filter((s) => s.hasExtractedData);
    const contexts = await Promise.all(
      withData.map((s) => getSimilarProjectContext(projectId, s.projectId)),
    );

    const blocks: string[] = [];
    for (const ctx of contexts) {
      const lines: string[] = [];
      lines.push(
        `## ${ctx.project.name} (${ctx.project.propertyType ?? "Unknown type"}, ${ctx.project.city ?? "Unknown city"})`,
      );

      const matchingSection = ctx.reportSections.find(
        (s) => s.sectionKey === sectionKey,
      );
      if (matchingSection?.content.trim()) {
        lines.push(`\n### Their ${sectionKey.replace(/-/g, " ")} section:\n`);
        lines.push(matchingSection.content.substring(0, 1500));
      }

      appendSubjectComparisonForSection(sectionKey, ctx.subjectData, lines);

      if (ctx.extractedData) {
        const adjCategories: string[] = [];
        for (const grid of [
          ctx.extractedData.landAdjustments,
          ctx.extractedData.saleAdjustments,
          ctx.extractedData.rentalAdjustments,
        ]) {
          if (grid && typeof grid === "object" && "rows" in grid) {
            const rows = (grid as { rows: { category?: string }[] }).rows;
            if (Array.isArray(rows)) {
              for (const row of rows) {
                const cat = row.category;
                if (
                  typeof cat === "string" &&
                  cat.trim() &&
                  !adjCategories.includes(cat.trim())
                ) {
                  adjCategories.push(cat.trim());
                }
              }
            }
          }
        }
        if (adjCategories.length > 0) {
          lines.push(`\nAdjustment categories used: ${adjCategories.join(", ")}`);
        }

        if (ctx.extractedData.reconciliation) {
          const recon = ctx.extractedData.reconciliation as {
            primary_approach?: string;
          };
          if (recon.primary_approach) {
            lines.push(`Primary valuation approach: ${recon.primary_approach}`);
          }
        }
      }

      if (lines.length <= 1) {
        continue;
      }

      let block = lines.join("\n");
      if (block.length > 4000) {
        block = `${block.substring(0, 4000)}\n...(truncated)`;
      }
      blocks.push(block);
    }
    return blocks;
  } catch (e) {
    console.error(
      TAG,
      "fetchSimilarProjectContexts:",
      e instanceof Error ? e.message : e,
    );
    return [];
  }
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

  if (context.similarProjectContext.length > 0) {
    parts.push(
      `# Context from Similar Past Projects\n\n${context.similarProjectContext.join("\n\n---\n\n")}`,
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
