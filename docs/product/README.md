# Product Documentation

Documentation mapping how the Appraisal Comps Maps webapp works — data flows, service integrations, database schema, and API routes.

## Documents

| Document | Description |
|----------|-------------|
| [Architecture Overview](./architecture-overview.md) | Tech stack, system diagram, service integration map, routing structure, auth flow |
| [Data Flow](./data-flow.md) | Per-feature sequence diagrams showing how data moves through the system |
| [Database Schema](./database-schema.md) | Full Supabase schema — all tables, columns, relationships, RLS, triggers, vector search |
| [API Reference](./api-reference.md) | Every API route — parameters, return values, external service calls |
| [Integrations & legacy automation](./n8n-dependencies.md) | **TODO — coming soon** (placeholder; app does not call n8n at runtime) |

## Quick Reference

### Where is data stored?

| Data | Store | Access Pattern |
|------|-------|-----------------|
| Project metadata, folder IDs, spreadsheet link | Supabase `projects` | `useProject` hook (browser) |
| Subject property data (core, taxes, parcels, improvements, `improvement_analysis` JSONB, FEMA, etc.) | Supabase `subject_data` + Realtime | `useSubjectData` hook (browser) |
| Comparables | Supabase `comparables` | `useProject` hook (browser) |
| Parsed comp payloads from AI (`raw_data` JSONB) | Supabase `comp_parsed_data` + Realtime | `useCompParsedData` hook (browser) |
| Map state (zoom, center, drawings) | Supabase `maps` | `useProject` hook (browser) |
| Map markers (comp positions) | Supabase `map_markers` | `useProject` hook (browser) |
| Page edit locks | Supabase `page_locks` + Realtime | `usePresence` hook (browser) |
| Subject photo analysis | Supabase `photo_analyses` + Realtime | `useProjectPhotos` hook (browser); analysis runs in-app (Drive + Gemini) |
| Report section content | Supabase `report_sections` + Realtime | `useReportSection` hook (browser) |
| Uploaded documents + AI extraction | Supabase `project_documents` + Realtime | `DocumentManager` component (browser) |
| Document → section / comp context filter | Supabase `project_documents.section_tag` | `DocumentContextPanel`, document APIs |
| AI knowledge base | Supabase `knowledge_base` | Server-side prompt builder |
| Google Spreadsheet (optional / legacy fields) | Google Sheets | **TODO — coming soon** (direct Sheets API or documented export path) |
| Subject photos (files) | Google Drive | Drive API (user OAuth) |
| input.json (for Google Docs) | Google Drive | `exportInputJson` → Drive API (user OAuth) |

### Integration summary

Core flows use **Supabase**, **Google Drive** (OAuth), and **Gemini** from Next.js server routes and server modules. **TODO — coming soon:** expanded notes on spreadsheet alignment and reporting pipelines.

_Last updated: April 2026_
