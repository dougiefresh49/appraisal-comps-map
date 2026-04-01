-- Add is_reference flag to projects table.
-- Reference projects hold historical data (past reports, CSV-imported comps)
-- and are used for cross-project comp reuse search.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_reference boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS projects_is_reference_idx ON projects(is_reference) WHERE is_reference = true;
