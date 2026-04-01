# 032: Past Report Vectorization and Comp Reuse

**Priority:** Medium
**Complexity:** Medium
**Dependencies:** None (uses existing pgvector + tables).

## Problem

Users want to reuse narrative patterns from past reports (RAG-style) and pull comps from prior engagements into a new project. **pgvector** is already enabled with `report_sections` embeddings and backfill API patterns.

## Comp Duplication Strategy

Comps reused across reports are **duplicated per project**, not shared via a join table. Rationale:
- The same property may have updated information between reports
- Each project needs independent `#` numbering, comments, and adjustments
- Historical accuracy: old report data stays frozen
- Simple clone flow: copy `raw_data` from source to new `comparables` + `comp_parsed_data` rows

The search UI shows which projects previously used a comp:
```
2941 Didram Rd, Odessa TX
  Sale Price: $170,000 | Date: Jan 2024 | Land: 2.57 AC
  Used in: 6310 Tashaya Dr (Oct 2025), 210 W 57th St (Jul 2025)
  [Clone to Current Project]
```

## Import Flow

```
1. Create "Reference Library" project row
   └── Returns project_id (UUID)

2. CSV import → comparables + comp_parsed_data + comp_parcels + comp_parcel_improvements

3. For each of the 11 reference projects (from project-folder-ids.md):
   a. Create reference project row (name, project_folder_id, is_reference = true)
   b. PDF backfill → report_sections (narrative extraction via Gemini)
   c. Fire n8n webhook (project_id + project_folder_id) → photo_analyses (fire-and-forget)
```

## Input Data

### Project folder IDs (complete)

11 projects mapped in `docs/past-reports/project-folder-ids.md` with both table and JSON formats. Includes the n8n photo backfill webhook endpoint.

### CSV exports (5 files, ~490 rows total)

All in `docs/report-data-spreadsheet/sheets-exported--csv/`:

| File | Rows | Headers | Links To |
|------|------|---------|----------|
| `report-data  - sale comps.csv` | 75 | `#, Address, Use Type, Grantor, Grantee, Recording, Date of Sale, ...` (65 columns) | `comp_parsed_data.raw_data` |
| `report-data - land comps.csv` | 60 | `#, Address, Use Type, Grantor, Grantee, Recording, ...` (36 columns) | `comp_parsed_data.raw_data` |
| `report-data - comp-parcels.csv` | 141 | `instrumentNumber, APN, APN Link, Location, Legal, Lot #, Size (AC), ...` (17 columns) | `comp_parcels` table |
| `report-data - comp-parcel-improvements.csv` | 210 | `instrumentNumber, APN, Building #, Section #, Year Built, ...` (14 columns) | `comp_parcel_improvements` table |
| `report-data - subject.csv` | 1 | Same as subject sheet | `subject_data.core` (current project only) |

### CSV Column Mapping

**Sale comps / Land comps → `comparables` + `comp_parsed_data`:**
- CSV `#` → `comparables.number`
- CSV `Address` → `comparables.address`
- CSV `Recording` → `comparables.instrument_number`
- CSV comp type inferred from which file (sale comps → `'Sales'`, land comps → `'Land'`)
- **Entire CSV row** → `comp_parsed_data.raw_data` as a JSON object (keys = CSV header names, values = cell values)
- `Use Type` column indicates if the row is `"Sale"`, `"Extra"`, `"Rental"`, or `"Old Report"` -- rows with `"Old Report"` or negative `#` values are from prior reports

**Comp parcels → `comp_parcels` table:**
- CSV headers map 1:1 to table columns (column names match the schema from migration 018)
- `instrumentNumber` links parcels to comps via `comparables.instrument_number`
- `comp_id` resolved by looking up `comparables` WHERE `instrument_number` matches

**Comp parcel improvements → `comp_parcel_improvements` table:**
- CSV headers map 1:1 to table columns
- `instrumentNumber` + `APN` links to the parent `comp_parcels` row
- `parcel_id` resolved by looking up `comp_parcels` WHERE `instrument_number` + `apn` match

### Handling negative `#` values and "Old Report" use type

