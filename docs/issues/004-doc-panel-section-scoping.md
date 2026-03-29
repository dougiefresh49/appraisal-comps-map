# 004: Document Side-Panel -- Scope to Current Section + Inline Add

**Priority:** High
**Complexity:** Medium
**Dependencies:** None
**Feedback ref:** docs/feedback/05-comp-sections.md, docs/feedback/06-analysis-section.md

## Problem

Two issues with the DocumentContextPanel:

1. **Scoping**: On a comp detail page, the "Docs" panel shows ALL project documents instead of only documents related to that specific comp. The panel should be section-aware -- on a sales comp detail page it should show documents tagged to that specific comp, on the ownership page it should show deed records, etc.

2. **Inline Add**: The "Add Document" button at the bottom of the panel navigates to the `/documents` page. This breaks the user's context. Instead, clicking "Add Document" should open a Drive folder browser inline within the panel, scoped to the relevant folder (e.g., the comp's folder in Drive for comp detail, the subject folder for subject pages).

## Expected Behavior

### Scoping
- On comp detail pages: show only documents where `document_label` or a new `section_tag` field matches the comp (e.g., "sales-comp-1")
- On analysis pages: show documents matching the `SECTION_DOCUMENT_MAP` types (already works for top-level types)
- The "Other Project Documents" section can still show everything else

### Inline Add
- "Add Document" opens a `DriveFolderBrowser` within the panel (not a new page)
- The browser is pre-navigated to the relevant folder:
  - Comp detail: comp's `folderId` in Drive
  - Subject pages: `folder_structure.subjectFolderId`
  - Analysis pages: `folder_structure.reportMapsFolderId` or `subjectFolderId`
- Selecting a file triggers processing inline (shows progress in the panel)

## Affected Files

- `src/components/DocumentContextPanel.tsx` -- add optional `compFolderId` prop, add inline DriveFolderBrowser for "Add Document", filter by section/comp
- May need a new `section_tag` column on `project_documents` or use existing `document_label` for filtering

## Acceptance Criteria

- [ ] Panel on comp detail shows only comp-specific documents
- [ ] "Add Document" opens a Drive browser inline in the panel
- [ ] Drive browser is pre-navigated to the relevant folder
- [ ] File selection triggers processing without leaving the panel
