# 017: Analysis Pages -- Generation Context Controls + Visual Polish

**Priority:** Medium
**Complexity:** Medium
**Dependencies:** None
**Origin:** Remaining items from feedback/06-analysis-section.md

## Problem

The analysis pages (Zoning, Ownership, Subject Site Summary, HBU) have `DocumentContextPanel` toggles and basic content generation, but are missing:

1. **Include/exclude checkboxes** on documents in the context panel to control what feeds into AI generation
2. **Photo context section** in the panel for Subject Site Summary (which relies heavily on subject photos)
3. **HBU prerequisite status** -- should show whether Zoning, Ownership, and Site Summary have been generated and warn if stale
4. **"Last generated" timestamp** and model info on generated content
5. **Structured data sections** on Ownership (deed facts above narrative) and Site Summary (key facts strip)

## Expected Behavior

### Context Controls
- Each document row in `DocumentContextPanel` has a checkbox to include/exclude from generation context
- Excluded documents are visually dimmed but still visible
- When regenerating, only checked documents are passed to the prompt builder

### Photo Context (Site Summary)
- Panel has a "Photo Context" section listing subject photos with descriptions
- Toggle to include/exclude photo context from generation

### HBU Prerequisites
- Panel shows status of Zoning, Ownership, and Site Summary sections
- Warning indicator if any prerequisite is empty or has been regenerated more recently than HBU

### Visual Polish
- "Last generated" timestamp below content area (from `report_sections.updated_at`)
- Ownership page: structured deed facts block above the narrative
- Site Summary page: key facts strip (land size, building size, year built, condition)

## Affected Files

- `src/components/DocumentContextPanel.tsx` -- add include/exclude checkboxes, photo context section
- `src/components/ReportSectionPage.tsx` or `ReportSectionContent.tsx` -- add timestamp display
- `src/app/project/[projectId]/analysis/ownership/page.tsx` -- add deed facts block
- `src/app/project/[projectId]/analysis/subject-site-summary/page.tsx` -- add key facts, photo context
- `src/app/project/[projectId]/analysis/highest-best-use/page.tsx` -- add prerequisite status
- `src/lib/prompt-builder.ts` -- respect include/exclude flags

## Acceptance Criteria

- [ ] Documents in context panel have include/exclude checkboxes
- [ ] Site Summary panel shows photo context with toggle
- [ ] HBU page shows prerequisite section status
- [ ] Generated content shows "last generated" timestamp
- [ ] Ownership shows structured deed facts above narrative
- [ ] Site Summary shows key facts strip
