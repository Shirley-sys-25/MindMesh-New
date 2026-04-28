ALTER TABLE chat_requests
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS user_message TEXT,
  ADD COLUMN IF NOT EXISTS assistant_message TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_requests_session_id_created_at
  ON chat_requests(session_id, created_at);
