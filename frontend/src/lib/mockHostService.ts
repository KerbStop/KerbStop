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
  });
}