export type MockChargerDetails = {
  photoUrl: string;
  exactAddress: string;
};

const chargerPhoto =
  'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=1400&q=85';

export const mockChargerDetails: Record<string, MockChargerDetails> = {
  'ch-001': { photoUrl: chargerPhoto, exactAddress: 'DEMO ADDRESS · 12 Belfield Grove, Dublin 4' },
  'ch-002': { photoUrl: chargerPhoto, exactAddress: 'DEMO ADDRESS · 8 Clonskeagh Lane, Dublin 14' },
  'ch-003': { photoUrl: chargerPhoto, exactAddress: 'DEMO ADDRESS · 3 Stillorgan Business Park, Dublin 18' },
  'ch-004': { photoUrl: chargerPhoto, exactAddress: 'DEMO ADDRESS · 21 Ranelagh Gardens, Dublin 6' },
  'ch-005': { photoUrl: chargerPhoto, exactAddress: 'DEMO ADDRESS · 6 Donnybrook Road, Dublin 4' },
  'ch-006': { photoUrl: chargerPhoto, exactAddress: 'DEMO ADDRESS · 14 Ballsbridge Terrace, Dublin 4' },
  'ch-007': { photoUrl: chargerPhoto, exactAddress: 'DEMO ADDRESS · 5 Dundrum View, Dublin 16' },
  'ch-008': { photoUrl: chargerPhoto, exactAddress: 'DEMO ADDRESS · 9 Blackrock Park, Co. Dublin' },
  'ch-009': { photoUrl: chargerPhoto, exactAddress: 'DEMO ADDRESS · 17 Rathmines Square, Dublin 6' },
  'ch-010': { photoUrl: chargerPhoto, exactAddress: 'DEMO ADDRESS · 2 Sandyford Court, Dublin 18' },
  'ch-011': { photoUrl: chargerPhoto, exactAddress: 'DEMO ADDRESS · 4 Belfield Campus Way, Dublin 4' },
  'ch-012': { photoUrl: chargerPhoto, exactAddress: 'DEMO ADDRESS · 11 Clonskeagh Drive, Dublin 14' },
};

export function getMockChargerDetails(chargerId: string): MockChargerDetails {
  return mockChargerDetails[chargerId] ?? {
    photoUrl: chargerPhoto,
    exactAddress: 'DEMO ADDRESS · Shared after reservation',
  };
}