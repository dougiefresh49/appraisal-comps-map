# n8n Dependencies — Current State

This document tracks which parts of the app still depend on n8n and what it would take to remove each dependency.

## Overview

n8n acts as a middleware bridge between the webapp and Google Drive/Sheets. The app makes POST requests to n8n webhook URLs, and n8n handles file I/O with Google services.

**Two base URL env vars are used:**

- `NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL` — Used from client-side pages (project creation, comps)
- `N8N_WEBHOOK_BASE_URL` — Used from server-side (photos, report content)

---

## Active n8n Workflows

### 1. Subject Photos — Analyze


|                            |                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Triggered by**           | `POST /api/photos/process` → n8n `/subject-photos-analyze`                                                                                     |
| **What n8n does**          | Downloads all photos from Drive folder → Resizes → Sends to Gemini for classification/labeling → Writes results to Supabase `photo_analyses`   |
| **Replacement difficulty** | Medium — Need Google Drive API access to list/download folder contents, then Gemini processing (already have `extractDocumentContent` pattern) |


### 2. Subject Photos — Save input.json


|                            |                                                                                |
| -------------------------- | ------------------------------------------------------------------------------ |
| **Triggered by**           | ~~`POST /api/photos` → n8n `/subject-photos-save-input`~~ **REMOVED**         |
| **What n8n does**          | ~~Receives photo list JSON → Writes `input.json` file to Google Drive~~        |
| **Now handled by**         | `exportInputJson` in `photos/actions.ts` → `uploadOrUpdateFile` via Drive API |


### 3. Comp Data Refresh


|                            |                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Triggered by**           | `POST /api/comps-data` → n8n `/comps-data`                                                                                    |
| **What n8n does**          | Reads comp data from Google Spreadsheet → Returns structured JSON with comps + image references                               |
| **Replacement difficulty** | Hard — Requires reading from a complex multi-tab spreadsheet. Would need Google Sheets API + understanding of sheet structure |


### 4. Comp Folder List


|                            |                                                                    |
| -------------------------- | ------------------------------------------------------------------ |
| **Triggered by**           | ~~`POST /api/comps-folder-list` → n8n `/comps-folder-list`~~ **REMOVED** |
| **Now handled by**         | `POST /api/comps-folder-list` → Drive API (`listFolderChildren`)   |


### 5. Comp Folder Details


|                            |                                                                        |
| -------------------------- | ---------------------------------------------------------------------- |
| **Triggered by**           | ~~`POST /api/comps-folder-details` → n8n `/comps-folder-details`~~ **REMOVED** |
| **Now handled by**         | `POST /api/comps-folder-details` → Drive API (`getFolderMetadata`, `downloadFile`) |


### 6. Comp Parser


|                            |                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------ |
| **Triggered by**           | `POST /api/comps-parser` → n8n `/comps-parser`                                       |
| **What n8n does**          | Downloads comp folder contents → Sends to AI for structured data extraction          |
| **Replacement difficulty** | Medium — Drive download + Gemini extraction (similar pattern to document processing) |


### 7. Comp Exists Check


|                            |                                                                  |
| -------------------------- | ---------------------------------------------------------------- |
| **Triggered by**           | `POST /api/comps-exists` → n8n `/comps-exists`                   |
| **What n8n does**          | Queries Google Spreadsheet to check if a comp already exists     |
| **Replacement difficulty** | Hard — Requires Sheets API access to query specific cells/ranges |


### 8. Cover Photo Data


|                            |                                                                       |
| -------------------------- | --------------------------------------------------------------------- |
| **Triggered by**           | ~~Cover page client → n8n `/subject-photo-data`~~ **REMOVED**        |
| **Now handled by**         | `POST /api/cover-data` → Drive API (user OAuth) + `sharp` resize     |


### 9. Project List / Creation


|                            |                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| **Triggered by**           | `/projects/new` page → n8n `/projects-new` and `/project-data`                                 |
| **What n8n does**          | Lists Drive project folders, reads project spreadsheet data                                    |
| **Replacement difficulty** | Hard — Requires Drive listing + Spreadsheet reading + understanding project folder conventions |


---

## Already Removed from n8n


| Feature                   | Previous n8n Flow                                      | Now Handled By                                                 |
| ------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| Report content generation | n8n read Drive files → Gemini → save to Drive markdown | `prompt-builder.ts` → Gemini → Supabase `report_sections`      |
| Document processing       | n8n planned `/process-document` (never built)          | `documents/actions.ts` → Gemini → Supabase `project_documents` |
| Cover photo data          | Cover page client → n8n `/subject-photo-data`          | `POST /api/cover-data` → Drive API (user OAuth) + sharp resize |
| Comp folder list          | `POST /api/comps-folder-list` → n8n `/comps-folder-list` | `POST /api/comps-folder-list` → Drive API (user OAuth)       |
| Comp folder details       | `POST /api/comps-folder-details` → n8n `/comps-folder-details` | `POST /api/comps-folder-details` → Drive API (user OAuth) |
| Photo export (input.json) | `POST /api/photos` → n8n `/subject-photos-save-input`  | `exportInputJson` → Drive API (user OAuth) `uploadOrUpdateFile` |


---

## Removal Priority Recommendation

### Phase 1 — Easy wins ✅ COMPLETE

1. **Cover photo data** — Replaced by `POST /api/cover-data` using Drive API + sharp
2. **Comp folder list/details** — Replaced by `comps-folder-list` and `comps-folder-details` using Drive API
3. **Photo export (input.json)** — Replaced by `exportInputJson` using `uploadOrUpdateFile`

**How it works:** All Phase 1 replacements use the user's Google OAuth `provider_token` from their Supabase session. This is obtained via `getGoogleToken()` in `src/utils/supabase/server.ts` and passed as a Bearer token to Drive API calls in `src/lib/drive-api.ts`. Users must re-login once to grant the added Drive scopes.

### Phase 2 — Medium (reuse existing patterns)

1. **Photo analysis** — Drive folder download + Gemini (replicate document processing pattern)
2. **Comp parser** — Drive download + Gemini extraction

### Phase 3 — Hard (requires Spreadsheet integration)

1. **Comp data refresh** — Need Sheets API, complex spreadsheet structure
2. **Comp exists check** — Need Sheets API
3. **Project creation** — Need Drive + Sheets API, understand project conventions

> **Note:** Phase 3 items are harder because the Google Spreadsheet is the source of truth for comp data and adjustments. Replacing n8n for these would essentially mean building a Sheets API integration or migrating the spreadsheet data model into the app itself.

