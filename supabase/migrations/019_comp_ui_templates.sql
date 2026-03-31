-- Add comp_ui_templates JSONB column to projects table.
-- Stores per-project template configurations for the Comp UI page:
-- { land: Section[], sales: Section[], salesIncome: Section[], rentals: Section[] }
ALTER TABLE projects ADD COLUMN IF NOT EXISTS comp_ui_templates jsonb DEFAULT '{}';
