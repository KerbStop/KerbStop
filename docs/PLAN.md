# KerbStop back end: portions and decisions

The team plan already fixes the stack (Node, Express, TypeScript, SQLite, Stripe, OpenRouter) and
the API contract with King's front end. This splits that work into portions that can each be
reviewed, tested and demoed on their own.

## Portions

| # | Portion | Files | Status |
| --- | --- | --- | --- |
| 1 | Foundations: config, database schema, error format, seed data | `config.ts`, `db.ts`, `errors.ts`, `seed.ts` | Done |
| 2 | Charger search and listings | `routes/chargers.ts`, `availability.ts`, `slots.ts` | Done |
| 3 | Pricing maths | `pricing.ts` | Done, matches the plan's worked example (€10.08, hold €14.19) |
| 4 | Booking and Checkout hold | `bookingFlow.ts` (create), `payments.ts` | Done; real Stripe untested until keys are added |
| 5 | Stripe webhook and booking states | `routes/webhooks.ts`, `bookingFlow.ts` | Done; tested through mock checkout |
| 6 | Charging session: start, simulated meter, stop with partial capture | `bookingFlow.ts`, `routes/bookings.ts` | Done |
| 7 | Hosts and Stripe Connect onboarding | `routes/hosts.ts`, `payments.ts` | Done; real onboarding untested until keys are added |
| 8 | No-shows, expiry sweep, Radar risk levels | `bookingFlow.ts` (sweepNoShows), webhook | Done |
| 9 | AI: bill reader and availability parser | `ai.ts`, `routes/ai.ts` | Code done; needs an OpenRouter key and a bill test set |
| 10 | Tests, README, mock data for King | `test/`, `README.md`, `mock/chargers.json` | Done (11 tests pass) |

## Still to do

- Run the loop against a real Stripe sandbox (needs `STRIPE_SECRET_KEY` and `stripe listen`).
- Run the AI against real bills and phrases (needs `OPENROUTER_API_KEY`); build the 10–15 bill test set and compare two models.
- Smart search (stretch) and "verified drivers only" (stretch): not started.
- Front end: King's.

## Design questions for Sean

Each has a default already built in, marked **(current)**. Change any you'd like.

1. **Where does it run for the demo?**
   a. Laptop only, `localhost:4000` **(current)**
   b. Deployed (Render, Railway or Fly) so judges and King can hit a public URL
2. **Database**
   a. SQLite file **(current)**, simplest for a laptop demo
   b. Hosted Postgres (Supabase or Neon), needed if we deploy with more than one instance
3. **Repo layout**
   a. One repo, `backend/` and `frontend/` side by side **(current)**
   b. Separate repos for front and back end
4. **Mock-payments mode** (runs with no Stripe key, fake checkout page)
   a. Keep it so King can build without keys **(current)**
   b. Remove it and always use the Stripe sandbox
5. **Seeded chargers and host payouts.** Seeded hosts have no Stripe account, so their bookings
   pay Kerb only and the dashboard can't show a host's share for them.
   a. Leave as is; show host payouts with a host created live in the demo **(current)**
   b. Create one sandbox connected account up front and attach two seeded chargers to it
6. **Radar-blocked card.** The plan says the booking stays `pending_payment` so the driver can retry,
   but the front-end section also polls for `blocked`.
   a. Stay `pending_payment` with `riskLevel: "highest"`; the front end shows "card blocked, try another" **(current)**
   b. Move it to `blocked` (driver has to start a new booking)
7. **AI confidence format**
   a. A number from 0 to 1 **(current)**; under 0.6 means "please check"
   b. "high", "medium" or "low"
8. **AI models.** Default `google/gemini-2.5-flash` for both features; the bill route takes
   `?model=` for the comparison. Which second model do you want to compare against?
9. **Charger defaults.** Every charger gets 10c a minute overstay after a 10-minute grace, and
   the simulated clock runs 60× (one real minute is one charging hour). Keep, or change?
10. **Accounts.** No login: drivers are just an email and the host dashboard is open to anyone
    with the host id.
    a. Fine for the hackathon **(current)**
    b. Add a simple magic-link or Stripe-email login
11. **Extras beyond the contract.** I added `bookings` to `GET /api/hosts/:id`, `status` to the
    meter response, `POST /api/hosts/:id/onboarding-link` and the mock checkout page. All are
    additive, so King's code keeps working. OK to add them to the contract in the plan?
