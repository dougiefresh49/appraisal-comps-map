# Open Issues Index

## Completed Issues (removed)

All issues 001-038 have been resolved and merged. All issue documents deleted.

## Open Code Issues

### 042 — AI chat cost approach tool cannot read cost report content

**Status:** Open  
**Priority:** Medium  
**Summary:** The `get_cost_report_html` chat tool can fail or return content the model does not effectively use when answering cost-approach questions. Example message for investigation: `chat_messages.id = 480424c2-c43e-4ab7-9db7-e020b80fcf4c`. See [042-ai-chat-cost-report-tool-content.md](./042-ai-chat-cost-report-tool-content.md).

### 041 — Clean up subject parcels/improvements data model

**Status:** Open  
**Priority:** Medium  
**Summary:** `subject_data` stores parcel/improvement info in three places (`core`, `parcels[]`, `improvements[]`). Currently `core` is the source of truth (form + adjustment grid), while the arrays are blank for all past projects. A derived-from-core workaround keeps the tables populated in the UI. Needs a decision on canonical storage. See [041-subject-parcels-improvements-data-model.md](./041-subject-parcels-improvements-data-model.md).

### 040 — Backfill comp_parcels / comp_parcel_improvements from raw_data

**Status:** Deferred (no current consumer)  
**Trigger:** Implement when issue 033 (push to spreadsheet) or any cross-comp aggregation query needs normalized parcel rows.

**Background:**  
The UI currently reads and writes parcel and parcel-improvement data exclusively from `comp_parsed_data.raw_data._parcelData` and `raw_data._parcelImprovements`. The normalized tables `comp_parcels` and `comp_parcel_improvements` exist in the schema (migration `018_comp_parcels.sql`) but are not populated for comps parsed through the webapp — only for comps imported via `POST /api/seed/import-csv-comps`.

**What needs to happen:**  
Write a backfill API route (or one-time migration) that:
1. Iterates all `comp_parsed_data` rows where `raw_data->'_parcelData'` is non-empty.
2. Maps each `ParcelData` entry (spreadsheet-key names) to the snake_case `comp_parcels` columns, upserts on `(comp_id, apn)` or instrument number.
3. For each inserted/updated parcel row, maps `_parcelImprovements` entries with matching `instrumentNumber` or `APN` to `comp_parcel_improvements`, upserts on `(parcel_id, building_number, section_number)`.
4. Skips comps that already have up-to-date normalized rows (compare `updated_at`).

**Key reference files:**
- `src/app/api/seed/import-csv-comps/route.ts` — existing importer that does this mapping from CSV; reuse its column-mapping logic
- `src/app/api/seed/backfill-comps/route.ts` — existing cloner; shows the `parcel_id` remapping pattern
- `src/types/comp-data.ts` — `ParcelData` and `ParcelImprovement` interfaces (spreadsheet keys)
- `supabase/migrations/018_comp_parcels.sql` — normalized table schema

**Note:** Until this is done, do not add any direct reads from `comp_parcels` / `comp_parcel_improvements` in the UI — always use `raw_data._parcelData` / `raw_data._parcelImprovements` as the source of truth for comp parcel editing.

**039 (done):** New-project Drive folder list uses `GET /api/projects/list-drive-roots` and env `GOOGLE_DRIVE_APPRAISAL_PROJECTS_PARENT_FOLDER_ID` — see [039-remove-n8n-projects-new-folder-picker.md](./039-remove-n8n-projects-new-folder-picker.md).

## Roadmap status (historical)

Planned features from the Stability and Features Roadmap were implemented:
- Wave 1: Critical bugs (022-025, 034) -- merged
- Wave 2: Data quality (026-029) -- merged
- Wave 3: Features (030-033, 035-038) -- merged
- Pre-existing tracks (017, 018) -- merged

## Remaining Operational Tasks (not code issues)

These are one-time data operations, not code changes:

### 1. Run CSV comp import
Call `POST /api/seed/import-csv-comps` to import the 490 rows from the CSV exports into the Reference Library project. This creates comparables + comp_parsed_data + comp_parcels + comp_parcel_improvements.

### 2. Run old report import orchestrator
Call `POST /api/seed/import-old-reports` to create the 11 reference projects and backfill report sections (prefers markdown under `docs/past-reports/` when present). This:
- Creates 11 reference projects from `docs/past-reports/project-folder-ids.md`
- Calls backfill-reports for each file with the project_id

### 3. Push migration 023 (is_reference column)
The 032-A agent created migration `023_reference_projects.sql`. Verify it was pushed to Supabase. If not: `npx supabase db push`.

### 4. Verify Sheets API push
Test the "Push to Sheet" button on a comp detail page to confirm the Google Sheets write-back works with the new OAuth scope.
