# 003: Comp Detail Page -- Empty State Improvements

**Priority:** High
**Complexity:** Medium
**Dependencies:** 001 (comp add flow provides the folderId)
**Feedback ref:** docs/feedback/05-comp-sections.md section 2

## Problem

When navigating to a comp detail page for a newly added comp (e.g., "SALES COMP #1 -- --"), the page shows "No parsed data for this comp yet" with a "Parse Files" button. The header shows dashes because there is no address or number data yet. The "Parse Files" button opens the CompAddFlow but the user has already added the comp -- they should just be able to select files and parse.

## Expected Behavior

1. If the comp has a `folderId` (set during the add flow from issue 001), the detail page should immediately show the files in that folder and allow the user to select which to parse
2. The header should show the comp folder name as a fallback when address is not yet available: e.g., "SALES COMP #1 -- (Processing...)" or "SALES COMP #1 -- Comp Folder Name"
3. After parsing completes (Realtime update), the page should automatically populate with the parsed data
4. The "Parse Files" button in the empty state should be replaced with an inline file selector that shows the files in the comp's Drive folder

## Affected Files

- `src/components/CompDetailPage.tsx` -- improve empty state, show folder name as fallback, auto-show file selector when folderId exists
- `src/components/CompAddFlow.tsx` -- may need to support a "files only" mode where the folder is already known

## Acceptance Criteria

- [ ] Comp header shows folder name when address is not available
- [ ] If comp has folderId, show files from that folder directly (no need to pick folder again)
- [ ] After parsing, fields auto-populate via Realtime subscription
- [ ] Parse progress is visible (status badge changes from "processing" to "parsed")
