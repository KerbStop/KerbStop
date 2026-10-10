import { test } from "node:test";
import assert from "node:assert/strict";
import { driverPriceCentsPerKwh, energyCents, holdCents, split } from "../src/pricing.js";
import { slotFitsAvailability } from "../src/availability.js";

test("worked example from the team plan", () => {
  assert.equal(driverPriceCentsPerKwh(45), 50);
  assert.equal(energyCents(20, 45), 1008); // driver pays €10.08 for 20 kWh
  assert.deepEqual(split(1008), { hostEarnsCents: 900, kerbFeeCents: 108 });
  assert.equal(holdCents(7.4, 3, 45, 10), 1419); // 3h on 7.4 kW at 45c: hold €14.19
});

test("availability windows in Dublin time, including overnight", () => {
  const weekdays = [1, 2, 3, 4, 5].map((day) => ({ day: day as 1, start: "09:00", end: "17:00" }));
  // Mon 13 Oct 2026, Dublin is UTC+1 (IST) so 09:00 local = 08:00Z.
  assert.ok(slotFitsAvailability(new Date("2026-10-12T08:00:00Z"), new Date("2026-10-12T11:00:00Z"), weekdays));
  assert.ok(!slotFitsAvailability(new Date("2026-10-12T07:00:00Z"), new Date("2026-10-12T09:00:00Z"), weekdays));
  assert.ok(!slotFitsAvailability(new Date("2026-10-11T10:00:00Z"), new Date("2026-10-11T11:00:00Z"), weekdays)); // Sunday
  const overnight = [{ day: 1 as const, start: "19:00", end: "07:00" }];
  assert.ok(slotFitsAvailability(new Date("2026-10-12T21:00:00Z"), new Date("2026-10-13T05:00:00Z"), overnight));
  assert.ok(!slotFitsAvailability(new Date("2026-10-13T05:00:00Z"), new Date("2026-10-13T07:00:00Z"), overnight));
});
