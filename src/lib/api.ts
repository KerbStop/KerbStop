import { mockChargers } from '../data/mockChargers';
import type { Booking, Charger } from '../types';

const API_BASE_URL = 'http://localhost:4000';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function listChargers(): Promise<Charger[]> {
  await wait(400);

  return mockChargers.map((charger, index) => ({
    ...charger,
    distanceKm: Number((1.2 + index * 0.6).toFixed(1)),
  }));
}

export async function getChargerById(id: string): Promise<Charger> {
  await wait(350);

  const charger = mockChargers.find((item) => item.id === id);

  if (!charger) {
    throw new Error('This charger could not be found.');
  }

  return {
    ...charger,
    distanceKm: 1.4,
  };
}

export async function createBooking(input: {
  chargerId: string;
  date: string;
  start: string;
  end: string;
  driverEmail: string;
}): Promise<Booking> {
  await wait(500);

  const holdCents = 1240;

  return {
    id: `bk-${Date.now()}`,
    chargerId: input.chargerId,
    driverEmail: input.driverEmail,
    start: `${input.date}T${input.start}:00`,
    end: `${input.date}T${input.end}:00`,
    status: 'reserved',
    holdCents,
    riskLevel: 'normal',
    kwhDelivered: 0,
    receipt: null,
  };
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
