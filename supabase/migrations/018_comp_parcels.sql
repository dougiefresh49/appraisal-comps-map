-- Normalized tables for comp parcel data and improvements.
-- Mirrors spreadsheet tabs: comp-parcels and comp-parcel-improvements.
-- Linked to comparables via instrument_number (recording/deed number).
-- Also has comp_id FK for direct association when instrument_number isn't known.

create table if not exists comp_parcels (
  id uuid primary key default gen_random_uuid(),
  comp_id text references comparables(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  instrument_number text,
  apn text not null default '',
  apn_link text default '',
  location text default '',
  legal text default '',
  lot_number text,
  size_ac numeric,
  size_sf numeric,
  building_size_sf numeric,
  office_area_sf numeric,
  warehouse_area_sf numeric,
  parking_sf numeric,
  storage_area_sf numeric,
  buildings integer,
  total_tax_amount numeric,
  county_appraised_value numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists comp_parcels_comp_id_idx on comp_parcels(comp_id);
create index if not exists comp_parcels_project_id_idx on comp_parcels(project_id);
create index if not exists comp_parcels_instrument_number_idx on comp_parcels(instrument_number);

create table if not exists comp_parcel_improvements (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid references comp_parcels(id) on delete cascade,
  comp_id text references comparables(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  instrument_number text,
  apn text not null default '',
  building_number integer default 1,
  section_number integer default 1,
  year_built integer,
  effective_year_built integer,
  gross_building_area_sf numeric,
  office_area_sf numeric,
  warehouse_area_sf numeric,
  parking_sf numeric,
  storage_area_sf numeric,
  is_gla boolean default true,
  construction text default '',
  comments text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists comp_parcel_improvements_parcel_id_idx on comp_parcel_improvements(parcel_id);
create index if not exists comp_parcel_improvements_comp_id_idx on comp_parcel_improvements(comp_id);
create index if not exists comp_parcel_improvements_project_id_idx on comp_parcel_improvements(project_id);

-- RLS
alter table comp_parcels enable row level security;
create policy "Authenticated full access" on comp_parcels
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter table comp_parcel_improvements enable row level security;
create policy "Authenticated full access" on comp_parcel_improvements
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- updated_at triggers
create trigger comp_parcels_updated_at
  before update on comp_parcels
  for each row execute function update_updated_at();

create trigger comp_parcel_improvements_updated_at
  before update on comp_parcel_improvements
  for each row execute function update_updated_at();

-- Enable Realtime
alter publication supabase_realtime add table comp_parcels;
alter publication supabase_realtime add table comp_parcel_improvements;
