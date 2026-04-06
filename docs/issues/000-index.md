# Open Issues Index

## Completed Issues (removed)

All issues 001-038 have been resolved and merged. All issue documents deleted.

## Open Code Issues

None.

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
