import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../auth.js";
import { newId, one, q } from "../db.js";
import { ApiError } from "../errors.js";
import { chargerRowsForHost, toCharger } from "../models.js";
import { payments } from "../payments.js";

export const hosts = Router();
hosts.use(requireUser);

const NewHost = z.object({
  name: z.string().min(1).max(80),
  hostType: z.enum(["home", "business"]),
});

type HostRow = { id: string; user_id: string | null; stripe_account_id: string | null; payouts_enabled: boolean };

async function ownHost(id: string, userId: string): Promise<HostRow> {
  const host = await one<HostRow>(`SELECT id, user_id, stripe_account_id, payouts_enabled FROM hosts WHERE id = $1`, [id]);
  if (!host || host.user_id !== userId) throw new ApiError("not_found", `No host with id ${id}`);
  return host;
}

// One host profile per account. Stripe Connect onboarding also checks the host's identity
// and bank details before payouts are enabled.
hosts.post("/", async (req, res) => {
  const body = NewHost.parse(req.body);
  const user = req.user!;
  const existing = await one<HostRow>(`SELECT id, stripe_account_id FROM hosts WHERE user_id = $1`, [user.id]);
  if (existing?.stripe_account_id) {
    return res.json({ hostId: existing.id, onboardingUrl: await payments.onboardingLink(existing.stripe_account_id) });
  }
  const id = existing?.id ?? newId("host");
  const accountId = await payments.createConnectedAccount(user.email, body.hostType);
  await q(`
    INSERT INTO hosts (id, user_id, name, email, host_type, stripe_account_id) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET stripe_account_id = EXCLUDED.stripe_account_id`,
    [id, user.id, body.name, user.email, body.hostType, accountId]);
  res.status(201).json({ hostId: id, onboardingUrl: await payments.onboardingLink(accountId) });
});

hosts.get("/:id", async (req, res) => {
  const host = await ownHost(req.params.id, req.user!.id);

  let payoutsEnabled = host.payouts_enabled;
  if (host.stripe_account_id && !payoutsEnabled) {
    payoutsEnabled = await payments.payoutsEnabled(host.stripe_account_id);
    if (payoutsEnabled) await q(`UPDATE hosts SET payouts_enabled = true WHERE id = $1`, [host.id]);
  }

  const { earnings } = (await one<{ earnings: number }>(`
    SELECT COALESCE(SUM((b.receipt->>'hostEarnsCents')::int), 0)::int AS earnings
    FROM bookings b JOIN chargers c ON c.id = b.charger_id
    WHERE c.host_id = $1 AND b.status IN ('completed', 'no_show')`, [host.id]))!;

  // Drivers' emails stay private; the host sees the slot, status and Radar risk level.
  const bookings = (await q(`
    SELECT b.id, b.charger_id, b.start_at, b.end_at, b.status, b.risk_level, b.hold_cents
    FROM bookings b JOIN chargers c ON c.id = b.charger_id
    WHERE c.host_id = $1 AND b.status <> 'expired' ORDER BY b.start_at`, [host.id])).map((b) => ({
    id: b.id, chargerId: b.charger_id, start: new Date(b.start_at).toISOString(), end: new Date(b.end_at).toISOString(),
    status: b.status, riskLevel: b.risk_level, holdCents: b.hold_cents,
  }));

  res.json({
    hostId: host.id,
    payoutsEnabled,
    earningsCents: earnings,
    chargers: (await chargerRowsForHost(host.id)).map(toCharger),
    bookings,
  });
});

/** Fresh onboarding link if the first one expired or the host didn't finish. */
hosts.post("/:id/onboarding-link", async (req, res) => {
  const host = await ownHost(req.params.id, req.user!.id);
  if (!host.stripe_account_id) throw new ApiError("invalid_input", "Host has no Stripe account");
  res.json({ onboardingUrl: await payments.onboardingLink(host.stripe_account_id) });
});
