-- ============================================================
-- Chat threads: one thread = one named conversation per project
-- ============================================================
CREATE TABLE chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX idx_chat_threads_project_user
  ON chat_threads (project_id, user_id, archived_at);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON chat_threads
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE TRIGGER update_updated_at
  BEFORE UPDATE ON chat_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Chat messages: individual turns within a thread
-- sort_order ensures correct ordering within the same DB transaction
-- ============================================================
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  mentions JSONB,
  tool_result JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_thread
  ON chat_messages (thread_id, created_at, sort_order);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON chat_messages
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
