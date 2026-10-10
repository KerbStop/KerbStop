import { app } from "./app.js";
import { assertConfig, config } from "./config.js";
import { migrate } from "./db.js";
import { seedIfEmpty } from "./seed.js";
import { sweepNoShows } from "./bookingFlow.js";

assertConfig();
await migrate();
await seedIfEmpty();

setInterval(() => sweepNoShows().catch(console.error), 60_000);

app.listen(config.port, () => {
  console.log(`Kerb back end listening on port ${config.port}`);
});
