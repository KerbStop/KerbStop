import { db, nowIso } from "./db.js";

/**
 * A slot is taken if it overlaps a reserved or charging booking, or a pending_payment
 * booking whose Checkout Session hasn't expired yet.
 */
export function slotIsTaken(chargerId: string, start: string, end: string, excludeBookingId = ""): boolean {
  const row = db.prepare(`
    SELECT 1 FROM bookings
    WHERE chargerId = ? AND id != ?
      AND start < ? AND end > ?
      AND (status IN ('reserved','charging')
           OR (status = 'pending_payment' AND checkoutExpiresAt > ?))
    LIMIT 1`).get(chargerId, excludeBookingId, end, start, nowIso());
  return !!row;
}
