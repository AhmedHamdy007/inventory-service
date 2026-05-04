const { query } = require("../db/pool");

function rowToReservation(row) {
  if (!row) return null;
  return {
    bookingId: row.booking_id,
    userId: row.user_id,
    shopId: row.shop_id,
    stylistId: row.stylist_id,
    serviceId: row.service_id,
    status: row.status,
    reservedAt: row.reserved_at,
    releasedAt: row.released_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function reserveStockForBooking(payload) {
  const result = await query(
    `INSERT INTO inventory_reservations (
      booking_id, user_id, shop_id, stylist_id, service_id, status, reserved_at, released_at
    )
    VALUES ($1, $2, $3, $4, $5, 'reserved', NOW(), NULL)
    ON CONFLICT (booking_id)
    DO UPDATE SET user_id = EXCLUDED.user_id,
                  shop_id = EXCLUDED.shop_id,
                  stylist_id = EXCLUDED.stylist_id,
                  service_id = EXCLUDED.service_id,
                  status = 'reserved',
                  reserved_at = COALESCE(inventory_reservations.reserved_at, NOW()),
                  released_at = NULL,
                  updated_at = NOW()
    RETURNING *`,
    [
      payload.bookingId,
      payload.userId,
      payload.shopId,
      payload.stylistId,
      payload.serviceId,
    ]
  );
  return rowToReservation(result.rows[0]);
}

async function releaseReservedStockForBooking(payload) {
  const result = await query(
    `INSERT INTO inventory_reservations (
      booking_id, user_id, shop_id, stylist_id, service_id, status, reserved_at, released_at
    )
    VALUES ($1, $2, $3, NULL, NULL, 'released', NULL, NOW())
    ON CONFLICT (booking_id)
    DO UPDATE SET status = 'released',
                  released_at = NOW(),
                  updated_at = NOW()
    RETURNING *`,
    [payload.bookingId, payload.userId, payload.shopId]
  );
  return rowToReservation(result.rows[0]);
}

module.exports = {
  reserveStockForBooking,
  releaseReservedStockForBooking,
};
