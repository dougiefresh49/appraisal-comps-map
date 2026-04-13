-- Per-turn Gemini usage (token counts + response ids) for billing / cost attribution.
-- One row per user message / assistant reply cycle (aggregates multiple generateContent calls when tools run).
CREATE TABLE gemini_chat_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assistant_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  generate_calls INTEGER NOT NULL DEFAULT 1,
  prompt_tokens BIGINT,
  candidates_tokens BIGINT,
  total_tokens BIGINT,
  response_ids TEXT[] NOT NULL DEFAULT '{}',
  calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gemini_chat_usage_project_created
  ON gemini_chat_usage (project_id, created_at DESC);

CREATE INDEX idx_gemini_chat_usage_user_created
  ON gemini_chat_usage (user_id, created_at DESC);

CREATE INDEX idx_gemini_chat_usage_thread
  ON gemini_chat_usage (thread_id);

COMMENT ON TABLE gemini_chat_usage IS
  'Gemini API usage for one chat turn; calls[] holds per generateContent() snapshot (response_id, token counts).';

ALTER TABLE gemini_chat_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON gemini_chat_usage
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
