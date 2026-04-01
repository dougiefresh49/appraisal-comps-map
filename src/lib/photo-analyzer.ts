import "server-only";

import { GoogleGenAI, type Part } from "@google/genai";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadFile, listFolderChildren } from "~/lib/drive-api";

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
async function resizeForGemini(
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
): Promise<{ description: string; improvements_observed: Record<string, string> }> {
  const prompt = `You are an expert commercial real estate appraiser documenting a property inspection. This image has been labeled as: "${label}" and categorized as "${category}" for a ${propertyType} property at ${subjectAddress}.

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
 * Generate a short label for a classified photo, e.g. "Subject Front", "Warehouse Interior".
 */
function buildLabel(
  category: PhotoCategory,
  fileName: string,
  propertyType: string,
): string {
  const base = propertyType.split(" ")[0] ?? "Subject";
  const categoryShort: Record<PhotoCategory, string> = {
    "Site & Grounds": "Site View",
    "Building Exterior": `${base} Exterior`,
    "Building Interior": `${base} Interior`,
    "Residential / Apartment Unit": "Unit Interior",
    "Damage & Deferred Maintenance": "Deferred Maintenance",
  };

  // Use filename stem as a hint if it's descriptive
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim();
  const isDescriptive = stem.length > 3 && !/^\d+$/.test(stem) && !/^img/i.test(stem) && !/^dsc/i.test(stem);

  if (isDescriptive) {
    return stem
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  return categoryShort[category] ?? `${base} Photo`;
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
function resolveImageMimeType(fileName: string, driveMimeType: string): string {
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
 * Analyzes a single photo: classifies, labels, describes, and upserts into photo_analyses.
 */
export async function analyzePhoto(
  input: PhotoAnalysisInput,
  token: string,
  supabase: SupabaseClient,
  sortOrder: number,
): Promise<PhotoAnalysisResult> {
  const arrayBuffer = await downloadFile(token, input.fileId);
  const rawBuffer = Buffer.from(arrayBuffer);

  // We don't know the mime type from Drive file listing; derive from filename
  const mimeType = resolveImageMimeType(input.fileName, "");
  const { buffer: resizedBuffer, mimeType: resizedMimeType } =
    await resizeForGemini(rawBuffer, mimeType);

  const category = await classifyImage(
    resizedBuffer,
    resizedMimeType,
    input.propertyType,
    input.subjectContext,
  );

  const label = buildLabel(category, input.fileName, input.propertyType);

  const { description, improvements_observed } = await describeImage(
    resizedBuffer,
    resizedMimeType,
    category,
    label,
    input.propertyType,
    input.subjectAddress,
    input.subjectContext,
  );

  // Upsert into photo_analyses (match by project_id + file_id)
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
  },
): Promise<{ totalPhotos: number }> {
  const allFiles = await listFolderChildren(token, photosFolderId, {
    filesOnly: true,
  });

  const imageFiles = allFiles.filter((f) => isImageFile(f.name, f.mimeType));

  if (imageFiles.length === 0) {
    return { totalPhotos: 0 };
  }

  const concurrency = opts.concurrency ?? 2;

  // Process images in batches
  for (let i = 0; i < imageFiles.length; i += concurrency) {
    const batch = imageFiles.slice(i, i + concurrency);
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
            `[analyzeProjectPhotos] Processed ${sortOrder + 1}/${imageFiles.length}: ${file.name}`,
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

  return { totalPhotos: imageFiles.length };
}
