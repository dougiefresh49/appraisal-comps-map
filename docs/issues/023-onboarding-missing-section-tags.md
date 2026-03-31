# 023: Missing `section_tag` on Processed Documents (Onboarding + Document Panel)

**Priority:** Critical
**Complexity:** Low
**Dependencies:** None

## Problem

Section tags are missing in two places:

1. **Onboarding:** `projects/new/page.tsx:391-402` POSTs to `/api/documents` without `sectionTag`. All subject documents ingested during onboarding get `section_tag = null`.
2. **Document panel context:** When adding documents through the right-side `DocumentContextPanel`, the app knows which section the user is in (subject overview, neighborhood, comp detail, etc.). This context should always be used to infer the tag automatically. Issue 015 partially addressed this for comp detail, but all section contexts need to propagate consistently.

## Expected Behavior

- Subject-folder uploads during onboarding receive `sectionTag: "subject"`.
- Engagement-folder uploads during onboarding receive `sectionTag: "engagement"`.
- Sketch-folder uploads during onboarding receive `sectionTag: "subject"` (or `"sketches"`).
- Documents added via `DocumentContextPanel` on any page inherit the section tag from the panel's `effectiveSectionTag` -- this should work for subject, neighborhood, analysis, and comp-specific contexts.
- Tag derivation aligns with `inferDocumentType` / folder context so types and tags stay consistent.

## Affected Files

- `src/app/projects/new/page.tsx` -- pass `sectionTag` for each document POST (subject vs engagement vs sketch paths; lines ~391-402)
- `src/components/DocumentContextPanel.tsx` -- verify `effectiveSectionTag` is always passed when adding documents via the inline Drive browser (all section keys, not just comp-detail)

## Acceptance Criteria

- [ ] Subject folder files POST with `sectionTag: "subject"` during onboarding.
- [ ] Engagement folder files POST with `sectionTag: "engagement"` during onboarding.
- [ ] Documents added from any `DocumentContextPanel` instance have a non-null `section_tag` matching the current section.
- [ ] Confirmed in DB (`project_documents.section_tag`) after a test onboarding run.
- [ ] No regression for non-onboarding document uploads (existing routes still behave as before).
