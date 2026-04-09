-- Store the market conditions rate (% increase per month) at the project level.
-- This seeds the adjustment grid default instead of always using the hardcoded 0.5 fallback.

alter table projects
  add column if not exists percent_inc_per_month numeric;
