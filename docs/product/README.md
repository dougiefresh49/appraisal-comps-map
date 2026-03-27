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
| Project metadata, subject info | Supabase `projects` | `useProject` hook (browser) |
| Comparables | Supabase `comparables` | `useProject` hook (browser) |
| Map state (zoom, center, drawings) | Supabase `maps` | `useProject` hook (browser) |
| Map markers (comp positions) | Supabase `map_markers` | `useProject` hook (browser) |
| Page edit locks | Supabase `page_locks` + Realtime | `usePresence` hook (browser) |
| Subject photo analysis | Supabase `photo_analyses` + Realtime | `useProjectPhotos` hook (browser) |
| Report section content | Supabase `report_sections` + Realtime | `useReportSection` hook (browser) |
| Uploaded documents + AI extraction | Supabase `project_documents` + Realtime | `DocumentManager` component (browser) |
| AI knowledge base | Supabase `knowledge_base` | Server-side prompt builder |
| Comp raw data + adjustments | Google Spreadsheet | n8n webhooks → API routes |
| Subject photos (files) | Google Drive | n8n reads, app generates preview URLs |
| input.json (for Google Docs) | Google Drive | App exports via n8n |

### What calls n8n vs what's direct?

| Direct (no n8n) | Still uses n8n |
|-----------------|---------------|
| Auth (Supabase) | Project creation (Drive + Sheets) |
| All map interactions (Supabase) | Photo analysis (Drive → Gemini) |
| Report generation (Gemini + Supabase) | Photo export (Drive write) |
| Document processing (Gemini + Supabase) | Comp data refresh (Sheets) |
| Realtime collaboration (Supabase) | Comp parser (Drive + AI) |
| Seed/backfill tools (local + Gemini) | Comp folder browsing (Drive) |
| | Cover photo data (Drive) |

_Last updated: December 2025_
