-- ============================================================
-- Add file_id, sort_order, is_included to photo_analyses
-- ============================================================
alter table photo_analyses add column if not exists file_id text;
alter table photo_analyses add column if not exists sort_order integer default 0;
alter table photo_analyses add column if not exists is_included boolean default true;

-- ============================================================
-- Index for ordered fetches within a project
-- ============================================================
create index if not exists idx_photo_analyses_project_sort
  on photo_analyses(project_id, sort_order);

-- ============================================================
-- Enable Realtime for live collaboration on photos
-- ============================================================
alter publication supabase_realtime add table photo_analyses;
