# 011: Document Side-Panel -- Add View Button to Open in New Tab

**Priority:** Low
**Complexity:** Low
**Dependencies:** None
**Feedback ref:** User testing feedback on docs/feedback/07-documents-section.md

## Problem

In the document context side-panel, there is no way to view the actual document. Users want a quick way to open the original file in Google Drive to review it.

## Expected Behavior

- Each document row in the `DocumentContextPanel` should have a "View" button (eyeball icon)
- Clicking it opens `https://drive.google.com/file/d/${fileId}/view` in a new tab
- Only shown for documents that have a `file_id` (not uploaded files without Drive IDs)

## Affected Files

- `src/components/DocumentContextPanel.tsx` -- add eyeball icon button to `DocumentRow`, opens Drive view URL in new tab

## Acceptance Criteria

- [ ] Each document with a `file_id` has a view button
- [ ] Clicking opens the file in Google Drive in a new tab
- [ ] Documents without `file_id` do not show the button
