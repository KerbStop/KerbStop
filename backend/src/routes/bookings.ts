import { Router } from "express";
import { z } from "zod";
import { requireUser, requireVerified } from "../auth.js";
import { q } from "../db.js";
import { type BookingRow, toBooking } from "../models.js";
import * as flow from "../bookingFlow.js";

export const bookings = Router();
bookings.use(requireUser);

const NewBooking = z.object({
  chargerId: z.string(),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
});

// Only drivers who've passed Stripe Identity can book a stranger's charger.
bookings.post("/", requireVerified, async (req, res) => {
  res.status(201).json(await flow.createBooking(req.user!, NewBooking.parse(req.body)));
});

bookings.get("/", async (req, res) => {
  const rows = await q<BookingRow>(`SELECT * FROM bookings WHERE driver_user_id = $1 AND status <> 'expired' ORDER BY start_at DESC`, [req.user!.id]);
  res.json({ bookings: rows.map((r) => toBooking(r)) });
});

bookings.get("/:id", async (req, res) => {
  res.json(toBooking(await flow.driverBooking(req.params.id, req.user!)));
});

bookings.post("/:id/start", async (req, res) => {
  res.json(await flow.startCharging(req.params.id, req.user!));
});

bookings.get("/:id/meter", async (req, res) => {
  res.json(await flow.meter(req.params.id, req.user!));
});

bookings.post("/:id/stop", async (req, res) => {
  res.json(await flow.stopCharging(req.params.id, req.user!));
});

bookings.post("/:id/cancel", async (req, res) => {
  res.json(await flow.cancelBooking(req.params.id, req.user!));
});
