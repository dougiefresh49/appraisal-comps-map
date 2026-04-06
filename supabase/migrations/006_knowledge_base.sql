-- ============================================================
-- Knowledge base table (system prompts, examples, extra knowledge)
-- ============================================================
create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  gem_name text not null,
  content_type text not null,
  input text,
  output text not null,
  embedding extensions.vector(768),
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table knowledge_base enable row level security;
create policy "Authenticated full access" on knowledge_base
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists idx_knowledge_base_gem_name
  on knowledge_base(gem_name);
create index if not exists idx_knowledge_base_gem_content_type
  on knowledge_base(gem_name, content_type);
