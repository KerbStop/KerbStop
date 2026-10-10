// Booking state machine. Only the Stripe webhook moves a booking out of pending_payment.
import type { User } from "./auth.js";
import { config } from "./config.js";
import { newId, q, tx } from "./db.js";
import { ApiError } from "./errors.js";
import {
  type BookingRow, type ChargerRow, type Receipt, type RiskLevel,
  getBookingRow, getChargerRow, setBooking, toBooking,
} from "./models.js";
import { payments } from "./payments.js";
import { energyCents, holdCents, NO_SHOW_FEE_CENTS, split } from "./pricing.js";
import { slotFitsAvailability } from "./availability.js";
import { slotIsTaken } from "./slots.js";

const MAX_DAYS_AHEAD = 6; // card holds last about 7 days
const START_EARLY_MIN = 15;

async function mustGetCharger(id: string): Promise<ChargerRow> {
  const row = await getChargerRow(id);
  if (!row) throw new ApiError("charger_not_found", `No charger with id ${id}`);
  return row;
}

/** The booking, if it belongs to this driver. */
export async function driverBooking(id: string, user: User): Promise<BookingRow> {
  const row = await getBookingRow(id);
  if (!row || row.driver_user_id !== user.id) throw new ApiError("not_found", `No booking with id ${id}`);
  return row;
}

/** Host account to pay, refreshing payouts status from Stripe if we haven't seen it enabled yet. */
async function hostAccountFor(c: ChargerRow): Promise<string | null> {
  if (!c.stripe_account_id) return null;
  if (c.payouts_enabled) return c.stripe_account_id;
  const enabled = await payments.payoutsEnabled(c.stripe_account_id);
  if (!enabled) return null;
  await q(`UPDATE hosts SET payouts_enabled = true WHERE id = $1`, [c.host_id]);
  return c.stripe_account_id;
}

export async function createBooking(user: User, input: { chargerId: string; start: string; end: string }) {
  const charger = await mustGetCharger(input.chargerId);
  const start = new Date(input.start);
  const end = new Date(input.end);
  const now = Date.now();

  if (end <= start) throw new ApiError("invalid_input", "end must be after start");
  if (end.getTime() < now) throw new ApiError("invalid_input", "That slot is in the past");
  if (start.getTime() - now > MAX_DAYS_AHEAD * 86_400_000) {
    throw new ApiError("invalid_input", `Bookings can be at most ${MAX_DAYS_AHEAD} days ahead, because card holds expire after about 7 days`);
  }
  if (!slotFitsAvailability(start, end, charger.availability)) {
    throw new ApiError("invalid_input", "That slot is outside the charger's open hours");
  }

  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  const hold = holdCents(charger.power_kw, hours, charger.host_price_cents_per_kwh, charger.overstay_cents_per_min);
  const id = newId("bk");

  // Lock the charger for the check-and-insert so two requests can't both grab the slot.
  await tx(async (db) => {
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [charger.id]);
    if (await slotIsTaken(charger.id, startIso, endIso, "", db)) {
      throw new ApiError("slot_taken", "Someone has already booked that slot");
    }
    await db.query(`
      INSERT INTO bookings (id, charger_id, driver_user_id, driver_email, start_at, end_at, status, hold_cents, checkout_expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending_payment', $7, $8)`,
      [id, charger.id, user.id, user.email, startIso, endIso, hold, new Date(now + 31 * 60_000).toISOString()]);
  });

  try {
    const hostAccount = await hostAccountFor(charger);
    const checkout = await payments.createHoldCheckout({
      bookingId: id, holdCents: hold, chargerTitle: charger.title, driverEmail: user.email, hostAccountId: hostAccount,
    });
    await setBooking(id, {
      checkout_session_id: checkout.checkoutSessionId,
      checkout_expires_at: new Date(checkout.expiresAt),
      destination_charge: !!hostAccount,
    });
    return { bookingId: id, checkoutUrl: checkout.url, holdCents: hold };
  } catch (err) {
    await setBooking(id, { status: "expired" });
    throw err;
  }
}

