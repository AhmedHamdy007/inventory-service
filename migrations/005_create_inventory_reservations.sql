CREATE TABLE IF NOT EXISTS inventory_reservations (
  booking_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  stylist_id TEXT,
  service_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'released')),
  reserved_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_shop_status
  ON inventory_reservations (shop_id, status, updated_at DESC);
