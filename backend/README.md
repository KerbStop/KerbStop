# Kerb back end

Express + TypeScript API for Kerb on Supabase Postgres, built to the shared API contract in the team plan.

- **Stripe Checkout** places a hold at booking; only what was used is captured and the rest released.
- **Stripe Connect** pays hosts daily as destination charges, with Kerb's 12% taken as the application fee.
- **Stripe Identity** checks a government ID (passport, driving licence or national ID card) plus a matching
  selfie before anyone can book a charger or list one.
- **Stripe Radar** screens every card; risk levels show on the host's dashboard.
- **Supabase Auth** handles sign-in (email magic links) on the front end; the back end verifies its tokens.
- **OpenRouter** reads electricity bills and parses plain-English availability.

## Run it

Full beginner steps for Windows are in [`docs/SETUP-WINDOWS.md`](../docs/SETUP-WINDOWS.md). Short version:

```bash
npm install
cp .env.example .env        # fill in Supabase, Stripe and OpenRouter values
npm run stripe:demo-host    # once: creates the sandbox host account the seeded chargers pay
npm run dev                 # http://localhost:4000; creates tables and seeds 12 chargers on first run
npm run stripe:listen       # second terminal: forwards Stripe webhooks to your laptop
npm test                    # end-to-end tests on an in-memory Postgres with a fake Stripe
```

## How the front end talks to it

Sign in with Supabase on the front end (`supabase.auth.signInWithOtp({ email })`), then send the session's
access token on every call that needs a user:

```
Authorization: Bearer <session.access_token>
```

Browsing chargers needs no sign-in. Booking and listing need a verified ID:

1. `POST /api/me/verify` returns a Stripe-hosted `url`. Send the user there.
2. Stripe sends them back to `FRONTEND_URL/verify?done=1`. Poll `GET /api/me` until `identityStatus` is `verified`.

## API

Money in integer cents, times in UTC ISO 8601, errors as `{ "error": { "code", "message" } }`.
Error codes: `invalid_input`, `charger_not_found`, `slot_taken`, `booking_not_active`, `payment_not_confirmed`,
`ai_unavailable`, `unauthorized` (sign in), `identity_required` (verify ID), `forbidden`, `not_found`.

| Endpoint | Auth | Notes |
| --- | --- | --- |
| `GET /api/chargers?lat&lng&radiusKm&from&to` | none | With `from`/`to`, only chargers open and free for that slot |
| `GET /api/chargers/:id` | none | |
| `GET /api/me` | signed in | `{ userId, email, identityStatus, hostId }` |
| `POST /api/me/verify` | signed in | Starts Stripe Identity → `{ identityStatus, url }` |
| `POST /api/hosts` | signed in | `{ name, hostType }` → `{ hostId, onboardingUrl }` (Stripe Connect) |
| `GET /api/hosts/:id` | owner | `{ hostId, payoutsEnabled, earningsCents, chargers, bookings }` |
| `POST /api/hosts/:id/onboarding-link` | owner | Fresh Connect onboarding link |
| `POST /api/chargers` | owner, verified | `{ hostId, title, lat, lng, area, connector, powerKw, hostPriceCentsPerKwh, availability, overstayCentsPerMin?, graceMinutes?, offPeak? }` |
| `POST /api/ai/bill` | signed in | multipart field `bill`; optional `?model=` |
| `POST /api/ai/availability` | signed in | `{ text }` |
| `POST /api/bookings` | verified | `{ chargerId, start, end }` → `{ bookingId, checkoutUrl, holdCents }` |
| `GET /api/bookings` | signed in | The driver's own bookings |
| `GET /api/bookings/:id` | driver | Poll this after Checkout; only the webhook moves it to `reserved` |
| `POST /api/bookings/:id/start` | driver | From 15 minutes before the slot |
| `GET /api/bookings/:id/meter` | driver | `{ kwhDelivered, runningCostCents, elapsedMinutes, status }`; stops itself at the hold |
| `POST /api/bookings/:id/stop` | driver | Partial capture with Kerb's fee; receipt on the booking |
| `POST /api/bookings/:id/cancel` | driver | Free before the slot starts |
| `POST /api/webhooks/stripe` | Stripe signature | Payments, Identity and Connect events; duplicates ignored |

## Key decisions

- **Prices:** the driver pays host price + 12%. Kerb's fee is the Connect application fee at capture.
- **Hold** = power × slot hours × price × 1.12 + 30 minutes of overstay. Bookings at most 6 days ahead.
- **Seeded chargers** all pay out to one sandbox "Kerb Demo Host" account (`STRIPE_DEMO_ACCOUNT_ID`), so
  every demo booking shows the host's share and Kerb's fee in the Stripe dashboard.
- **Radar-blocked card:** the booking stays `pending_payment` so the driver can retry with another card,
  which goes through Radar and 3D Secure again. If checkout then expires, the booking ends as `blocked`.
- **Identity:** drivers and hosts both pass Stripe Identity. Hosts are also verified by Stripe Connect
  onboarding before payouts are enabled.
- **AI** never sets a price: the bill reader returns rates, and the code adds a 10c margin.
  `npm run ai:compare -- ./bills` compares Gemini Flash with Claude on a folder of bill photos.
- **Simulated charger:** its clock runs `DEMO_SPEEDUP`× faster from the moment charging starts.

## Deploying

`render.yaml` at the repo root deploys this folder to Render. Set the same environment variables there,
add a Stripe webhook endpoint for `https://<your-app>.onrender.com/api/webhooks/stripe` with the events
listed in `npm run stripe:listen`, and use its signing secret as `STRIPE_WEBHOOK_SECRET`.

## Limitations

- Charging is simulated; real chargers need OCPP to start and stop remotely.
- Card holds last about 7 days, hence the 6-day booking limit.
- Bill photos vary by supplier and quality; low-confidence reads should go to manual entry.
- Render's free plan sleeps when idle, so the first request after a while takes a few seconds.
