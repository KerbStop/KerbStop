// All money is integer cents. Kerb adds a 12% fee on top of the host's price.
export const KERB_FEE = 0.12;
export const OVERSTAY_BUFFER_MIN = 30;
export const NO_SHOW_FEE_CENTS = 300;

/** What the driver pays per kWh: host price + 12%, rounded. Use everywhere. */
export function driverPriceCentsPerKwh(hostPriceCentsPerKwh: number): number {
  return Math.round(hostPriceCentsPerKwh * (1 + KERB_FEE));
}

/** Energy cost to the driver, Kerb fee included. */
export function energyCents(kwh: number, hostPriceCentsPerKwh: number): number {
  return Math.round(kwh * hostPriceCentsPerKwh * (1 + KERB_FEE));
}

/** Most a slot could cost: full power for the whole slot, plus 30 min of overstay. */
export function holdCents(powerKw: number, hours: number, hostPriceCentsPerKwh: number, overstayCentsPerMin: number): number {
  return Math.round(powerKw * hours * hostPriceCentsPerKwh * (1 + KERB_FEE) + OVERSTAY_BUFFER_MIN * overstayCentsPerMin);
}

/** Split a captured total into the host's share and Kerb's application fee. */
export function split(totalCents: number) {
  const hostEarnsCents = Math.round(totalCents / (1 + KERB_FEE));
  return { hostEarnsCents, kerbFeeCents: totalCents - hostEarnsCents };
}
