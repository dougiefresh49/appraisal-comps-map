# 018: Photo Analysis -- Move from n8n to Webapp

**Priority:** Medium
**Complexity:** High
**Dependencies:** None
**Origin:** Remaining item from feedback/03-subject-section.md section 7, docs/product/n8n-dependencies.md

## Problem

Photo analysis still calls `env.N8N_WEBHOOK_BASE_URL + "/subject-photos-analyze"` in `src/server/photos/actions.ts`. This is the last major n8n dependency for the core workflow. Moving it to the webapp would follow the same pattern used for document processing and comp parsing.

## Expected Behavior

Replace the n8n photo analysis call with direct Gemini processing in the webapp:

1. Download images from Google Drive (using `drive-api.ts`)
2. Send each image to Gemini for classification and labeling (using prompts from `docs/gemini-image-prompts/`)
3. Save results to `photo_analyses` table in Supabase
4. Update progress in real-time so the UI can show analysis status

## Affected Files

- `src/server/photos/actions.ts` -- replace `triggerPhotoAnalysis` with direct Gemini calls
- `src/app/api/photos/process/route.ts` -- update to use new direct processing
- Potentially new: `src/lib/photo-classifier.ts` -- extracted classification/labeling logic

## Reference

- Classifier prompt: `docs/gemini-image-prompts/classifier.md`
- Labeler prompt: `docs/gemini-image-prompts/labeler.md`
- Summary prompt: `docs/gemini-image-classifier/Make Subject Summary prompt.md`
- Knowledge base CSV: `docs/gemini-image-prompts/AI Photo Labeling Knowledge Base - Sheet1.csv`

## Acceptance Criteria

- [ ] Photo analysis runs entirely in the webapp (no n8n call)
- [ ] Images are classified, labeled, and described via Gemini
- [ ] Results saved to `photo_analyses` table
- [ ] Progress updates visible in real-time on the photos page
- [ ] n8n `subject-photos-analyze` endpoint is no longer called
