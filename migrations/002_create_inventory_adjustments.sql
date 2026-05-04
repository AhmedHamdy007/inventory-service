CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('shop', 'stylist')),
  scope_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('set', 'delta')),
  delta NUMERIC(12, 2) NOT NULL,
  previous_quantity NUMERIC(12, 2) NOT NULL,
  next_quantity NUMERIC(12, 2) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_item ON inventory_adjustments (inventory_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_scope ON inventory_adjustments (scope_type, scope_id, created_at DESC);
