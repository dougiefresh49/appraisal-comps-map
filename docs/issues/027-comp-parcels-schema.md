# 027: DB Schema -- `comp_parcels` and `comp_parcel_improvements`

**Priority:** High  
**Complexity:** Medium  
**Dependencies:** 022 (stable `comp_parsed_data` writes; parser changes in 026 should write normalized rows)

## Problem

Spreadsheet tabs separate `comp-parcels` and `comp-parcel-improvements` linked by APN / instrument number. The database stores comp detail only as JSONB in `comp_parsed_data.raw_data`. That prevents querying parcel attributes across comps, rendering parcel summary tables, and modeling multi-parcel sales cleanly.

## Expected Behavior

- New tables mirror spreadsheet semantics and TypeScript `ParcelData` / `ParcelImprovement` (see `parser-type-defs.md`).
- After parsing, the pipeline writes **both** the full blob to `comp_parsed_data` and normalized rows to the new tables.
- RLS and indexes follow existing project patterns (authenticated access, FK to comparables / comp_parsed_data as designed).

## Affected Files

- New migration: `comp_parcels`, `comp_parcel_improvements` (names per SQL convention)
- `src/lib/comp-parser.ts` — upsert normalized parcel rows post-parse
- `src/lib/supabase-queries.ts` — read helpers for parcel + improvement queries
- Reference: `docs/report-data-spreadsheet/parser-type-defs.md`

## Acceptance Criteria

- [ ] Migration creates `comp_parcels` with fields for APN, instrument number, sizes, office/warehouse/building areas, county value, taxes, etc. (aligned to `ParcelData`).
- [ ] Migration creates `comp_parcel_improvements` linked to parcel rows (aligned to `ParcelImprovement`).
- [ ] RLS policies applied (consistent with other comp tables).
- [ ] Parser persists normalized rows on successful parse; re-parse updates replace stale rows correctly.
- [ ] Types / queries updated so UI or APIs can fetch parcels without scraping JSONB (smoke test query documented).
- [ ] No orphan rows when comps are deleted (FK `ON DELETE` behavior defined and tested).
