// Simple sign-in for the hackathon: the user enters their email, the back end returns a
// signed token, and the front end sends it as "Authorization: Bearer <token>". There are
// no passwords; trust comes from Stripe Identity, which checks a government ID and selfie
// before anyone can book or list a charger.
import type { NextFunction, Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { config } from "./config.js";
import { one } from "./db.js";
import { ApiError } from "./errors.js";

export type User = {
  id: string;
  email: string;
  identityStatus: "unverified" | "processing" | "requires_input" | "verified";
};

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const key = () => new TextEncoder().encode(config.authSecret);

/** Find or create the user for this email and return a token valid for 7 days. */
export async function signIn(email: string) {
  const normalized = email.trim().toLowerCase();
  const id = `usr_${Buffer.from(normalized).toString("base64url").slice(0, 24)}_${(await sha(normalized)).slice(0, 8)}`;
  await one(`INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [id, normalized]);
  const token = await new SignJWT({ email: normalized }).setProtectedHeader({ alg: "HS256" })
    .setSubject(id).setIssuedAt().setExpirationTime("7d").sign(key());
  return { token, userId: id, email: normalized };
}

async function sha(s: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Buffer.from(digest).toString("hex");
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return next(new ApiError("unauthorized", "Sign in first"));
  let sub = "";
  try {
    sub = String((await jwtVerify(token, key())).payload.sub ?? "");
  } catch {
    return next(new ApiError("unauthorized", "Your session has expired. Sign in again"));
  }
  const row = await one<{ id: string; email: string; identity_status: User["identityStatus"] }>(
    `SELECT id, email, identity_status FROM users WHERE id = $1`, [sub]);
  if (!row) return next(new ApiError("unauthorized", "Sign in again"));
  req.user = { id: row.id, email: row.email, identityStatus: row.identity_status };
  next();
}

/** Drivers and hosts must pass Stripe Identity before booking or listing a charger. */
export function requireVerified(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.identityStatus !== "verified") {
    return next(new ApiError("identity_required", "Verify your ID before continuing"));
  }
  next();
}
