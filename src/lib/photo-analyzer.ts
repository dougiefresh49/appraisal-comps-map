import "server-only";

import { GoogleGenAI, type Part } from "@google/genai";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadFile, listFolderChildren } from "~/lib/drive-api";
import { LABEL_EXAMPLES } from "~/lib/photo-label-examples";

const PHOTO_MODEL = "gemini-3.1-flash-lite-preview";

const VALID_CATEGORIES = [
  "Site & Grounds",
  "Building Exterior",
  "Building Interior",
  "Residential / Apartment Unit",
  "Damage & Deferred Maintenance",
] as const;

export type PhotoCategory = (typeof VALID_CATEGORIES)[number];

export interface PhotoAnalysisInput {
  projectId: string;
  fileId: string;
  fileName: string;
  subjectContext: string;
  propertyType: string;
  subjectAddress: string;
}

export interface PhotoAnalysisResult {
  category: PhotoCategory;
  label: string;
  description: string;
  improvements_observed: Record<string, string>;
}

interface DescribeImageResponse {
  description: string;
  improvements_observed: Record<string, string>;
}

/** Optional behavior for `describeImage` (e.g. human-corrected caption). */
export interface DescribeImageOptions {
  humanVerifiedLabel?: boolean;
}

function getAI(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GEMINI_API_KEY is not set — Gemini photo analysis requires an API key",
    );
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Formats subject_data.core into a short context paragraph for Gemini prompts.
 * Extracts address, property type, building size, construction, condition, year built,
 * number of buildings, and site improvements.
 */
export function buildSubjectPhotoContext(
  core: Record<string, unknown>,
): string {
  const parts: string[] = [];

  const address =
    typeof core.address === "string"
      ? core.address
      : typeof core.siteAddress === "string"
        ? core.siteAddress
        : typeof core.propertyAddress === "string"
          ? core.propertyAddress
          : null;
  if (address) parts.push(`Address: ${address}`);

  const propertyType =
    typeof core.propertyType === "string"
      ? core.propertyType
      : typeof core.use === "string"
        ? core.use
        : null;
  if (propertyType) parts.push(`Property Type: ${propertyType}`);

  const buildingSize =
    typeof core.buildingSize === "string" || typeof core.buildingSize === "number"
      ? String(core.buildingSize)
      : typeof core.gba === "string" || typeof core.gba === "number"
        ? String(core.gba)
        : typeof core.buildingArea === "string" || typeof core.buildingArea === "number"
          ? String(core.buildingArea)
          : null;
  if (buildingSize) parts.push(`Building Size: ${buildingSize} SF`);

  const construction =
    typeof core.construction === "string"
      ? core.construction
      : typeof core.constructionType === "string"
        ? core.constructionType
        : typeof core.frameType === "string"
          ? core.frameType
          : null;
  if (construction) parts.push(`Construction: ${construction}`);

  const condition =
    typeof core.condition === "string"
      ? core.condition
      : typeof core.overallCondition === "string"
        ? core.overallCondition
        : null;
  if (condition) parts.push(`Condition: ${condition}`);

  const yearBuilt =
    typeof core.yearBuilt === "string" || typeof core.yearBuilt === "number"
      ? String(core.yearBuilt)
      : typeof core.year === "string" || typeof core.year === "number"
        ? String(core.year)
        : null;
  if (yearBuilt) parts.push(`Year Built: ${yearBuilt}`);

  const numBuildings =
    typeof core.numberOfBuildings === "string" ||
    typeof core.numberOfBuildings === "number"
      ? String(core.numberOfBuildings)
      : typeof core.buildingCount === "string" ||
          typeof core.buildingCount === "number"
        ? String(core.buildingCount)
        : null;
  if (numBuildings) parts.push(`Number of Buildings: ${numBuildings}`);

  const siteImprovements =
    typeof core.siteImprovements === "string"
      ? core.siteImprovements
      : typeof core.improvements === "string"
        ? core.improvements
        : null;
  if (siteImprovements) parts.push(`Site Improvements: ${siteImprovements}`);

  if (parts.length === 0) {
    return "No additional subject context available.";
  }

  return parts.join(". ") + ".";
}

/**
 * Resize an image buffer so it fits within Gemini's recommended limits.
 * Caps the long edge at 1568px and enforces max 4MB output.
 */
