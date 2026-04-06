# AGENTS.md -- Shared Context for AI Agents

This file provides essential context for any agent working on the Appraisal Comps Maps codebase. Read this before starting any task.

## Project Overview

A Next.js (App Router) webapp for commercial real estate appraisal report preparation. Two users (appraiser + assistant) use it to manage comparables, generate AI-written report sections, organize photos, and create maps -- all backed by Supabase (PostgreSQL + Realtime) with Google Drive as the file storage layer. The app is progressively replacing n8n middleware workflows with direct Drive API + Gemini calls.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack dev) |
| Language | TypeScript (strict) |
| UI | Tailwind CSS, Heroicons, dark-mode-first |
| State (server) | Supabase (PostgreSQL, Realtime, RLS, pgvector) |
| State (client) | React hooks (`useProject`, `useSubjectData`, `useCompParsedData`, etc.) |
| Auth | Supabase Google OAuth (provider_token used for Drive API) |
| AI | Google Gemini 3+ (`@google/genai`) only -- see [Gemini models](#gemini-api-gemini-3-only) |
| File Storage | Google Drive (user's OAuth token, accessed via `src/lib/drive-api.ts`) |
| Maps | Google Maps Platform (`@vis.gl/react-google-maps`) |
| Package Manager | pnpm |

## Key Commands

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build (includes lint + typecheck)
pnpm check        # Lint + typecheck without building
pnpm typecheck    # tsc --noEmit only
npx supabase db push  # Push pending migrations to remote Supabase
```

### Database Migrations

When creating a new migration file in `supabase/migrations/`, push it with:

```bash
npx supabase db push
```

**IMPORTANT -- Cloud agents:** The Supabase CLI authenticates via `SUPABASE_SECRET_KEY`. For cloud agents, this is set in the **Configured Environment** secrets (Cursor cloud agent settings). If `npx supabase db push` fails with an auth error or "Cannot find project ref":

1. First, try linking the project: `npx supabase link --project-ref eijvwgxixczzpespefmd`
2. If that fails, verify the env var is available: `echo $SUPABASE_SECRET_KEY | head -c 10`
3. The project ref is `eijvwgxixczzpespefmd` (AppraisalBotReports)

**For local development:** The CLI reads `SUPABASE_SECRET_KEY` from `.env`. Verify with: `grep SUPABASE_SECRET_KEY .env`

**Migration file naming:** Use the convention `NNN_description.sql` (e.g., `022_merge_subject_core_force_keys.sql`). Always check the highest existing number in `supabase/migrations/` before creating a new one to avoid conflicts:

```bash
ls supabase/migrations/ | sort | tail -5
```

**After creating a migration, you MUST push it.** Do not skip this step. If the push fails due to a remote mismatch, use `npx supabase migration repair` to fix the history.

## Project Structure

```
src/
  app/
    api/                  # Next.js API routes (server-side)
      comps/parse/        # AI comp parsing (replaces n8n comp parser)
      documents/          # Document upload + processing
      drive/list/         # Drive folder listing proxy
      photos/             # Photo export + analysis trigger
      projects/           # Project discovery + engagement parsing
      report-content/     # AI report section generation
    project/[projectId]/  # All project pages (sidebar layout)
      analysis/           # Zoning, Ownership, Site Summary, HBU writeups
      cover/              # Cover page
      land-sales/         # Land comps, map, UI template, comp details,
                          # adjustments grid, discussion narrative
      neighborhood/       # Neighborhood overview (map banner + writeup)
      neighborhood-map/   # Full-screen neighborhood map editor
      rentals/            # Rental comps, map, UI template, comp details
      sales/              # Sales comps, map, UI template, comp details,
                          # adjustments grid, discussion narrative
      subject/            # Overview, improvements, location-map, photos,
                          # flood-map, sketches, cost-report
    projects/             # Project list + new project onboarding wizard
  components/             # Shared React components (52 files)
  hooks/                  # Custom React hooks (8 files)
  lib/                    # Server-side utilities (11 files)
  server/                 # Server actions (documents, photos, reports)
  types/                  # TypeScript type definitions
  utils/                  # Client utilities (projectStore, supabase client, etc.)

supabase/
  migrations/             # SQL migration files (001-028)

docs/
  issues/                 # Open issue tracker (017-034)
  product/                # Architecture docs, API reference, n8n deps
  report-data-spreadsheet/
    parser-type-defs.md   # TypeScript interfaces for Gemini parsing + Apps Script importer
    named-functions.md    # Google Sheets named functions with formulas
    report-data - ai-prompts.csv  # AI prompts from spreadsheet
    # sheets-exported--html|csv/ — optional local exports (.gitignored; not in repo)
  n8n/
    workflows/            # Exported n8n workflow JSON files
    gemini-node-prompts/  # Prompts used in n8n Gemini nodes
  cost-report-examples/   # SwiftEstimator cost report HTML + screenshots
  notes/                  # Miscellaneous notes (agent auth, etc.)
  old-local-data-backups/ # Legacy localStorage data exports
  examples/screenshots/   # UI screenshots for reference
```

## Database Schema (Supabase)

| Table | Purpose | Realtime? |
|-------|---------|-----------|
| `projects` | Project metadata, `folder_structure` JSONB, `spreadsheet_id` | No |
| `comparables` | Comp entities (address, APN, type, `parsed_data_status`) | No |
| `comp_parsed_data` | Rich parsed comp data (`raw_data` JSONB from AI extraction) | Yes |
| `subject_data` | Subject info (`core`, `taxes`, `tax_entities`, `parcels`, `improvements`, `improvement_analysis`, `fema`) | Yes |
| `maps` | Map views (center, zoom, drawings, linked comp) | No |
| `map_markers` | Marker positions on maps | No |
| `photo_analyses` | AI-analyzed photo metadata (label, description, sort_order) | Yes |
| `report_sections` | Generated report content per section (incl. discussion narratives) | Yes |
| `project_documents` | Uploaded/linked documents with AI extraction results | Yes |
| `knowledge_base` | AI knowledge entries (system prompts, examples) | No |
| `page_locks` | Edit locks for multi-user collaboration | No |
| `report_section_annotations` | AI-generated + human-reviewed section annotations from past reports | No |
| `report_extracted_data` | Structured comp/adjustment/cost/reconciliation data extracted from past reports | No |
| `project_adjustment_drafts` | Editable adjustment grid drafts (`grid_data` JSONB), one per project+comp_type | No |

All tables have RLS enabled with "Authenticated full access" policies. The `update_updated_at()` trigger auto-updates `updated_at` on modifications.

## Key Patterns

### Data Access (Client-Side)
- **`useProject(projectId)`** -- loads project + comparables + maps from Supabase. Returns `project`, `projectName`, `updateProject(fn)`.
- **`useSubjectData(projectId)`** -- loads/subscribes to `subject_data` with Realtime. Returns `subjectData`, `saveSubjectData(data)`.
- **`useCompParsedData(compId)`** -- loads/subscribes to `comp_parsed_data` for a single comp. Returns `data`, `updateRawData(key, value)`.
- **`useReportSection(projectId, sectionKey)`** -- loads/subscribes to a report section.

### Data Access (Server-Side)
- Use `createClient()` from `~/utils/supabase/server` for Supabase queries.
- Use `getGoogleToken()` from `~/utils/supabase/server` for the user's Google OAuth token.
- Drive operations use `src/lib/drive-api.ts` (`listFolderChildren`, `downloadFile`, `uploadOrUpdateFile`, etc.)

### Folder Structure
Projects store discovered Google Drive folder IDs in `projects.folder_structure` (JSONB):
```json
{
  "subjectFolderId": "...",
  "subjectPhotosFolderId": "...",
  "subjectSketchesFolderId": "...",
  "reportsFolderId": "...",
  "reportMapsFolderId": "...",
  "costReportFolderId": "...",
  "engagementFolderId": "...",
  "compsFolderIds": { "land": "...", "sales": "...", "rentals": "..." }
}
```
Access in client components: `(project as any).folderStructure` or `(project as any).folder_structure`.

### Reusable Components
- **`MapBanner`** -- displays a map image from Drive with an edit/expand button overlay. Props: `projectId`, `imageType`, `editHref`.
- **`DocumentContextPanel`** -- right-side drawer showing processed documents for a section. Props: `projectId`, `sectionKey`, `isOpen`, `onClose`.
- **`DocumentPanelToggle`** -- button that opens the DocumentContextPanel.
- **`DriveFolderBrowser`** -- navigable Google Drive folder tree. Props: `rootFolderId`, `onSelect`, `multiSelect`.
- **`MapLockGuard`** -- wraps map editors with page_locks-based edit locking (created but not yet integrated into map pages).
- **`CompAddFlow`** -- wizard dialog for selecting a Drive folder + files to parse for a comp.
- **`ReportSectionPage` / `ReportSectionContent`** -- pattern for AI-generated report section pages (markdown editor + generate/regenerate).

## Skills Available

### Frontend Design
**File:** `.cursor/skills/frontend-design/SKILL.md`

Use when building or redesigning UI components. The app uses a dark-mode-first aesthetic (gray-950 backgrounds, gray-900 cards, blue-600 accents, gray-100 text). Follow the skill's guidance on typography, spatial composition, and intentional design. Avoid generic Tailwind patterns.

### n8n Appraisal Sheet Formulas
**File:** `.cursor/skills/n8n-appraisal-sheet-formulas/SKILL.md`

Use when you need actual cell formulas from the live Google Spreadsheet. Two access paths:
1. **MCP:** `execute_workflow` on `user-n8n-mcp` with `workflowId: jVRwr2YMOAZawPTI`
2. **HTTP:** `POST https://dougiefreshdesigns.app.n8n.cloud/webhook/get-formulas`

See `.cursor/skills/n8n-appraisal-sheet-formulas/reference.md` for the full sheet name catalog.

## Reference Documentation

| Document | What it Contains | When to Use |
|----------|-----------------|-------------|
| `docs/report-data-spreadsheet/parser-type-defs.md` | TypeScript interfaces for `LandSaleData`, `SaleData`, `RentalData`, `SubjectData`, `SubjectTax`, `ParcelImprovement`, `ParcelData`, `TaxEntity` | Building comp detail forms, comp parsing prompts, subject editors |
| `docs/report-data-spreadsheet/named-functions.md` | Google Sheets named functions with formulas (`AC_TO_SF`, `CALC_MONTHLY_INCREASE`, `GET_NOI`, etc.) | Implementing calculated fields |
| *(optional)* `docs/report-data-spreadsheet/sheets-exported--html/` | HTML tab exports you generate locally (gitignored) | Same as above — open `{sheetName}.html` in a browser |
| `docs/cost-report-examples/` | SwiftEstimator cost report HTML | Building the cost report viewer page |
| `docs/n8n/workflows/` | Exported n8n workflow JSON files | Understanding legacy n8n flows being replaced |
| `docs/issues/` | Open issue tracker (017-034) with priorities, complexity, dependencies | Picking work items |
| `docs/product/` | Architecture overview, data flow, API reference, n8n dependencies | Understanding system architecture |
| [appraisal-bot Apps Scripts](https://github.com/dougiefresh49/appraisal-bot/tree/main/app-scripts/apbot-report-data) | Google Sheets automation: JSON importer, UI templates, comp editor, adjustments, reconciliation | Understanding how parsed data flows into the spreadsheet, template logic, named range handling |

## Open Issues

See `docs/issues/000-index.md` for the full list, parallelization guide, and wave groupings.

**Wave 1 -- Critical / onboarding:** 022 (comp_parsed_data UNIQUE + upsert), 023 (onboarding `section_tag`), 024 (subject merge from notes/CAD/address), 025 (sketches in onboarding)

**Wave 2 -- Data quality:** 026 (parsing prompts + `gemini-3.1-pro-preview`), 027 (`comp_parcels` / `comp_parcel_improvements`), 028 (calculated fields), 029 (parser type defs vs gem prompt sync), 034 (audit codebase for model IDs older than Gemini 3; policy is Gemini 3+ only)

**Wave 3 -- Features:** 030 (comp summary tables w/ dropdown labels + add/remove rows), 031 (comp UI redesign; absorbs former 016), 032 (past report vectorization: narratives + comp data + spreadsheet import), 033 (per-section push to spreadsheet via Sheets API)

**Ongoing (pre-roadmap track):** 017 (analysis pages -- context + polish), 018 (photo analysis polish)

## n8n Status

The **webapp does not call n8n webhooks** at runtime. Legacy spreadsheet workflows and exported workflow JSON live under `docs/n8n/workflows/`. The **n8n appraisal sheet formulas** skill may still use MCP or HTTP to fetch live cell formulas from n8n for development — that is external tooling, not the Next.js app.

## Gemini API (Gemini 3+ only)

**Policy:** Use **only** [Gemini 3](https://ai.google.dev/gemini-api/docs/gemini-3) family model IDs for text, vision, and structured outputs in this repo. Do **not** add new call sites or defaults that use Gemini 2.x, 1.5, or other models older than Gemini 3. When changing existing code, migrate model strings to Gemini 3 unless a Google-documented exception applies (e.g. a capability explicitly requires an older model).

**Reference:** [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3) (thinking levels, `media_resolution` on `v1alpha`, temperature default 1.0, thought signatures for tools / image workflows).

**Standard model IDs (pick by latency/cost vs reasoning depth):**

| Use case | Model ID |
|----------|----------|
| High volume, lowest cost / latency | `gemini-3.1-flash-lite-preview` |
| Balanced flash | `gemini-3-flash-preview` |
| Heaviest reasoning, extraction quality | `gemini-3.1-pro-preview` |

For multimodal **image generation** or other specialized 3.x variants, use the IDs listed in the same guide (e.g. `gemini-3.1-flash-image-preview` / `gemini-3-pro-image-preview`) rather than legacy image models.

## Environment Variables

Defined in `src/env.js` via `@t3-oss/env-nextjs`:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase anon/publishable key |
| `SUPABASE_SECRET_KEY` | Supabase service role key |
| `GOOGLE_GEMINI_API_KEY` | Gemini API key for AI features |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth for token refresh |
| `GOOGLE_DRIVE_APPRAISAL_PROJECTS_PARENT_FOLDER_ID` | Optional. Drive folder whose children are project roots (`/projects/new` picker via `/api/projects/list-drive-roots`) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API key |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Google Maps styled map ID |

## Conventions

- **File naming:** lowercase with dashes for directories, PascalCase for components, camelCase for utilities
- **Imports:** use `~/` path alias (maps to `src/`)
- **Server-only code:** add `import "server-only"` at top of files that should never run in the browser
- **Supabase client vs server:** `~/utils/supabase/client` for browser, `~/utils/supabase/server` for API routes/server components
- **ESLint:** strict rules -- prefer `??` over `||`, use `.exec()` instead of `.match()`, no unused vars, no `any` without explicit disable
- **Dark mode:** all UI should work in dark mode first (`dark:` prefix), light mode is secondary
- **Realtime:** tables with Realtime enabled are subscribed to via hooks; use `supabase.channel()` + `.on("postgres_changes", ...)` pattern
