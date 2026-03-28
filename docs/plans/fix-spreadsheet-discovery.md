# Plan: Fix Spreadsheet Discovery in Onboarding Flow

**Branch:** `feat/photo-analysis`
**Issue:** Spreadsheet is not found during the folder structure discovery step of the onboarding wizard.

---

## Root Cause Analysis

The current `findSpreadsheetId` function in `src/lib/project-discovery.ts` has two problems:

1. **Wrong search location:** It searches the **project root folder** for any Google Sheet. The spreadsheet actually lives inside the **`reports/`** subfolder.
2. **No name filtering:** It matches the first file with `mimeType === "application/vnd.google-apps.spreadsheet"` — no name pattern is applied. The naming convention is `report-data*` (e.g. `report-data - Smith Property`, `report-data - 123 Main St`).

The legacy n8n workflow (`Tep8CtzA1FaIcRBs`) did this correctly: it searched inside the `reports` folder for spreadsheets whose name starts with `"report-data"`.

### Current broken code (`src/lib/project-discovery.ts` lines 87–94):

```typescript
export async function findSpreadsheetId(
  token: string,
  projectFolderId: string,
): Promise<string | null> {
  const files = await listFolderChildren(token, projectFolderId); // BUG: searches root, not reports/
  const sheet = files.find((f) => f.mimeType === SPREADSHEET_MIME); // BUG: no name filter
  return sheet?.id ?? null;
}
```

---

## Fix Plan

### 1. Update `findSpreadsheetId` → `findSpreadsheetCandidates` in `src/lib/project-discovery.ts`

**What changes:**
- Rename `findSpreadsheetId` to `findSpreadsheetCandidates`
- Accept `reportsFolderId` (from the already-discovered folder structure) instead of `projectFolderId`
- Search inside the `reports/` folder for files matching:
  - `mimeType === "application/vnd.google-apps.spreadsheet"`
  - `name` starts with `"report-data"` (case-insensitive)
- Return an **array** of `DriveFile[]` (id, name, mimeType) rather than a single `string | null`
- Keep a fallback: if no matches found in `reports/`, optionally search root for any spreadsheet (preserves backward compat for edge-case folder layouts)

**New signature:**

```typescript
export async function findSpreadsheetCandidates(
  token: string,
  reportsFolderId: string | undefined,
  projectFolderId: string,
): Promise<DriveFile[]> {
  // 1. If reportsFolderId exists, list files in reports/ folder
  // 2. Filter by MIME type = spreadsheet AND name starts with "report-data" (case-insensitive)
  // 3. If matches found, return them
  // 4. Fallback: search project root for any spreadsheet (backward compat)
  // 5. Return empty array if nothing found
}
```

**Files changed:** `src/lib/project-discovery.ts`

---

### 2. Update the discover API route (`src/app/api/projects/discover/route.ts`)

**What changes:**
- Call `discoverFolderStructure` first (to get `reportsFolderId`), then call `findSpreadsheetCandidates` with that ID
- Change the response shape to return `spreadsheetCandidates: DriveFile[]` alongside `spreadsheetId: string | null`
- If exactly one candidate is found, auto-assign `spreadsheetId` and save to DB immediately
- If multiple candidates are found, do NOT save `spreadsheet_id` yet — return the candidates to the client for user selection
- If zero candidates, save `spreadsheet_id` as `null`

**New response shape:**

```typescript
{
  ok: true,
  folderStructure: FolderStructure,
  spreadsheetId: string | null,           // auto-selected if exactly 1 match
  spreadsheetCandidates: DriveFile[],      // all matches (0, 1, or many)
}
```

**Files changed:** `src/app/api/projects/discover/route.ts`

---

### 3. Add a new API route for saving a user-selected spreadsheet

**Why:** When the user selects a spreadsheet from multiple candidates, we need an endpoint to persist their choice.

**New file:** `src/app/api/projects/select-spreadsheet/route.ts`

```typescript
// POST { projectId: string, spreadsheetId: string }
// → Updates projects.spreadsheet_id in Supabase
// → Returns { ok: true }
```

**Files created:** `src/app/api/projects/select-spreadsheet/route.ts`

---

### 4. Update the wizard UI (`src/app/projects/new/page.tsx`)

**What changes:**

#### a) New state variables
- `spreadsheetCandidates: DriveFile[]` — holds all matching sheets from discovery
- Existing `spreadsheetId` state continues to hold the final selected ID

