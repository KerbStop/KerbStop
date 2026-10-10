# Kerb back end

Express + TypeScript + SQLite API for Kerb, built to the shared API contract in the team plan.
Stripe Connect pays hosts, Checkout places a hold at booking, and only what was used is captured.
OpenRouter reads electricity bills and parses plain-English availability.

## Run it

```bash
npm install
cp .env.example .env      # fill in keys, or leave Stripe empty for mock payments
npm run dev               # http://localhost:4000, seeds 12 chargers on first run
npm test                  # end-to-end booking loop in mock-payments mode
```

With real Stripe keys, forward webhooks in a second terminal:

```bash
npm run stripe:listen     # copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET
```

### Mock-payments mode

With no `STRIPE_SECRET_KEY`, `checkoutUrl` points to a local page (`/api/dev/checkout/:id`) with
buttons for a normal card, an elevated-risk card, a Radar-blocked card and closing checkout.
Each fakes the matching webhook, so the front end can build the whole loop without keys.
`GET /api/health` says which mode is on.

## Layout

| File | What it does |
| --- | --- |
| `src/index.ts` | Starts the server and the once-a-minute no-show sweep |
| `src/app.ts` | Express app, CORS for the front end, routes, error handler |
| `src/config.ts` | Environment variables |
| `src/db.ts` | SQLite schema: hosts, chargers, bookings, stripe_events |
| `src/models.ts` | Shared contract types and row-to-API mapping |
| `src/pricing.ts` | All money maths: driver price, hold, fee split |
| `src/availability.ts` | Open-hours check in Dublin time, including overnight windows |
| `src/slots.ts` | Double-booking check |
| `src/bookingFlow.ts` | Booking state machine: create, confirm, start, meter, stop, cancel, no-show |
| `src/payments.ts` | Every Stripe call (and its mock) |
| `src/ai.ts` | OpenRouter bill reader and availability parser, zod-checked with one retry |
| `src/seed.ts` | 12 chargers around UCD and Dublin |
| `src/routes/*` | HTTP endpoints from the contract, the Stripe webhook, the mock checkout |
| `mock/chargers.json` | `GET /api/chargers` output for the front end's mock file |

## API

Everything in the team plan's contract: money in integer cents, times in UTC ISO 8601, errors as
`{ "error": { "code", "message" } }`.

| Endpoint | Notes |
| --- | --- |
| `GET /api/chargers?lat&lng&radiusKm&from&to` | All params optional; with `from`/`to`, only chargers open and free for that slot |
| `GET /api/chargers/:id` | |
| `POST /api/hosts` | `{ name, email, hostType }` → `{ hostId, onboardingUrl }` |
| `GET /api/hosts/:id` | Also returns `bookings` with risk level for the dashboard (extra to the contract) |
| `POST /api/hosts/:id/onboarding-link` | Fresh Stripe onboarding link (extra) |
| `POST /api/chargers` | `{ hostId, title, lat, lng, area, connector, powerKw, hostPriceCentsPerKwh, availability, overstayCentsPerMin?, graceMinutes?, offPeak? }` |
| `POST /api/ai/bill` | multipart field `bill`; optional `?model=` to compare models |
| `POST /api/ai/availability` | `{ text }` |
| `POST /api/bookings` | `{ chargerId, driverEmail, start, end }` → `{ bookingId, checkoutUrl, holdCents }` |
| `GET /api/bookings/:id` | Poll this; only the webhook moves it to `reserved` |
| `POST /api/bookings/:id/start` | From 15 minutes before the slot |
| `GET /api/bookings/:id/meter` | `{ kwhDelivered, runningCostCents, elapsedMinutes, status }`; stops itself at the hold |
| `POST /api/bookings/:id/stop` | Partial capture with Kerb's fee; receipt on the booking |
| `POST /api/bookings/:id/cancel` | Free before the slot starts |
| `POST /api/webhooks/stripe` | Signature-checked, duplicate events ignored |

## Key decisions

- Prices: driver pays host price + 12%. Kerb's fee is taken as the Connect application fee at capture.
- Hold = power × slot hours × price × 1.12 + 30 minutes of overstay. Bookings at most 6 days ahead.
- Seeded hosts have no Stripe account, so their bookings are plain platform charges. Hosts created
  through `POST /api/hosts` who finish onboarding get destination charges and daily payouts.
- The simulated charger clock runs `DEMO_SPEEDUP`× faster from the moment charging starts.
  Energy flows until the slot ends; overstay is charged per minute after the grace period.
- The AI never sets a price: the bill reader returns rates, and the code adds a 10c margin.

## Limitations

- Charging is simulated; real chargers need OCPP to start and stop remotely.
- No login: drivers are identified by email and host dashboards by id.
- Card holds last about 7 days, hence the 6-day booking limit.
- Bill photos vary by supplier and quality; low-confidence reads should go to manual entry.
