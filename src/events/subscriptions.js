const { subscribe } = require("./subscriber");
const { BOOKING_CONFIRMED, BOOKING_CANCELLED } = require("./eventTypes");
const {
  reserveStockForBooking,
  releaseReservedStockForBooking,
} = require("../repositories/reservationRepository");

async function initSubscriptions() {
  if (!process.env.RABBITMQ_URL) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "event-subscriber",
      level: "WARN",
      message: "RABBITMQ_URL missing; inventory subscriptions disabled",
    }));
    return;
  }

  await subscribe(BOOKING_CONFIRMED, "inventory-service.bookings.confirmed", async (payload, ack, nack) => {
    try {
      await reserveStockForBooking(payload);
      ack();
    } catch (error) {
      nack(error);
    }
  });

  await subscribe(BOOKING_CANCELLED, "inventory-service.bookings.cancelled", async (payload, ack, nack) => {
    try {
      await releaseReservedStockForBooking(payload);
      ack();
    } catch (error) {
      nack(error);
    }
  });
}

module.exports = { initSubscriptions };
