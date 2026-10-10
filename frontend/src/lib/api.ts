// Talks to the Kerb back end (backend/). In development Vite forwards /api to
// http://localhost:4000, so no address is needed here; set VITE_API_URL when deployed.
import type { Booking, Charger } from '../types';
import { clearSession, getToken, saveSession } from './session';

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

// Where distances are measured from until the driver shares their location: UCD Belfield.
const UCD: [number, number] = [53.3065, -6.2187];

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const friendly: Record<string, string> = {
  slot_taken: 'Someone has just booked that slot. Please pick another time.',
  identity_required: 'Please verify your ID before booking.',
  unauthorized: 'Please sign in again.',
  ai_unavailable: 'The AI helper is unavailable right now. You can enter the details yourself.',
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('network', 'Cannot reach the KerbStop server. Is the back end running?', 0);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code: string = body?.error?.code ?? 'error';
    if (code === 'unauthorized') clearSession();
    throw new ApiError(code, friendly[code] ?? body?.error?.message ?? 'Something went wrong. Please try again.', response.status);
  }
  return body as T;
}

const post = <T>(path: string, data?: unknown) =>
  request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) });

// ---- Sign-in and ID check ----

export type Me = {
  userId: string;
  email: string;
  identityStatus: 'unverified' | 'processing' | 'requires_input' | 'verified';
  hostId: string | null;
};

export async function signIn(email: string): Promise<Me> {
  const { token } = await post<{ token: string }>('/api/auth/login', { email });
  saveSession(token, email.trim().toLowerCase());
  return getMe();
}

export const getMe = () => request<Me>('/api/me');

/** Starts Stripe Identity. Returns the Stripe page to send the user to, or null if already verified. */
export async function startIdentityCheck(): Promise<string | null> {
  const { url } = await post<{ url: string | null }>('/api/me/verify');
  return url;
}

// ---- Chargers ----

export async function listChargers(): Promise<Charger[]> {
  const { chargers } = await request<{ chargers: Charger[] }>(`/api/chargers?lat=${UCD[0]}&lng=${UCD[1]}&radiusKm=50`);
  return chargers;
}

export const getChargerById = (id: string) => request<Charger>(`/api/chargers/${encodeURIComponent(id)}`);

// ---- Bookings ----

export function createBooking(input: { chargerId: string; start: string; end: string }) {
  return post<{ bookingId: string; checkoutUrl: string; holdCents: number }>('/api/bookings', input);
}

export const getBooking = (id: string) => request<Booking>(`/api/bookings/${encodeURIComponent(id)}`);
export const startCharging = (id: string) => post<Booking>(`/api/bookings/${encodeURIComponent(id)}/start`);
export const stopCharging = (id: string) => post<Booking>(`/api/bookings/${encodeURIComponent(id)}/stop`);
export const cancelBooking = (id: string) => post<Booking>(`/api/bookings/${encodeURIComponent(id)}/cancel`);

export type MeterReading = {
  kwhDelivered: number;
  runningCostCents: number;
  elapsedMinutes: number | null;
  status: Booking['status'];
};

export const getMeter = (id: string) => request<MeterReading>(`/api/bookings/${encodeURIComponent(id)}/meter`);

// ---- Hosts ----

export function becomeHost(name: string, hostType: 'home' | 'business') {
  return post<{ hostId: string; onboardingUrl: string }>('/api/hosts', { name, hostType });
}

export type HostSummary = {
  hostId: string;
  payoutsEnabled: boolean;
  earningsCents: number;
  chargers: Charger[];
  bookings: { id: string; chargerId: string; start: string; end: string; status: Booking['status']; holdCents: number }[];
};

export const getHost = (id: string) => request<HostSummary>(`/api/hosts/${encodeURIComponent(id)}`);

export type NewCharger = {
  hostId: string;
  title: string;
  lat: number;
  lng: number;
  area: string;
  connector: 'Type 2' | 'CCS';
  powerKw: number;
  hostPriceCentsPerKwh: number;
  availability: Charger['availability'];
};

export const publishCharger = (input: NewCharger) => post<Charger>('/api/chargers', input);

export type BillReading = {
  dayRateCents: number | null;
  nightRateCents: number | null;
  suggestedPriceCents: number | null;
  confidence: number;
  notes: string;
};

export function readBill(file: File) {
  const form = new FormData();
  form.append('bill', file);
  return request<BillReading>('/api/ai/bill', { method: 'POST', body: form });
}
