import Database from "better-sqlite3";
import { config } from "./config.js";

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS hosts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  hostType TEXT NOT NULL CHECK (hostType IN ('home','business')),
  stripeAccountId TEXT,
  payoutsEnabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS chargers (
  id TEXT PRIMARY KEY,
  hostId TEXT NOT NULL REFERENCES hosts(id),
  title TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  area TEXT NOT NULL,
  connector TEXT NOT NULL,
  powerKw REAL NOT NULL,
  hostPriceCentsPerKwh INTEGER NOT NULL,
  overstayCentsPerMin INTEGER NOT NULL,
  graceMinutes INTEGER NOT NULL,
  availability TEXT NOT NULL,
  offPeak INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  chargerId TEXT NOT NULL REFERENCES chargers(id),
  driverEmail TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  status TEXT NOT NULL,
  holdCents INTEGER NOT NULL,
  checkoutSessionId TEXT,
  checkoutExpiresAt TEXT,
  paymentIntentId TEXT,
  destinationCharge INTEGER NOT NULL DEFAULT 0,
  riskLevel TEXT,
  chargingStartedAt TEXT,
  kwhDelivered REAL NOT NULL DEFAULT 0,
  receipt TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_charger ON bookings(chargerId, status);
CREATE TABLE IF NOT EXISTS stripe_events (
  eventId TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  receivedAt TEXT NOT NULL
);
`);

export const nowIso = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
