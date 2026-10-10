export type Charger = {
  id: string;
  hostName: string;
  hostType: 'home' | 'business';
  title: string;
  lat: number;
  lng: number;
  area: string;
  connector: 'Type 2' | 'CCS';
  powerKw: number;
  priceCentsPerKwh: number;
  hostPriceCentsPerKwh?: number;
  overstayCentsPerMin: number;
  graceMinutes: number;
  availability: {
    day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    start: string;
    end: string;
  }[];
  offPeak: boolean;
  rating: number;
  distanceKm?: number;
  bookedSlots?: { start: string; end: string }[];
};

export type BookingStatus =
  | 'pending_payment'
  | 'reserved'
  | 'charging'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'expired'
  | 'blocked';

export type Booking = {
  id: string;
  chargerId: string;
  driverEmail: string;
  start: string;
  end: string;
  status: BookingStatus;
  holdCents: number;
  riskLevel:
    | 'normal'
    | 'elevated'
    | 'highest'
    | 'not_assessed'
    | null;
  kwhDelivered: number;
  receipt: null | {
    energyCents: number;
    overstayCents: number;
    noShowCents: number;
    totalCents: number;
    releasedCents: number;
    hostEarnsCents: number;
  };
};
