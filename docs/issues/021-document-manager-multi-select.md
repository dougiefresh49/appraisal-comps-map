# 021: Document Manager -- Enable Multi-Select in Drive Browser

**Priority:** Low
**Complexity:** Low
**Dependencies:** None
**Origin:** Remaining item from feedback/07-documents-section.md

## Problem

`DriveFolderBrowser` supports a `multiSelect` prop, but `DocumentManager` does not pass it. Users can only select one file at a time from the Drive browser when adding documents, requiring multiple round trips to add several files from the same folder.

## Expected Behavior

1. `DocumentManager` passes `multiSelect={true}` to `DriveFolderBrowser`
2. User can select multiple files, then click "Add & Process" to queue them all
3. Each selected file creates a separate `project_documents` row and is processed independently
4. Progress is shown per file

## Affected Files

- `src/components/DocumentManager.tsx` -- enable multi-select, handle batch add

## Acceptance Criteria

- [ ] Multiple files can be selected in the Drive browser
- [ ] All selected files are processed when submitted
- [ ] Each file shows independent processing status
