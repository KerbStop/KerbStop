// Every Stripe call lives here. In mock-payments mode (no STRIPE_SECRET_KEY) the same
// functions succeed locally so the rest of the app doesn't need to know.
import Stripe from "stripe";
import { config, mockPayments } from "./config.js";
import { newId } from "./db.js";

export const stripe = mockPayments ? null : new Stripe(config.stripeSecretKey);

const THREE_DS_OVER_CENTS = 3000;

export async function createConnectedAccount(email: string, hostType: "home" | "business") {
  if (!stripe) return { accountId: newId("mock_acct"), onboardingUrl: `${config.frontendUrl}/host?mockOnboarding=done` };
  const account = await stripe.accounts.create({
    type: "express",
    country: "IE",
    email,
    business_type: hostType === "business" ? "company" : "individual",
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    settings: { payouts: { schedule: { interval: "daily" } } },
  });
  return { accountId: account.id, onboardingUrl: await onboardingLink(account.id) };
}

export async function onboardingLink(accountId: string) {
  if (!stripe) return `${config.frontendUrl}/host?mockOnboarding=done`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${config.frontendUrl}/host?onboarding=refresh`,
    return_url: `${config.frontendUrl}/host?onboarding=done`,
  });
  return link.url;
}

export async function payoutsEnabled(accountId: string): Promise<boolean> {
  if (!stripe) return accountId.startsWith("mock_acct");
  const account = await stripe.accounts.retrieve(accountId);
  return !!account.payouts_enabled && !!account.charges_enabled;
}

/**
 * Checkout Session that only authorises (holds) holdCents. If the host has a live
 * connected account it's a destination charge, so the host's share goes straight to them.
 */
export async function createHoldCheckout(opts: {
  bookingId: string;
  holdCents: number;
  chargerTitle: string;
  hostAccountId: string | null;
}) {
  const expiresAt = Math.floor(Date.now() / 1000) + 31 * 60; // Stripe's minimum is 30 min
  if (!stripe) {
    return {
      checkoutSessionId: newId("mock_cs"),
      url: `${config.backendUrl}/api/dev/checkout/${opts.bookingId}`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      destinationCharge: !!opts.hostAccountId,
    };
  }
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: opts.bookingId,
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
  return {
    checkoutSessionId: session.id,
    url: session.url!,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    destinationCharge: !!opts.hostAccountId,
  };
}

export async function getPaymentIntentRisk(paymentIntentId: string) {
  if (!stripe) return null;
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
  const charge = pi.latest_charge as Stripe.Charge | null;
  return (charge?.outcome?.risk_level ?? null) as "normal" | "elevated" | "highest" | "not_assessed" | null;
}

export async function capture(paymentIntentId: string, amountCents: number, applicationFeeCents: number | null) {
  if (!stripe) return;
  await stripe.paymentIntents.capture(paymentIntentId, {
    amount_to_capture: amountCents,
    ...(applicationFeeCents !== null ? { application_fee_amount: applicationFeeCents } : {}),
  });
}

export async function cancelHold(paymentIntentId: string) {
  if (!stripe) return;
  await stripe.paymentIntents.cancel(paymentIntentId);
}

export async function expireCheckout(checkoutSessionId: string) {
  if (!stripe) return;
  try {
    await stripe.checkout.sessions.expire(checkoutSessionId);
  } catch {
    // Already completed or expired.
  }
}
