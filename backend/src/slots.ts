import type { Queryer } from "./db.js";
import { q } from "./db.js";

/**
 * A slot is taken if it overlaps a reserved or charging booking, or a pending_payment
 * booking whose Checkout Session hasn't expired yet.
 */
export async function slotIsTaken(chargerId: string, start: string, end: string, excludeBookingId = "", db?: Queryer) {
  const sql = `
    SELECT 1 FROM bookings
    WHERE charger_id = $1 AND id <> $2
      AND start_at < $3 AND end_at > $4
      AND (status IN ('reserved','charging')
           OR (status = 'pending_payment' AND checkout_expires_at > now()))
    LIMIT 1`;
  const params = [chargerId, excludeBookingId, end, start];
  const rows = db ? (await db.query(sql, params)).rows : await q(sql, params);
  return rows.length > 0;
}
