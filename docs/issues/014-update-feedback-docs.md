# 014: Update Feedback Docs to Mark Completed Items

**Priority:** Low
**Complexity:** Low
**Dependencies:** None

## Problem

The feedback documents in `docs/feedback/` were written before the UX Overhaul implementation. Many items have been completed and should be marked as such so future readers know what's done vs what's still open.

## Items to Mark as DONE

### docs/feedback/01-db-bugs.md
- [x] RLS fix applied (migration 009_rls_fix.sql)

### docs/feedback/02-onboarding-flow.md
- [x] Onboarding wizard implemented (project-discovery.ts, engagement-parser.ts, new page)
- [x] Schema changes applied (migration 010, folder_structure + spreadsheet_id)
- [x] API routes created (discover, parse-engagement)
- [x] n8n project creation flow replaced

### docs/feedback/03-subject-section.md
- [x] Section 1: DocumentContextPanel created and integrated on Subject Overview
- [x] Section 2: Analysis pages moved under Subject in sidebar
- [x] Section 3: Flood Map page created with FEMA fields and MapBanner
- [x] Section 4: Building Sketches page created (has bugs: 005, 012)
- [x] Section 5: Cost Report page created (conditional sidebar item)
- [x] Section 6: Improvements page redesigned with new data model (has bugs: 006, 007)
- [ ] Section 7: Photos still n8n-dependent (out of scope for this plan)

### docs/feedback/04-neighborhood-section.md
- [x] Section 1: Neighborhood is standalone sidebar item (not nested group)
- [x] Section 2: MapBanner loads from Drive (when folder_structure exists)
- [x] Section 3: Boundary fields added (N, S, E, W)
- [x] Section 4: Back navigation added to neighborhood-map page

### docs/feedback/05-comp-sections.md
- [x] Comp list redesigned with MapBanner, parsed status badges, Detail links
- [x] Individual comp links in sidebar
- [x] Comp detail pages created for all three types
- [x] Comp UI template pages created for all three types
- [x] MapLockGuard component created (not yet integrated -- see issue 009)
- [ ] Add flow via Drive picker (see issue 001)
- [ ] Read-only map default (see issue 009)

### docs/feedback/06-analysis-section.md
- [x] Moved under Subject sidebar
- [x] DocumentContextPanel toggle added to all pages
- [x] MapBanner on zoning page
- [x] Empty state notes for HBU prerequisites

### docs/feedback/07-documents-section.md
- [x] DriveFolderBrowser integrated in DocumentManager
- [x] UI cleanup (badges, file names, "View in Drive" links, expandable text)
- [ ] Tags/categories filtering (see issue 010)
- [ ] View button in context panel (see issue 011)

## Affected Files

All files in `docs/feedback/` -- add a "Status" section at the top of each file indicating completion state.

## Acceptance Criteria

- [ ] Each feedback doc has a clear status section
- [ ] Completed items are checked off
- [ ] Remaining items reference the corresponding issue number