/** checkout.session.completed: the hold is in place. */
export async function onPaymentConfirmed(bookingId: string, paymentIntentId: string, riskLevel: RiskLevel) {
  const b = await getBookingRow(bookingId);
  if (!b) return;
  const lost = await tx(async (db) => {
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [b.charger_id]);
    const taken = await slotIsTaken(b.charger_id, b.start_at.toISOString(), b.end_at.toISOString(), b.id, db);
    const current = (await db.query(`SELECT status FROM bookings WHERE id = $1`, [b.id])).rows[0]?.status;
    const ok = current === "pending_payment" && !taken;
    await setBooking(b.id, { payment_intent_id: paymentIntentId, risk_level: riskLevel, status: ok ? "reserved" : "cancelled" }, db);
    return !ok;
  });
  // Paid too late, or someone else's payment landed first: release this hold at once.
  if (lost) await payments.cancelHold(paymentIntentId);
}

/**
 * checkout.session.expired: the driver never paid, so the slot frees up. If Radar blocked
 * their card along the way it ends as "blocked" so the host can see it.
 */
export async function onCheckoutExpired(bookingId: string) {
  await q(`UPDATE bookings SET status = CASE WHEN was_blocked THEN 'blocked' ELSE 'expired' END
           WHERE id = $1 AND status = 'pending_payment'`, [bookingId]);
}

/**
 * payment_intent.payment_failed with a Radar block. The booking stays pending_payment so
 * the driver can retry with another card (which goes through Radar and 3D Secure again)
 * until checkout expires.
 */
export async function onPaymentBlocked(bookingId: string, riskLevel: RiskLevel) {
  await q(`UPDATE bookings SET was_blocked = true, risk_level = $2 WHERE id = $1 AND status = 'pending_payment'`,
    [bookingId, riskLevel ?? "highest"]);
}

/** payment_intent.canceled: if we didn't cancel it ourselves, the hold ran out. */
export async function onHoldCanceled(bookingId: string) {
  await q(`UPDATE bookings SET status = 'expired' WHERE id = $1 AND status = 'reserved'`, [bookingId]);
}

export async function startCharging(id: string, user: User) {
  const b = await driverBooking(id, user);
  if (b.status === "pending_payment") throw new ApiError("payment_not_confirmed", "Payment hasn't been confirmed yet");
  if (b.status !== "reserved") throw new ApiError("booking_not_active", `Booking is ${b.status}, not reserved`);
  if (Date.now() < b.start_at.getTime() - START_EARLY_MIN * 60_000) {
    throw new ApiError("booking_not_active", `Charging opens ${START_EARLY_MIN} minutes before your slot starts`);
  }
  await setBooking(id, { status: "charging", charging_started_at: new Date() });
  return toBooking((await getBookingRow(id))!);
}

/**
 * Simulated meter. The charger's clock runs DEMO_SPEEDUP times faster than real time
 * from the moment charging starts. Energy flows at full power until the slot ends;
 * after the grace period, overstay is charged per minute. Never exceeds the hold.
 */
function readMeter(b: BookingRow, c: ChargerRow) {
  const startedAt = b.charging_started_at!.getTime();
  const simNow = startedAt + (Date.now() - startedAt) * config.demoSpeedup;
  const slotEnd = b.end_at.getTime();
  const chargingMs = Math.max(0, Math.min(simNow, slotEnd) - startedAt);
  const kwh = c.power_kw * (chargingMs / 3_600_000);
  const overstayMin = Math.max(0, Math.floor((simNow - slotEnd) / 60_000) - c.grace_minutes);

  let energy = energyCents(kwh, c.host_price_cents_per_kwh);
  let overstay = overstayMin * c.overstay_cents_per_min;
  const capped = energy + overstay >= b.hold_cents;
  if (capped) {
    energy = Math.min(energy, b.hold_cents);
    overstay = b.hold_cents - energy;
  }
  return {
    kwhDelivered: Math.round(kwh * 1000) / 1000,
    energyCents: energy,
    overstayCents: overstay,
    runningCostCents: energy + overstay,
    elapsedMinutes: Math.floor((simNow - startedAt) / 60_000),
    capped,
  };
}

