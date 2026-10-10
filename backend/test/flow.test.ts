// End-to-end booking loop in mock-payments mode against a throwaway database.
process.env.DB_PATH = ":memory:";
process.env.STRIPE_SECRET_KEY = "";
process.env.OPENROUTER_API_KEY = "";
process.env.DEMO_SPEEDUP = "3600"; // one real second = one simulated hour

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

let server: Server;
let base = "";

before(async () => {
  const { app } = await import("../src/app.js");
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${(server.address() as { port: number }).port}/api`;
});
after(() => server.close());

const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  return { status: res.status, body: text.startsWith("{") ? JSON.parse(text) : text };
};

// Phibsborough is open 24/7, so slots relative to now always fit.
const CH = "ch_phibsborough";
const inMin = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const pay = (id: string, card: string) =>
  fetch(`${base}/dev/checkout/${id}`, { method: "POST", body: new URLSearchParams({ card }), redirect: "manual" });

test("lists the 12 seeded chargers with driver prices", async () => {
  const r = await call("GET", "/chargers?lat=53.3065&lng=-6.2210&radiusKm=50");
  assert.equal(r.body.chargers.length, 12);
  const c = r.body.chargers.find((x: { id: string }) => x.id === "ch_clonskeagh");
  assert.equal(c.priceCentsPerKwh, 50);
  assert.ok(r.body.chargers[0].distanceKm <= r.body.chargers[1].distanceKm);
});

test("unknown charger uses the shared error shape", async () => {
  const r = await call("GET", "/chargers/nope");
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, "charger_not_found");
});

test("book, pay, charge, stop: captures only what was used", async () => {
  const b = await call("POST", "/bookings", { chargerId: CH, driverEmail: "d@example.com", start: inMin(1), end: inMin(181) });
  assert.equal(b.status, 201);
  assert.ok(b.body.holdCents > 0);

  // The success redirect alone proves nothing.
  assert.equal((await call("GET", `/bookings/${b.body.bookingId}`)).body.status, "pending_payment");
  assert.equal((await call("POST", `/bookings/${b.body.bookingId}/start`)).body.error.code, "payment_not_confirmed");

  // Second driver can't take the same slot while the first checkout is open.
  const clash = await call("POST", "/bookings", { chargerId: CH, driverEmail: "e@example.com", start: inMin(30), end: inMin(90) });
  assert.equal(clash.body.error.code, "slot_taken");

  await pay(b.body.bookingId, "normal");
  const reserved = await call("GET", `/bookings/${b.body.bookingId}`);
  assert.equal(reserved.body.status, "reserved");
  assert.equal(reserved.body.riskLevel, "normal");

  assert.equal((await call("POST", `/bookings/${b.body.bookingId}/start`)).body.status, "charging");
  await new Promise((r) => setTimeout(r, 1000)); // ~1 simulated hour
  const m = await call("GET", `/bookings/${b.body.bookingId}/meter`);
  assert.ok(m.body.kwhDelivered > 5 && m.body.kwhDelivered < 9, `kWh ${m.body.kwhDelivered}`);

  const done = await call("POST", `/bookings/${b.body.bookingId}/stop`);
  assert.equal(done.body.status, "completed");
  const r = done.body.receipt;
  assert.equal(r.totalCents + r.releasedCents, b.body.holdCents);
  assert.ok(r.totalCents < b.body.holdCents);
  assert.equal(r.overstayCents, 0);

  const host = await call("GET", "/hosts/host_eoin");
  assert.equal(host.body.earningsCents, r.hostEarnsCents);
});

test("can't start early; cancelling before the slot is free", async () => {
  const b = await call("POST", "/bookings", { chargerId: CH, driverEmail: "d@example.com", start: inMin(300), end: inMin(301) });
  await pay(b.body.bookingId, "normal");
  assert.equal((await call("POST", `/bookings/${b.body.bookingId}/start`)).body.error.code, "booking_not_active");
  const c = await call("POST", `/bookings/${b.body.bookingId}/cancel`);
  assert.equal(c.body.status, "cancelled");
});

test("meter stops itself at the hold", async () => {
  // A 2-minute slot: at 3600x it's over in a blink, then overstay runs into the hold.
  const b = await call("POST", "/bookings", { chargerId: CH, driverEmail: "x@example.com", start: inMin(0), end: inMin(2) });
  await pay(b.body.bookingId, "normal");
  assert.equal((await call("POST", `/bookings/${b.body.bookingId}/start`)).body.status, "charging");
  await new Promise((r) => setTimeout(r, 1500));
  const m = await call("GET", `/bookings/${b.body.bookingId}/meter`);
  assert.equal(m.body.status, "completed");
  const final = await call("GET", `/bookings/${b.body.bookingId}`);
  assert.equal(final.body.receipt.totalCents, final.body.holdCents);
  assert.equal(final.body.receipt.releasedCents, 0);
});

test("rejects bookings more than 6 days ahead and bad input", async () => {
  const far = await call("POST", "/bookings", { chargerId: CH, driverEmail: "d@example.com", start: inMin(8 * 1440), end: inMin(8 * 1440 + 60) });
  assert.equal(far.body.error.code, "invalid_input");
  const bad = await call("POST", "/bookings", { chargerId: CH, driverEmail: "not-an-email", start: "soon", end: "later" });
  assert.equal(bad.body.error.code, "invalid_input");
});

test("blocked card leaves the booking unpaid with risk logged", async () => {
  const b = await call("POST", "/bookings", { chargerId: CH, driverEmail: "d@example.com", start: inMin(600), end: inMin(660) });
  await pay(b.body.bookingId, "blocked");
  const r = await call("GET", `/bookings/${b.body.bookingId}`);
  assert.equal(r.body.status, "pending_payment");
  assert.equal(r.body.riskLevel, "highest");
});

test("AI endpoints fall back cleanly without a key", async () => {
  const r = await call("POST", "/ai/availability", { text: "weekdays 9 to 5" });
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, "ai_unavailable");
});

test("hosts and listings", async () => {
  const h = await call("POST", "/hosts", { name: "Test", email: "t@example.com", hostType: "home" });
  assert.equal(h.status, 201);
  const c = await call("POST", "/chargers", {
    hostId: h.body.hostId, title: "Test charger", lat: 53.3, lng: -6.2, area: "Ranelagh",
    connector: "Type 2", powerKw: 7.4, hostPriceCentsPerKwh: 40,
    availability: [{ day: 1, start: "09:00", end: "17:00" }],
  });
  assert.equal(c.status, 201);
  assert.equal(c.body.priceCentsPerKwh, 45);
  const got = await call("GET", `/hosts/${h.body.hostId}`);
  assert.equal(got.body.chargers.length, 1);
  assert.equal(got.body.payoutsEnabled, true);
});
