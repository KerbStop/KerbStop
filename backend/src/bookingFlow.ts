// Booking state machine. Only payment confirmation (the Stripe webhook, or the mock
// checkout page) moves a booking out of pending_payment.
import { config } from "./config.js";
import { db, newId, nowIso } from "./db.js";
import { ApiError } from "./errors.js";
import {
  type Booking, type BookingRow, type ChargerRow, type Receipt,
  getBookingRow, getChargerRow, setBooking, toBooking,
} from "./models.js";
import * as payments from "./payments.js";
import { energyCents, holdCents, NO_SHOW_FEE_CENTS, split } from "./pricing.js";
import { slotFitsAvailability } from "./availability.js";
import { slotIsTaken } from "./slots.js";

const MAX_DAYS_AHEAD = 6; // card holds last about 7 days
const START_EARLY_MIN = 15;

function mustGetBooking(id: string): BookingRow {
  const row = getBookingRow(id);
  if (!row) throw new ApiError("invalid_input", `No booking with id ${id}`, 404);
  return row;
}

function mustGetCharger(id: string): ChargerRow {
  const row = getChargerRow(id);
  if (!row) throw new ApiError("charger_not_found", `No charger with id ${id}`);
  return row;
}

export async function createBooking(input: { chargerId: string; driverEmail: string; start: string; end: string }) {
  const charger = mustGetCharger(input.chargerId);
  const start = new Date(input.start);
  const end = new Date(input.end);
  const now = Date.now();

  if (end <= start) throw new ApiError("invalid_input", "end must be after start");
  if (end.getTime() < now) throw new ApiError("invalid_input", "That slot is in the past");
  if (start.getTime() - now > MAX_DAYS_AHEAD * 86_400_000) {
    throw new ApiError("invalid_input", `Bookings can be at most ${MAX_DAYS_AHEAD} days ahead, because card holds expire after about 7 days`);
  }
  if (!slotFitsAvailability(start, end, JSON.parse(charger.availability))) {
    throw new ApiError("invalid_input", "That slot is outside the charger's open hours");
  }

  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  const hold = holdCents(charger.powerKw, hours, charger.hostPriceCentsPerKwh, charger.overstayCentsPerMin);
  const id = newId("bk");

  // Check and insert in one transaction so two requests can't both grab the slot.
  db.transaction(() => {
    if (slotIsTaken(charger.id, startIso, endIso)) throw new ApiError("slot_taken", "Someone has already booked that slot");
    db.prepare(`INSERT INTO bookings (id, chargerId, driverEmail, start, end, status, holdCents, checkoutExpiresAt, createdAt)
                VALUES (?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?)`)
      .run(id, charger.id, input.driverEmail, startIso, endIso, hold, new Date(now + 31 * 60_000).toISOString(), nowIso());
  })();

  try {
    const hostAccount = charger.stripeAccountId && charger.payoutsEnabled ? charger.stripeAccountId : null;
    const checkout = await payments.createHoldCheckout({
      bookingId: id, holdCents: hold, chargerTitle: charger.title, hostAccountId: hostAccount,
    });
    setBooking(id, {
      checkoutSessionId: checkout.checkoutSessionId,
      checkoutExpiresAt: checkout.expiresAt,
      destinationCharge: checkout.destinationCharge ? 1 : 0,
    });
    return { bookingId: id, checkoutUrl: checkout.url, holdCents: hold };
  } catch (err) {
    setBooking(id, { status: "expired" });
    throw err;
  }
}

/** checkout.session.completed: the hold is in place. */
export async function onPaymentConfirmed(bookingId: string, paymentIntentId: string, riskLevel: Booking["riskLevel"]) {
  const b = getBookingRow(bookingId);
  if (!b) return;
  setBooking(bookingId, { paymentIntentId, riskLevel });
  if (b.status !== "pending_payment" || slotIsTaken(b.chargerId, b.start, b.end, b.id)) {
    // Paid too late, or someone else's payment landed first: release this hold at once.
    await payments.cancelHold(paymentIntentId);
    setBooking(bookingId, { status: "cancelled" });
    return;
  }
  setBooking(bookingId, { status: "reserved" });
}

/** checkout.session.expired: the driver never paid, so the slot frees up. */
export function onCheckoutExpired(bookingId: string) {
  const b = getBookingRow(bookingId);
  if (b?.status === "pending_payment") setBooking(bookingId, { status: "expired" });
}

/** payment_intent.payment_failed with a Radar block: keep it for the host dashboard. */
export function onPaymentBlocked(bookingId: string, riskLevel: Booking["riskLevel"]) {
  const b = getBookingRow(bookingId);
  if (b?.status === "pending_payment") setBooking(bookingId, { riskLevel: riskLevel ?? "highest" });
}

/** payment_intent.canceled: if we didn't cancel it ourselves, the hold ran out. */
export function onHoldCanceled(bookingId: string) {
  const b = getBookingRow(bookingId);
  if (b?.status === "reserved") setBooking(bookingId, { status: "expired" });
}

export function startCharging(id: string) {
  const b = mustGetBooking(id);
  if (b.status === "pending_payment") throw new ApiError("payment_not_confirmed", "Payment hasn't been confirmed yet");
  if (b.status !== "reserved") throw new ApiError("booking_not_active", `Booking is ${b.status}, not reserved`);
  const opensAt = new Date(b.start).getTime() - START_EARLY_MIN * 60_000;
  if (Date.now() < opensAt) {
    throw new ApiError("booking_not_active", `Charging opens ${START_EARLY_MIN} minutes before your slot starts`);
  }
  setBooking(id, { status: "charging", chargingStartedAt: nowIso() });
  return toBooking(mustGetBooking(id));
}

