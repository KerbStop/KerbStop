// Shared types from the team plan's API contract, plus row <-> API mapping.
import { one, q, type Queryer } from "./db.js";
import { driverPriceCentsPerKwh } from "./pricing.js";

export type Window = { day: 0 | 1 | 2 | 3 | 4 | 5 | 6; start: string; end: string };

export type Charger = {
  id: string;
  hostName: string;
  hostType: "home" | "business";
  title: string;
  lat: number;
  lng: number;
  area: string;
  connector: "Type 2" | "CCS";
  powerKw: number;
  priceCentsPerKwh: number;
  overstayCentsPerMin: number;
  graceMinutes: number;
  availability: Window[];
  offPeak: boolean;
  rating: number;
  distanceKm?: number;
};

export type BookingStatus =
  | "pending_payment" | "reserved" | "charging" | "completed"
  | "no_show" | "cancelled" | "expired" | "blocked";

export type RiskLevel = "normal" | "elevated" | "highest" | "not_assessed" | null;

export type Receipt = {
  energyCents: number;
  overstayCents: number;
  noShowCents: number;
  totalCents: number;
  releasedCents: number;
  hostEarnsCents: number;
};

export type Booking = {
  id: string;
  chargerId: string;
  driverEmail: string;
  start: string;
  end: string;
  status: BookingStatus;
  holdCents: number;
  riskLevel: RiskLevel;
  kwhDelivered: number;
  receipt: Receipt | null;
};

export type ChargerRow = {
  id: string; host_id: string; title: string; lat: number; lng: number; area: string;
  connector: string; power_kw: number; host_price_cents_per_kwh: number; overstay_cents_per_min: number;
  grace_minutes: number; availability: Window[]; off_peak: boolean; rating: number;
  host_name: string; host_type: string; stripe_account_id: string | null; payouts_enabled: boolean;
};

export type BookingRow = {
  id: string; charger_id: string; driver_user_id: string; driver_email: string;
  start_at: Date; end_at: Date; status: BookingStatus; hold_cents: number;
  checkout_session_id: string | null; checkout_expires_at: Date | null; payment_intent_id: string | null;
  destination_charge: boolean; was_blocked: boolean; risk_level: RiskLevel;
  charging_started_at: Date | null; kwh_delivered: number; receipt: Receipt | null; created_at: Date;
};

const CHARGER_SELECT = `
  SELECT c.*, h.name AS host_name, h.host_type, h.stripe_account_id, h.payouts_enabled
  FROM chargers c JOIN hosts h ON h.id = c.host_id`;

export const getChargerRow = (id: string) => one<ChargerRow>(`${CHARGER_SELECT} WHERE c.id = $1`, [id]);
export const allChargerRows = () => q<ChargerRow>(`${CHARGER_SELECT} ORDER BY c.id`);
export const chargerRowsForHost = (hostId: string) =>
  q<ChargerRow>(`${CHARGER_SELECT} WHERE c.host_id = $1 ORDER BY c.id`, [hostId]);

export function toCharger(r: ChargerRow): Charger {
  return {
    id: r.id,
    hostName: r.host_name,
    hostType: r.host_type as Charger["hostType"],
    title: r.title,
    lat: r.lat,
    lng: r.lng,
    area: r.area,
    connector: r.connector as Charger["connector"],
    powerKw: r.power_kw,
    priceCentsPerKwh: driverPriceCentsPerKwh(r.host_price_cents_per_kwh),
    overstayCentsPerMin: r.overstay_cents_per_min,
    graceMinutes: r.grace_minutes,
    availability: r.availability,
    offPeak: r.off_peak,
    rating: r.rating,
  };
}

export const getBookingRow = (id: string) => one<BookingRow>(`SELECT * FROM bookings WHERE id = $1`, [id]);

export function toBooking(r: BookingRow): Booking {
  return {
    id: r.id,
    chargerId: r.charger_id,
    driverEmail: r.driver_email,
    start: new Date(r.start_at).toISOString(),
    end: new Date(r.end_at).toISOString(),
    status: r.status,
    holdCents: r.hold_cents,
    riskLevel: r.risk_level,
    kwhDelivered: Math.round(r.kwh_delivered * 1000) / 1000,
    receipt: r.receipt,
  };
}

/** Update booking columns, e.g. setBooking(id, { status: "reserved" }). */
export async function setBooking(id: string, fields: Partial<BookingRow>, db: Queryer | null = null) {
  const keys = Object.keys(fields) as (keyof BookingRow)[];
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = keys.map((k) => (k === "receipt" ? JSON.stringify(fields[k]) : fields[k]));
  const sql = `UPDATE bookings SET ${sets} WHERE id = $1`;
  if (db) await db.query(sql, [id, ...values]);
  else await q(sql, [id, ...values]);
}
