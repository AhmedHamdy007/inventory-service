CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('shop', 'stylist')),
  scope_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unit_type TEXT NOT NULL,
  low_stock_threshold NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_scope ON inventory_items (scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items (category);
