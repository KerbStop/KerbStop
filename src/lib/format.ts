export function formatCurrencyFromCents(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

export function formatPricePerKwh(centsPerKwh: number): string {
  return `${formatCurrencyFromCents(centsPerKwh)}/kWh`;
}

export function formatDistance(distanceKm?: number): string {
  if (distanceKm === undefined) {
    return 'Near you';
  }

  return `${distanceKm.toFixed(1)} km away`;
}

export function formatDayLabel(day: number): string {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return labels[day] ?? 'Day';
}

export function formatAvailabilityWindow(start: string, end: string): string {
  return `${start}–${end}`;
}

export function formatTimeRange(start: string, end: string): string {
  return `${start} to ${end}`;
}

export function formatReading(value: number): string {
  return value.toFixed(1);
}
