-- ============================================================
-- Fix: Enable RLS on comp_parsed_data and subject_data
-- These tables were created in 008 without RLS policies
-- ============================================================

alter table comp_parsed_data enable row level security;
create policy "Authenticated full access" on comp_parsed_data
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter table subject_data enable row level security;
create policy "Authenticated full access" on subject_data
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- Fix: Add missing updated_at triggers (also absent from 008)
-- ============================================================

create trigger comp_parsed_data_updated_at
  before update on comp_parsed_data
  for each row execute function update_updated_at();

create trigger subject_data_updated_at
  before update on subject_data
  for each row execute function update_updated_at();
