export const hostOnboardingSteps = [
  { key: 'access', label: 'Sign up / log in' },
  { key: 'account', label: 'Account & personal information' },
  { key: 'identity', label: 'Identity' },
  { key: 'contact', label: 'Contact verification' },
  { key: 'welcome', label: 'List your charger' },
  { key: 'charger', label: 'Charger details' },
  { key: 'location', label: 'Charger location' },
  { key: 'photos', label: 'Photos' },
  { key: 'bill', label: 'Electricity bill' },
  { key: 'price', label: 'Set your price' },
  { key: 'availability', label: 'Availability' },
  { key: 'payouts', label: 'Stripe Connect' },
  { key: 'review', label: 'Review listing' },
] as const;

export type HostStepKey = (typeof hostOnboardingSteps)[number]['key'];
export type HostIdentityDocument = 'passport' | 'driving licence' | 'national ID';
export type HostKind = 'home' | 'business';
export type HostConnector = 'Type 2' | 'CCS';
export type HostDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type MockHostState = {
  step: HostStepKey;
  authMode: 'signup' | 'login';
  accountCreated: boolean;
  fullName: string;
  email: string;
  phone: string;
  identityDocument: HostIdentityDocument;
  identityVerified: boolean;
  contactVerified: boolean;
  hostKind: HostKind;
  chargerName: string;
  connector: HostConnector;
  powerKw: number;
  area: string;
  address: string;
  eircode: string;
  locationConfirmed: boolean;
  photoCount: number;
  billFileName: string;
  billAnalyzed: boolean;
  electricityRateCents: number;
  billConfidence: number;
  priceCentsPerKwh: number;
  availability: Record<HostDay, boolean>;
  availabilityExceptions: Record<string, boolean>;
  availableFrom: string;
  availableUntil: string;
  stripeConnected: boolean;
  published: boolean;
  listingId: string;
  publishedAt: string | null;
  /** The back end's host profile, created when the host connects Stripe. */
  hostId: string;
};

const storageKey = 'kerbstop.mock-host-onboarding.v1';

export const initialMockHostState: MockHostState = {
  step: 'access',
  authMode: 'signup',
  accountCreated: false,
  fullName: '',
  email: '',
  phone: '',
  identityDocument: 'driving licence',
  identityVerified: false,
  contactVerified: false,
  hostKind: 'home',
  chargerName: '',
  connector: 'Type 2',
  powerKw: 7.4,
  area: '',
  address: '',
  eircode: '',
  locationConfirmed: false,
  photoCount: 0,
  billFileName: '',
  billAnalyzed: false,
  electricityRateCents: 29,
  billConfidence: 96,
  priceCentsPerKwh: 37,
  availability: {
    Mon: true,
    Tue: true,
    Wed: true,
    Thu: true,
    Fri: true,
    Sat: false,
    Sun: false,
  },
  availabilityExceptions: {},
  availableFrom: '18:00',
  availableUntil: '22:00',
  stripeConnected: false,
  published: false,
  listingId: '',
  publishedAt: null,
  hostId: '',
};

export function loadMockHostState(): MockHostState {
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return initialMockHostState;
    const savedState = JSON.parse(saved) as Partial<MockHostState> & { step?: string };
    const savedStep = (savedState as { step?: string }).step;
    return {
      ...initialMockHostState,
      ...savedState,
      step: (savedStep === 'personal' ? 'account' : savedStep ?? initialMockHostState.step) as HostStepKey,
    };
  } catch {
    return initialMockHostState;
  }
}

export function saveMockHostState(state: MockHostState) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // The host flow remains active in memory if browser storage is unavailable.
  }
  return state;
}

export function updateMockHostState(current: MockHostState, changes: Partial<MockHostState>) {
  return saveMockHostState({ ...current, ...changes });
}

export function startFreshMockHostListing() {
  const current = loadMockHostState();
  return saveMockHostState({
    ...initialMockHostState,
    step: 'charger',
    accountCreated: current.accountCreated,
    fullName: current.fullName,
    email: current.email,
    phone: current.phone,
    identityDocument: current.identityDocument,
    identityVerified: current.identityVerified,
    contactVerified: current.contactVerified,
    hostId: current.hostId,
    stripeConnected: current.stripeConnected,
  });
}
const dayNumbers: Record<HostDay, 0 | 1 | 2 | 3 | 4 | 5 | 6> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Weekly windows in the back end's format (0 = Sunday), from the days and hours the host picked. */
export function toAvailabilityWindows(state: MockHostState) {
  return (Object.keys(state.availability) as HostDay[])
    .filter((day) => state.availability[day])
    .map((day) => ({ day: dayNumbers[day], start: state.availableFrom, end: state.availableUntil === '00:00' ? '24:00' : state.availableUntil }));
}

// Rough centres of Dublin areas, so a new listing lands in the right place on the map.
const areaCentres: Record<string, [number, number]> = {
  belfield: [53.3065, -6.2187], ucd: [53.3065, -6.2187], clonskeagh: [53.3105, -6.2335], donnybrook: [53.3216, -6.2364],
  ranelagh: [53.3262, -6.2564], rathmines: [53.3225, -6.2652], ballsbridge: [53.3296, -6.2296], sandymount: [53.3326, -6.2178],
  stillorgan: [53.2896, -6.1991], dundrum: [53.2925, -6.2454], milltown: [53.3104, -6.2508], booterstown: [53.3089, -6.1945],
  blackrock: [53.3015, -6.1778], 'mount merrion': [53.2995, -6.2112], sandyford: [53.2771, -6.2179], terenure: [53.3097, -6.2833],
  rathgar: [53.3150, -6.2730], drumcondra: [53.3700, -6.2550], phibsborough: [53.3605, -6.2730], 'dublin city': [53.3498, -6.2603],
  'city centre': [53.3498, -6.2603], smithfield: [53.3483, -6.2779], glasnevin: [53.3720, -6.2700], clontarf: [53.3640, -6.2050],
  howth: [53.3786, -6.0657], 'dun laoghaire': [53.2940, -6.1340], dalkey: [53.2775, -6.1000], tallaght: [53.2876, -6.3728],
  lucan: [53.3570, -6.4490], swords: [53.4597, -6.2181], malahide: [53.4509, -6.1544], 'ringsend': [53.3412, -6.2259],
};

export function areaToLatLng(area: string): { lat: number; lng: number } {
  const key = area.trim().toLowerCase();
  const match = Object.entries(areaCentres).find(([name]) => key.includes(name));
  const [lat, lng] = match ? match[1] : areaCentres.belfield;
  // Nudge slightly so two listings in one area don't sit on the same map pin.
  return { lat: lat + (Math.random() - 0.5) * 0.004, lng: lng + (Math.random() - 0.5) * 0.006 };
}
