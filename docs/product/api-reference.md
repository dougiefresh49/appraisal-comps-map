# API Route Reference

All API routes live under `src/app/api/`. Unless noted, handlers expect an authenticated Supabase session (middleware).

---

## Projects

### `POST /api/projects/discover`

Walks the selected Drive project folder to populate `folder_structure`, resolve spreadsheet candidates, and persist discovery results on the project row.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | Yes | Supabase project UUID |
| `projectFolderId` | string | Yes | Root Drive folder for the appraisal job |

**External calls:** Google Drive API (`project-discovery.ts`), Supabase update

### `POST /api/projects/parse-engagement`

Parses an engagement letter from an uploaded file or a Drive `fileId`.

**Multipart:** `file` (PDF, etc.)  
**JSON:** `{ fileId }` — requires Drive OAuth

**External calls:** Drive (if `fileId`), `engagement-parser.ts` / Gemini

### `POST /api/projects/parse-flood-map`

Extracts flood map fields from a Drive file via Gemini.

| Field | Type | Required |
|-------|------|----------|
| `fileId` | string | Yes |

**External calls:** Drive download, Gemini (`document-prompts` + `gemini.ts`)

### `POST /api/projects/select-spreadsheet`

Saves the chosen appraisal spreadsheet ID on the project.

| Field | Type | Required |
|-------|------|----------|
| `projectId` | string | Yes |
| `spreadsheetId` | string | Yes |

**External calls:** Supabase only

### `GET /api/projects/list-drive-roots`

Lists **immediate child folders** of the Drive parent configured for appraisal project roots (new-project wizard picker).

**Query / body:** None.

**Returns:** `{ projects: { id: string; name: string }[] }` — sorted by folder name.

**Configuration:** Server env `GOOGLE_DRIVE_APPRAISAL_PROJECTS_PARENT_FOLDER_ID`. If unset, responds `503` with an error message.

**External calls:** Google Drive API (`listFolderChildren` with user OAuth)

**Caller:** `useProjectsList()` on `/projects/new`.

---

## Drive

### `POST /api/drive/list`

Lists children of a Drive folder (optional folders-only or files-only).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `folderId` | string | Yes | Folder to list |
| `foldersOnly` | boolean | No | Restrict to folders |
| `filesOnly` | boolean | No | Restrict to files |

**Returns:** `{ files: DriveFile[] }`

**External calls:** Google Drive API (`listFolderChildren`)

---

## Comparables

### `POST /api/comps/parse`

Runs in-app comp parsing: downloads selected files from Drive, calls Gemini, writes `comp_parsed_data`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `compId` | string | Yes | Comparable UUID |
| `projectId` | string | Yes | Project UUID |
| `type` | string | Yes | `land`, `sales`, or `rentals` |
| `fileIds` | string[] | No | Drive file IDs to parse |
| `extraContext` | string | No | Extra prompt context |

**External calls:** Drive API, Gemini (`comp-parser.ts`), Supabase

### `POST /api/comps-folder-list`

Lists comp subfolders under the project’s comps root for a given type.

| Field | Type | Required |
|-------|------|----------|
| `projectFolderId` | string | Yes |
| `type` | string | Yes |

**External calls:** Google Drive API

### `POST /api/comps-folder-details`

Loads metadata (and file listing) for one comp folder.

| Field | Type | Required |
|-------|------|----------|
| `projectFolderId` | string | Yes |
| `folderId` | string | Yes |
| `type` | string | Yes |

**External calls:** Google Drive API

### Spreadsheet-oriented comp routes (removed)

**TODO — coming soon.** Direct Google Sheets integration or a documented replacement for legacy “refresh comps from sheet” / “comp exists in sheet” flows may be added later. Comp data in the app is stored in Supabase (`comparables`, `comp_parsed_data`).

---

## Cover

### `POST /api/cover-data`

Resolves the subject photos folder, finds the cover image (e.g. “Subject Front”), downloads from Drive, resizes with `sharp`, returns base64 JPEG.

