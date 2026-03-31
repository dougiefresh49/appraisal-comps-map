# 032: Past Report Vectorization and Comp Reuse

**Priority:** Medium
**Complexity:** Medium
**Dependencies:** None (uses existing pgvector + tables). Layer C benefits from 027 (parcel tables).

## Problem

Users want to reuse narrative patterns from past reports (RAG-style) and pull comps from prior engagements into a new project. Supabase Vector Buckets are optional paid scale; **pgvector** is already enabled with `report_sections` embeddings and backfill API patterns.

## Implementation (Three Layers)

### Layer A -- Narrative sections from PDFs (already works)

- Run the backfill endpoint for all past reports in `docs/past-reports/` to extract sections into `report_sections` (project_id = null for orphan/reference sections).
- The PDFs are sufficient for narrative extraction -- Gemini multimodal handles PDF directly. No need for Google Doc or markdown conversion.
- If PDFs are too large for the Gemini context window, the user has an **iLovePDF API key** available for compression, or can compress via Raycast manually.
- Future RAG chat stays out of scope for this issue; foundation remains `knowledge_base` + `report_sections` + `project_documents` + existing `search_similar_*` RPCs.

### Layer B -- Comp data extraction from PDFs

- Parse the comp data tables from past report PDFs using Gemini (the comp summary tables, individual comp details, adjustment grids are all in the PDF).
- Store extracted comp data in `comp_parsed_data` with a reference project (or a special "reference library" project).
- This enables cross-project comp search by address, APN, or other fields.

### Layer C -- Spreadsheet data import from old projects

- For richer comp records, import the actual spreadsheet data from old Google Sheets (CSV exports of specific tabs: `land comps`, `sale comps`, `rental comps`, `comp-parcels`, `comp-parcel-improvements`).
- This gives exact numbers, adjustment values, and formula-derived fields that may not be perfectly extracted from PDF.
- User provides CSV exports or Google Sheet file IDs; a bulk import endpoint processes them into `comp_parsed_data` + normalized parcel tables (027).

### Comp reuse flow

- When adding a comp, show a "Search Past Comps" option in `CompAddFlow` that queries `comp_parsed_data` across all projects by address, APN, or similarity. On match, offer to clone into current project.

## Affected Files

- `src/components/CompAddFlow.tsx` -- "Search Past Comps" entry point + results UI
- API routes or server actions for cross-project comp search (new or extended)
- New: bulk import endpoint for CSV/spreadsheet data (Layer C)
- Reference / ops: `docs/past-reports/`, `/api/seed/backfill-reports` (or successor)

## Acceptance Criteria

- [ ] All past reports in `docs/past-reports/` backfilled into `report_sections` with embeddings (Layer A).
- [ ] Comp data extracted from at least one past report PDF and stored in `comp_parsed_data` (Layer B).
- [ ] CSV or spreadsheet import path functional for old project data (Layer C).
- [ ] Comp add flow exposes search by address and APN (minimum); similarity search optional if embedding pipeline for comps exists.
- [ ] Cloning creates comparable + `comp_parsed_data` without duplicating Drive assets unless intended.
- [ ] No new mandatory paid Vector Bucket dependency.
