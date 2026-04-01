# 018: Photo Analysis -- Move from n8n to Webapp

**Priority:** Medium
**Complexity:** High
**Dependencies:** None

## Problem

Photo analysis still calls `env.N8N_WEBHOOK_BASE_URL + "/subject-photos-analyze"` in `src/server/photos/actions.ts`. This is the last major n8n dependency for the core workflow. Moving it to the webapp would follow the same pattern used for document processing and comp parsing.

## Architecture

The photo analysis pipeline has three Gemini steps per image, run sequentially:

### Step 1: Classify

Assign each image to ONE category. Uses a short prompt with property type and subject context.

Categories: `Site & Grounds`, `Building Exterior`, `Building Interior`, `Residential / Apartment Unit`, `Damage & Deferred Maintenance`

Prompt ref: `docs/n8n/gemini-node-prompts/image--classify.md`
Model: `gemini-3.1-flash-lite-preview` (fast, lightweight classification)

### Step 2: Label + Describe

Generate a label (e.g., "Subject Front", "Warehouse Interior") and a 2-4 sentence description with observed improvements. Returns JSON with `description` and `improvements_observed` object.

The `improvements_observed` keys include: foundation, roof, building_frame, exterior_walls, floors, walls, ceiling, lighting, restrooms, electrical, plumbing, heating, hvac, fire_protection, elevators, site_improvements, landscaping, parking, construction_quality, stories.

Prompt ref: `docs/n8n/gemini-node-prompts/image--generate-description.md`
Model: `gemini-3.1-flash-lite-preview` (structured extraction)

### Step 3: Subject Context (simplified)

The old n8n flow used a separate prompt to generate a subject summary from the spreadsheet's raw data. This is no longer needed because:
- By the time photos are processed (end of onboarding), `subject_data.core` already has all the property details
- The classify and describe prompts already accept a `description` parameter for context
- We can build the context string directly from `subject_data.core` (address, property type, building size, construction, condition, year built, etc.)

So instead of a separate Gemini call, we just format a short context string from the DB and pass it to Steps 1 and 2.

## Onboarding Integration

### New step: Photos folder confirmation

Add a step in the onboarding wizard (after subject docs, before flood map or confirmation) that:
- Shows the discovered `subjectPhotosFolderId` and its contents (thumbnail previews if possible, or file list)
- Has a checkbox: "Auto-import and analyze subject photos" (default: checked)
- If checked, photo analysis is queued during the final submit

### Processing status screen

After the user clicks "Finalize" on the confirmation step, show a **processing status modal/screen** instead of immediately redirecting. This screen shows progress for all async tasks:

```
Creating project...                    [done]
Processing subject documents (1 of 3)  [in progress]
Processing subject documents (2 of 3)  [queued]
Processing subject documents (3 of 3)  [queued]
Processing building sketches (1 of 1)  [queued]
Analyzing subject photos (0 of 28)     [queued]
Generating ownership analysis          [queued]
```

Each line updates in real-time via Supabase Realtime subscriptions (watching `project_documents`, `photo_analyses`, `report_sections` for the project). Once all critical tasks complete (docs + sketches), redirect to the project dashboard. Photo analysis can continue in the background -- the photos page already shows progress via Realtime.

## Implementation

### New module: `src/lib/photo-analyzer.ts`

```typescript
interface PhotoAnalysisInput {
  projectId: string;
  fileId: string;
  fileName: string;
  subjectContext: string; // built from subject_data.core
  propertyType: string;
  subjectAddress: string;
}

interface PhotoAnalysisResult {
  category: string;
  label: string;
  description: string;
  improvements_observed: Record<string, string>;
}
```

Flow per image:
1. Download image from Drive via `drive-api.ts`
2. Resize with `sharp` (keep under Gemini's size limits)
3. Call Gemini with classify prompt -> get category
4. Call Gemini with label+describe prompt (includes category from step 3) -> get label, description, improvements_observed
5. Upsert into `photo_analyses` with all fields + `file_id`, `sort_order`

Process images sequentially or with a small concurrency limit (2-3) to avoid Drive/Gemini rate limits.

### Subject context builder

```typescript
function buildSubjectPhotoContext(core: Record<string, unknown>): string {
  // Extract key fields and format as a short paragraph
  // Address, property type, building size, construction, condition, year built,
  // number of buildings, site improvements, etc.
}
```

### Update onboarding wizard

- New step between subject docs and flood map (or after flood map)
- Shows photos folder contents with checkbox
- On finalize: fire photo analysis as fire-and-forget (like document processing)
- Processing status modal tracks all async operations

## Affected Files

- New: `src/lib/photo-analyzer.ts` -- classification, labeling, description pipeline
- `src/server/photos/actions.ts` -- replace `triggerPhotoAnalysis` with direct call to `photo-analyzer.ts`
- `src/app/api/photos/process/route.ts` -- update to use new direct processing
- `src/app/projects/new/page.tsx` -- add photos confirmation step + processing status modal
- Reference prompts: `docs/n8n/gemini-node-prompts/image--classify.md`, `docs/n8n/gemini-node-prompts/image--generate-description.md`

## Acceptance Criteria

- [ ] Photo analysis runs entirely in the webapp (no n8n call)
- [ ] Images are classified into correct categories via Gemini
- [ ] Images are labeled and described with improvements_observed JSON
- [ ] Subject context built from `subject_data.core` (no separate Gemini call for summary)
- [ ] Results saved to `photo_analyses` table with file_id, sort_order, category, label, description, improvements_observed
- [ ] Progress updates visible in real-time on the photos page
- [ ] Onboarding wizard has photos folder confirmation step with auto-import checkbox
- [ ] Processing status screen/modal shows progress for all async tasks during onboarding finalize
- [ ] n8n `subject-photos-analyze` endpoint is no longer called for new projects
- [ ] `pnpm build` passes