#### b) Discovery step handler (`handleSelectFolder`)
- After discovery response, check the candidates array:
  - **0 matches:** Show `Spreadsheet: —` in the discovery summary (current behavior)
  - **1 match:** Auto-select it, set `spreadsheetId` to that ID (current-like behavior, but now actually finds it)
  - **2+ matches:** Set `spreadsheetCandidates`, leave `spreadsheetId` as `null` until user picks one

#### c) Spreadsheet selection UI (new component within step 3 / engagement step)
- When `spreadsheetCandidates.length > 1 && !spreadsheetId`, show a selection prompt:
  - Title: "Multiple spreadsheets found"
  - Subtitle: "Select the report data spreadsheet for this project"
  - List of candidates with radio buttons showing file name
  - "Confirm" button that:
    1. Sets `spreadsheetId` in state
    2. Calls `POST /api/projects/select-spreadsheet` to persist the choice
- This UI should appear between the discovery summary card and the engagement file list

#### d) Discovery summary update
- Change the `Spreadsheet:` line to show:
  - `"Found"` when spreadsheetId is set
  - `"Select below ↓"` when candidates > 1 and none selected yet
  - `"—"` when no candidates found

**Files changed:** `src/app/projects/new/page.tsx`

---

### 5. Update `drive-api.ts` helper (optional improvement)

**What changes:** Add a `nameContains` or `nameStartsWith` filter option to `listFolderChildren` to perform server-side filtering via the Google Drive API `q` parameter. This is more efficient than client-side filtering for large folders.

**Alternative approach:** Use `findChildByName` with a `contains` query operator. However, the Drive API `name contains 'x'` query is less precise than listing + client-side `startsWith`. Given the `reports/` folder typically has a small number of files, client-side filtering after listing all files is acceptable and simpler.

**Decision:** Start with client-side filtering in `findSpreadsheetCandidates`. Only add server-side filtering if performance is a concern.

**Files changed:** Potentially `src/lib/drive-api.ts` (optional)

---

### 6. Type updates

**What changes:**
- Export `DriveFile` from `drive-api.ts` is already done
- The `FolderStructure` interface does not need changes (spreadsheet is stored separately)
- No changes to `ProjectFolderStructure` in `projectStore.ts`

---

### 7. Database migrations

**Assessment:** No new database migrations are needed. The existing `spreadsheet_id text` column on the `projects` table (added in migration `010_project_enhancements.sql`) is sufficient to store the selected spreadsheet ID.

> **Note:** If any DB migrations become necessary during implementation (e.g., storing spreadsheet name alongside ID, or adding a `spreadsheet_candidates` JSONB column for audit purposes), use the Supabase skills and tools to create and run the migration after it is implemented. Follow the existing migration naming convention (`014_*.sql` as the next sequential number).

---

## Implementation Order

| Step | Description | Complexity | Dependencies |
|------|-------------|------------|--------------|
| 1 | Update `findSpreadsheetCandidates` in `project-discovery.ts` | Low | None |
| 2 | Update discover API route response shape | Low | Step 1 |
| 3 | Create `select-spreadsheet` API route | Low | None |
| 4 | Update wizard UI to handle candidates + selection | Medium | Steps 2, 3 |
| 5 | Test end-to-end | — | Steps 1–4 |

Steps 1–3 can be done in parallel. Step 4 depends on the API changes.

---

## Testing Strategy

1. **Unit test the new `findSpreadsheetCandidates` logic:**
   - Mock `listFolderChildren` to return various combinations (0, 1, 2+ spreadsheets with matching/non-matching names)
   - Verify correct filtering by name pattern and MIME type
   - Verify fallback to root-level search when no reports folder exists

2. **Manual test the wizard flow:**
   - Test with a project folder that has 1 spreadsheet named `report-data - ...` in `/reports` → should auto-detect
   - Test with a project folder that has 2+ matching spreadsheets → should show selection UI
   - Test with a project folder that has no matching spreadsheets → should show `—`
   - Test with a project folder that has a spreadsheet in root but not in reports → verify fallback behavior

3. **Verify the discovery summary card** shows correct status in all scenarios

---

## Risk Assessment

- **Low risk:** The change is localized to 3–4 files and doesn't affect any other features
- **Backward compatible:** The fallback to root-level search preserves behavior for any projects that might have spreadsheets in non-standard locations
- **No migration needed:** Existing DB schema supports the fix
- **n8n parity:** The new logic mirrors exactly what the legacy n8n workflow did, validated against the workflow JSON (`Tep8CtzA1FaIcRBs`)
