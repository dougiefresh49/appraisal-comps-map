-- Migration 038: Add proposed_parcels and proposed_improvements columns to subject_data
-- for the async Subject Rebuild review flow (mirrors proposed_core/proposed_fema).

ALTER TABLE subject_data
  ADD COLUMN IF NOT EXISTS proposed_parcels jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS proposed_improvements jsonb DEFAULT NULL;
