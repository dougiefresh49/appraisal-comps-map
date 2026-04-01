# Product Documentation

Documentation mapping how the Appraisal Comps Maps webapp works — data flows, service integrations, database schema, and API routes.

## Documents

| Document | Description |
|----------|-------------|
| [Architecture Overview](./architecture-overview.md) | Tech stack, system diagram, service integration map, routing structure, auth flow |
| [Data Flow](./data-flow.md) | Per-feature sequence diagrams showing how data moves through the system |
| [Database Schema](./database-schema.md) | Full Supabase schema — all tables, columns, relationships, RLS, triggers, vector search |
| [API Reference](./api-reference.md) | Every API route — parameters, return values, external service calls |
| [n8n Dependencies](./n8n-dependencies.md) | Which features still depend on n8n, replacement difficulty, phased removal plan |

## Quick Reference

### Where is data stored?

| Data | Store | Access Pattern |
|------|-------|---------------|
| Project metadata, folder IDs, spreadsheet link | Supabase `projects` | `useProject` hook (browser) |
| Subject property data (core, taxes, parcels, improvements, `improvement_analysis` JSONB, FEMA, etc.) | Supabase `subject_data` + Realtime | `useSubjectData` hook (browser) |
| Comparables | Supabase `comparables` | `useProject` hook (browser) |
| Parsed comp payloads from AI (`raw_data` JSONB) | Supabase `comp_parsed_data` + Realtime | `useCompParsedData` hook (browser) |
| Map state (zoom, center, drawings) | Supabase `maps` | `useProject` hook (browser) |
| Map markers (comp positions) | Supabase `map_markers` | `useProject` hook (browser) |
| Page edit locks | Supabase `page_locks` + Realtime | `usePresence` hook (browser) |
| Subject photo analysis | Supabase `photo_analyses` + Realtime | `useProjectPhotos` hook (browser) |
| Report section content | Supabase `report_sections` + Realtime | `useReportSection` hook (browser) |
| Uploaded documents + AI extraction | Supabase `project_documents` + Realtime | `DocumentManager` component (browser) |
| Document → section / comp context filter | Supabase `project_documents.section_tag` | `DocumentContextPanel`, document APIs |
| AI knowledge base | Supabase `knowledge_base` | Server-side prompt builder |
| Comp adjustments / sheet-backed fields (legacy) | Google Spreadsheet | `POST /api/comps-data` via n8n (UI refresh largely unused) |
| Subject photos (files) | Google Drive | Drive API (user OAuth); analysis path still via n8n |
| input.json (for Google Docs) | Google Drive | `exportInputJson` → Drive API (user OAuth) |

### What calls n8n vs what's direct?

| Direct (no n8n) | Still uses n8n |
|-----------------|---------------|
| Auth (Supabase) | Photo analysis (`/subject-photos-analyze`) |
| New project wizard — project root picker (`GET /api/projects/list-drive-roots`), discovery, Drive listing, engagement/flood parse, Supabase (`/api/projects/*`, `/api/drive/list`, `project-discovery.ts`) | Comp data refresh (`POST /api/comps-data` → `/comps-data`) |
| Photo export / `input.json` (Drive API) | |
| Comp parsing (`POST /api/comps/parse`, Gemini + Drive) | Comp exists check (`POST /api/comps-exists` → `/comps-exists`) |
| Comp folder list & details (Drive API) | |
| Cover photo data (`POST /api/cover-data`, Drive + sharp) | |
| All map interactions (Supabase) | |
| Report generation (Gemini + Supabase) | |
| Document processing (Gemini + Supabase) | |
| Realtime collaboration (Supabase) | |
| Seed/backfill tools (local + Gemini) | |

_Last updated: April 2026_
