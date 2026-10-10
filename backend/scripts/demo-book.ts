// Walks through the whole real flow against the running back end, step by step:
// sign in, Stripe Identity, an AI call, booking, Stripe Checkout, charging and the receipt.
//   npm run demo:book            (with `npm run dev` and `npm run stripe:listen` running)
//   npm run demo:book -- --skip-ai
import { createInterface } from "node:readline/promises";

const API = process.env.API_URL ?? "http://localhost:4000/api";
const rl = createInterface({ input: process.stdin, output: process.stdout });
const skipAi = process.argv.includes("--skip-ai");
let token = "";

const euros = (c: number) => `€${(c / 100).toFixed(2)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (n: number, text: string) => console.log(`\n=== Step ${n}: ${text} ===`);

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} failed (${res.status}): ${json.error?.code}: ${json.error?.message}`);
  return json;
}

async function waitFor<T>(what: string, check: () => Promise<T | null>, timeoutMs = 10 * 60_000): Promise<T> {
  process.stdout.write(`Waiting for ${what}`);
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await check();
    if (v) {
      console.log(" done.");
      return v;
    }
    process.stdout.write(".");
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for ${what}. Is \`npm run stripe:listen\` running?`);
}

try {
  await fetch(`${API}/health`).catch(() => {
    throw new Error("Can't reach the back end. Start it with `npm run dev` first.");
  });

  step(1, "Sign in");
  const email = (await rl.question("Email to sign in with (any address): ")).trim() || "driver@example.com";
  ({ token } = await api("POST", "/auth/login", { email }));
  console.log(`Signed in as ${email}.`);

  step(2, "Verify your ID with Stripe Identity");
  let me = await api("GET", "/me");
  if (me.identityStatus === "verified") {
    console.log("Already verified.");
  } else {
    const v = await api("POST", "/me/verify");
    console.log(`Open this link and choose the option to simulate a successful verification:\n  ${v.url}`);
    console.log("(The page it sends you back to won't load until the front end exists. That's fine.)");
    me = await waitFor("Stripe to confirm the ID check", async () => {
      const m = await api("GET", "/me");
      if (m.identityStatus === "requires_input") throw new Error("Stripe says the ID check failed. Run this again and pick the success option.");
      return m.identityStatus === "verified" ? m : null;
    });
  }

  if (!skipAi) {
    step(3, "AI availability parser (OpenRouter)");
    try {
      const ai = await api("POST", "/ai/availability", { text: "weekdays 9 to 5, and every night except Sunday" });
      console.log(`Confidence ${ai.confidence}. Windows:`);
      for (const w of ai.windows) console.log(`  ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w.day]} ${w.start}-${w.end}`);
    } catch (err) {
      console.log(`AI call failed (the app would fall back to manual entry): ${(err as Error).message}`);
    }
  }

  step(4, "Book a charger");
  const start = new Date(Date.now() + 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  const booking = await api("POST", "/bookings", { chargerId: "ch_phibsborough", start: start.toISOString(), end: end.toISOString() });
  console.log(`Booked Phibsborough for one hour. Hold: ${euros(booking.holdCents)} (nothing charged yet).`);
  console.log(`Pay on Stripe Checkout with card 4242 4242 4242 4242, any future date, any CVC:\n  ${booking.checkoutUrl}`);
  await waitFor("the payment webhook (status reserved)", async () => {
    const b = await api("GET", `/bookings/${booking.bookingId}`);
    if (["cancelled", "expired", "blocked"].includes(b.status)) throw new Error(`Booking ended as ${b.status}.`);
    return b.status === "reserved" ? b : null;
  });
  console.log("Reserved. In the Stripe dashboard > Payments, this shows as Uncaptured: that's the hold.");

  step(5, "Charge");
  await rl.question("Press Enter to start charging...");
  await api("POST", `/bookings/${booking.bookingId}/start`);
  for (let i = 0; i < 5; i++) {
    await sleep(2000);
    const m = await api("GET", `/bookings/${booking.bookingId}/meter`);
    console.log(`  ${m.elapsedMinutes} min simulated, ${m.kwhDelivered} kWh, ${euros(m.runningCostCents)} so far`);
    if (m.status === "completed") break;
  }

  step(6, "Stop and capture");
  let final = await api("GET", `/bookings/${booking.bookingId}`);
  if (final.status === "charging") final = await api("POST", `/bookings/${booking.bookingId}/stop`);
  const r = final.receipt;
  console.log(`Energy ${euros(r.energyCents)}, overstay ${euros(r.overstayCents)}, total charged ${euros(r.totalCents)}.`);
  console.log(`Released back to the card: ${euros(r.releasedCents)}. Host earns ${euros(r.hostEarnsCents)}, Kerb keeps ${euros(r.totalCents - r.hostEarnsCents)}.`);
  console.log("\nIn the Stripe dashboard > Payments, the payment is now partially captured, with the host's share");
  console.log("transferred to Kerb Demo Host (if STRIPE_DEMO_ACCOUNT_ID is set and its onboarding is finished).");
  console.log("\nAll steps passed.");
} catch (err) {
  console.error(`\nStopped: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
