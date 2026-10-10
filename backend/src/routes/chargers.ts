import { Router } from "express";
import { z } from "zod";
import { requireUser, requireVerified } from "../auth.js";
import { newId, one, q } from "../db.js";
import { ApiError } from "../errors.js";
import { WindowSchema } from "../ai.js";
import { allChargerRows, getChargerRow, toCharger } from "../models.js";
import { slotFitsAvailability } from "../availability.js";
import { slotIsTaken } from "../slots.js";

export const chargers = Router();

const Search = z.object({
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radiusKm: z.coerce.number().positive().default(10),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// Public: anyone can browse the map before signing in.
chargers.get("/", async (req, res) => {
  const query = Search.parse(req.query);
  if ((query.from && !query.to) || (!query.from && query.to)) throw new ApiError("invalid_input", "Pass both from and to, or neither");
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  if (from && to && to <= from) throw new ApiError("invalid_input", "to must be after from");

  let list = (await allChargerRows()).map((row) => {
    const c = toCharger(row);
    if (query.lat !== undefined && query.lng !== undefined) {
      c.distanceKm = Math.round(distanceKm(query.lat, query.lng, c.lat, c.lng) * 10) / 10;
    }
    return c;
  });
  if (query.lat !== undefined && query.lng !== undefined) {
    list = list.filter((c) => c.distanceKm! <= query.radiusKm).sort((a, b) => a.distanceKm! - b.distanceKm!);
  }
  if (from && to) {
    const free = [];
    for (const c of list) {
      if (slotFitsAvailability(from, to, c.availability) && !(await slotIsTaken(c.id, from.toISOString(), to.toISOString()))) {
        free.push(c);
      }
    }
    list = free;
  }
  res.json({ chargers: list });
});

chargers.get("/:id", async (req, res) => {
  const row = await getChargerRow(req.params.id);
  if (!row) throw new ApiError("charger_not_found", `No charger with id ${req.params.id}`);
  res.json(toCharger(row));
});

const NewCharger = z.object({
  hostId: z.string(),
  title: z.string().min(3).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  area: z.string().min(2).max(60),
  connector: z.enum(["Type 2", "CCS"]),
  powerKw: z.number().positive().max(350),
  hostPriceCentsPerKwh: z.number().int().positive().max(200),
  overstayCentsPerMin: z.number().int().min(0).max(100).default(10),
  graceMinutes: z.number().int().min(0).max(60).default(10),
  availability: z.array(WindowSchema).min(1),
  offPeak: z.boolean().default(false),
});

// Hosts must be signed in, own the host profile, and have passed ID verification.
chargers.post("/", requireUser, requireVerified, async (req, res) => {
  const body = NewCharger.parse(req.body);
  const host = await one(`SELECT id FROM hosts WHERE id = $1 AND user_id = $2`, [body.hostId, req.user!.id]);
  if (!host) throw new ApiError("forbidden", "That host profile isn't yours");
  const id = newId("ch");
  await q(`
    INSERT INTO chargers (id, host_id, title, lat, lng, area, connector, power_kw, host_price_cents_per_kwh,
                          overstay_cents_per_min, grace_minutes, availability, off_peak, rating)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0)`,
    [id, body.hostId, body.title, body.lat, body.lng, body.area, body.connector, body.powerKw,
      body.hostPriceCentsPerKwh, body.overstayCentsPerMin, body.graceMinutes,
      JSON.stringify(body.availability), body.offPeak]);
  res.status(201).json(toCharger((await getChargerRow(id))!));
});
