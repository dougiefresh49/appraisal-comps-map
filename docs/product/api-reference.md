# API Route Reference

All API routes live under `src/app/api/`. Unless noted, all require authentication (enforced by middleware).

---

## Report Content

### `POST /api/report-content`

Unified endpoint for report section CRUD and AI generation.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"get"`, `"update"`, `"generate"`, `"regenerate"` |
| `projectId` | string | Yes | Project UUID |
| `section` | string | Yes | Section key (e.g., `neighborhood`, `zoning`) |
| `projectFolderId` | string | No | Drive folder ID (for context) |
| `content` | string | No | Content for `update` action |
| `previousContent` | string | No | For `regenerate` action |
| `regenerationContext` | string | No | Extra user instructions for `regenerate` |

**Returns:** `{ content, exists, version }`

**External calls:** Supabase (read/write), Gemini (for generate/regenerate)

---

## Documents

### `GET /api/documents?projectId={id}`

Lists all documents for a project.

**Returns:** `{ documents: ProjectDocument[] }`

### `POST /api/documents`

Add a document (two content types supported) or reprocess an existing one.

**FormData (file upload):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | Yes | |
| `documentType` | string | Yes | `deed`, `flood_map`, `cad`, `zoning_map`, `neighborhood_map`, `location_map`, `engagement`, `other` |
| `documentLabel` | string | No | User label |
| `file` | File | Yes | The document file |

**JSON (Drive file ID):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | Yes | |
| `documentType` | string | Yes | |
| `documentLabel` | string | No | |
| `fileId` | string | Yes | Google Drive file ID |

**JSON (reprocess):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"reprocess"` |
| `documentId` | string | Yes | Document UUID to reprocess |

**Returns:** `{ documentId }` or `{ ok, documentId }`

**External calls:** Supabase (insert), Gemini (async extraction + embedding), Google Drive (if fileId provided)

---

## Photos

### `POST /api/photos/process`

Triggers the n8n photo analysis workflow.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectFolderId` | string | Yes | Drive folder with subject photos |

**Returns:** `{ total }` — number of photos to be processed

**External calls:** n8n `/subject-photos-analyze`

### `POST /api/photos`

Exports photo labels to Google Drive as `input.json`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | Yes | |
| `projectFolderId` | string | Yes | |

**Returns:** `{ success, count }`

**External calls:** Supabase (read photo_analyses), n8n `/subject-photos-save-input`

---

## Comparables

### `POST /api/comps-data`

Loads comparable data from the Google Spreadsheet via n8n.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectFolderId` | string | Yes | |
| `type` | string | Yes | `land`, `sales`, `rentals` |

**Returns:** `{ comps, imageMap }`

**External calls:** n8n `/comps-data`

### `POST /api/comps-folder-list`

Lists comp subfolders in Drive.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectFolderId` | string | Yes | |
| `type` | string | Yes | |

**Returns:** `{ folders: [{ folderId, name, isParsed }] }`

**External calls:** n8n `/comps-folder-list`

### `POST /api/comps-folder-details`

Gets details for a specific comp folder.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectFolderId` | string | Yes | |
| `folderId` | string | Yes | |
| `type` | string | Yes | |

**External calls:** n8n `/comps-folder-details`

### `POST /api/comps-parser`

Parses comp folder contents using AI via n8n.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | |
| `folderId` | string | Yes | |
| `projectFolderId` | string | Yes | |
| `extraContext` | string | No | |
| `prevParsedContent` | string | No | |

**External calls:** n8n `/comps-parser`

### `POST /api/comps-exists`

Checks if a comp already exists in the spreadsheet.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reportFolderId` | string | Yes | |
| `type` | string | Yes | |
| `query` | string | Yes | |
| `instrumentNumber` | string | No | |
| `apn` | string | No | |

**External calls:** n8n `/comps-exists`

---

## Seed / Backfill

### `POST /api/seed/knowledge-base`

One-time import of the AI knowledge base CSV into Supabase.

**Body:** None required

**Behavior:** Reads `docs/n8n-gemini-prompts/AI Appraiser Knowledge Base - Sheet1.csv`, parses rows, generates embeddings, inserts into `knowledge_base` table. Skips if table already has data.

**External calls:** Local filesystem, Supabase, Gemini (embeddings)

### `POST /api/seed/backfill-reports`

One-time extraction of report sections from prior report PDFs.

**Body:** None required

**Behavior:** Reads PDFs from `docs/prior-reports/`, uses Gemini multimodal to extract sections, generates embeddings, inserts into `report_sections` with `project_id = null`. Skips if orphan sections already exist.

**External calls:** Local filesystem, Supabase, Gemini (extraction + embeddings)

---

## Auth

### `GET /auth/callback`

OAuth callback handler. Exchanges the authorization code for a Supabase session, sets cookies, and redirects to `/projects`.

**External calls:** Supabase Auth

---

## n8n Dependency Summary

| Route | n8n Endpoint | Can Be Replaced? |
|-------|-------------|-----------------|
| `/api/photos/process` | `/subject-photos-analyze` | Yes (would need Drive access + Gemini) |
| `/api/photos` | `/subject-photos-save-input` | Yes (would need Drive write access) |
| `/api/comps-data` | `/comps-data` | Harder (reads from Spreadsheet) |
| `/api/comps-folder-list` | `/comps-folder-list` | Harder (Drive folder operations) |
| `/api/comps-folder-details` | `/comps-folder-details` | Harder (Drive operations) |
| `/api/comps-parser` | `/comps-parser` | Harder (Drive + AI parsing) |
| `/api/comps-exists` | `/comps-exists` | Harder (Spreadsheet query) |
| Cover page | `/subject-photo-data` | Yes (Drive metadata fetch) |
| New project | `/projects-new`, `/project-data` | Harder (Drive + Spreadsheet) |
