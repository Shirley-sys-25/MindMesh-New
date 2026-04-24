CREATE TABLE IF NOT EXISTS chat_requests (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id TEXT,
  user_sub TEXT,
  mode TEXT NOT NULL,
  orchestration_path TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  prompt_preview TEXT,
  response_chars INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_requests_created_at ON chat_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_requests_request_id ON chat_requests(request_id);

CREATE TABLE IF NOT EXISTS transcribe_requests (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id TEXT,
  user_sub TEXT,
  mime_type TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  text_chars INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_transcribe_requests_created_at ON transcribe_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_transcribe_requests_request_id ON transcribe_requests(request_id);
