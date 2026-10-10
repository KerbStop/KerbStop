import { app } from "./app.js";
import { config, mockPayments } from "./config.js";
import { sweepNoShows } from "./bookingFlow.js";

setInterval(() => sweepNoShows().catch(console.error), 60_000);

app.listen(config.port, () => {
  console.log(`Kerb back end on ${config.backendUrl}${mockPayments ? " (mock payments: no STRIPE_SECRET_KEY)" : ""}`);
});