The CSV contains rows with negative `#` values (e.g., `-1`, `-2`) and `Use Type = "Old Report"`. These are comps from prior reports that are kept in the running spreadsheet for reference. Import them all -- the comp reuse search benefits from having the full history. Assign a positive `number` starting from 1 per reference project during import.

## Implementation

### Layer 0: Create Reference Projects

New migration to add `is_reference` boolean to `projects`:
```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_reference boolean DEFAULT false;
```

Import endpoint creates:
1. One "Reference Library" project (`is_reference = true`) -- holds all CSV-imported comps
2. One reference project per entry in `project-folder-ids.md` -- holds report sections + photos

### Layer A: Narrative sections from PDFs

Update `src/app/api/seed/backfill-reports/route.ts` to accept an optional `project_id` body parameter. When provided, `report_sections` rows get that `project_id` instead of `null`.

For each reference project, call the updated endpoint with the matching PDF file and `project_id`.

### Layer C: CSV Import

New endpoint `POST /api/seed/import-csv-comps` that:

1. Reads the CSV files from `docs/report-data-spreadsheet/sheets-exported--csv/` using a simple CSV parser (e.g., `papaparse` or manual split -- no heavy dependency needed)
2. For each sale/land comp row:
   - Insert into `comparables`: `{ id: uuid, project_id, type, number, address, instrument_number }`
   - Insert into `comp_parsed_data`: `{ comp_id, project_id, raw_data: {entire CSV row as JSON} }`
3. For each parcel row:
   - Look up `comp_id` from `comparables` WHERE `instrument_number` matches
   - Insert into `comp_parcels`: `{ comp_id, project_id, instrument_number, apn, ... }`
4. For each improvement row:
   - Look up `parcel_id` from `comp_parcels` WHERE `instrument_number` + `apn` match
   - Insert into `comp_parcel_improvements`: `{ parcel_id, comp_id, project_id, ... }`

### Layer D: Fire n8n photo backfill

For each reference project that has a `project_folder_id`, POST to the n8n webhook:
```
POST https://dougiefreshdesigns.app.n8n.cloud/webhook/past-report-photo-backfil
{ "project_folder_id": "...", "project_id": "..." }
```
Fire-and-forget.

### Comp Reuse Search

New API route `POST /api/comps/search`:
```typescript
// Body: { query: string, type?: CompType }
// Searches comp_parsed_data.raw_data->>'Address' ILIKE '%query%'
// OR comp_parsed_data.raw_data->>'APN' ILIKE '%query%'
// Returns: comp data + project name + list of projects using the same address
```

UI in `CompAddFlow.tsx`:
- "Search Past Comps" tab/button alongside the Drive folder picker
- Search input + results list
- Each result shows: address, sale price, date, type, "Used in: Project A, Project B"
- "Clone" button creates new `comparables` + `comp_parsed_data` in current project

## Affected Files

- `docs/past-reports/project-folder-ids.md` -- complete (user filled in 11 projects)
- New migration: add `is_reference` boolean to `projects`
- New: `src/app/api/seed/import-csv-comps/route.ts` -- CSV import endpoint
- New: `src/app/api/seed/import-old-reports/route.ts` -- orchestrates reference project creation + PDF backfill + n8n webhook
- Update: `src/app/api/seed/backfill-reports/route.ts` -- accept `project_id` parameter
- New: `src/app/api/comps/search/route.ts` -- cross-project comp search
- Update: `src/components/CompAddFlow.tsx` -- "Search Past Comps" UI

## Acceptance Criteria

- [ ] `is_reference` column added to `projects` table
- [ ] Reference projects created for all 11 old reports
- [ ] CSV comp data imported into `comparables` + `comp_parsed_data` (75 sales + 60 land comps)
- [ ] CSV parcel data imported into `comp_parcels` (141 rows) + `comp_parcel_improvements` (210 rows)
- [ ] PDF narrative sections backfilled into `report_sections` with per-project `project_id`
- [ ] n8n photo backfill webhook fired for each reference project with `project_folder_id`
- [ ] Cross-project comp search works by address and APN
- [ ] Search results show which projects previously used each comp
- [ ] Cloning creates new comp rows in the current project with copied `raw_data`
- [ ] `pnpm build` passes
