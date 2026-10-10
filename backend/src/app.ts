import cors from "cors";
import express from "express";
import { config, mockPayments } from "./config.js";
import "./db.js";
import { errorHandler } from "./errors.js";
import { seedIfEmpty } from "./seed.js";
import { chargers } from "./routes/chargers.js";
import { hosts } from "./routes/hosts.js";
import { bookings } from "./routes/bookings.js";
import { ai } from "./routes/ai.js";
import { webhooks } from "./routes/webhooks.js";
import { devCheckout } from "./routes/devCheckout.js";

seedIfEmpty();

export const app = express();
app.use(cors({ origin: config.frontendUrl }));
app.use("/api/webhooks", webhooks); // raw body, before express.json()
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, mockPayments, ai: !!config.openRouterKey }));
app.use("/api/chargers", chargers);
app.use("/api/hosts", hosts);
app.use("/api/bookings", bookings);
app.use("/api/ai", ai);
if (mockPayments) app.use("/api/dev", devCheckout);

app.use((_req, res) => res.status(404).json({ error: { code: "invalid_input", message: "No such endpoint" } }));
app.use(errorHandler);

