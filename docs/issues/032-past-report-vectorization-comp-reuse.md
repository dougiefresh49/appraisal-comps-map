# 032: Past Report Vectorization and Comp Reuse

**Priority:** Medium
**Complexity:** Medium
**Dependencies:** None (uses existing pgvector + tables). Layer C benefits from 027 (parcel tables).

## Problem

Users want to reuse narrative patterns from past reports (RAG-style) and pull comps from prior engagements into a new project. Supabase Vector Buckets are optional paid scale; **pgvector** is already enabled with `report_sections` embeddings and backfill API patterns.

## Comp Duplication Strategy

Comps reused across reports are **duplicated per project**, not shared via a join table. Rationale:
- The same property may have updated information between reports (new details found, corrected data, different comments)
- Each project needs independent `#` numbering, comments, and adjustments
- Historical accuracy: old report data stays frozen even if the comp is updated in a new report
- Simple clone flow: copy `raw_data` from source to new `comparables` + `comp_parsed_data` rows
- The "Search Past Comps" flow prevents re-parsing by cloning existing data instead of re-running Gemini

The search UI shows which projects previously used a comp:
```
2941 Didram Rd, Odessa TX
  Sale Price: $170,000 | Date: Jan 2024 | Land: 2.57 AC
  Used in: 6310 Tashaya Dr (Oct 2025), 210 W 57th St (Jul 2025)
  [Clone to Current Project]
```

## Import Flow

For each old report, the import creates a **reference project** in Supabase first, then kicks off parallel data population:

```
1. Create reference project row (name, project_folder_id, flagged as reference)
   └── Returns project_id (UUID)

2. In parallel (all use the project_id from step 1):
   a. PDF backfill → report_sections (narrative extraction via Gemini)
   b. CSV import → comp_parsed_data, comp_parcels, comp_parcel_improvements
   c. Fire n8n webhook (project_id + project_folder_id) → photo_analyses (fire-and-forget)
```

## Input Data

### Project folder IDs

The user will provide a mapping of past reports to their Google Drive folder IDs in `docs/past-reports/project-folder-ids.md`. The import script reads this file to create reference projects and fire n8n webhooks. Format:

```markdown
| Report PDF | Project Name | Google Drive Folder ID |
|------------|-------------|----------------------|
| 6310 Tashaya Dr Odessa Report.pdf | 6310 Tashaya Dr Odessa | {folder_id} |
| 210 W 57th Odessa Report.pdf | 210 W 57th Odessa | {folder_id} |
| 103 East Ave Kermit Appraisal Report.pdf | 103 East Ave Kermit | {folder_id} |
| Apprisal Report for 1227 S Murphy.pdf | 1227 S Murphy | {folder_id} |
```

### CSV exports (current spreadsheet only)

CSV files in `docs/report-data-spreadsheet/sheets-exported--csv/` contain comp data from the **current running spreadsheet** (which accumulates comps across reports). These are imported once and associated with whichever reference project they belong to based on the comp's date range or instrument number.

## Implementation (Four Layers)

### Layer 0: Create Reference Projects

- Read `docs/past-reports/project-folder-ids.md` for the mapping
- For each report, insert a `projects` row with:
  - `name`: from the mapping table
  - `project_folder_id`: the Drive folder ID from the mapping
  - `is_reference`: flag to distinguish from active projects (add `boolean DEFAULT false` column to `projects` if not present, or use a convention)
- Returns a `project_id` UUID for each

### Layer A: Narrative sections from PDFs (existing endpoint)

- Run the backfill endpoint for each PDF in `docs/past-reports/` into `report_sections` with the corresponding reference `project_id`
- The PDFs are sufficient -- Gemini multimodal handles PDF directly
- If PDFs are too large for context window, user has an iLovePDF API key for compression

### Layer B: Comp data extraction from PDFs (optional)

- Parse comp data tables from past report PDFs using Gemini
- Store in `comp_parsed_data` with the reference `project_id`
- Useful as a fallback when CSV data is incomplete for older reports

### Layer C: Spreadsheet data import from CSV exports

- Read CSV files from `docs/report-data-spreadsheet/sheets-exported--csv/`:
  - `report-data  - sale comps.csv` (77 rows)
  - `report-data - comp-parcel-improvements.csv` (212 rows)
  - `report-data - subject.csv`
  - Other comp/parcel CSVs
- For each comp row: create `comparables` + `comp_parsed_data` entries
- Populate `comp_parcels` and `comp_parcel_improvements` from the parcel CSVs
- Comps that appear in multiple reports get **duplicated** -- one `comp_parsed_data` row per project that used them

### Layer D: Fire n8n photo backfill webhook

- For each reference project, call the n8n webhook with:
  - `project_id`: the UUID from Layer 0
  - `project_folder_id`: the Drive folder ID from `project-folder-ids.md`
- **Fire-and-forget** -- don't wait for completion
- n8n downloads photos from Drive, runs classify/label/describe, inserts into `photo_analyses` with the `project_id`
- The webapp's Realtime subscription on `photo_analyses` will show progress as rows appear

### Comp Reuse Search

- "Search Past Comps" button in `CompAddFlow.tsx`
- Queries `comp_parsed_data` across all projects (including reference projects) by address (ILIKE) or APN
- Shows matches with key fields (address, sale price, date, type, source project name)
- Shows "Used in: Project A, Project B" for comps that appear in multiple projects
- On selection, **clones** into current project (new `comparables` + `comp_parsed_data` rows with copied `raw_data`)

## Affected Files

- New: `docs/past-reports/project-folder-ids.md` -- user-provided mapping (manual)
- New: `src/app/api/seed/import-old-reports/route.ts` -- orchestrates the full import
- Existing: `src/app/api/seed/backfill-reports/route.ts` -- update to accept project_id parameter
- New: CSV parser utility for reading the exported spreadsheet data
- `src/components/CompAddFlow.tsx` -- "Search Past Comps" UI
- New API route or server action for cross-project comp search
- Possibly: migration to add `is_reference` boolean to `projects`

## Acceptance Criteria

- [ ] `docs/past-reports/project-folder-ids.md` exists with the mapping (user fills in folder IDs)
- [ ] Reference project created for each old report with a valid project_id and is_reference flag
- [ ] PDF narrative sections backfilled into `report_sections` with project_id
- [ ] CSV comp data imported into `comp_parsed_data` + `comp_parcels` + `comp_parcel_improvements`
- [ ] Comps used in multiple reports are duplicated per project (not shared)
- [ ] n8n webhook fired with project_id + project_folder_id for photo backfill (fire-and-forget)
- [ ] Comp add flow has "Search Past Comps" with address/APN search across all projects
- [ ] Search results show which projects previously used each comp
- [ ] Cloning creates new comp rows in the current project with copied data
- [ ] No new mandatory paid dependencies