export async function resizeForGemini(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const isJpeg = mimeType === "image/jpeg" || mimeType === "image/jpg";
  const isPng = mimeType === "image/png";
  const isWebp = mimeType === "image/webp";

  if (!isJpeg && !isPng && !isWebp) {
    // For unsupported types, return as-is and let Gemini handle it
    return { buffer: imageBuffer, mimeType };
  }

  const img = sharp(imageBuffer);
  const metadata = await img.metadata();
  const maxDim = 1568;

  const needsResize =
    (metadata.width && metadata.width > maxDim) ||
    (metadata.height && metadata.height > maxDim);

  const resized = needsResize
    ? img.resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
    : img;

  const outputBuffer = await resized
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();

  return { buffer: outputBuffer, mimeType: "image/jpeg" };
}

/**
 * Classify a photo into one of the five appraisal categories using Gemini.
 */
export async function classifyImage(
  imageBuffer: Buffer,
  mimeType: string,
  propertyType: string,
  subjectContext: string,
): Promise<PhotoCategory> {
  const prompt = `You are an AI assistant classifying photos for a commercial real estate appraisal.

The overall property type is: ${propertyType}

Additional context about the subject property are as follows:
${subjectContext}

Based on this context and the image attached below, classify the image into ONE of the following categories:

- Site & Grounds
- Building Exterior
- Building Interior
- Residential / Apartment Unit
- Damage & Deferred Maintenance.

Respond with only the single category name and nothing else.`;

  const parts: Part[] = [
    {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType,
      },
    },
    { text: prompt },
  ];

  const response = await getAI().models.generateContent({
    model: PHOTO_MODEL,
    contents: parts,
    config: {
      temperature: 0.1,
      maxOutputTokens: 64,
    },
  });

  const raw = (response.text ?? "").trim();

  // Match against the known categories (case-insensitive, partial ok)
  const matched = VALID_CATEGORIES.find(
    (cat) =>
      raw.toLowerCase() === cat.toLowerCase() ||
      raw.toLowerCase().includes(cat.toLowerCase()),
  );

  return matched ?? "Building Exterior";
}

/**
 * Generate a label and detailed description for a classified photo using Gemini.
 * Returns { description, improvements_observed }.
 */
export async function describeImage(
  imageBuffer: Buffer,
  mimeType: string,
  category: PhotoCategory,
  label: string,
  propertyType: string,
  subjectAddress: string,
  subjectContext: string,
  options?: DescribeImageOptions,
): Promise<{ description: string; improvements_observed: Record<string, string> }> {
  const humanVerifiedPrefix = options?.humanVerifiedLabel
    ? `The photo caption below was set or corrected by a human appraiser. Treat it as authoritative: describe only what the image supports and align the narrative and improvements_observed with that caption. Do not contradict the caption.\n\n`
    : "";

  const prompt = `You are an expert commercial real estate appraiser documenting a property inspection. ${humanVerifiedPrefix}This image has been labeled as: "${label}" and categorized as "${category}" for a ${propertyType} property at ${subjectAddress}.

A short description of the subject property is as follows:
${subjectContext}

Analyze the image and respond with ONLY a valid JSON object (no markdown, no code fences) in the following structure:

{
  "description": "<2-4 sentence detailed description of what you observe: materials, construction quality, approximate dimensions, condition, notable features, and any deficiencies or deferred maintenance. Be specific about material types (e.g., 'painted drywall' not 'walls', 'concrete slab' not 'floor'). This will be used as reference documentation for an appraisal report.>",
  "improvements_observed": {
    "<key>": "<value>"
  }
}

For the "improvements_observed" object, ONLY include keys for characteristics that are clearly visible in this image. Do not speculate about what you cannot see. Do not include keys with empty or "N/A" values. Use these keys when the corresponding feature is visible:

- "foundation" — foundation type (e.g., "Concrete slab", "Pier and beam")
- "roof" — roof type and material (e.g., "Metal standing seam", "Built-up flat roof")
- "building_frame" — structural frame (e.g., "Heavy steel beam", "Wood frame")
- "exterior_walls" — exterior wall material (e.g., "Pre-engineered metal siding", "Brick veneer")
- "floors" — floor material and finish (e.g., "Concrete slab, smooth finish", "Commercial carpet")
- "walls" — interior wall material (e.g., "Painted drywall", "Exposed CMU block")
- "ceiling" — ceiling type (e.g., "Drop ceiling with acoustic tiles", "Exposed metal deck")
- "lighting" — lighting type (e.g., "LED high-bay fixtures", "Fluorescent tubes")
- "restrooms" — fixtures and count if visible (e.g., "2 fixtures, ceramic tile walls")
- "electrical" — visible electrical systems (e.g., "3-phase panel, 440V service")
- "plumbing" — visible plumbing features (e.g., "Water heater, copper pipes")
- "heating" — heating system (e.g., "Forced air gas furnace", "None observed")
- "hvac" — HVAC/air conditioning (e.g., "Wall-mounted units, appear non-functional")
- "fire_protection" — sprinklers, extinguishers, alarms (e.g., "Smoke detectors, no sprinkler heads")
- "elevators" — elevator type if visible (e.g., "1 hydraulic freight elevator")
- "site_improvements" — fencing, wells, septic, paving (e.g., "Metal pipe fencing with barb wire, 2 water wells")
- "landscaping" — landscaping type and condition (e.g., "Raw caliche yard, minimal grass")
- "parking" — surface type and approximate spaces (e.g., "Gravel lot, ~15 spaces")
- "construction_quality" — quality rating if assessable (e.g., "Average", "Above average")
- "stories" — number of stories if visible from exterior (e.g., "2")`;

  const parts: Part[] = [
    {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType,
      },
    },
    { text: prompt },
  ];

  const response = await getAI().models.generateContent({
    model: PHOTO_MODEL,
    contents: parts,
    config: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
    },
  });

  const raw = (response.text ?? "").trim();

  try {
    const parsed = JSON.parse(raw) as DescribeImageResponse;
    return {
      description: parsed.description ?? "",
      improvements_observed:
        typeof parsed.improvements_observed === "object" &&
        parsed.improvements_observed !== null
          ? parsed.improvements_observed
          : {},
    };
  } catch {
    console.warn("[describeImage] Failed to parse Gemini JSON response:", raw.slice(0, 200));
    return { description: raw, improvements_observed: {} };
  }
}