export async function meter(id: string, user: User) {
  const b = await driverBooking(id, user);
  if (b.status === "completed") {
    return { kwhDelivered: b.kwh_delivered, runningCostCents: b.receipt!.totalCents, elapsedMinutes: null, status: b.status };
  }
  if (b.status !== "charging") throw new ApiError("booking_not_active", `Booking is ${b.status}, not charging`);
  const m = readMeter(b, await mustGetCharger(b.charger_id));
  if (m.capped) {
    await stopCharging(id, user);
    return { kwhDelivered: m.kwhDelivered, runningCostCents: m.runningCostCents, elapsedMinutes: m.elapsedMinutes, status: "completed" };
  }
  await setBooking(id, { kwh_delivered: m.kwhDelivered });
  return { kwhDelivered: m.kwhDelivered, runningCostCents: m.runningCostCents, elapsedMinutes: m.elapsedMinutes, status: b.status };
}

/** Capture what was used (capped at the hold) with Kerb's fee; Stripe releases the rest. */
export async function stopCharging(id: string, user: User) {
  const b = await driverBooking(id, user);
  if (b.status !== "charging") throw new ApiError("booking_not_active", `Booking is ${b.status}, not charging`);
  const m = readMeter(b, await mustGetCharger(b.charger_id));
  const totalCents = m.runningCostCents;
  const { hostEarnsCents, kerbFeeCents } = split(totalCents);

  if (totalCents === 0) await payments.cancelHold(b.payment_intent_id!);
  else await payments.capture(b.payment_intent_id!, totalCents, b.destination_charge ? kerbFeeCents : null);

  const receipt: Receipt = {
    energyCents: m.energyCents,
    overstayCents: m.overstayCents,
    noShowCents: 0,
    totalCents,
    releasedCents: b.hold_cents - totalCents,
    hostEarnsCents,
  };
  await setBooking(id, { status: "completed", kwh_delivered: m.kwhDelivered, receipt });
  return toBooking((await getBookingRow(id))!);
}

/** Driver cancels before the slot starts: release the hold, free of charge. */
export async function cancelBooking(id: string, user: User) {
  const b = await driverBooking(id, user);
  if (b.status === "pending_payment") {
    if (b.checkout_session_id) await payments.expireCheckout(b.checkout_session_id);
    await setBooking(id, { status: "cancelled" });
  } else if (b.status === "reserved") {
    if (Date.now() >= b.start_at.getTime()) {
      throw new ApiError("booking_not_active", "The slot has started; cancelling now counts as a no-show");
    }
    if (b.payment_intent_id) await payments.cancelHold(b.payment_intent_id);
    await setBooking(id, { status: "cancelled" });
  } else {
    throw new ApiError("booking_not_active", `Booking is ${b.status} and can't be cancelled`);
  }
  return toBooking((await getBookingRow(id))!);
}

/** Runs every minute: reserved bookings past start + grace become no-shows. */
export async function sweepNoShows() {
  const due = await q<BookingRow>(`
    SELECT b.* FROM bookings b JOIN chargers c ON c.id = b.charger_id
    WHERE b.status = 'reserved' AND b.start_at + make_interval(mins => c.grace_minutes) < now()`);
  for (const b of due) {
    try {
      const fee = Math.min(NO_SHOW_FEE_CENTS, b.hold_cents);
      const { hostEarnsCents, kerbFeeCents } = split(fee);
      await payments.capture(b.payment_intent_id!, fee, b.destination_charge ? kerbFeeCents : null);
      const receipt: Receipt = {
        energyCents: 0, overstayCents: 0, noShowCents: fee,
        totalCents: fee, releasedCents: b.hold_cents - fee, hostEarnsCents,
      };
      await setBooking(b.id, { status: "no_show", receipt });
    } catch (err) {
      console.error(`no-show capture failed for ${b.id}`, err);
    }
  }
  // Backstop for missed checkout.session.expired webhooks.
  await q(`UPDATE bookings SET status = CASE WHEN was_blocked THEN 'blocked' ELSE 'expired' END
           WHERE status = 'pending_payment' AND checkout_expires_at < now() - interval '5 minutes'`);
}
