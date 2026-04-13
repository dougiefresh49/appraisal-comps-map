-- Chat message file attachments (Supabase Storage metadata) + bucket
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS attachments JSONB;

COMMENT ON COLUMN chat_messages.attachments IS
  'Array of { fileName, mimeType, storagePath, size } for user-uploaded chat attachments';

-- Private bucket for per-user paths: {user_id}/{project_id}/...
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  10485760,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can read objects in their folder (first path segment = auth.uid)
CREATE POLICY "chat_attachments_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "chat_attachments_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "chat_attachments_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
