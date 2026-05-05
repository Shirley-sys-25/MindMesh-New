CREATE TABLE IF NOT EXISTS session_states (
  session_id TEXT PRIMARY KEY,
  user_sub TEXT,
  current_objective TEXT,
  session_summary TEXT,
  current_view TEXT,
  active_tab TEXT,
  objective_step INTEGER NOT NULL DEFAULT 0,
  objective_progress INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE session_states
  ADD COLUMN IF NOT EXISTS current_view TEXT,
  ADD COLUMN IF NOT EXISTS active_tab TEXT;

CREATE INDEX IF NOT EXISTS idx_session_states_user_sub_updated_at
  ON session_states(user_sub, updated_at DESC);
