-- Stores structured comp data, adjustment grids, cost approach, and reconciliation
-- extracted from past report markdown files (Pass 2 of the backfill pipeline).
-- One row per project; upserted on re-run. Separate from report_sections (narratives)
-- to keep structured numeric data clearly distinct from RAG text content.
create table report_extracted_data (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  source_filename text,
  land_comps jsonb default '[]',
  sale_comps jsonb default '[]',
  rental_comps jsonb default '[]',
  land_adjustments jsonb,
  sale_adjustments jsonb,
  rental_adjustments jsonb,
  cost_approach jsonb,
  reconciliation jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(project_id)
);

alter table report_extracted_data enable row level security;

create policy "Authenticated full access" on report_extracted_data
  for all using (auth.role() = 'authenticated');

create trigger update_report_extracted_data_updated_at
  before update on report_extracted_data
  for each row execute function update_updated_at();
