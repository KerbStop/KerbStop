// Imported first by tests so config sees these before it loads.
process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-characters-long";
process.env.DEMO_SPEEDUP = "3600"; // one real second = one simulated hour
process.env.OPENROUTER_API_KEY = "";
process.env.STRIPE_DEMO_ACCOUNT_ID = "acct_test";
