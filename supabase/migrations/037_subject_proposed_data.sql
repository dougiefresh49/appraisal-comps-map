-- Migration 037: Persist subject rebuild preview in separate columns until the user confirms merge.

ALTER TABLE subject_data
  ADD COLUMN IF NOT EXISTS proposed_core jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS proposed_fema jsonb DEFAULT NULL;
