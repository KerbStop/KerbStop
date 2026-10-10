# KerbStop back end: portions and decisions

The team plan already fixes the stack (Node, Express, TypeScript, SQLite, Stripe, OpenRouter) and
the API contract with King's front end. This splits that work into portions that can each be
reviewed, tested and demoed on their own.

## Portions

| # | Portion | Files | Status |
| --- | --- | --- | --- |
| 1 | Foundations: config, Postgres schema, error format, seed data | `config.ts`, `db.ts`, `errors.ts`, `seed.ts` | Done |
| 2 | Charger search and listings | `routes/chargers.ts`, `availability.ts`, `slots.ts` | Done |
| 3 | Pricing maths | `pricing.ts` | Done, matches the plan's worked example (€10.08, hold €14.19) |
| 4 | Booking and Checkout hold | `bookingFlow.ts` (create), `payments.ts` | Done |
| 5 | Stripe webhook and booking states | `routes/webhooks.ts`, `bookingFlow.ts` | Done |
| 6 | Charging session: start, simulated meter, stop with partial capture | `bookingFlow.ts`, `routes/bookings.ts` | Done |
| 7 | Hosts and Stripe Connect onboarding | `routes/hosts.ts`, `payments.ts` | Done; real onboarding untested until keys are added |
| 8 | No-shows, expiry sweep, Radar risk levels | `bookingFlow.ts` (sweepNoShows), webhook | Done |
| 9 | AI: bill reader and availability parser | `ai.ts`, `routes/ai.ts`, `scripts/compare-models.ts` | Code done; needs a bill test set |
| 11 | Sign-in and ID verification | `auth.ts`, `routes/me.ts`, webhook | Done |
| 12 | Deploy config | `render.yaml` | Ready; not deployed yet |
| 10 | Tests, README, sample data for King | `test/`, `README.md`, `mock/chargers.json` | Done (12 tests pass) |

## Still to do

- Sean: create the Supabase project, turn on Stripe Identity, run `npm run stripe:demo-host` (see `docs/SETUP-WINDOWS.md`).
- Run the full loop against the real Stripe sandbox once the front end has sign-in.
- Build the 10 to 15 bill test set and run `npm run ai:compare`.
- Deploy to Render when Sean says go.
- Smart search (stretch): not started. "Verified drivers only" is now always on.
- Front end: King's, now with Supabase sign-in and the ID verification step.

## Decisions (from Sean, 10 Oct)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Where it runs | Deployed to Render (`render.yaml`); deploy happens once Sean says go |
| 2 | Database | Supabase Postgres |
| 3 | Repo layout | One repo, `backend/` and `frontend/` side by side |
| 4 | Mock payments | Removed: Stripe sandbox only |
| 5 | Seeded hosts | One sandbox "Kerb Demo Host" Connect account receives all seeded chargers' payouts, so every demo booking is a destination charge showing the host's share and Kerb's fee |
| 6 | Radar-blocked card | Stays `pending_payment` so the driver can retry with another card (Radar and 3D Secure screen it again); ends as `blocked` if checkout then expires. Locking out on one block would punish false positives, and Radar already stopped the money |
| 7 | AI confidence | Number from 0 to 1; under 0.6 means "please check" |
| 8 | Second AI model | Claude via OpenRouter (`OPENROUTER_COMPARE_MODEL`), compared with `npm run ai:compare` |
| 9 | Charger defaults | Kept: 10c a minute overstay after 10 minutes' grace; 60× simulated clock |
| 10 | Accounts | Supabase Auth email magic links; Stripe Identity checks a government ID plus a selfie for drivers (before booking) and hosts (before listing) |
| 11 | Contract extras | Accepted; documented in `backend/README.md` |