/**
 * Regenerate description and improvements_observed using a user-provided label
 * (e.g. after manual correction). Inverse of {@link generateSmartLabel}.
 */
export async function redescribeFromLabel(
  imageBuffer: Buffer,
  mimeType: string,
  category: PhotoCategory,
  userLabel: string,
  propertyType: string,
  subjectAddress: string,
  subjectContext: string,
): Promise<{ description: string; improvements_observed: Record<string, string> }> {
  const label = userLabel.trim() || "Subject photo";
  return describeImage(
    imageBuffer,
    mimeType,
    category,
    label,
    propertyType,
    subjectAddress,
    subjectContext,
    { humanVerifiedLabel: true },
  );
}

/**
 * Camera/auto-generated filename patterns that should NOT be used as labels.
 * Matches: PXL_*, IMG_*, DSC*, DSCN*, MVIMG_*, samsung*, photo*, dcim*
 * and stems that are primarily digits/punctuation (e.g. "20250522 164933641~2").
 */
const NON_DESCRIPTIVE_PATTERN = /^(img|dsc[n_]?|pxl|dcim|mvimg|samsung|photo)\b/i;

function isStemDescriptive(stem: string): boolean {
  if (stem.length <= 3) return false;
  if (/^\d+$/.test(stem)) return false;
  if (NON_DESCRIPTIVE_PATTERN.test(stem)) return false;
  // Reject stems that are mostly digits/punctuation after stripping spaces/tildes/dots
  if (stem.replace(/[\d\s~.]+/g, "").length <= 2) return false;
  return true;
}

/**
 * Returns a category-based fallback label (e.g. "Warehouse Exterior") for use
 * when the filename is a camera pattern and no description is available yet.
 */
function buildCategoryFallbackLabel(
  category: PhotoCategory,
  propertyType: string,
): string {
  const base = propertyType.split(" ")[0] ?? "Subject";
  const map: Record<PhotoCategory, string> = {
    "Site & Grounds": "Site View",
    "Building Exterior": `${base} Exterior`,
    "Building Interior": `${base} Interior`,
    "Residential / Apartment Unit": "Unit Interior",
    "Damage & Deferred Maintenance": "Deferred Maintenance",
  };
  return map[category] ?? `${base} Photo`;
}

/**
 * Generate a short label for a classified photo.
 * Uses the filename stem only if it is actually descriptive (not a camera pattern).
 * Falls back to a category-based label when the stem is auto-generated.
 */
function buildLabel(
  category: PhotoCategory,
  fileName: string,
  propertyType: string,
): string {
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[-_.]/g, " ").trim();

  if (isStemDescriptive(stem)) {
    return stem
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  return buildCategoryFallbackLabel(category, propertyType);
}

/**
 * Generate a contextual, specific label for a photo using Gemini + few-shot examples.
 * Produces labels like "Lobby", "Chapel - Bathroom", "Rear Fence Damage" instead of
 * generic category-level labels.
 *
 * @param imageBuffer - Resized image buffer (from resizeForGemini)
 * @param mimeType - Mime type of the image
 * @param category - Photo category (from classifyImage)
 * @param description - Gemini description of the image (from describeImage)
 * @param propertyType - Property type string from the project
 * @param subjectAddress - Subject property address
 */
