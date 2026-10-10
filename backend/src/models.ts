// Shared types from the team plan's API contract, plus row <-> API mapping.
import { db } from "./db.js";
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
  riskLevel: "normal" | "elevated" | "highest" | "not_assessed" | null;
  kwhDelivered: number;
  receipt: Receipt | null;
};

export type ChargerRow = {
  id: string; hostId: string; title: string; lat: number; lng: number; area: string;
  connector: string; powerKw: number; hostPriceCentsPerKwh: number; overstayCentsPerMin: number;
  graceMinutes: number; availability: string; offPeak: number; rating: number;
  hostName: string; hostType: string; stripeAccountId: string | null; payoutsEnabled: number;
};

export type BookingRow = {
  id: string; chargerId: string; driverEmail: string; start: string; end: string;
  status: BookingStatus; holdCents: number; checkoutSessionId: string | null;
  checkoutExpiresAt: string | null; paymentIntentId: string | null; destinationCharge: number;
  riskLevel: Booking["riskLevel"]; chargingStartedAt: string | null; kwhDelivered: number;
  receipt: string | null; createdAt: string;
};

const CHARGER_SELECT = `
  SELECT c.*, h.name AS hostName, h.hostType, h.stripeAccountId, h.payoutsEnabled
  FROM chargers c JOIN hosts h ON h.id = c.hostId`;

export function getChargerRow(id: string): ChargerRow | undefined {
  return db.prepare(`${CHARGER_SELECT} WHERE c.id = ?`).get(id) as ChargerRow | undefined;
}

export function allChargerRows(): ChargerRow[] {
  return db.prepare(CHARGER_SELECT).all() as ChargerRow[];
}

export function chargerRowsForHost(hostId: string): ChargerRow[] {
  return db.prepare(`${CHARGER_SELECT} WHERE c.hostId = ?`).all(hostId) as ChargerRow[];
}

export function toCharger(r: ChargerRow): Charger {
  return {
    id: r.id,
    hostName: r.hostName,
    hostType: r.hostType as Charger["hostType"],
    title: r.title,
    lat: r.lat,
    lng: r.lng,
    area: r.area,
    connector: r.connector as Charger["connector"],
    powerKw: r.powerKw,
    priceCentsPerKwh: driverPriceCentsPerKwh(r.hostPriceCentsPerKwh),
    overstayCentsPerMin: r.overstayCentsPerMin,
    graceMinutes: r.graceMinutes,
    availability: JSON.parse(r.availability),
    offPeak: !!r.offPeak,
    rating: r.rating,
  };
}

export function getBookingRow(id: string): BookingRow | undefined {
  return db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(id) as BookingRow | undefined;
}

export function toBooking(r: BookingRow): Booking {
  return {
    id: r.id,
    chargerId: r.chargerId,
    driverEmail: r.driverEmail,
    start: r.start,
    end: r.end,
    status: r.status,
    holdCents: r.holdCents,
    riskLevel: r.riskLevel,
    kwhDelivered: Math.round(r.kwhDelivered * 1000) / 1000,
    receipt: r.receipt ? JSON.parse(r.receipt) : null,
  };
}

export function setBooking(id: string, fields: Partial<BookingRow>) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  db.prepare(`UPDATE bookings SET ${keys.map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id`)
    .run({ ...fields, id });
}
