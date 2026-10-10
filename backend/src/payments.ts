// Every Stripe call lives here, behind one interface so tests can stand in a fake.
// Runtime always uses the real Stripe API (sandbox keys for the demo).
import Stripe from "stripe";
import { config } from "./config.js";
import type { RiskLevel } from "./models.js";

const THREE_DS_OVER_CENTS = 3000;

export type Payments = {
  createConnectedAccount(email: string, hostType: "home" | "business"): Promise<string>;
  onboardingLink(accountId: string): Promise<string>;
  payoutsEnabled(accountId: string): Promise<boolean>;
  createHoldCheckout(opts: {
    bookingId: string; holdCents: number; chargerTitle: string; driverEmail: string; hostAccountId: string | null;
  }): Promise<{ checkoutSessionId: string; url: string; expiresAt: string }>;
  getPaymentIntentRisk(paymentIntentId: string): Promise<RiskLevel>;
  getChargeOutcome(chargeId: string): Promise<{ type: string | null; riskLevel: RiskLevel }>;
  capture(paymentIntentId: string, amountCents: number, applicationFeeCents: number | null): Promise<void>;
  cancelHold(paymentIntentId: string): Promise<void>;
  expireCheckout(checkoutSessionId: string): Promise<void>;
  createIdentitySession(userId: string, email: string): Promise<{ id: string; url: string }>;
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event;
};

function stripePayments(): Payments {
  const stripe = new Stripe(config.stripeSecretKey);
  return {
    async createConnectedAccount(email, hostType) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "IE",
        email,
        business_type: hostType === "business" ? "company" : "individual",
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        settings: { payouts: { schedule: { interval: "daily" } } },
      });
      return account.id;
    },

    async onboardingLink(accountId) {
      const link = await stripe.accountLinks.create({
        account: accountId,
        type: "account_onboarding",
        refresh_url: `${config.frontendUrl}/host?onboarding=refresh`,
        return_url: `${config.frontendUrl}/host?onboarding=done`,
      });
      return link.url;
    },

    async payoutsEnabled(accountId) {
      const account = await stripe.accounts.retrieve(accountId);
      return !!account.payouts_enabled && !!account.charges_enabled;
    },

    // Checkout Session that only authorises (holds) holdCents. With a host account it's
    // a destination charge, so the host's share goes straight to them at capture.
    async createHoldCheckout(opts) {
      const expiresAt = Math.floor(Date.now() / 1000) + 31 * 60; // Stripe's minimum is 30 min
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        client_reference_id: opts.bookingId,
        customer_email: opts.driverEmail,
        expires_at: expiresAt,
        success_url: `${config.frontendUrl}/booking/${opts.bookingId}`,
        cancel_url: `${config.frontendUrl}/booking/${opts.bookingId}?cancelled=1`,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: opts.holdCents,
            product_data: {
              name: "Charging hold: maximum for your slot",
              description: `${opts.chargerTitle}. You're only charged for what you use; the rest is released.`,
            },
          },
        }],
        payment_intent_data: {
          capture_method: "manual",
          metadata: { bookingId: opts.bookingId },
          ...(opts.hostAccountId ? { transfer_data: { destination: opts.hostAccountId } } : {}),
        },
        ...(opts.holdCents > THREE_DS_OVER_CENTS
          ? { payment_method_options: { card: { request_three_d_secure: "any" as const } } }
          : {}),
        metadata: { bookingId: opts.bookingId },
      });
      return { checkoutSessionId: session.id, url: session.url!, expiresAt: new Date(expiresAt * 1000).toISOString() };
    },

    async getPaymentIntentRisk(paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
      const charge = pi.latest_charge as Stripe.Charge | null;
      return (charge?.outcome?.risk_level ?? null) as RiskLevel;
    },

    async getChargeOutcome(chargeId) {
      const charge = await stripe.charges.retrieve(chargeId);
      return { type: charge.outcome?.type ?? null, riskLevel: (charge.outcome?.risk_level ?? null) as RiskLevel };
    },

    async capture(paymentIntentId, amountCents, applicationFeeCents) {
      await stripe.paymentIntents.capture(paymentIntentId, {
        amount_to_capture: amountCents,
        ...(applicationFeeCents !== null ? { application_fee_amount: applicationFeeCents } : {}),
      });
    },

    async cancelHold(paymentIntentId) {
      await stripe.paymentIntents.cancel(paymentIntentId);
    },

    async expireCheckout(checkoutSessionId) {
      try {
        await stripe.checkout.sessions.expire(checkoutSessionId);
      } catch {
        // Already completed or expired.
      }
    },

    // Stripe Identity: government ID (passport, driving licence or national ID card)
    // plus a selfie that must match it.
    async createIdentitySession(userId, email) {
      const session = await stripe.identity.verificationSessions.create({
        type: "document",
        provided_details: { email },
        options: {
          document: {
            allowed_types: ["driving_license", "passport", "id_card"],
            require_matching_selfie: true,
            require_live_capture: true,
          },
        },
        metadata: { userId },
        return_url: `${config.frontendUrl}/verify?done=1`,
      });
      return { id: session.id, url: session.url! };
    },

    constructEvent(rawBody, signature) {
      return stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
    },
  };
}

let impl: Payments | null = null;

/** Tests call this with a fake before making requests. */
export function usePayments(p: Payments) {
  impl = p;
}

export const payments: Payments = new Proxy({} as Payments, {
  get: (_t, prop: keyof Payments) => (impl ??= stripePayments())[prop],
});
