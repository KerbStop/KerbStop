// Availability windows are local Dublin time ("09:00"–"17:00"); bookings are UTC ISO strings.
// A window whose end is at or before its start runs past midnight into the next day.
import type { Window } from "./models.js";

const TZ = "Europe/Dublin";
const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const DAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

function localParts(d: Date) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: DAYS[p.weekday], min: Number(p.hour) * 60 + Number(p.minute) };
}

function inWindows(d: Date, windows: Window[]): boolean {
  const { day, min } = localParts(d);
  return windows.some((w) => {
    const s = toMin(w.start);
    const e = w.end === "24:00" ? 1440 : toMin(w.end);
    if (e > s) return w.day === day && min >= s && min < e;
    // Overnight window: evening part on w.day, morning part on the next day.
    return (w.day === day && min >= s) || ((w.day + 1) % 7 === day && min < e);
  });
}

/** True if every minute of [start, end) falls inside the charger's open hours. */
export function slotFitsAvailability(start: Date, end: Date, windows: Window[]): boolean {
  const step = 5 * 60_000;
  for (let t = start.getTime(); t < end.getTime(); t += step) {
    if (!inWindows(new Date(t), windows)) return false;
  }
  return inWindows(new Date(end.getTime() - 60_000), windows);
}
