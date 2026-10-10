// End-to-end API tests against an in-memory Postgres (PGlite) with a fake Stripe.
// Webhooks are posted to the real route; only signature checks and Stripe calls are faked.
import "./env.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { PGlite } from "@electric-sql/pglite";
import { SignJWT } from "jose";
import { useDriver, migrate } from "../src/db.js";
import { usePayments, type Payments } from "../src/payments.js";

const calls: { fn: string; args: unknown[] }[] = [];
const risk: Record<string, string> = {};
const fakePayments: Payments = {
  createConnectedAccount: async () => "acct_test",
  onboardingLink: async (a) => `https://connect.stripe.test/${a}`,
  payoutsEnabled: async (a) => a === "acct_test",
  createHoldCheckout: async (o) => {
    calls.push({ fn: "createHoldCheckout", args: [o] });
    return { checkoutSessionId: `cs_${o.bookingId}`, url: `https://checkout.stripe.test/${o.bookingId}`, expiresAt: new Date(Date.now() + 31 * 60_000).toISOString() };
  },
  getPaymentIntentRisk: async (pi) => (risk[pi] ?? "normal") as any,
  getChargeOutcome: async () => ({ type: "blocked", riskLevel: "highest" }),
  capture: async (...args) => void calls.push({ fn: "capture", args }),
  cancelHold: async (...args) => void calls.push({ fn: "cancelHold", args }),
  expireCheckout: async () => {},
  createIdentitySession: async (userId) => ({ id: `vs_${userId}`, url: `https://verify.stripe.test/${userId}` }),
  constructEvent: (raw) => JSON.parse(raw.toString()),
};

let server: Server;
let base = "";

before(async () => {
  const pg = new PGlite();
  useDriver({
    query: (t, p) => pg.query(t, p as any[]),
    transaction: (fn) => pg.transaction((t) => fn({ query: (s, p) => t.query(s, p as any[]) })),
    exec: (s) => pg.exec(s),
  });
  usePayments(fakePayments);
  await migrate();
  const { seedIfEmpty } = await import("../src/seed.js");
  await seedIfEmpty();
  const { app } = await import("../src/app.js");
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${(server.address() as { port: number }).port}/api`;
});
after(() => server.close());

const tokenFor = (sub: string) =>
  new SignJWT({ email: `${sub}@example.com` }).setProtectedHeader({ alg: "HS256" }).setSubject(sub)
    .setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));

async function call(method: string, path: string, body?: unknown, who?: string) {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (who) headers.Authorization = `Bearer ${await tokenFor(who)}`;
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

const webhook = (type: string, object: unknown) =>
  fetch(`${base}/webhooks/stripe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": "test" },
    body: JSON.stringify({ id: `evt_${crypto.randomUUID()}`, type, data: { object } }),
  });

const pay = (bookingId: string, pi = `pi_${bookingId}`) =>
  webhook("checkout.session.completed", { client_reference_id: bookingId, payment_intent: pi });

async function verify(who: string) {
  await call("POST", "/me/verify", {}, who);
  await webhook("identity.verification_session.verified", { id: `vs_${who}`, metadata: { userId: who } });
}

// Phibsborough is open 24/7, so slots relative to now always fit.
const CH = "ch_phibsborough";
const inMin = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

test("anyone can browse the 12 seeded chargers", async () => {
  const r = await call("GET", "/chargers?lat=53.3065&lng=-6.2210&radiusKm=50");
  assert.equal(r.body.chargers.length, 12);
  assert.equal(r.body.chargers.find((c: any) => c.id === "ch_clonskeagh").priceCentsPerKwh, 50);
  assert.equal((await call("GET", "/chargers/nope")).body.error.code, "charger_not_found");
});

