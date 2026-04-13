-- Gemini model id used for assistant replies (e.g. gemini-3-flash-preview)
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS model_used TEXT;

COMMENT ON COLUMN chat_messages.model_used IS
  'Resolved Gemini model id for assistant messages; null for user/tool rows';
