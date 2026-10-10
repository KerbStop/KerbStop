// Creates the sandbox "Kerb Demo Host" connected account that the seeded chargers pay out to.
//   npm run stripe:demo-host
// Run once, finish onboarding with Stripe's test details, then put the printed account id
// in STRIPE_DEMO_ACCOUNT_ID and restart. Run it again any time for a fresh onboarding link.
import Stripe from "stripe";
import { config } from "../src/config.js";

if (!config.stripeSecretKey) throw new Error("Set STRIPE_SECRET_KEY in backend/.env first");
const stripe = new Stripe(config.stripeSecretKey);

let accountId = config.stripeDemoAccountId;
if (!accountId) {
  const account = await stripe.accounts.create({
    type: "express",
    country: "IE",
    email: "demo-host@kerb.example",
    business_type: "individual",
    business_profile: { name: "Kerb Demo Host", product_description: "Shared EV charging" },
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    settings: { payouts: { schedule: { interval: "daily" } } },
  });
  accountId = account.id;
}

const account = await stripe.accounts.retrieve(accountId);
if (account.charges_enabled && account.payouts_enabled) {
  console.log(`${accountId} is fully onboarded. Set STRIPE_DEMO_ACCOUNT_ID=${accountId}`);
} else {
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: "https://dashboard.stripe.com/test/connect/accounts",
    return_url: "https://dashboard.stripe.com/test/connect/accounts",
  });
  console.log(`1. Add this to backend/.env:  STRIPE_DEMO_ACCOUNT_ID=${accountId}`);
  console.log(`2. Open this link and finish onboarding with Stripe's test details:\n   ${link.url}`);
  console.log("   (test phone: use the prefilled number, SMS code 000000; test bank: IBAN IE29AIBK93115212345678)");
  console.log("3. Restart the back end. Every seeded charger now pays this account.");
}
