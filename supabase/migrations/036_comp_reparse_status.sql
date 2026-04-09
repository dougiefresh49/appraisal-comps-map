-- Migration 036: Support background re-parse with proposed data review
--
-- 1. Expand parsed_data_status CHECK to include 'reparsing' and 'pending_review'
-- 2. Add proposed_raw_data column to comp_parsed_data for async merge review

ALTER TABLE comparables
  DROP CONSTRAINT IF EXISTS comparables_parsed_data_status_check,
  ADD CONSTRAINT comparables_parsed_data_status_check
    CHECK (parsed_data_status IN ('none','processing','parsed','error','reparsing','pending_review'));

ALTER TABLE comp_parsed_data
  ADD COLUMN IF NOT EXISTS proposed_raw_data jsonb DEFAULT NULL;
