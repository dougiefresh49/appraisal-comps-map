# 013: Update Product Docs to Reflect Current State

**Priority:** Low
**Complexity:** Low
**Dependencies:** None

## Problem

The product documentation in `docs/product/` was written before the UX Overhaul and several changes need to be reflected:

### docs/product/README.md
- "What calls n8n vs what's direct?" table is outdated:
  - "Project creation (Drive + Sheets)" --> now handled by onboarding wizard (`project-discovery.ts` + `engagement-parser.ts`)
  - "Photo export (Drive write)" --> already replaced by `exportInputJson` using Drive API
  - "Comp parser (Drive + AI)" --> already replaced by `POST /api/comps/parse`
  - "Comp folder browsing (Drive)" --> already replaced by Drive API in `comps-folder-list` and `comps-folder-details`
  - "Cover photo data (Drive)" --> already replaced by `POST /api/cover-data`
- "Where is data stored?" table needs new rows for `subject_data`, `comp_parsed_data`, `improvement_analysis`

### docs/product/n8n-dependencies.md
- Phase 1 section is marked complete but the "How it works" section needs updating
- Phase 2 items: Photo analysis is still n8n. Comp parser is now webapp.
- Phase 3 items: Project creation is now webapp (onboarding wizard)
- "Already Removed" table needs: Project creation flows, comp folder list/details, cover photo data, photo export
- Several workflow entries in the "Active n8n Workflows" section are no longer active

### docs/product/architecture-overview.md, data-flow.md, api-reference.md
- New API routes not documented: `/api/projects/discover`, `/api/projects/parse-engagement`, `/api/drive/list`, `/api/comps/parse`
- New components not mentioned: DriveFolderBrowser, DocumentContextPanel, MapBanner, MapLockGuard, CompDetailPage, CompUITemplate, ImprovementAnalysisEditor
- New pages not listed: flood-map, sketches, cost-report, comp detail pages for each type, comp UI pages for land/rentals

## Acceptance Criteria

- [ ] README.md tables are accurate
- [ ] n8n-dependencies.md reflects current state (which are removed, which remain)
- [ ] New API routes are documented
- [ ] New pages/components are mentioned
