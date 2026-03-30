-- Add section_tag column to project_documents for section-based filtering
alter table project_documents add column if not exists section_tag text;

create index if not exists idx_project_documents_section_tag
  on project_documents(project_id, section_tag);
