# n8n Dependencies — Current State

This document tracks which parts of the app still depend on n8n and what it would take to remove each dependency.

## Overview

n8n remains a **narrow** middleware bridge for a few workflows. The webapp calls n8n via POST to webhook URLs; most Drive, Sheets-adjacent, and AI work now runs in Next.js with the user’s Google OAuth token.

**Two base URL env vars are used:**

- `NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL` — Client-side calls (e.g. comps-exists if invoked from the browser)
- `N8N_WEBHOOK_BASE_URL` — Server-side calls (photos process, comps-data, etc.)

---

## Active n8n Workflows

### 1. Project folder list (new-project picker)

| | |
| --- | --- |
| **Triggered by** | `/projects/new` → `useProjectsList()` → `POST {NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL}/projects-new` (client-side) |
| **What n8n does** | Lists candidate project folders in Google Drive for the picker |
| **Replacement difficulty** | Medium — Same parent-folder or shared-drive convention, implemented with Drive API + server route (then drop client n8n URL) |

### 2. Subject Photos — Analyze

| | |
| --- | --- |
| **Triggered by** | `POST /api/photos/process` → n8n `/subject-photos-analyze` |
| **What n8n does** | Downloads photos from Drive → processes → sends to Gemini → writes rows to Supabase `photo_analyses` |
| **Replacement difficulty** | Medium — Replicate with Drive API + Gemini in-app (similar to document extraction patterns) |

### 3. Comp Data Refresh

| | |
| --- | --- |
| **Triggered by** | `POST /api/comps-data` → n8n `/comps-data` |
| **What n8n does** | Reads comp-related data from the project Google Spreadsheet → returns structured JSON (comps + image references) |
| **Replacement difficulty** | Hard — Sheets API + deep knowledge of multi-tab layout; spreadsheet remains a legacy source of truth for some fields |
| **UI note** | Spreadsheet refresh is not surfaced as a primary user action in the current UI; route remains for compatibility |

### 4. Comp Exists Check

| | |
| --- | --- |
| **Triggered by** | `POST /api/comps-exists` → n8n `/comps-exists` |
| **What n8n does** | Queries the Google Spreadsheet to see if a comparable already exists |
| **Replacement difficulty** | Hard — Requires Sheets API queries aligned with current sheet structure |

---

## Removed from n8n (now in-app)

| Feature | Previous n8n flow | Now handled by |
| --- | --- | --- |
| Report content generation | Drive read → Gemini → Drive markdown | `prompt-builder.ts` → Gemini → Supabase `report_sections` |
| Document processing | Planned `/process-document` (never built in n8n) | `documents/actions.ts` → Gemini → Supabase `project_documents` |
| Cover photo data | `/subject-photo-data` | `POST /api/cover-data` → Drive API + `sharp` |
| Comp folder list | `/comps-folder-list` | `POST /api/comps-folder-list` → `drive-api.ts` |
| Comp folder details | `/comps-folder-details` | `POST /api/comps-folder-details` → `drive-api.ts` |
| Comp parser | `/comps-parser` | `POST /api/comps/parse` → `comp-parser.ts` + Gemini |
| Photo export (`input.json`) | `/subject-photos-save-input` | `exportInputJson` in `photos/actions.ts` → `uploadOrUpdateFile` |
| Project spreadsheet bootstrap (old) | `/project-data` | `POST /api/projects/discover` + wizard + `POST /api/projects/select-spreadsheet` |
| Project folder picker list | `/projects-new` (still used by `useProjectsList`) | *Not yet replaced* — still n8n until Drive list moves in-app |

---

## Removal Priority Recommendation

### Phase 1 — Easy wins — **COMPLETE**

Cover photo data, comp folder list/details, and photo export (`input.json`) all use the user’s Google OAuth `provider_token` via `getGoogleToken()` and `src/lib/drive-api.ts`.

### Phase 2 — Medium — **PARTIAL**

1. **Photo analysis** — **Still on n8n.** Replace with Drive download + Gemini in the Next.js server (reuse document/photo patterns).
2. **Comp parser** — **DONE in-app** (`/api/comps/parse`, `comp-parser.ts`).

### Phase 3 — Hard — **OPEN**

1. **Comp data refresh** — Sheets API or migrate comp/adjustment model fully into Supabase.
2. **Comp exists check** — Sheets API aligned with spreadsheet layout.
3. **Project creation** — **Mostly in-app** after folder selection (discover, parse-engagement, parse-flood-map, Drive list). **Exception:** the initial Drive project list for `/projects/new` still uses n8n `/projects-new`.

> **Note:** The Google Spreadsheet is still relevant for legacy comp/adjustment workflows accessed via `comps-data` / `comps-exists`. Fully removing n8n for those paths means a first-class Sheets integration or retiring those routes once data lives only in Supabase.
