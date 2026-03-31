# 037: Persist Comp Summary Table Config to Database

**Priority:** High
**Complexity:** Low
**Dependencies:** 036 (comp_ui_templates table must exist first)

## Problem

`CompSummaryTable.tsx` stores its row configuration (which labels, in what order) in **localStorage** via `loadSavedRows` / `saveRows` helper functions. This means:
- Config doesn't sync between users
- Config is lost on browser clear
- No default templates available without manual setup

## Solution

Reuse the `comp_ui_templates` table (from issue 036) with `template_type = 'SUMMARY'`. The table's `(project_id, comp_type, template_type)` unique constraint already supports this.

The `content` JSONB for summary tables is simpler than comp UI templates -- just an array of `{ id, label }` objects (the current `SummaryRow` type).

## Changes

1. Update the `template_type` CHECK constraint on `comp_ui_templates` to include `'SUMMARY'`: `check (template_type in ('DEFAULT', 'INCOME', 'SUMMARY'))`
2. Seed default summary rows (project_id = null) for Land/SUMMARY, Sales/SUMMARY, Rentals/SUMMARY using the existing `LAND_DEFAULT_ROWS`, `SALES_DEFAULT_ROWS`, `RENTALS_DEFAULT_ROWS` arrays
3. Update `CompSummaryTable.tsx`:
   - Replace `loadSavedRows` / `saveRows` (localStorage) with Supabase reads/writes to `comp_ui_templates` where `template_type = 'SUMMARY'`
   - On load: query project-specific row, fall back to default (project_id IS NULL)
   - On change (add/remove/reorder rows): debounced upsert to the table
   - Remove the localStorage helpers

## Affected Files

- New migration to add `'SUMMARY'` to the check constraint + seed rows
- `src/components/CompSummaryTable.tsx` -- replace localStorage with Supabase

## Acceptance Criteria

- [ ] Summary table config persists to `comp_ui_templates` with `template_type = 'SUMMARY'`
- [ ] Default summary rows seeded for all comp types
- [ ] Project-specific overrides saved on edit
- [ ] Falls back to defaults when no project override exists
- [ ] No more localStorage usage for summary config
- [ ] `pnpm build` passes
