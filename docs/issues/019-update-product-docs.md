# 019: Update Product Documentation

**Priority:** Low
**Complexity:** Low
**Dependencies:** None
**Origin:** Issue 013 (unchanged -- not yet addressed)

## Problem

The product documentation in `docs/product/` was written before the UX Overhaul and n8n removal work. Key inaccuracies:

### docs/product/README.md
- "What calls n8n vs what's direct?" table lists several items as n8n that are now webapp-direct (project creation, photo export, comp parser, comp folder browsing, cover photo data)
- "Where is data stored?" table missing `subject_data`, `comp_parsed_data`, `improvement_analysis`, `page_locks`

### docs/product/n8n-dependencies.md
- Phase 2/3 items need status updates (comp parser now webapp, project creation now webapp)
- "Already Removed" table needs additions
- Active workflows section has stale entries

### docs/product/architecture-overview.md, data-flow.md, api-reference.md
- Missing new API routes: `/api/projects/discover`, `/api/projects/parse-engagement`, `/api/drive/list`, `/api/comps/parse`
- Missing new components: DriveFolderBrowser, DocumentContextPanel, MapBanner, MapLockGuard, CompDetailPage, CompUITemplate, CompAddFlow
- Missing new pages: flood-map, sketches, cost-report, comp detail pages, comp UI pages

## Acceptance Criteria

- [ ] README.md tables are accurate
- [ ] n8n-dependencies.md reflects current state
- [ ] New API routes documented
- [ ] New pages/components mentioned in architecture docs
