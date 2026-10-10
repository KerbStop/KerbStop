import { mockChargers } from '../data/mockChargers';
import type { Booking, Charger } from '../types';

const STORAGE_KEY = 'kerbstop.mock-bookings.v1';
const SERVICE_FEE_RATE = 0.12;
const MAXIMUM_HOLD_BUFFER_CENTS = 300;
const SIMULATION_TIME_MULTIPLIER = 60;
let memoryBookings: MockBookingRecord[] = [];

export type MockBookingRecord = Booking & {
  durationHours: number;
  estimatedEnergyCents: number;
  serviceFeeCents: number;
  estimatedTotalCents: number;
  chargingStartedAt: number | null;
  chargingStoppedAt?: number;
};

export type MockMeterReading = {
  kwhDelivered: number;
  energyCents: number;
  serviceFeeCents: number;
  totalCents: number;
  elapsedSeconds: number;
};

export function estimateBooking(charger: Charger, durationHours: number) {
  const energyCents = Math.round(charger.priceCentsPerKwh * charger.powerKw * durationHours);
  const serviceFeeCents = Math.round(energyCents * SERVICE_FEE_RATE);
  const totalCents = energyCents + serviceFeeCents;
  return { energyCents, serviceFeeCents, totalCents, holdCents: totalCents + MAXIMUM_HOLD_BUFFER_CENTS };
}

function readBookings(): MockBookingRecord[] {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return memoryBookings;
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item.id !== 'string' || typeof item.chargerId !== 'string')) return memoryBookings;
    memoryBookings = parsed as MockBookingRecord[];
    return memoryBookings;
  } catch {
    return memoryBookings;
  }
}

function saveBookings(bookings: MockBookingRecord[]) {
  memoryBookings = bookings;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  } catch {
    // Keep the demo journey working for this tab when browser storage is unavailable.
  }
}

function findCharger(chargerId: string): Charger {
  const charger = mockChargers.find((item) => item.id === chargerId);
  if (!charger) throw new Error('This charger could not be found.');
  return charger;
}

function updateBooking(bookingId: string, update: (booking: MockBookingRecord) => MockBookingRecord) {
  const bookings = readBookings();
  const index = bookings.findIndex((booking) => booking.id === bookingId);
  if (index < 0) throw new Error('This booking could not be found.');

  bookings[index] = update(bookings[index]);
  saveBookings(bookings);
  return bookings[index];
}

function getMeterReading(booking: MockBookingRecord, charger: Charger): MockMeterReading {
  const elapsedSeconds = booking.chargingStartedAt
    ? Math.max(0, Math.floor((((booking.chargingStoppedAt ?? Date.now()) - booking.chargingStartedAt) / 1000) * SIMULATION_TIME_MULTIPLIER))
    : 0;
  // Round energy down so independently rounded money values never exceed the hold.
  const maximumKwh = Math.floor(booking.holdCents / ((1 + SERVICE_FEE_RATE) * charger.priceCentsPerKwh) * 100) / 100;
  const kwhDelivered = Math.min(
    maximumKwh,
    Number(((charger.powerKw * elapsedSeconds) / 3600).toFixed(2)),
  );
  const energyCents = Math.round(kwhDelivered * charger.priceCentsPerKwh);
  const serviceFeeCents = Math.round(energyCents * SERVICE_FEE_RATE);

  return {
    kwhDelivered,
    energyCents,
    serviceFeeCents,
    totalCents: energyCents + serviceFeeCents,
    elapsedSeconds,
  };
}

export async function createBooking(input: {
  chargerId: string;
  date: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  driverEmail: string;
}): Promise<MockBookingRecord> {
  const charger = findCharger(input.chargerId);
  const start = new Date(`${input.date}T${input.startTime}:00`);
  const end = new Date(`${input.date}T${input.endTime}:00`);
  const minutes = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute; };
  const fitsAvailability = charger.availability.some((slot) => slot.day === start.getDay()
    && minutes(input.startTime) >= minutes(slot.start) && minutes(input.endTime) <= minutes(slot.end));
  if (![1, 2, 3].includes(input.durationHours) || !Number.isFinite(start.getTime())
    || start <= new Date() || end.getTime() - start.getTime() !== input.durationHours * 3600000
    || start.getMinutes() % 30 !== 0 || !fitsAvailability) {
    throw new Error('Choose a future session within this charger’s availability.');
  }
  const estimate = estimateBooking(charger, input.durationHours);
  const estimatedEnergyCents = estimate.energyCents;
  const serviceFeeCents = estimate.serviceFeeCents;
  const estimatedTotalCents = estimate.totalCents;
  const id = `bk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const booking: MockBookingRecord = {
    id,
    chargerId: charger.id,
    driverEmail: input.driverEmail,
    start: `${input.date}T${input.startTime}:00`,
    end: `${input.date}T${input.endTime}:00`,
    status: 'pending_payment',
    holdCents: estimatedTotalCents + MAXIMUM_HOLD_BUFFER_CENTS,
    riskLevel: 'normal',
    kwhDelivered: 0,
    receipt: null,
    durationHours: input.durationHours,
    estimatedEnergyCents,
    serviceFeeCents,
    estimatedTotalCents,
    chargingStartedAt: null,
  };

  saveBookings([...readBookings(), booking]);
  return booking;
}

export async function getBooking(bookingId: string): Promise<MockBookingRecord | null> {
  return readBookings().find((booking) => booking.id === bookingId) ?? null;
}

export async function confirmPayment(bookingId: string): Promise<MockBookingRecord> {
  return updateBooking(bookingId, (booking) => ({
    ...booking,
    status: booking.status === 'pending_payment' ? 'reserved' : booking.status,
  }));
}

export async function startCharging(bookingId: string): Promise<MockBookingRecord> {
  return updateBooking(bookingId, (booking) => {
    if (booking.status !== 'reserved') throw new Error('This booking is not ready to start.');
    return { ...booking, status: 'charging', chargingStartedAt: Date.now() };
  });
}

export async function getMeter(bookingId: string): Promise<MockMeterReading> {
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error('This booking could not be found.');

  if (booking.status !== 'charging' && booking.status !== 'completed') throw new Error('This session has not started.');
  const meter = getMeterReading(booking, findCharger(booking.chargerId));
  updateBooking(bookingId, (current) => ({ ...current, kwhDelivered: meter.kwhDelivered }));
  return meter;
}

export async function stopCharging(bookingId: string): Promise<MockBookingRecord> {
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error('This booking could not be found.');
  if (booking.status === 'completed') return booking;
  if (booking.status !== 'charging') throw new Error('This booking is not currently charging.');

  const charger = findCharger(booking.chargerId);
  const meter = getMeterReading(booking, charger);
  const updated: MockBookingRecord = {
    ...booking,
    status: 'completed',
    chargingStoppedAt: Date.now(),
    kwhDelivered: meter.kwhDelivered,
    receipt: {
      energyCents: meter.energyCents,
      overstayCents: 0,
      noShowCents: 0,
      totalCents: meter.totalCents,
      releasedCents: Math.max(booking.holdCents - meter.totalCents, 0),
      hostEarnsCents: meter.energyCents,
    },
  };

  return updateBooking(bookingId, () => updated);
}

export async function getReceipt(bookingId: string): Promise<MockBookingRecord['receipt']> {
  const booking = await getBooking(bookingId);
  return booking?.receipt ?? null;
}