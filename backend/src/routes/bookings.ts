import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { getBookingRow, toBooking } from "../models.js";
import * as flow from "../bookingFlow.js";

export const bookings = Router();

const NewBooking = z.object({
  chargerId: z.string(),
  driverEmail: z.email(),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
});

bookings.post("/", async (req, res) => {
  res.status(201).json(await flow.createBooking(NewBooking.parse(req.body)));
});

bookings.get("/:id", (req, res) => {
  const row = getBookingRow(req.params.id);
  if (!row) throw new ApiError("invalid_input", `No booking with id ${req.params.id}`, 404);
  res.json(toBooking(row));
});

bookings.post("/:id/start", (req, res) => {
  res.json(flow.startCharging(req.params.id));
});

bookings.get("/:id/meter", async (req, res) => {
  res.json(await flow.meter(req.params.id));
});

bookings.post("/:id/stop", async (req, res) => {
  res.json(await flow.stopCharging(req.params.id));
});

bookings.post("/:id/cancel", async (req, res) => {
  res.json(await flow.cancelBooking(req.params.id));
});
