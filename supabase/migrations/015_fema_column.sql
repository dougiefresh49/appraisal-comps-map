-- Migration 015: Move FEMA data from subject_data.core to a dedicated fema JSONB column.
-- This eliminates cross-concern collisions between property identification and flood data.

-- Step 1: Add the new column
ALTER TABLE subject_data
  ADD COLUMN IF NOT EXISTS fema jsonb NOT NULL DEFAULT '{}';

-- Step 2: Copy existing FEMA keys from core → fema, then strip them from core
UPDATE subject_data
SET
  fema = jsonb_build_object(
    'FemaMapNum',       COALESCE(core->'FemaMapNum', 'null'::jsonb),
    'FemaZone',         COALESCE(core->'FemaZone', 'null'::jsonb),
    'FemaIsHazardZone', COALESCE(core->'FemaIsHazardZone', 'null'::jsonb),
    'FemaMapDate',      COALESCE(core->'FemaMapDate', 'null'::jsonb)
  ),
  core = core - 'FemaMapNum' - 'FemaZone' - 'FemaIsHazardZone' - 'FemaMapDate'
WHERE
  core ? 'FemaMapNum'
  OR core ? 'FemaZone'
  OR core ? 'FemaIsHazardZone'
  OR core ? 'FemaMapDate';
