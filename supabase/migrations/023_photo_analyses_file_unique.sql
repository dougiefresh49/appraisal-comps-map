-- ============================================================
-- Add unique constraint on photo_analyses(project_id, file_id)
-- to support upsert operations from the photo-analyzer module.
-- ============================================================
alter table photo_analyses
  add constraint photo_analyses_project_file_unique
  unique (project_id, file_id);
