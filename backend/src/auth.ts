// Sign-in is Supabase Auth (email magic links) on the front end. The front end sends the
// Supabase access token as "Authorization: Bearer <token>"; we verify it here and keep a
// users row per account with its Stripe Identity verification status.
import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
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

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function verifyToken(token: string): Promise<JWTPayload> {
  if (config.supabaseJwtSecret) {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(config.supabaseJwtSecret), { audience: "authenticated" });
    return payload;
  }
  jwks ??= createRemoteJWKSet(new URL(`${config.supabaseUrl}/auth/v1/.well-known/jwks.json`));
  const { payload } = await jwtVerify(token, jwks, { audience: "authenticated" });
  return payload;
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return next(new ApiError("unauthorized", "Sign in first"));
  let payload: JWTPayload;
  try {
    payload = await verifyToken(token);
  } catch {
    return next(new ApiError("unauthorized", "Your session has expired. Sign in again"));
  }
  const id = String(payload.sub ?? "");
  const email = String(payload.email ?? "");
  if (!id || !email) return next(new ApiError("unauthorized", "Token has no user"));

  const row = await one<{ id: string; email: string; identity_status: User["identityStatus"] }>(`
    INSERT INTO users (id, email) VALUES ($1, $2)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, email, identity_status`, [id, email]);
  req.user = { id: row!.id, email: row!.email, identityStatus: row!.identity_status };
  next();
}

/** Drivers and hosts must pass Stripe Identity before booking or listing a charger. */
export function requireVerified(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.identityStatus !== "verified") {
    return next(new ApiError("identity_required", "Verify your ID before continuing"));
  }
  next();
}
