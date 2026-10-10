import { type Request, type Response, Router, raw } from "express";
import type Stripe from "stripe";
import { q } from "../db.js";
import { payments } from "../payments.js";
import * as flow from "../bookingFlow.js";

export const webhooks = Router();

// Needs the raw body for signature checks, so it's mounted before express.json().
webhooks.post("/stripe", raw({ type: "application/json" }), async (req: Request, res: Response) => {
  let event: Stripe.Event;
  try {
    event = payments.constructEvent(req.body, req.headers["stripe-signature"] as string);
  } catch (err) {
    return res.status(400).send(`Webhook signature check failed: ${(err as Error).message}`);
  }

  const fresh = (await q(`INSERT INTO stripe_events (event_id, type) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id`,
    [event.id, event.type])).length === 1;
  if (!fresh) return res.json({ received: true, duplicate: true });

  try {
    await handleStripeEvent(event);
  } catch (err) {
    // Let Stripe retry: forget the event so the retry is processed.
    await q(`DELETE FROM stripe_events WHERE event_id = $1`, [event.id]);
    console.error(`webhook ${event.type} failed`, err);
    return res.status(500).send("handler failed");
  }
  res.json({ received: true });
});

export async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const bookingId = session.client_reference_id;
      const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!bookingId || !piId) return;
      await flow.onPaymentConfirmed(bookingId, piId, await payments.getPaymentIntentRisk(piId));
      return;
    }
    case "checkout.session.expired": {
      const bookingId = event.data.object.client_reference_id;
      if (bookingId) await flow.onCheckoutExpired(bookingId);
      return;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      const bookingId = pi.metadata?.bookingId;
      const charge = pi.last_payment_error?.charge;
      // Radar blocks show up as a failed payment whose charge outcome is "blocked".
      if (bookingId && charge) {
        const outcome = await payments.getChargeOutcome(typeof charge === "string" ? charge : (charge as { id: string }).id);
        if (outcome.type === "blocked") await flow.onPaymentBlocked(bookingId, outcome.riskLevel ?? "highest");
      }
      return;
    }
    case "payment_intent.canceled": {
      const bookingId = event.data.object.metadata?.bookingId;
      if (bookingId) await flow.onHoldCanceled(bookingId);
      return;
    }
    // Stripe Identity results for drivers and hosts.
    case "identity.verification_session.verified":
    case "identity.verification_session.requires_input":
    case "identity.verification_session.processing":
    case "identity.verification_session.canceled": {
      const session = event.data.object;
      const status = {
        "identity.verification_session.verified": "verified",
        "identity.verification_session.requires_input": "requires_input",
        "identity.verification_session.processing": "processing",
        "identity.verification_session.canceled": "unverified",
      }[event.type];
      // Only the latest session counts, and a verified user stays verified.
      await q(`UPDATE users SET identity_status = $2, verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE verified_at END
               WHERE id = $1 AND identity_session_id = $3 AND identity_status <> 'verified'`,
        [session.metadata?.userId, status, session.id]);
      return;
    }
    case "account.updated": {
      const account = event.data.object;
      await q(`UPDATE hosts SET payouts_enabled = $2 WHERE stripe_account_id = $1`,
        [account.id, !!account.payouts_enabled && !!account.charges_enabled]);
      return;
    }
  }
}
