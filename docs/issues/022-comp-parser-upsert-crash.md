# 022: Comp Parser Upsert Crash (missing UNIQUE on `comp_id`)

**Priority:** Critical  
**Complexity:** Low  
**Dependencies:** None (must land before 026, 027 — comp parser writes assume one row per comp)

## Problem

`comp-parser.ts` uses `.upsert({...}, { onConflict: "comp_id" })` against `comp_parsed_data`, but the table has no **UNIQUE** constraint on `comp_id` (only a non-unique index). PostgreSQL rejects `ON CONFLICT` targets that are not backed by a unique constraint or exclusion constraint. This blocks saving parsed comp data reliably and matches a design mismatch: the app treats parsed data as one row per comp (`useCompParsedData`).

## Expected Behavior

- `comp_parsed_data` enforces at most one row per `comp_id` at the database level.
- Comp parser upserts succeed without PostgreSQL errors.

## Affected Files

- New migration: `supabase/migrations/017_comp_parsed_data_unique.sql` (or next free number when implemented — check existing migrations before adding)
- `src/lib/comp-parser.ts` — verify upsert `onConflict: "comp_id"` after constraint exists (no code change required if constraint name matches)

## Acceptance Criteria

- [ ] Migration adds `UNIQUE (comp_id)` on `comp_parsed_data` (e.g., `ALTER TABLE comp_parsed_data ADD CONSTRAINT comp_parsed_data_comp_id_unique UNIQUE (comp_id)`).
- [ ] Migration pushed / applied to remote Supabase (`npx supabase db push`).
- [ ] Comp parse flow completes without upsert errors when re-parsing the same comp.
- [ ] Existing duplicate `comp_id` rows (if any) are resolved or documented before applying the constraint.