| Field | Type | Required |
|-------|------|----------|
| `projectFolderId` | string | Yes |
| `subjectPhotosFolderId` | string | No | If omitted, discovered under subject → photos |

**External calls:** Supabase (`photo_analyses`), Google Drive API, `sharp` (local)

---

## Photos

### `POST /api/photos/process`

Triggers in-app subject photo analysis: resolves the subject photos folder in Drive, queues images for classification/description via Gemini (`photo-analyzer.ts`), and upserts rows in `photo_analyses` (progress visible via Realtime).

| Field | Type | Required |
|-------|------|----------|
| `projectFolderId` | string | Yes |
| `projectId` | string | No |

If `projectId` is omitted, it is resolved from `projects` using `project_folder_id`.

**Returns:** `{ success, totalPhotos?, error? }`

**External calls:** Google Drive API, Gemini (`photo-analyzer.ts`), Supabase

### `POST /api/photos`

Writes `input.json` to the subject photos folder in Drive from current `photo_analyses` rows.

| Field | Type | Required |
|-------|------|----------|
| `projectId` | string | Yes |
| `projectFolderId` | string | Yes |
| `subjectPhotosFolderId` | string | No |

**External calls:** Supabase read, Google Drive API (`exportInputJson`)

---

## Documents

### `GET /api/documents?projectId={id}`

Lists all documents for a project.

**Returns:** `{ documents: ProjectDocument[] }`

### `POST /api/documents`

Add a document (upload or Drive file ID) or reprocess an existing row. Documents can carry a `section_tag` for filtering in `DocumentContextPanel` and related flows.

**FormData (file upload):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | Yes | |
| `documentType` | string | Yes | e.g. `deed`, `flood_map`, `cad`, `zoning_map`, `neighborhood_map`, `location_map`, `engagement`, `other` |
| `documentLabel` | string | No | |
| `sectionTag` | string | No | Stored as `project_documents.section_tag` |
| `file` | File | Yes | |

**JSON (Drive file ID):**

| Field | Type | Required |
|-------|------|----------|
| `projectId` | string | Yes |
| `documentType` | string | Yes |
| `documentLabel` | string | No |
| `sectionTag` | string | No |
| `fileId` | string | Yes |

**JSON (reprocess):**

| Field | Type | Required |
|-------|------|----------|
| `action` | string | Yes | `"reprocess"` |
| `documentId` | string | Yes |

**Returns:** `{ documentId }` or `{ ok, documentId }`

**External calls:** Supabase (insert/update), Gemini (async extraction + embedding), Google Drive (if `fileId` or download path)

---

## Report content

### `POST /api/report-content`

Unified CRUD + AI generation for `report_sections`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `get`, `update`, `generate`, `regenerate` |
| `projectId` | string | Yes | |
| `section` | string | Yes | e.g. `neighborhood`, `zoning` |
| `content` | string | No | For `update` |
| `previousContent` | string | No | For `regenerate` |
| `regenerationContext` | string | No | User hint for `regenerate` |

**External calls:** Supabase, Gemini (`prompt-builder.ts`)

---

## Auth helpers

### `GET /api/auth/drive-status`

Returns whether the session can obtain a Google Drive access token (`getGoogleToken()`).

**Returns:** `{ authenticated: boolean, error?, code? }`

---

## Seed / backfill

### `POST /api/seed/knowledge-base`

Imports knowledge base CSV from the repo into `knowledge_base` with embeddings.

### `POST /api/seed/backfill-reports`

Extracts sections from prior-report PDFs into `report_sections` (`project_id` null).

---

## OAuth callback (app route, not under `/api`)

### `GET /auth/callback`

Supabase Google OAuth exchange; sets session cookies; redirects to `/projects`.

---

## Integration notes

**TODO — coming soon:** Optional Google Sheets read/write or export documentation. Parsing is `POST /api/comps/parse` (not a separate `/api/comps-parser` route).
