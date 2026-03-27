-- ============================================================
-- Enable pgvector extension (toggle on in Supabase dashboard first)
-- ============================================================
create extension if not exists vector with schema extensions;

-- ============================================================
-- Report sections table (replaces Google Drive .md files)
-- ============================================================
create table if not exists report_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  section_key text not null,
  content text not null default '',
  version integer not null default 1,
  generation_context jsonb default '{}',
  embedding extensions.vector(768),
  property_type text,
  city text,
  county text,
  subject_address text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(project_id, section_key)
);

-- ============================================================
-- Report section history (version snapshots)
-- ============================================================
create table if not exists report_section_history (
  id uuid primary key default gen_random_uuid(),
  report_section_id uuid references report_sections(id) on delete cascade,
  content text not null,
  version integer not null,
  generation_context jsonb default '{}',
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table report_sections enable row level security;
create policy "Authenticated full access" on report_sections
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter table report_section_history enable row level security;
create policy "Authenticated full access" on report_section_history
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists idx_report_sections_project_id
  on report_sections(project_id);
create index if not exists idx_report_sections_project_section
  on report_sections(project_id, section_key);
create index if not exists idx_report_sections_section_key
  on report_sections(section_key);
create index if not exists idx_report_section_history_section_id
  on report_section_history(report_section_id);

-- ============================================================
-- Updated_at trigger
-- ============================================================
create trigger report_sections_updated_at
  before update on report_sections
  for each row execute function update_updated_at();

-- ============================================================
-- Enable Realtime for live collaboration
-- ============================================================
alter publication supabase_realtime add table report_sections;
