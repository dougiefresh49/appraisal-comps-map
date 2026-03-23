-- ============================================================
-- Projects table
-- ============================================================
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_company text,
  client_name text,
  property_type text,
  subject_photos_folder_id text,
  project_folder_id text,
  subject jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- Comparables table
-- ============================================================
create table if not exists comparables (
  id text primary key,
  project_id uuid references projects(id) on delete cascade,
  type text not null check (type in ('Land', 'Sales', 'Rentals')),
  number text,
  address text not null default '',
  address_for_display text not null default '',
  apn jsonb default '[]',
  instrument_number text,
  folder_id text,
  images jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- Map views table
-- ============================================================
create table if not exists maps (
  id text primary key,
  project_id uuid references projects(id) on delete cascade,
  type text not null,
  linked_comp_id text references comparables(id) on delete set null,
  map_center jsonb not null default '{"lat":31.8458,"lng":-102.3676}',
  map_zoom numeric not null default 17,
  bubble_size numeric not null default 1.0,
  hide_ui boolean not null default false,
  document_frame_size numeric not null default 1.0,
  drawings jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- Map markers table
-- ============================================================
create table if not exists map_markers (
  id text primary key,
  map_id text references maps(id) on delete cascade,
  comp_id text references comparables(id) on delete cascade,
  marker_position jsonb,
  bubble_position jsonb,
  is_tail_pinned boolean not null default false,
  pinned_tail_tip_position jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- Page locks table (for form edit locking)
-- ============================================================
create table if not exists page_locks (
  project_id uuid references projects(id) on delete cascade,
  page_key text not null,
  locked_by uuid references auth.users(id),
  locked_at timestamptz default now(),
  primary key (project_id, page_key)
);

-- ============================================================
-- Row Level Security
-- All authenticated users can access everything
-- ============================================================
alter table projects enable row level security;
create policy "Authenticated full access" on projects
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter table comparables enable row level security;
create policy "Authenticated full access" on comparables
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter table maps enable row level security;
create policy "Authenticated full access" on maps
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter table map_markers enable row level security;
create policy "Authenticated full access" on map_markers
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter table page_locks enable row level security;
create policy "Authenticated full access" on page_locks
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists idx_comparables_project_type on comparables(project_id, type);
create index if not exists idx_maps_project_type on maps(project_id, type);
create index if not exists idx_map_markers_map_id on map_markers(map_id);
create index if not exists idx_map_markers_comp_id on map_markers(comp_id);

-- ============================================================
-- Updated_at trigger function
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

create trigger comparables_updated_at
  before update on comparables
  for each row execute function update_updated_at();

create trigger maps_updated_at
  before update on maps
  for each row execute function update_updated_at();

create trigger map_markers_updated_at
  before update on map_markers
  for each row execute function update_updated_at();

-- ============================================================
-- Enable Realtime for presence channels
-- ============================================================
alter publication supabase_realtime add table page_locks;
