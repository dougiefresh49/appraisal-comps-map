-- ============================================================
-- Project documents table (process-once context store)
-- ============================================================
create table if not exists project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  document_type text not null,
  document_label text,
  file_id text,
  file_name text,
  mime_type text,
  extracted_text text,
  structured_data jsonb default '{}',
  embedding extensions.vector(768),
  processed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table project_documents enable row level security;
create policy "Authenticated full access" on project_documents
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists idx_project_documents_project_id
  on project_documents(project_id);
create index if not exists idx_project_documents_project_type
  on project_documents(project_id, document_type);
create index if not exists idx_project_documents_type
  on project_documents(document_type);

-- ============================================================
-- Updated_at trigger
-- ============================================================
create trigger project_documents_updated_at
  before update on project_documents
  for each row execute function update_updated_at();

-- ============================================================
-- Enable Realtime for processing status updates
-- ============================================================
alter publication supabase_realtime add table project_documents;
