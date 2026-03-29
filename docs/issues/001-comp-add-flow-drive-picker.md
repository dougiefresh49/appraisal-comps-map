# 001: Comp Add Flow -- Drive Folder Picker Instead of Manual Entry

**Priority:** High
**Complexity:** Medium
**Dependencies:** None
**Feedback ref:** docs/feedback/05-comp-sections.md section 1

## Problem

When clicking "+ Add Comp" on the comparables page, the user is expected to manually type in comp data (address, APN, etc.). This is not the intended flow. The user wants to select a comp folder from Google Drive, choose which documents to parse, and have the comp data auto-populated from AI extraction.

Currently the "+ Add Comp" button creates an empty comparable row with blank fields. The comp detail page has a "Parse Files" button but it is disconnected from the add flow.

## Expected Behavior

1. User clicks "+ Add Comp" on the comps list page
2. A dialog/modal opens showing the comp subfolders in Google Drive (from `folder_structure.compsFolderIds.{type}`)
3. Folders that already have a matching comparable in the database are grayed out or marked as "already added"
4. User selects a folder, then selects which files within that folder to process
5. Clicking "Submit" creates the comparable row in Supabase (with the `folderId` set), sets `parsed_data_status` to `processing`, kicks off the parse via `POST /api/comps/parse`, and redirects to the comp detail page
6. Clicking "Cancel" returns to the comps list with no changes

## Affected Files

- `src/components/ComparablesPageContent.tsx` -- replace `handleAddComparable` to open the dialog instead of creating an empty row
- `src/components/CompAddFlow.tsx` -- this component already exists and has the folder selection + file selection flow; wire it up as a modal triggered from the comp list page
- `src/components/ComparablesList.tsx` -- remove the existing "+ Add {type}" button at the bottom or merge with the header button

## Acceptance Criteria

- [ ] "+ Add Comp" opens a Drive folder picker dialog
- [ ] User can select a comp folder and see files inside
- [ ] Submit creates the comp, triggers parsing, and redirects to the detail page
- [ ] Cancel closes the dialog without side effects
- [ ] Folders already in the database are indicated as such
