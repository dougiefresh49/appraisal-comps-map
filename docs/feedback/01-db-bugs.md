# DB Bugs -- RLS Missing on New Tables

**Priority:** Critical
**Affects:** `subject_data`, `comp_parsed_data`

## Problem

Migration `008_comp_data_subject_data.sql` created the `subject_data` and `comp_parsed_data` tables but did **not** enable Row Level Security (RLS) or create any policies. Both tables are currently unrestricted -- any unauthenticated request can read/write to them.

This is inconsistent with all other tables in the schema (e.g., `projects`, `comparables`, `maps`, `map_markers`, `photo_analyses`, `report_sections`, `project_documents`, `knowledge_base`) which all have RLS enabled with `"Authenticated full access"` policies.

## Current State

From `supabase/migrations/008_comp_data_subject_data.sql`:

```sql
create table if not exists comp_parsed_data ( ... );
create table if not exists subject_data ( ... );
-- No RLS statements
```

## Required Fix

Create a new migration (`009_rls_fix.sql`) that adds RLS to both tables:

```sql
-- Enable RLS on comp_parsed_data
alter table comp_parsed_data enable row level security;
create policy "Authenticated full access" on comp_parsed_data
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Enable RLS on subject_data
alter table subject_data enable row level security;
create policy "Authenticated full access" on subject_data
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Add updated_at triggers (also missing from 008)
create trigger comp_parsed_data_updated_at
  before update on comp_parsed_data
  for each row execute function update_updated_at();

create trigger subject_data_updated_at
  before update on subject_data
  for each row execute function update_updated_at();
```

## Notes

- The `update_updated_at()` trigger function already exists (created in migration 001)
- After creating the migration file, run `npx supabase db push` to apply
- Verify in Supabase dashboard that both tables show RLS as enabled