test("booking needs sign-in and a verified ID", async () => {
  const slot = { chargerId: CH, start: inMin(10), end: inMin(70) };
  assert.equal((await call("POST", "/bookings", slot)).body.error.code, "unauthorized");
  assert.equal((await call("POST", "/bookings", slot, "unverified")).body.error.code, "identity_required");

  const v = await call("POST", "/me/verify", {}, "alice");
  assert.match(v.body.url, /verify\.stripe\.test/);
  assert.equal((await call("GET", "/me", undefined, "alice")).body.identityStatus, "processing");
  await webhook("identity.verification_session.verified", { id: "vs_alice", metadata: { userId: "alice" } });
  assert.equal((await call("GET", "/me", undefined, "alice")).body.identityStatus, "verified");
});

test("book, pay, charge, stop: captures only what was used, with Kerb's fee to the demo host", async () => {
  await verify("driver1");
  const b = await call("POST", "/bookings", { chargerId: CH, start: inMin(1), end: inMin(181) }, "driver1");
  assert.equal(b.status, 201, JSON.stringify(b.body));
  const id = b.body.bookingId;
  const checkout = calls.find((c) => c.fn === "createHoldCheckout" && (c.args[0] as any).bookingId === id)!;
  assert.equal((checkout.args[0] as any).hostAccountId, "acct_test"); // destination charge to the demo host

  assert.equal((await call("GET", `/bookings/${id}`, undefined, "driver1")).body.status, "pending_payment");
  assert.equal((await call("POST", `/bookings/${id}/start`, {}, "driver1")).body.error.code, "payment_not_confirmed");
  assert.equal((await call("GET", `/bookings/${id}`, undefined, "someone-else")).body.error.code, "not_found");

  await verify("driver2");
  const clash = await call("POST", "/bookings", { chargerId: CH, start: inMin(30), end: inMin(90) }, "driver2");
  assert.equal(clash.body.error.code, "slot_taken");

  await pay(id);
  assert.equal((await call("GET", `/bookings/${id}`, undefined, "driver1")).body.status, "reserved");
  assert.equal((await call("POST", `/bookings/${id}/start`, {}, "driver1")).body.status, "charging");
  await new Promise((r) => setTimeout(r, 1000));
  const m = await call("GET", `/bookings/${id}/meter`, undefined, "driver1");
  assert.ok(m.body.kwhDelivered > 5 && m.body.kwhDelivered < 9, `kWh ${m.body.kwhDelivered}`);

  const done = await call("POST", `/bookings/${id}/stop`, {}, "driver1");
  assert.equal(done.body.status, "completed");
  const r = done.body.receipt;
  assert.equal(r.totalCents + r.releasedCents, b.body.holdCents);
  const cap = calls.filter((c) => c.fn === "capture").at(-1)!;
  assert.deepEqual(cap.args, [`pi_${id}`, r.totalCents, r.totalCents - r.hostEarnsCents]);
});

