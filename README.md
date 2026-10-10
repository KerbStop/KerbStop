# KerbStop

Rent out idle EV chargers by the hour. HackUCD 2026.

| Folder | What's in it |
| --- | --- |
| `backend/` | Express + TypeScript + SQLite API, Stripe Connect and Checkout holds, OpenRouter AI. See `backend/README.md`. |
| `frontend/` | Vite + React + TypeScript driver and host application |
| `docs/SETUP-WINDOWS.md` | Beginner setup guide for running the back end on Windows |
| `docs/PLAN.md` | How the back end is split into portions, what's done, and open design questions |

## Run the frontend

```sh
cd frontend
npm install
npm run dev
```

To use the Google Maps JavaScript API, copy `frontend/.env.example` to `frontend/.env.local`, add a browser-restricted `VITE_GOOGLE_MAPS_API_KEY`, then restart Vite. Enable Maps JavaScript API and billing in Google Cloud, and restrict the key to the development/deployed HTTP referrers. The local env file is ignored by Git.

The driver booking journey and host onboarding currently use browser-persisted mock state. Payment authorisation, identity checks, electricity bill reading, Stripe Connect, charger metering, listing publication, and dashboard metrics are simulations; no backend payment or verification calls are made from the frontend.

## Run the backend

```bash
cd backend
npm install
npm run dev
```
