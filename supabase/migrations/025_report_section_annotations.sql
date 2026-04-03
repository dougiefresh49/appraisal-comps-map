create table report_section_annotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  source_filename text,
  section_key text not null,
  label text not null,
  parent_group text not null,
  content_type text not null,
  extraction_priority text not null default 'reference',
  variability text not null default 'medium',
  ai_confidence float,
  human_reviewed boolean default false,
  notes text,
  content_preview text,
  start_line int,
  end_line int,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(project_id, section_key)
);

alter table report_section_annotations enable row level security;
create policy "Authenticated full access" on report_section_annotations
  for all using (auth.role() = 'authenticated');

create trigger update_report_section_annotations_updated_at
  before update on report_section_annotations
  for each row execute function update_updated_at();
