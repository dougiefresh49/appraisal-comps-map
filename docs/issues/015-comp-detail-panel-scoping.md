# 015: Comp Detail -- Document Panel Scoping + Auto-Tagging

**Priority:** High
**Complexity:** Low
**Dependencies:** None
**Origin:** Remaining items from issues 003, 004, 010

## Problem

`CompDetailPage` renders `DocumentContextPanel` with only `sectionKey="comp-detail"` and does not pass `compFolderId` or `sectionTag`. This causes three failures:

1. **Panel shows all project documents** instead of only documents relevant to the specific comp (because `sectionKeyToTag("comp-detail")` returns `null` and `SECTION_DOCUMENT_MAP["comp-detail"]` is empty).
2. **Inline "Add Document" starts at the subject folder** instead of the comp's Drive folder (because `compFolderId` is not passed, so `folderIdForSection` falls back to `subjectFolderId`).
3. **Documents added from a comp detail page are not auto-tagged** with a comp-specific tag (e.g., `sales-comp-1`), so they cannot be filtered later.

Additionally, the `comparables` table's `parsed_data_status` badge on the comp detail header does not live-update because `useProject` has no Realtime subscription on `comparables`.

## Expected Behavior

1. `CompDetailPage` passes `compFolderId={comp.folderId}` and `sectionTag={compType}-comp-{compNumber}` to `DocumentContextPanel`
2. Panel filters documents by that `sectionTag`, showing comp-specific docs prominently
3. Inline "Add Document" opens `DriveFolderBrowser` rooted at the comp's Drive folder
4. New documents added from the panel are automatically tagged with the comp-specific tag
5. Parse status badge updates when `parsed_data_status` changes (either via Realtime on `comparables` or by refreshing after parse completes)

## Affected Files

- `src/components/CompDetailPage.tsx` -- pass `compFolderId` and `sectionTag` props
- `src/components/DocumentContextPanel.tsx` -- ensure `sectionKeyToTag` handles comp-specific keys or uses the passed `sectionTag` directly

## Acceptance Criteria

- [ ] Panel on comp detail shows only comp-specific documents
- [ ] Inline add browser starts at the comp's Drive folder
- [ ] Documents added from comp detail are auto-tagged (e.g., `sales-comp-1`)
- [ ] Parse status badge reflects current state after parsing completes
