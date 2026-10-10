import { type Request, type Response, Router, raw } from "express";
import type Stripe from "stripe";
import { config } from "../config.js";
import { db, nowIso } from "../db.js";
import { stripe, getPaymentIntentRisk } from "../payments.js";
import * as flow from "../bookingFlow.js";

export const webhooks = Router();

// Needs the raw body for signature checks, so it's mounted before express.json().
webhooks.post("/stripe", raw({ type: "application/json" }), async (req: Request, res: Response) => {
  if (!stripe) return res.status(400).send("Stripe is not configured");
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"] as string, config.stripeWebhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook signature check failed: ${(err as Error).message}`);
  }

  const fresh = db.prepare("INSERT OR IGNORE INTO stripe_events (eventId, type, receivedAt) VALUES (?, ?, ?)")
    .run(event.id, event.type, nowIso()).changes === 1;
  if (!fresh) return res.json({ received: true, duplicate: true });

  try {
    await handle(event);
  } catch (err) {
    // Let Stripe retry: forget the event so the retry is processed.
    db.prepare("DELETE FROM stripe_events WHERE eventId = ?").run(event.id);
    console.error(`webhook ${event.type} failed`, err);
    return res.status(500).send("handler failed");
  }
  res.json({ received: true });
});

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const bookingId = session.client_reference_id;
      const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!bookingId || !piId) return;
      await flow.onPaymentConfirmed(bookingId, piId, await getPaymentIntentRisk(piId));
      return;
    }
    case "checkout.session.expired": {
      const bookingId = event.data.object.client_reference_id;
      if (bookingId) flow.onCheckoutExpired(bookingId);
      return;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      const bookingId = pi.metadata?.bookingId;
      const err = pi.last_payment_error;
      // Radar blocks show up as a failed payment whose charge outcome is "blocked".
      if (bookingId && err?.charge) {
        const chargeId = typeof err.charge === "string" ? err.charge : (err.charge as { id: string }).id;
        const charge = await stripe!.charges.retrieve(chargeId);
        if (charge.outcome?.type === "blocked") {
          flow.onPaymentBlocked(bookingId, (charge.outcome.risk_level ?? "highest") as "highest");
        }
      }
      return;
    }
    case "payment_intent.canceled": {
      const bookingId = event.data.object.metadata?.bookingId;
      if (bookingId) flow.onHoldCanceled(bookingId);
      return;
    }
  }
}
