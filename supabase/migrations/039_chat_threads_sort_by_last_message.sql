-- Sort threads by last chat message time (not thread.updated_at, which changes on rename).
CREATE OR REPLACE FUNCTION list_chat_threads_for_project(
  project_uuid uuid,
  user_uuid uuid,
  archived_only boolean
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  user_id uuid,
  title text,
  created_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.project_id,
    t.user_id,
    t.title,
    t.created_at,
    t.updated_at,
    t.archived_at
  FROM chat_threads t
  LEFT JOIN LATERAL (
    SELECT MAX(cm.created_at) AS last_msg_at
    FROM chat_messages cm
    WHERE cm.thread_id = t.id
  ) m ON true
  WHERE t.project_id = project_uuid
    AND t.user_id = user_uuid
    AND (
      (archived_only = false AND t.archived_at IS NULL)
      OR (archived_only = true AND t.archived_at IS NOT NULL)
    )
  ORDER BY COALESCE(m.last_msg_at, t.created_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION list_chat_threads_for_project(uuid, uuid, boolean) TO authenticated;
