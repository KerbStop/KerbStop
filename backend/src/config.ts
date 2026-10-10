import "dotenv/config";

const list = (v: string | undefined, fallback: string) =>
  (v ?? fallback).split(",").map((s) => s.trim()).filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // First entry is where Stripe sends drivers back to; all entries are allowed by CORS.
  frontendUrls: list(process.env.FRONTEND_URL, "http://localhost:3000"),
  get frontendUrl() {
    return this.frontendUrls[0];
  },
  // Empty = built-in database saved in localDataDir (laptop demo). Set it to use an external Postgres.
  databaseUrl: process.env.DATABASE_URL ?? "",
  localDataDir: process.env.LOCAL_DATA_DIR ?? "./.data",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  // Sandbox connected account that receives payouts for the seeded chargers.
  stripeDemoAccountId: process.env.STRIPE_DEMO_ACCOUNT_ID ?? "",
  // Signs the sign-in tokens the back end hands out. Any long random string.
  authSecret: process.env.AUTH_SECRET ?? "kerb-local-demo-secret-change-me-in-production",
  openRouterKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterModel: process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash",
  openRouterCompareModel: process.env.OPENROUTER_COMPARE_MODEL ?? "anthropic/claude-sonnet-4.5",
  // Simulated charger clock runs this many times faster than real time.
  demoSpeedup: Number(process.env.DEMO_SPEEDUP ?? 60),
};

export function assertConfig() {
  const missing = [
    ["STRIPE_SECRET_KEY", config.stripeSecretKey],
    ["STRIPE_WEBHOOK_SECRET", config.stripeWebhookSecret],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}. See backend/.env.example.`);
  }
  if (!config.stripeSecretKey.startsWith("sk_test_") && !config.stripeSecretKey.startsWith("rk_test_")) {
    console.warn("STRIPE_SECRET_KEY is not a test key. Kerb is a hackathon demo: use the Stripe sandbox.");
  }
  if (!config.databaseUrl) console.log(`No DATABASE_URL: using the built-in database in ${config.localDataDir}`);
}
