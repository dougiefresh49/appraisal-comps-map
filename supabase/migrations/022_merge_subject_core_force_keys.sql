-- Force-merge specific core keys (document-sourced City/State/Zip/County beat regex-parsed values).
CREATE OR REPLACE FUNCTION merge_subject_core_force_keys(
  p_project_id uuid,
  p_patch jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_key text;
  v_value jsonb;
BEGIN
  INSERT INTO subject_data (project_id, core, updated_at)
  VALUES (p_project_id, '{}'::jsonb, now())
  ON CONFLICT (project_id) DO NOTHING;

  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_patch)
  LOOP
    IF v_value IS NULL OR v_value = 'null'::jsonb OR v_value = '""'::jsonb THEN
      CONTINUE;
    END IF;

    UPDATE subject_data
    SET core = jsonb_set(core, ARRAY[v_key], v_value),
        updated_at = now()
    WHERE project_id = p_project_id;
  END LOOP;
END;
$$;
