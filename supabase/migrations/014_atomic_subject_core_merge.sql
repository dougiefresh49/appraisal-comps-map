-- Atomic merge for subject_data.core
-- Prevents concurrent document processors from overwriting each other's fields.
-- Only fills keys whose current value is NULL, empty string, or 0.
CREATE OR REPLACE FUNCTION merge_subject_core(
  p_project_id uuid,
  p_patch jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_key text;
  v_value jsonb;
BEGIN
  -- Ensure a row exists (no-op if already present)
  INSERT INTO subject_data (project_id, core, updated_at)
  VALUES (p_project_id, '{}'::jsonb, now())
  ON CONFLICT (project_id) DO NOTHING;

  -- Merge each key atomically: only overwrite if current value is null / "" / 0
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_patch)
  LOOP
    -- Skip null / empty-string patch values
    IF v_value IS NULL OR v_value = 'null'::jsonb OR v_value = '""'::jsonb THEN
      CONTINUE;
    END IF;

    UPDATE subject_data
    SET core = jsonb_set(core, ARRAY[v_key], v_value),
        updated_at = now()
    WHERE project_id = p_project_id
      AND (
        core->v_key IS NULL
        OR core->v_key = 'null'::jsonb
        OR core->v_key = '""'::jsonb
        OR core->v_key = '0'::jsonb
      );
  END LOOP;
END;
$$;
