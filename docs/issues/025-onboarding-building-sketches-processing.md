# 025: Onboarding -- Include Building Sketches for Processing

**Priority:** High  
**Complexity:** Low  
**Dependencies:** None (optional: 023 for consistent `section_tag` if sketches are stored as documents)

## Problem

The onboarding wizard lists subject folder files for AI processing but does not surface files from `subjectSketchesFolderId` (when present in `folder_structure`). Sketches contain building dimensions, square footages, and layout data needed for improvements and area reconciliation.

## Expected Behavior

- Subject document selection step also lists sketch folder children when `subjectSketchesFolderId` is known.
- Sketch files use document type `"sketch"` (or equivalent) with a extraction prompt that captures building names, dimensions, square footages, and area calculations.

## Affected Files

- `src/app/projects/new/page.tsx` — list/select sketches, POST processing with correct type/tag
- `src/lib/document-prompts.ts` — `sketch`-targeted extraction prompt

## Acceptance Criteria

- [ ] When `subjectSketchesFolderId` exists, onboarding shows sketch files for selection (or auto-includes per product decision — document which).
- [ ] Sketches are classified as `sketch` (or agreed type constant) for extraction.
- [ ] Prompt extracts building labels, dimensions, SF, and stated calculations where visible.
- [ ] Processed sketch output is stored consistently with other onboarding documents (e.g., `project_documents` + extraction JSON).
- [ ] No crash when sketch folder is missing or empty.
