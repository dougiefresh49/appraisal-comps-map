-- Fix: comp_parsed_data needs UNIQUE on comp_id for upsert (ON CONFLICT) to work.
-- The app expects one parsed-data row per comp (useCompParsedData, comp-parser.ts upsert).
ALTER TABLE comp_parsed_data
  ADD CONSTRAINT comp_parsed_data_comp_id_unique UNIQUE (comp_id);
