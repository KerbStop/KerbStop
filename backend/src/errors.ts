import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export type ErrorCode =
  | "invalid_input"
  | "charger_not_found"
  | "slot_taken"
  | "booking_not_active"
  | "payment_not_confirmed"
  | "ai_unavailable";

const STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  charger_not_found: 404,
  slot_taken: 409,
  booking_not_active: 409,
  payment_not_confirmed: 402,
  ai_unavailable: 503,
};

export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public status = STATUS[code]) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
  } else if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    res.status(400).json({ error: { code: "invalid_input", message } });
  } else {
    console.error(err);
    res.status(500).json({ error: { code: "internal", message: err?.message ?? "Something went wrong" } });
  }
};
