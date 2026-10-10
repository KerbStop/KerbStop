import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { errorHandler } from "./errors.js";
import { chargers } from "./routes/chargers.js";
import { hosts } from "./routes/hosts.js";
import { bookings } from "./routes/bookings.js";
import { ai } from "./routes/ai.js";
import { auth, me } from "./routes/me.js";
import { webhooks } from "./routes/webhooks.js";

export const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: config.frontendUrls }));
app.use("/api/webhooks", webhooks); // raw body, before express.json()
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, ai: !!config.openRouterKey }));
app.use("/api/auth", auth);
app.use("/api/me", me);
app.use("/api/chargers", chargers);
app.use("/api/hosts", hosts);
app.use("/api/bookings", bookings);
app.use("/api/ai", ai);

app.use((_req, res) => res.status(404).json({ error: { code: "not_found", message: "No such endpoint" } }));
app.use(errorHandler);
