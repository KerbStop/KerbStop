# KerbStop

HackUCD 2026 peer-to-peer EV charging marketplace for Dublin.

| Folder | What's in it |
| --- | --- |
| Repository root | Vite + React + TypeScript frontend for drivers and hosts |
| `backend/` | Express + TypeScript + SQLite API, Stripe Connect and Checkout holds, OpenRouter AI. See `backend/README.md`. |
| `docs/SETUP-WINDOWS.md` | Beginner setup guide for running the back end on Windows |
| `docs/PLAN.md` | How the back end is split into portions, what's done, and open design questions |

## Run the frontend

```sh
npm install
npm run dev
npm run build
npm run lint
```

## Run the backend

```bash
cd backend && npm install && npm run dev
```

## Google Maps setup

Copy `.env.example` to `.env.local`, set `VITE_GOOGLE_MAPS_API_KEY` to a browser key, and restart Vite. Optionally set `VITE_GOOGLE_MAP_ID`; otherwise the Google demo map ID is used. Environment files are ignored by Git. Browser keys are visible in browser requests, so restrict them in Google Cloud.

Enable Maps JavaScript API and billing. Apply HTTP referrer restrictions for your actual development URL (for example `http://localhost:3000/*` and `http://127.0.0.1:3000/*`) and deployed domain, and restrict API access to Maps JavaScript API. Never place server secrets in Vite environment variables. Missing or rejected keys show a setup message; charger listings and booking still work. There is no alternate map provider.

## Demo journey

Choose “I need a charge” → `/chargers`, select a listing or Google price marker, and open its details. Choose an available date, half-hour start, and 1–3 hour duration. Review the estimate and reserve. The isolated mock payment confirmation represents a future successful Checkout return and collects no payment information. Confirmation reveals a fictional demo address; directions search the general area.

Start the session, watch the accelerated meter (60 simulated seconds per real second), then stop and confirm to receive a receipt. “Done” returns home; “Find another charger” returns to discovery. `/browse` and the host routes remain available. Location permission is requested only when “Use my location” is clicked.

`src/lib/mockBookingService.ts` owns estimates, booking transitions, metering, and receipts. Bookings persist in local storage with a memory fallback. The hold caps energy plus the service fee. All bookings, payment authorisations, charging readings, and receipts are simulated; no real payment or charger connection occurs. Residential addresses remain hidden before confirmation.

## Future backend boundary

Replace the mock service with:

- `POST /api/bookings` → `{ bookingId, checkoutUrl, holdCents }`; redirect to the returned checkout URL.
- `GET /api/bookings/:id`
- `POST /api/bookings/:id/start`
- `GET /api/bookings/:id/meter`
- `POST /api/bookings/:id/stop`

The existing charger and booking types/API contracts remain unchanged. Backend confirmation will replace `confirmPayment()`; completed booking data supplies the receipt.
