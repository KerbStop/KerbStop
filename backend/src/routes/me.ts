import { Router } from "express";
import { requireUser } from "../auth.js";
import { one, q } from "../db.js";
import { payments } from "../payments.js";

export const me = Router();
me.use(requireUser);

/** Who's signed in, whether their ID is verified, and their host profile if any. */
me.get("/", async (req, res) => {
  const user = req.user!;
  const host = await one<{ id: string }>(`SELECT id FROM hosts WHERE user_id = $1`, [user.id]);
  res.json({ userId: user.id, email: user.email, identityStatus: user.identityStatus, hostId: host?.id ?? null });
});

/**
 * Start Stripe Identity: returns a Stripe-hosted page where the user photographs a
 * passport, driving licence or national ID card and takes a matching selfie. The
 * webhook marks them verified; the front end polls GET /api/me until it does.
 */
me.post("/verify", async (req, res) => {
  const user = req.user!;
  if (user.identityStatus === "verified") return res.json({ identityStatus: "verified", url: null });
  const session = await payments.createIdentitySession(user.id, user.email);
  await q(`UPDATE users SET identity_session_id = $2, identity_status = 'processing' WHERE id = $1`, [user.id, session.id]);
  res.json({ identityStatus: "processing", url: session.url });
});