/**
 * Simulated meter. The charger's clock runs DEMO_SPEEDUP times faster than real time
 * from the moment charging starts. Energy flows at full power until the slot ends;
 * after the grace period, overstay is charged per minute. Never exceeds the hold.
 */
function readMeter(b: BookingRow, c: ChargerRow) {
  const startedAt = new Date(b.chargingStartedAt!).getTime();
  const simNow = startedAt + (Date.now() - startedAt) * config.demoSpeedup;
  const slotEnd = new Date(b.end).getTime();
  const chargingMs = Math.max(0, Math.min(simNow, slotEnd) - startedAt);
  const kwh = c.powerKw * (chargingMs / 3_600_000);
  const overstayMin = Math.max(0, Math.floor((simNow - slotEnd) / 60_000) - c.graceMinutes);

  let energy = energyCents(kwh, c.hostPriceCentsPerKwh);
  let overstay = overstayMin * c.overstayCentsPerMin;
  const capped = energy + overstay >= b.holdCents;
  if (capped) {
    energy = Math.min(energy, b.holdCents);
    overstay = b.holdCents - energy;
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

export async function meter(id: string) {
  const b = mustGetBooking(id);
  if (b.status === "completed") {
    const r: Receipt = JSON.parse(b.receipt!);
    return { kwhDelivered: b.kwhDelivered, runningCostCents: r.totalCents, elapsedMinutes: null, status: b.status };
  }
  if (b.status !== "charging") throw new ApiError("booking_not_active", `Booking is ${b.status}, not charging`);
  const m = readMeter(b, mustGetCharger(b.chargerId));
  if (m.capped) {
    await stopCharging(id);
    return { kwhDelivered: m.kwhDelivered, runningCostCents: m.runningCostCents, elapsedMinutes: m.elapsedMinutes, status: "completed" };
  }
  setBooking(id, { kwhDelivered: m.kwhDelivered });
  return { kwhDelivered: m.kwhDelivered, runningCostCents: m.runningCostCents, elapsedMinutes: m.elapsedMinutes, status: b.status };
}

/** Capture what was used (capped at the hold) with Kerb's fee; Stripe releases the rest. */
export async function stopCharging(id: string) {
  const b = mustGetBooking(id);
  if (b.status !== "charging") throw new ApiError("booking_not_active", `Booking is ${b.status}, not charging`);
  const m = readMeter(b, mustGetCharger(b.chargerId));
  const totalCents = m.runningCostCents;
  const { hostEarnsCents, kerbFeeCents } = split(totalCents);

  if (totalCents === 0) await payments.cancelHold(b.paymentIntentId!);
  else await payments.capture(b.paymentIntentId!, totalCents, b.destinationCharge ? kerbFeeCents : null);

  const receipt: Receipt = {
    energyCents: m.energyCents,
    overstayCents: m.overstayCents,
    noShowCents: 0,
    totalCents,
    releasedCents: b.holdCents - totalCents,
    hostEarnsCents,
  };
  setBooking(id, { status: "completed", kwhDelivered: m.kwhDelivered, receipt: JSON.stringify(receipt) });
  return toBooking(mustGetBooking(id));
}

/** Driver cancels before the slot starts: release the hold, free of charge. */
export async function cancelBooking(id: string) {
  const b = mustGetBooking(id);
  if (b.status === "pending_payment") {
    if (b.checkoutSessionId) await payments.expireCheckout(b.checkoutSessionId);
    setBooking(id, { status: "cancelled" });
  } else if (b.status === "reserved") {
    if (Date.now() >= new Date(b.start).getTime()) {
      throw new ApiError("booking_not_active", "The slot has started; cancelling now counts as a no-show");
    }
    if (b.paymentIntentId) await payments.cancelHold(b.paymentIntentId);
    setBooking(id, { status: "cancelled" });
  } else {
    throw new ApiError("booking_not_active", `Booking is ${b.status} and can't be cancelled`);
  }
  return toBooking(mustGetBooking(id));
}

/** Runs every minute: reserved bookings past start + grace become no-shows. */
export async function sweepNoShows() {
  const due = db.prepare(`
    SELECT b.* FROM bookings b JOIN chargers c ON c.id = b.chargerId
    WHERE b.status = 'reserved'
      AND strftime('%s', b.start) + c.graceMinutes * 60 < strftime('%s', 'now')`).all() as BookingRow[];
  for (const b of due) {
    try {
      const fee = Math.min(NO_SHOW_FEE_CENTS, b.holdCents);
      const { hostEarnsCents, kerbFeeCents } = split(fee);
      await payments.capture(b.paymentIntentId!, fee, b.destinationCharge ? kerbFeeCents : null);
      const receipt: Receipt = {
        energyCents: 0, overstayCents: 0, noShowCents: fee,
        totalCents: fee, releasedCents: b.holdCents - fee, hostEarnsCents,
      };
      setBooking(b.id, { status: "no_show", receipt: JSON.stringify(receipt) });
    } catch (err) {
      console.error(`no-show capture failed for ${b.id}`, err);
    }
  }
  // Backstop for missed checkout.session.expired webhooks (and mock mode).
  db.prepare(`UPDATE bookings SET status = 'expired'
              WHERE status = 'pending_payment' AND checkoutExpiresAt < ?`)
    .run(new Date(Date.now() - 5 * 60_000).toISOString());
}