test("same webhook twice is processed once", async () => {
  await verify("driver3");
  const b = await call("POST", "/bookings", { chargerId: CH, start: inMin(600), end: inMin(660) }, "driver3");
  const event = JSON.stringify({ id: "evt_dupe", type: "checkout.session.completed", data: { object: { client_reference_id: b.body.bookingId, payment_intent: "pi_dupe" } } });
  const post = () => fetch(`${base}/webhooks/stripe`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": "t" }, body: event });
  await post();
  const second = await (await post()).json();
  assert.equal(second.duplicate, true);
});

test("if both drivers pay for one slot, the second hold is cancelled", async () => {
  await verify("racer1");
  await verify("racer2");
  const a = await call("POST", "/bookings", { chargerId: CH, start: inMin(1000), end: inMin(1060) }, "racer1");
  // Simulate the first checkout having expired in our records while Stripe still completes it.
  const { q } = await import("../src/db.js");
  await q(`UPDATE bookings SET checkout_expires_at = now() - interval '1 minute' WHERE id = $1`, [a.body.bookingId]);
  const b = await call("POST", "/bookings", { chargerId: CH, start: inMin(1000), end: inMin(1060) }, "racer2");
  assert.equal(b.status, 201);
  await pay(b.body.bookingId);
  await pay(a.body.bookingId, "pi_late");
  assert.equal((await call("GET", `/bookings/${a.body.bookingId}`, undefined, "racer1")).body.status, "cancelled");
  assert.ok(calls.some((c) => c.fn === "cancelHold" && c.args[0] === "pi_late"));
});

test("meter stops itself at the hold", async () => {
  await verify("driver4");
  const b = await call("POST", "/bookings", { chargerId: CH, start: inMin(0), end: inMin(2) }, "driver4");
  await pay(b.body.bookingId);
  assert.equal((await call("POST", `/bookings/${b.body.bookingId}/start`, {}, "driver4")).body.status, "charging");
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal((await call("GET", `/bookings/${b.body.bookingId}/meter`, undefined, "driver4")).body.status, "completed");
  const final = await call("GET", `/bookings/${b.body.bookingId}`, undefined, "driver4");
  assert.equal(final.body.receipt.totalCents, final.body.holdCents);
});

test("blocked card: driver can retry, and expiry after a block ends as blocked", async () => {
  await verify("driver5");
  const b = await call("POST", "/bookings", { chargerId: CH, start: inMin(2000), end: inMin(2060) }, "driver5");
  await webhook("payment_intent.payment_failed", { metadata: { bookingId: b.body.bookingId }, last_payment_error: { charge: "ch_x" } });
  let r = await call("GET", `/bookings/${b.body.bookingId}`, undefined, "driver5");
  assert.equal(r.body.status, "pending_payment");
  assert.equal(r.body.riskLevel, "highest");
  await webhook("checkout.session.expired", { client_reference_id: b.body.bookingId });
  r = await call("GET", `/bookings/${b.body.bookingId}`, undefined, "driver5");
  assert.equal(r.body.status, "blocked");
});

test("cancelling before the slot is free; bookings over 6 days ahead are rejected", async () => {
  await verify("driver6");
  const b = await call("POST", "/bookings", { chargerId: CH, start: inMin(3000), end: inMin(3060) }, "driver6");
  await pay(b.body.bookingId);
  assert.equal((await call("POST", `/bookings/${b.body.bookingId}/start`, {}, "driver6")).body.error.code, "booking_not_active");
  assert.equal((await call("POST", `/bookings/${b.body.bookingId}/cancel`, {}, "driver6")).body.status, "cancelled");
  const far = await call("POST", "/bookings", { chargerId: CH, start: inMin(8 * 1440), end: inMin(8 * 1440 + 60) }, "driver6");
  assert.equal(far.body.error.code, "invalid_input");
});

test("hosts: onboarding, verified-only listings, private dashboards", async () => {
  const h = await call("POST", "/hosts", { name: "Test", hostType: "home" }, "host1");
  assert.equal(h.status, 201);
  assert.match(h.body.onboardingUrl, /connect\.stripe\.test/);
  const listing = {
    hostId: h.body.hostId, title: "Test charger", lat: 53.3, lng: -6.2, area: "Ranelagh",
    connector: "Type 2", powerKw: 7.4, hostPriceCentsPerKwh: 40,
    availability: [{ day: 1, start: "09:00", end: "17:00" }],
  };
  assert.equal((await call("POST", "/chargers", listing, "host1")).body.error.code, "identity_required");
  await verify("host1");
  const c = await call("POST", "/chargers", listing, "host1");
  assert.equal(c.status, 201);
  assert.equal(c.body.priceCentsPerKwh, 45);
  const dash = await call("GET", `/hosts/${h.body.hostId}`, undefined, "host1");
  assert.equal(dash.body.chargers.length, 1);
  assert.equal(dash.body.payoutsEnabled, true);
  assert.equal((await call("GET", `/hosts/${h.body.hostId}`, undefined, "nosy")).body.error.code, "not_found");
});

test("AI endpoints need sign-in and fall back cleanly without a key", async () => {
  assert.equal((await call("POST", "/ai/availability", { text: "weekdays 9 to 5" })).body.error.code, "unauthorized");
  const r = await call("POST", "/ai/availability", { text: "weekdays 9 to 5" }, "alice");
  assert.equal(r.body.error.code, "ai_unavailable");
});
