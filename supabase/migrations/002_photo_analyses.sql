-- ============================================================
-- Photo analyses table (image knowledge base)
-- ============================================================
create table if not exists photo_analyses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  file_name text not null,
  category text not null,
  label text not null,
  description text,
  improvements_observed jsonb default '{}',
  property_type text,
  subject_address text,
  project_folder_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table photo_analyses enable row level security;
create policy "Authenticated full access" on photo_analyses
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists idx_photo_analyses_project_id on photo_analyses(project_id);
create index if not exists idx_photo_analyses_category on photo_analyses(category);
create index if not exists idx_photo_analyses_project_folder_id on photo_analyses(project_folder_id);
create index if not exists idx_photo_analyses_improvements on photo_analyses using gin (improvements_observed);

-- ============================================================
-- Updated_at trigger
-- ============================================================
create trigger photo_analyses_updated_at
  before update on photo_analyses
  for each row execute function update_updated_at();
