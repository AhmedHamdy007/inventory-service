CREATE TABLE IF NOT EXISTS inventory_scope_state (
  user_id TEXT PRIMARY KEY,
  last_scope_type TEXT NOT NULL CHECK (last_scope_type IN ('shop', 'stylist')),
  last_scope_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
