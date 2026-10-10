import { Router } from "express";
import { z } from "zod";
import { db, newId } from "../db.js";
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

chargers.get("/", (req, res) => {
  const q = Search.parse(req.query);
  if ((q.from && !q.to) || (!q.from && q.to)) throw new ApiError("invalid_input", "Pass both from and to, or neither");
  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if (from && to && to <= from) throw new ApiError("invalid_input", "to must be after from");

  let list = allChargerRows().map((row) => {
    const c = toCharger(row);
    if (q.lat !== undefined && q.lng !== undefined) {
      c.distanceKm = Math.round(distanceKm(q.lat, q.lng, c.lat, c.lng) * 10) / 10;
    }
    return c;
  });
  if (q.lat !== undefined && q.lng !== undefined) {
    list = list.filter((c) => c.distanceKm! <= q.radiusKm).sort((a, b) => a.distanceKm! - b.distanceKm!);
  }
  if (from && to) {
    list = list.filter((c) => slotFitsAvailability(from, to, c.availability)
      && !slotIsTaken(c.id, from.toISOString(), to.toISOString()));
  }
  res.json({ chargers: list });
});

chargers.get("/:id", (req, res) => {
  const row = getChargerRow(req.params.id);
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

chargers.post("/", (req, res) => {
  const body = NewCharger.parse(req.body);
  const host = db.prepare("SELECT id FROM hosts WHERE id = ?").get(body.hostId);
  if (!host) throw new ApiError("invalid_input", `No host with id ${body.hostId}`);
  const id = newId("ch");
  db.prepare(`
    INSERT INTO chargers (id, hostId, title, lat, lng, area, connector, powerKw, hostPriceCentsPerKwh,
                          overstayCentsPerMin, graceMinutes, availability, offPeak, rating)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`)
    .run(id, body.hostId, body.title, body.lat, body.lng, body.area, body.connector, body.powerKw,
      body.hostPriceCentsPerKwh, body.overstayCentsPerMin, body.graceMinutes,
      JSON.stringify(body.availability), body.offPeak ? 1 : 0);
  res.status(201).json(toCharger(getChargerRow(id)!));
});
