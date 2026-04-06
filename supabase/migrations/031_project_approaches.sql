alter table projects
  add column if not exists approaches jsonb
  default '{"salesComparison": {"land": true, "sales": true}, "income": true, "cost": true}';
