# KerbStop

Rent out idle EV chargers by the hour. HackUCD 2026.

| Folder | What's in it |
| --- | --- |
| `backend/` | Express + TypeScript + SQLite API, Stripe Connect and Checkout holds, OpenRouter AI. See `backend/README.md`. |
| `frontend/` | Vite + React + TypeScript driver and host application |
| `docs/SETUP-WINDOWS.md` | Beginner setup guide for running the back end on Windows |
| `docs/PLAN.md` | How the back end is split into portions, what's done, and open design questions |

## Run the demo (three terminals)

1. **Back end**: `cd backend`, `npm install`, `npm run dev` (needs `backend/.env`, see `docs/SETUP-WINDOWS.md`).
2. **Stripe listener**: `cd backend`, `npm run stripe:listen`. Bookings and ID checks only confirm while this runs.
3. **Front end**: `cd frontend`, `npm install`, `npm run dev`, then open http://localhost:3000.

For the live map, copy `frontend/.env.example` to `frontend/.env.local` and add a browser-restricted `VITE_GOOGLE_MAPS_API_KEY`. Without it, the charger list still works.

### Demo script

- **Driver**: I need a charge, pick a charger (Phibsborough is open 24/7), Review booking, sign in with any email, Verify with Stripe Identity (choose the test option that verifies), Reserve and pay. On Stripe Checkout use card `4242 4242 4242 4242`, any future date, any CVC. Start charging, let it run about 30 seconds (one real minute is one hour of charging), Stop, and show the receipt.
- **Blocked card**: pay with `4100 0000 0000 0019`. Stripe Radar blocks it and no booking is made.
- **Host**: Become a host, sign in, verify ID, fill in the charger, use a photo of an electricity bill (or the sample bill), Connect with Stripe, Publish. The charger appears on the driver map.