export async function generateSmartLabel(
  imageBuffer: Buffer,
  mimeType: string,
  category: PhotoCategory,
  description: string,
  propertyType: string,
  subjectAddress: string,
): Promise<string> {
  const examplesBlock = LABEL_EXAMPLES
    .map((ex) => `Category: ${ex.category} → Label: "${ex.label}"`)
    .join("\n");

  const prompt = `You are an AI assistant creating concise, specific photo labels for a commercial real estate appraisal report.

Property: ${propertyType} at ${subjectAddress}
Photo Category: ${category}
Photo Description: ${description || "(no description available)"}

Here are examples of good labels from past commercial real estate appraisals:

${examplesBlock}

Based on the photo category, description, and the image itself, generate a short, specific label (2-6 words) that identifies exactly what this photo shows. Be specific — use room names, orientations (Front/Rear/Left/Right), or distinguishing features. Do NOT use generic labels like "${category}" unless the photo is truly generic with no distinguishing features.

Respond with ONLY the label text — no quotes, no explanation, nothing else.`;

  const parts: Part[] = [
    { inlineData: { data: imageBuffer.toString("base64"), mimeType } },
    { text: prompt },
  ];

  try {
    const response = await getAI().models.generateContent({
      model: PHOTO_MODEL,
      contents: parts,
      config: { temperature: 0.2, maxOutputTokens: 64 },
    });

    const label = (response.text ?? "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .trim();

    if (label && label.length > 0 && label.length <= 80) {
      return label;
    }
  } catch (err) {
    console.warn("[generateSmartLabel] Gemini call failed, using fallback:", err);
  }

  return buildCategoryFallbackLabel(category, propertyType);
}

function normalizeLabelForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\\(.)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pick the closest string from `availableLabels` to model output (exact, then normalized, then Levenshtein). */
export function resolveReportLabelMatch(
  rawResponse: string,
  availableLabels: string[],
): string {
  const t = rawResponse
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  if (availableLabels.length === 0) return t;
  if (!t) return availableLabels[0] ?? "";

  const exact = availableLabels.find((l) => l === t);
  if (exact) return exact;

  const nt = normalizeLabelForMatch(t);
  const normHit = availableLabels.find(
    (l) => normalizeLabelForMatch(l) === nt,
  );
  if (normHit) return normHit;

  const includesHit = availableLabels.find(
    (l) =>
      nt.includes(normalizeLabelForMatch(l)) ||
      normalizeLabelForMatch(l).includes(nt),
  );
  if (includesHit) return includesHit;

  let best = availableLabels[0] ?? t;
  let bestDist = Infinity;
  for (const l of availableLabels) {
    const d = levenshtein(nt, normalizeLabelForMatch(l));
    if (d < bestDist) {
      bestDist = d;
      best = l;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

/**
 * Given a constrained list of labels from a published appraisal report, pick the one
 * that best matches the photo (vision + category + description).
 */
export async function matchPhotoToReportLabel(
  imageBuffer: Buffer,
  mimeType: string,
  availableLabels: string[],
  category: string,
  description: string,
): Promise<string> {
  if (availableLabels.length === 0) {
    return "";
  }
  if (availableLabels.length === 1) {
    return availableLabels[0] ?? "";
  }

  const listBlock = availableLabels
    .map((l, i) => `${i + 1}. ${l}`)
    .join("\n");

  const prompt = `You are matching a subject property inspection photo to the caption labels used in a commercial real estate appraisal report.

Photo category (from prior AI classification): ${category}
Photo description (from prior AI analysis): ${description || "(none)"}

The ONLY allowed labels are listed below. You must pick exactly one label that best describes this image. Copy the label text exactly as written (character-for-character), including punctuation and spacing.

Allowed labels:
${listBlock}

Respond with ONLY one line: the exact label text from the list, nothing else.`;

  const parts: Part[] = [
    { inlineData: { data: imageBuffer.toString("base64"), mimeType } },
    { text: prompt },
  ];

  try {
    const response = await getAI().models.generateContent({
      model: PHOTO_MODEL,
      contents: parts,
      config: {
        temperature: 0.1,
        maxOutputTokens: 128,
      },
    });

    const raw = (response.text ?? "").trim();
    return resolveReportLabelMatch(raw, availableLabels);
  } catch (err) {
    console.warn("[matchPhotoToReportLabel] Gemini failed:", err);
    return availableLabels[0] ?? "";
  }
}

/**
 * Determines if a Drive file is an image based on its name or mimeType.
 */
function isImageFile(fileName: string, mimeType?: string): boolean {
  if (mimeType?.startsWith("image/")) return true;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "tif", "tiff"].includes(ext);
}

/**
 * Maps a Drive file mime type (or extension) to a Gemini-compatible image mime type.
 */
export function resolveImageMimeType(fileName: string, driveMimeType: string): string {
  if (driveMimeType?.startsWith("image/")) return driveMimeType;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    tif: "image/tiff",
    tiff: "image/tiff",
  };
  return map[ext] ?? "image/jpeg";
}

/**
 * Analyzes a single photo: classifies, labels (smart), describes, and upserts into photo_analyses.
 * Flow: classify → buildLabel (filename-based fallback for description context) →
 *       describeImage → generateSmartLabel (Gemini label using description + image).
 */
export async function analyzePhoto(
  input: PhotoAnalysisInput,
  token: string,
  supabase: SupabaseClient,
  sortOrder: number,
): Promise<PhotoAnalysisResult> {
  const arrayBuffer = await downloadFile(token, input.fileId);
  const rawBuffer = Buffer.from(arrayBuffer);

  const mimeType = resolveImageMimeType(input.fileName, "");
  const { buffer: resizedBuffer, mimeType: resizedMimeType } =
    await resizeForGemini(rawBuffer, mimeType);

  const category = await classifyImage(
    resizedBuffer,
    resizedMimeType,
    input.propertyType,
    input.subjectContext,
  );

  // Use filename-based label as context for the describe call
  const fallbackLabel = buildLabel(category, input.fileName, input.propertyType);

  const { description, improvements_observed } = await describeImage(
    resizedBuffer,
    resizedMimeType,
    category,
    fallbackLabel,
    input.propertyType,
    input.subjectAddress,
    input.subjectContext,
  );

  // Generate a smart, contextual label using Gemini + description + image
  const label = await generateSmartLabel(
    resizedBuffer,
    resizedMimeType,
    category,
    description,
    input.propertyType,
    input.subjectAddress,
  );

  const { error: upsertError } = await supabase
    .from("photo_analyses")
    .upsert(
      {
        project_id: input.projectId,
        file_id: input.fileId,
        file_name: input.fileName,
        sort_order: sortOrder,
        category,
        label,
        description,
        improvements_observed,
        property_type: input.propertyType,
        subject_address: input.subjectAddress,
        is_included: true,
      },
      { onConflict: "project_id,file_id" },
    );

  if (upsertError) {
    console.error(
      `[analyzePhoto] Failed to upsert photo_analyses for file ${input.fileId}:`,
      upsertError,
    );
  }

  return { category, label, description, improvements_observed };
}

/**
 * Lists all image files in a Drive folder and analyzes each one.
 * Uses a small concurrency limit to avoid Drive/Gemini rate limits.
 * Returns the total number of photos queued for analysis.
 *
 * @param photoIds - Optional list of Drive file IDs to limit analysis to.
 *   When omitted, all images in the folder are processed.
 */
export async function analyzeProjectPhotos(
  projectId: string,
  photosFolderId: string,
  token: string,
  supabase: SupabaseClient,
  opts: {
    propertyType: string;
    subjectAddress: string;
    subjectContext: string;
    concurrency?: number;
    photoIds?: string[];
  },
): Promise<{ totalPhotos: number }> {
  const allFiles = await listFolderChildren(token, photosFolderId, {
    filesOnly: true,
  });

  const imageFiles = allFiles.filter((f) => isImageFile(f.name, f.mimeType));

  const filesToProcess = opts.photoIds
    ? imageFiles.filter((f) => opts.photoIds!.includes(f.id))
    : imageFiles;

  if (filesToProcess.length === 0) {
    return { totalPhotos: 0 };
  }

  const concurrency = opts.concurrency ?? 2;

  for (let i = 0; i < filesToProcess.length; i += concurrency) {
    const batch = filesToProcess.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (file, batchIdx) => {
        const sortOrder = i + batchIdx;
        try {
          await analyzePhoto(
            {
              projectId,
              fileId: file.id,
              fileName: file.name,
              subjectContext: opts.subjectContext,
              propertyType: opts.propertyType,
              subjectAddress: opts.subjectAddress,
            },
            token,
            supabase,
            sortOrder,
          );
          console.log(
            `[analyzeProjectPhotos] Processed ${sortOrder + 1}/${filesToProcess.length}: ${file.name}`,
          );
        } catch (err) {
          console.error(
            `[analyzeProjectPhotos] Error processing ${file.name}:`,
            err,
          );
        }
      }),
    );
  }

  return { totalPhotos: filesToProcess.length };
}
