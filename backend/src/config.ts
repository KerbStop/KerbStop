import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  backendUrl: process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
  dbPath: process.env.DB_PATH ?? "kerb.db",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  openRouterKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterModel: process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash",
  // Simulated charger clock runs this many times faster than real time.
  demoSpeedup: Number(process.env.DEMO_SPEEDUP ?? 60),
};

// Without a Stripe key the server runs in mock-payments mode: Checkout is replaced
// by a local test page that fakes the webhook. Lets the front end work offline.
export const mockPayments = !config.stripeSecretKey;
