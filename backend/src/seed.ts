// Seeds the same 12 chargers around UCD and Dublin that King's mock file uses.
import { config } from "./config.js";
import { one, q, tx } from "./db.js";
import type { Window } from "./models.js";

const weekdays = (start: string, end: string): Window[] =>
  ([1, 2, 3, 4, 5] as const).map((day) => ({ day, start, end }));
const nightsAndWeekends: Window[] = [
  ...([1, 2, 3, 4, 5] as const).map((day) => ({ day, start: "18:00", end: "08:00" })),
  { day: 6, start: "00:00", end: "24:00" },
  { day: 0, start: "00:00", end: "24:00" },
];
const everyDay = (start: string, end: string): Window[] =>
  ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({ day, start, end }));

const hosts = [
  { id: "host_aoife", name: "Aoife", email: "aoife@example.com", hostType: "home" },
  { id: "host_ciaran", name: "Ciarán", email: "ciaran@example.com", hostType: "home" },
  { id: "host_niamh", name: "Niamh", email: "niamh@example.com", hostType: "home" },
  { id: "host_padraig", name: "Pádraig", email: "padraig@example.com", hostType: "home" },
  { id: "host_siobhan", name: "Siobhán", email: "siobhan@example.com", hostType: "home" },
  { id: "host_eoin", name: "Eoin", email: "eoin@example.com", hostType: "home" },
  { id: "host_belfield", name: "Belfield Office Park", email: "facilities@belfield.example.com", hostType: "business" },
  { id: "host_docklands", name: "Docklands Tech Hub", email: "ops@docklands.example.com", hostType: "business" },
  { id: "host_rathmines", name: "Rathmines Medical Centre", email: "admin@rathmines.example.com", hostType: "business" },
] as const;

const chargers = [
  { id: "ch_clonskeagh", hostId: "host_aoife", title: "Driveway charger, Clonskeagh", lat: 53.3114, lng: -6.2335, area: "Clonskeagh", connector: "Type 2", powerKw: 7.4, price: 45, avail: weekdays("09:00", "17:00"), offPeak: false, rating: 4.8 },
  { id: "ch_milltown", hostId: "host_ciaran", title: "Garage charger, Milltown", lat: 53.3099, lng: -6.2484, area: "Milltown", connector: "Type 2", powerKw: 7.4, price: 42, avail: weekdays("08:30", "18:00"), offPeak: false, rating: 4.6 },
  { id: "ch_stillorgan", hostId: "host_niamh", title: "Driveway charger, Stillorgan", lat: 53.2896, lng: -6.1990, area: "Stillorgan", connector: "Type 2", powerKw: 7.4, price: 40, avail: everyDay("09:00", "16:00"), offPeak: false, rating: 4.9 },
  { id: "ch_donnybrook", hostId: "host_padraig", title: "Side-gate charger, Donnybrook", lat: 53.3210, lng: -6.2370, area: "Donnybrook", connector: "Type 2", powerKw: 7.4, price: 48, avail: weekdays("09:00", "17:30"), offPeak: false, rating: 4.5 },
  { id: "ch_stoneybatter", hostId: "host_siobhan", title: "Driveway charger, Stoneybatter", lat: 53.3527, lng: -6.2850, area: "Stoneybatter", connector: "Type 2", powerKw: 7.4, price: 44, avail: weekdays("08:00", "18:00"), offPeak: false, rating: 4.7 },
  { id: "ch_phibsborough", hostId: "host_eoin", title: "Front-garden charger, Phibsborough", lat: 53.3605, lng: -6.2730, area: "Phibsborough", connector: "Type 2", powerKw: 7.4, price: 41, avail: everyDay("00:00", "24:00"), offPeak: false, rating: 4.3 },
  { id: "ch_belfield_1", hostId: "host_belfield", title: "Belfield Office Park, bay 1", lat: 53.3049, lng: -6.2200, area: "Belfield", connector: "Type 2", powerKw: 22, price: 32, avail: nightsAndWeekends, offPeak: true, rating: 4.6 },
  { id: "ch_belfield_2", hostId: "host_belfield", title: "Belfield Office Park, bay 2", lat: 53.3051, lng: -6.2196, area: "Belfield", connector: "Type 2", powerKw: 22, price: 32, avail: nightsAndWeekends, offPeak: true, rating: 4.6 },
  { id: "ch_docklands_1", hostId: "host_docklands", title: "Docklands Tech Hub, rapid bay", lat: 53.3438, lng: -6.2380, area: "Grand Canal Dock", connector: "CCS", powerKw: 50, price: 38, avail: nightsAndWeekends, offPeak: true, rating: 4.4 },
  { id: "ch_docklands_2", hostId: "host_docklands", title: "Docklands Tech Hub, bay 2", lat: 53.3441, lng: -6.2386, area: "Grand Canal Dock", connector: "Type 2", powerKw: 22, price: 34, avail: nightsAndWeekends, offPeak: true, rating: 4.4 },
  { id: "ch_rathmines_1", hostId: "host_rathmines", title: "Rathmines Medical Centre car park", lat: 53.3225, lng: -6.2650, area: "Rathmines", connector: "Type 2", powerKw: 22, price: 35, avail: nightsAndWeekends, offPeak: true, rating: 4.2 },
  { id: "ch_sandyford", hostId: "host_niamh", title: "Driveway charger, Sandyford", lat: 53.2770, lng: -6.2160, area: "Sandyford", connector: "Type 2", powerKw: 7.4, price: 39, avail: weekdays("09:00", "17:00"), offPeak: false, rating: 4.1 },
] as const;

export async function seedIfEmpty() {
  const { n } = (await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM chargers"))!;
  if (n === 0) {
    await tx(async (db) => {
      for (const h of hosts) {
        await db.query(`INSERT INTO hosts (id, name, email, host_type) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [h.id, h.name, h.email, h.hostType]);
      }
      for (const c of chargers) {
        await db.query(`
          INSERT INTO chargers (id, host_id, title, lat, lng, area, connector, power_kw, host_price_cents_per_kwh,
                                overstay_cents_per_min, grace_minutes, availability, off_peak, rating)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 10, 10, $10, $11, $12)`,
          [c.id, c.hostId, c.title, c.lat, c.lng, c.area, c.connector, c.powerKw, c.price,
            JSON.stringify(c.avail), c.offPeak, c.rating]);
      }
    });
    console.log(`Seeded ${hosts.length} hosts and ${chargers.length} chargers`);
  }
  // All seeded hosts are paid through one sandbox "Kerb Demo Host" account, so every demo
  // booking is a Connect destination charge with the host's share visible in Stripe.
  if (config.stripeDemoAccountId) {
    await q(`UPDATE hosts SET stripe_account_id = $1, payouts_enabled = false
             WHERE user_id IS NULL AND stripe_account_id IS DISTINCT FROM $1`, [config.stripeDemoAccountId]);
  }
}
