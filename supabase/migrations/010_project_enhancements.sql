-- ============================================================
-- Enhance projects table with folder structure + spreadsheet ID
-- ============================================================

alter table projects add column if not exists folder_structure jsonb default '{}';
alter table projects add column if not exists spreadsheet_id text;

-- ============================================================
-- Add improvement_analysis to subject_data
-- Stores the improvement-analysis-v2 style rows:
-- [ { label, category, include, value }, ... ]
-- ============================================================

alter table subject_data add column if not exists improvement_analysis jsonb default '[]';

-- ============================================================
-- Add drive_modified_at to project_documents for staleness check
-- ============================================================

alter table project_documents add column if not exists drive_modified_at timestamptz;
