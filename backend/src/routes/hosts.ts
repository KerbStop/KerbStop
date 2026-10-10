import { Router } from "express";
import { z } from "zod";
import { db, newId } from "../db.js";
import { ApiError } from "../errors.js";
import { chargerRowsForHost, toCharger } from "../models.js";
import * as payments from "../payments.js";

export const hosts = Router();

const NewHost = z.object({
  name: z.string().min(1).max(80),
  email: z.email(),
  hostType: z.enum(["home", "business"]),
});

type HostRow = { id: string; stripeAccountId: string | null; payoutsEnabled: number };

hosts.post("/", async (req, res) => {
  const body = NewHost.parse(req.body);
  const id = newId("host");
  const { accountId, onboardingUrl } = await payments.createConnectedAccount(body.email, body.hostType);
  db.prepare(`INSERT INTO hosts (id, name, email, hostType, stripeAccountId) VALUES (?, ?, ?, ?, ?)`)
    .run(id, body.name, body.email, body.hostType, accountId);
  res.status(201).json({ hostId: id, onboardingUrl });
});

hosts.get("/:id", async (req, res) => {
  const host = db.prepare("SELECT id, stripeAccountId, payoutsEnabled FROM hosts WHERE id = ?").get(req.params.id) as HostRow | undefined;
  if (!host) throw new ApiError("invalid_input", `No host with id ${req.params.id}`, 404);

  let payoutsEnabled = !!host.payoutsEnabled;
  if (host.stripeAccountId && !payoutsEnabled) {
    payoutsEnabled = await payments.payoutsEnabled(host.stripeAccountId);
    if (payoutsEnabled) db.prepare("UPDATE hosts SET payoutsEnabled = 1 WHERE id = ?").run(host.id);
  }

  const { earnings } = db.prepare(`
    SELECT COALESCE(SUM(json_extract(b.receipt, '$.hostEarnsCents')), 0) AS earnings
    FROM bookings b JOIN chargers c ON c.id = b.chargerId
    WHERE c.hostId = ? AND b.status IN ('completed', 'no_show')`).get(host.id) as { earnings: number };

  const bookings = db.prepare(`
    SELECT b.id, b.chargerId, b.start, b.end, b.status, b.riskLevel, b.holdCents
    FROM bookings b JOIN chargers c ON c.id = b.chargerId
    WHERE c.hostId = ? AND b.status NOT IN ('expired') ORDER BY b.start`).all(host.id);

  res.json({
    hostId: host.id,
    payoutsEnabled,
    earningsCents: earnings,
    chargers: chargerRowsForHost(host.id).map(toCharger),
    // Extra to the contract: upcoming and past bookings with Radar risk level for the dashboard.
    bookings,
  });
});

/** Fresh onboarding link if the first one expired or the host didn't finish. */
hosts.post("/:id/onboarding-link", async (req, res) => {
  const host = db.prepare("SELECT id, stripeAccountId FROM hosts WHERE id = ?").get(req.params.id) as HostRow | undefined;
  if (!host?.stripeAccountId) throw new ApiError("invalid_input", "Host has no Stripe account", 404);
  res.json({ onboardingUrl: await payments.onboardingLink(host.stripeAccountId) });
});
