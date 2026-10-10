// Booking times in Dublin time, matching backend/src/availability.ts, so every start time
// offered here is one the back end will accept, whatever timezone the laptop is set to.
import type { Charger } from '../types';

const TZ = 'Europe/Dublin';
const DAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const partsFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export const MAX_DAYS_AHEAD = 6; // card holds last about 7 days
const SLOT_STEP_MIN = 30;

function dublinParts(date: Date) {
  const p = Object.fromEntries(partsFormat.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    dateKey: `${p.year}-${p.month}-${p.day}`,
    day: DAYS[p.weekday],
    minute: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** The instant that is `minute` minutes after midnight on dateKey, Dublin time. */
export function dublinTime(dateKey: string, minute: number): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minute);
  // Dublin is UTC+0 or UTC+1; correct the guess by however far off it reads.
  const read = dublinParts(new Date(guess));
  const [ry, rm, rd] = read.dateKey.split('-').map(Number);
  const offset = Date.UTC(ry, rm - 1, rd, 0, read.minute) - guess;
  return new Date(guess - offset);
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function inWindows(date: Date, windows: Charger['availability']) {
  const { day, minute } = dublinParts(date);
  return windows.some((w) => {
    const s = toMin(w.start);
    const e = w.end === '24:00' ? 1440 : toMin(w.end);
    if (e > s) return w.day === day && minute >= s && minute < e;
    return (w.day === day && minute >= s) || ((w.day + 1) % 7 === day && minute < e);
  });
}

function fits(start: Date, end: Date, windows: Charger['availability']) {
  for (let t = start.getTime(); t < end.getTime(); t += 5 * 60_000) {
    if (!inWindows(new Date(t), windows)) return false;
  }
  return inWindows(new Date(end.getTime() - 60_000), windows);
}

export type Slot = { start: Date; end: Date; label: string };

export const formatDublinTime = (date: Date) =>
  new Intl.DateTimeFormat('en-IE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);

export const formatDublinDate = (date: Date) => {
  const label = new Intl.DateTimeFormat('en-IE', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  return dublinParts(date).dateKey === dublinParts(new Date()).dateKey ? `Today · ${label}` : label;
};

export const formatDateKey = (dateKey: string) => formatDublinDate(dublinTime(dateKey, 12 * 60));

/** Free start times on dateKey for a session of `hours`, every 30 minutes. */
export function startTimes(charger: Charger, dateKey: string, hours: number): Slot[] {
  const now = Date.now();
  const booked = (charger.bookedSlots ?? []).map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()]);
  const slots: Slot[] = [];
  for (let minute = 0; minute < 1440; minute += SLOT_STEP_MIN) {
    const start = dublinTime(dateKey, minute);
    const end = new Date(start.getTime() + hours * 3_600_000);
    if (start.getTime() <= now || start.getTime() - now > MAX_DAYS_AHEAD * 86_400_000) continue;
    if (!fits(start, end, charger.availability)) continue;
    if (booked.some(([s, e]) => s < end.getTime() && e > start.getTime())) continue;
    slots.push({ start, end, label: formatDublinTime(start) });
  }
  return slots;
}

/** Dates (Dublin) from today up to MAX_DAYS_AHEAD that have at least one free 1-hour slot. */
export function bookableDates(charger: Charger): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset <= MAX_DAYS_AHEAD; offset += 1) {
    const dateKey = dublinParts(new Date(Date.now() + offset * 86_400_000)).dateKey;
    if (!dates.includes(dateKey) && startTimes(charger, dateKey, 1).length > 0) dates.push(dateKey);
  }
  return dates;
}

/** Windows that apply on a Dublin date, for the availability list. */
export function windowsOn(charger: Charger, dateKey: string) {
  const day = dublinParts(dublinTime(dateKey, 12 * 60)).day;
  return charger.availability.filter((w) => w.day === day);
}

/** Same formula as backend/src/pricing.ts, so the quote matches the real hold to the cent. */
export function estimate(charger: Charger, hours: number) {
  const hostPrice = charger.hostPriceCentsPerKwh ?? charger.priceCentsPerKwh / 1.12;
  const kwh = charger.powerKw * hours;
  const totalCents = Math.round(kwh * hostPrice * 1.12);
  const energyCents = Math.round(totalCents / 1.12);
  return {
    kwh,
    energyCents,
    serviceFeeCents: totalCents - energyCents,
    totalCents,
    holdCents: Math.round(kwh * hostPrice * 1.12 + 30 * charger.overstayCentsPerMin),
  };
}
