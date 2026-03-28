-- Migration 008: comp_parsed_data and subject_data tables

-- New table: comp_parsed_data
-- Stores the rich parsed data per comparable (full LandSaleData, SaleData, or RentalData from parser)
create table if not exists comp_parsed_data (
  id uuid primary key default gen_random_uuid(),
  comp_id text references comparables(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  raw_data jsonb not null default '{}',
  source text default 'parser',
  parsed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists comp_parsed_data_comp_id_idx on comp_parsed_data(comp_id);
create index if not exists comp_parsed_data_project_id_idx on comp_parsed_data(project_id);

-- New table: subject_data
-- Stores the rich subject information (SubjectData, SubjectTax, ParcelImprovement, ParcelData)
create table if not exists subject_data (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade unique,
  core jsonb not null default '{}',
  taxes jsonb not null default '[]',
  tax_entities jsonb not null default '[]',
  parcels jsonb not null default '[]',
  improvements jsonb not null default '[]',
  updated_at timestamptz default now()
);

create index if not exists subject_data_project_id_idx on subject_data(project_id);

-- Add parsed_data_status column to comparables table
alter table comparables add column if not exists parsed_data_status text
  default 'none' check (parsed_data_status in ('none', 'processing', 'parsed', 'error'));

-- Enable Realtime on new tables
alter publication supabase_realtime add table comp_parsed_data;
alter publication supabase_realtime add table subject_data;
