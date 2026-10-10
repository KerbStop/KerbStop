// Postgres access (Supabase in production). Every query goes through `q`, and
// multi-step changes through `tx`, so tests can swap in an in-memory Postgres.
import pg from "pg";
import { config } from "./config.js";

export type Row = Record<string, any>;
export type Queryer = { query: (text: string, params?: unknown[]) => Promise<{ rows: Row[] }> };

type Driver = Queryer & {
  transaction: <T>(fn: (q: Queryer) => Promise<T>) => Promise<T>;
  exec?: (sql: string) => Promise<unknown>; // multi-statement SQL, where query() can't
};

let driver: Driver | null = null;

function pgDriver(): Driver {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    // Supabase requires TLS; local Postgres usually doesn't have it.
    ssl: /localhost|127\.0\.0\.1/.test(config.databaseUrl) ? undefined : { rejectUnauthorized: false },
    max: 5,
  });
  return {
    query: (text, params) => pool.query(text, params as any[]),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({ query: (t, p) => client.query(t, p as any[]) });
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

/** Tests call this with an in-memory Postgres before anything touches the database. */
export function useDriver(d: Driver) {
  driver = d;
}

function current(): Driver {
  return (driver ??= pgDriver());
}

export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await current().query(text, params)).rows as T[];
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(text, params))[0];
}

export function tx<T>(fn: (q: Queryer) => Promise<T>): Promise<T> {
  return current().transaction(fn);
}

export const nowIso = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                       -- Supabase auth user id
  email TEXT NOT NULL,
  identity_status TEXT NOT NULL DEFAULT 'unverified',
  identity_session_id TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hosts (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE REFERENCES users(id),  -- null for seeded demo hosts
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  host_type TEXT NOT NULL CHECK (host_type IN ('home','business')),
  stripe_account_id TEXT,
  payouts_enabled BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS chargers (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id),
  title TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  area TEXT NOT NULL,
  connector TEXT NOT NULL,
  power_kw DOUBLE PRECISION NOT NULL,
  host_price_cents_per_kwh INTEGER NOT NULL,
  overstay_cents_per_min INTEGER NOT NULL,
  grace_minutes INTEGER NOT NULL,
  availability JSONB NOT NULL,
  off_peak BOOLEAN NOT NULL DEFAULT false,
  rating DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  charger_id TEXT NOT NULL REFERENCES chargers(id),
  driver_user_id TEXT NOT NULL REFERENCES users(id),
  driver_email TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  hold_cents INTEGER NOT NULL,
  checkout_session_id TEXT,
  checkout_expires_at TIMESTAMPTZ,
  payment_intent_id TEXT,
  destination_charge BOOLEAN NOT NULL DEFAULT false,
  was_blocked BOOLEAN NOT NULL DEFAULT false,
  risk_level TEXT,
  charging_started_at TIMESTAMPTZ,
  kwh_delivered DOUBLE PRECISION NOT NULL DEFAULT 0,
  receipt JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_charger ON bookings(charger_id, status);
CREATE INDEX IF NOT EXISTS bookings_driver ON bookings(driver_user_id);
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function migrate() {
  const d = current();
  if (d.exec) await d.exec(SCHEMA);
  else await d.query(SCHEMA);
}
