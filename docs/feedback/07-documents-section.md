# Documents Section -- Feedback and Feature Requests

**Priority:** Medium
**Current page:** `/project/[projectId]/documents`

## Summary of Issues

The documents page works but requires users to either upload a file or provide a Drive file ID. For most documents, the user knows exactly where the file is in the project's Drive folder structure (because the folder structure is standardized). The UI should support browsing Drive folders directly, with the manual file ID input as a fallback.

---

## 1. Drive Folder Browser

**Problem:** The current "Add Document" form has two options: upload a file or paste a Drive file ID. For standardized document locations (deed records in `subject/`, flood maps in `reports/maps/`, etc.), pasting a file ID is tedious. The user has to go to Google Drive, find the file, copy the ID from the URL, and paste it.

**Feature Request:** Replace the file ID input with a Drive folder browser:

### Primary Mode: Contextual Folder Browser

When adding a document, show a tree/list browser that starts at the project's root folder and lets the user navigate into subfolders. The browser should:

- Show the folder hierarchy with breadcrumb navigation
- Display files with their name, type icon, and last modified date
- Allow the user to click a file to select it
- Support selecting multiple files at once
- Pre-navigate to the relevant folder based on the document type selected:
  - `deed` → `subject/` folder
  - `flood_map` → `reports/maps/` folder
  - `zoning_map` → `reports/maps/` folder
  - `neighborhood_map` → `reports/maps/` folder
  - `cad` → `subject/` folder
  - `engagement` → `engagement-docs/` folder
  - `other` → project root

### Fallback Mode: Manual Input

Keep the file ID input and file upload as alternative options for:
- Documents stored outside the standard folder structure
- Documents not yet in Google Drive
- Quick access when the user already has the file ID copied

### UI Pattern

```
+-----------------------------------------------+
|  Add Document                                  |
|                                                |
|  Document Type: [Deed Record        v]         |
|  Label: [optional label]                       |
|                                                |
|  ┌─ Browse Drive ─────────────────────────┐   |
|  │  📁 331 Angel Trail Odessa 3-17-2025   │   |
|  │    📁 subject/                    >     │   |
|  │    📁 comps/                      >     │   |
|  │    📁 reports/                    >     │   |
|  │    📁 engagement-docs/            >     │   |
|  │    📄 Report Data.gsheet              │   |
|  └─────────────────────────────────────────┘   |
|                                                |
|  ── or ──                                      |
|                                                |
|  [Choose file to upload]                       |
|  [Paste Drive file ID: ____________]           |
|                                                |
|                          [Add & Process]        |
+-----------------------------------------------+
```

### Implementation

- Use `listFolderChildren` from `src/lib/drive-api.ts` to populate each level
- The project's `folder_structure` JSONB (proposed in onboarding flow) provides the starting folder IDs
- The browser component should be reusable -- it will be needed on comp detail pages and analysis pages for selecting documents to process

---

## 2. UI Cleanup

**Problem:** The current documents list is functional but could use visual refinement.

**Feature requests:**
- Show document type as a colored badge (consistent with the category colors used elsewhere)
- Show file name (not just the document type and label)
- Show a thumbnail or icon based on the file type (PDF icon, image icon, etc.)
- Show the extracted text preview (first 200 chars) in an expandable section
- Show structured data as key-value pairs if available
- Add a "View in Drive" link that opens the file in Google Drive
- Processing status should be more prominent: animated spinner while processing, clear success/error states

---

## 3. Document Processing Awareness Across the App

The documents page is currently the only place to manage documents, but document processing status needs to be visible throughout the app. The reusable right-side panel described in `docs/feedback/03-subject-section.md` (section 1) and `docs/feedback/06-analysis-section.md` (section 2) should provide contextual document awareness on every page that uses document context.

The Documents page should remain as the central place to see ALL documents for a project, but individual pages should show the subset of documents relevant to them.
