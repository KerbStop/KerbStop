import { ArrowRight, Clock3, LocateFixed, MapPin, Search, Star, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChargerCard } from '../components/ChargerCard';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { MapPanel } from '../components/MapPanel';
import { getMockChargerDetails } from '../data/mockChargerDetails';
import { listChargers } from '../lib/api';
import { formatDayLabel, formatDistance, formatPricePerKwh } from '../lib/format';
import type { Charger } from '../types';

const sortOptions = ['Recommended', 'Closest', 'Cheapest', 'Fastest'] as const;
type SortMode = (typeof sortOptions)[number];

const distanceLimits = {
  Any: Number.POSITIVE_INFINITY,
  'Under 1 km': 1,
  'Under 3 km': 3,
  'Under 5 km': 5,
} as const;

const filterDefaults = {
  maxPrice: 1000,
  connector: 'Any',
  speed: 'Any',
  distance: 'Any',
  when: 'Any',
  sort: 'Recommended' as SortMode,
};

const defaultDriverCenter: [number, number] = [53.3093, -6.2272];

function distanceFromLocation(latitude: number, longitude: number, charger: Charger) {
  const radiansPerDegree = Math.PI / 180;
  const latitudeRadians = latitude * radiansPerDegree;
  const chargerLatitudeRadians = charger.lat * radiansPerDegree;
  const latitudeDelta = (charger.lat - latitude) * radiansPerDegree;
  const longitudeDelta = (charger.lng - longitude) * radiansPerDegree;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeRadians) *
      Math.cos(chargerLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Number((6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))).toFixed(1));
}

export function ChargersPage() {
  const navigate = useNavigate();
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filters, setFilters] = useState(filterDefaults);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    listChargers()
      .then((items) => {
        if (!mounted) return;
        setChargers(items);
        setSelectedId(items[0]?.id ?? null);
      })
      .catch(() => {
        if (!mounted) return;
        setError('We could not load charger listings right now. Please try again in a moment.');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const filteredChargers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const chargersWithDistances = userLocation
      ? chargers.map((charger) => ({
          ...charger,
          distanceKm: distanceFromLocation(userLocation[0], userLocation[1], charger),
        }))
      : chargers;

    const result = chargersWithDistances.filter((charger) => {
      const matchSearch =
        query.length === 0 ||
        charger.area.toLowerCase().includes(query) ||
        charger.title.toLowerCase().includes(query) ||
        charger.hostName.toLowerCase().includes(query);

      const connectorMatch = filters.connector === 'Any' || charger.connector === filters.connector;
      const priceLimit = filters.maxPrice;
      const priceMatch = charger.priceCentsPerKwh <= priceLimit;
      const distanceLimit = distanceLimits[filters.distance as keyof typeof distanceLimits] ?? Number.POSITIVE_INFINITY;
      const distanceMatch = (charger.distanceKm ?? 99) <= distanceLimit;

      const speedMatch =
        filters.speed === 'Any' ||
        (filters.speed === '7 kW+' && charger.powerKw >= 7) ||
        (filters.speed === '11 kW+' && charger.powerKw >= 11) ||
        (filters.speed === '22 kW+' && charger.powerKw >= 22);

      const timeMatch =
        filters.when === 'Any' ||
        (filters.when === 'Afternoon' &&
          charger.availability.some((slot) => {
            const hour = Number(slot.start.split(':')[0]);
            return hour >= 12 && hour <= 17;
          })) ||
        (filters.when === 'Evening' &&
          charger.availability.some((slot) => {
            const hour = Number(slot.start.split(':')[0]);
            return hour >= 17;
          })) ||
        (filters.when === 'Off-peak' && charger.offPeak);

      return matchSearch && connectorMatch && priceMatch && distanceMatch && speedMatch && timeMatch;
    });

    if (userLocation) {
      return [...result].sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));
    }

    switch (filters.sort) {
      case 'Closest':
        return [...result].sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));
      case 'Cheapest':
        return [...result].sort((a, b) => a.priceCentsPerKwh - b.priceCentsPerKwh);
      case 'Fastest':
        return [...result].sort((a, b) => b.powerKw - a.powerKw);
      default:
        return [...result].sort((a, b) => {
          const scoreA = a.rating * 10 + (a.offPeak ? 2 : 0) - (a.distanceKm ?? 99) * 0.8;
          const scoreB = b.rating * 10 + (b.offPeak ? 2 : 0) - (b.distanceKm ?? 99) * 0.8;
          return scoreB - scoreA;
        });
    }
  }, [chargers, filters, searchTerm, userLocation]);

  const selectedCharger = filteredChargers.find((charger) => charger.id === selectedId) ?? filteredChargers[0] ?? null;
  const hoveredCharger = filteredChargers.find((charger) => charger.id === hoveredId) ?? null;
  const previewCharger = hoveredCharger ?? selectedCharger;
  const effectiveSelectedId = previewCharger?.id ?? null;

  const clearFilters = () => {
    setSearchTerm('');
    setFilters(filterDefaults);
  };

  const usePreciseLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Location is not available in this browser.');
      return;
    }

    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation([coords.latitude, coords.longitude]);
        setLocating(false);
      },
      (locationFailure) => {
        setLocationError(
          locationFailure.code === 1
            ? 'Location permission was denied. Enable it in your browser settings to find nearby chargers.'
            : locationFailure.code === 3
              ? 'Location took too long. Please try again.'
              : 'We could not get your location. Please try again.',
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  if (loading) {
    return <LoadingState message="Finding chargers near you..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <div className="driver-discovery container">
      <header className="driver-discovery-header">
        <span className="eyebrow">Driver</span>
        <h1>Find a charger near you.</h1>
        <p>Book available home and business chargers around Dublin.</p>
      </header>

      <div className="driver-workspace">
        <aside className="driver-sidebar" aria-label="Search and charger listings">
          <section className="driver-search-panel" aria-label="Search and filters">
            <div className="driver-search-row">
              <label className="search-field search-field-wide">
                <span className="search-label">
                  <Search size={15} />
                  Where do you need to charge?
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="UCD, Ranelagh, Dublin..."
                  aria-label="Search by location"
                />
              </label>

              <label className="search-field">
                <span>When</span>
                <select
                  value={filters.when}
                  onChange={(event) => setFilters((current) => ({ ...current, when: event.target.value }))}
                >
                  <option value="Any">Any time</option>
                  <option value="Afternoon">Afternoon</option>
                  <option value="Evening">Evening</option>
                  <option value="Off-peak">Off-peak</option>
                </select>
              </label>

              <label className="search-field">
                <span>Connector</span>
                <select
                  value={filters.connector}
                  onChange={(event) => setFilters((current) => ({ ...current, connector: event.target.value }))}
                >
                  <option value="Any">Any connector</option>
                  <option value="Type 2">Type 2</option>
                  <option value="CCS">CCS</option>
                </select>
              </label>

              <label className="search-field">
                <span>Max price</span>
                <select
                  value={filters.maxPrice}
                  onChange={(event) => setFilters((current) => ({ ...current, maxPrice: Number(event.target.value) }))}
                >
                  <option value={1000}>Any price</option>
                  <option value={40}>Under €0.40/kWh</option>
                  <option value={50}>Under €0.50/kWh</option>
                  <option value={60}>Under €0.60/kWh</option>
                </select>
              </label>

              <label className="search-field">
                <span>Speed</span>
                <select
                  value={filters.speed}
                  onChange={(event) => setFilters((current) => ({ ...current, speed: event.target.value }))}
                >
                  <option value="Any">Any speed</option>
                  <option value="7 kW+">7 kW+</option>
                  <option value="11 kW+">11 kW+</option>
                  <option value="22 kW+">22 kW+</option>
                </select>
              </label>

              <label className="search-field">
                <span>Distance</span>
                <select
                  value={filters.distance}
                  onChange={(event) => setFilters((current) => ({ ...current, distance: event.target.value }))}
                >
                  <option value="Any">Any distance</option>
                  <option value="Under 1 km">Under 1 km</option>
                  <option value="Under 3 km">Under 3 km</option>
                  <option value="Under 5 km">Under 5 km</option>
                </select>
              </label>

              <div className="driver-filter-actions">
                <button type="button" className="driver-location-button" onClick={usePreciseLocation} disabled={locating} aria-pressed={userLocation !== null}>
                  <LocateFixed size={15} />
                  {locating ? 'Locating…' : userLocation ? 'Using your location' : 'Use my location'}
                </button>
                <button type="button" className="driver-clear-button" onClick={clearFilters}>
                  <X size={14} /> Clear
                </button>
              </div>
            </div>
            {locationError ? <p className="location-message error" role="status">{locationError}</p> : null}
          </section>

          {previewCharger ? (
            <div className="selected-charger-panel driver-selected-preview" aria-live="polite">
              <div className="selected-charger-image">
                <img src={getMockChargerDetails(previewCharger.id).photoUrl} alt={`Shared charger near ${previewCharger.area}`} />
              </div>
              <div className="selected-charger-copy">
                <div className="selected-charger-header">
                  <div>
                    <span className="chip light">{previewCharger.area}</span>
                    <h2>{previewCharger.title}</h2>
                  </div>
                  <span className="price-highlight">{formatPricePerKwh(previewCharger.priceCentsPerKwh)}</span>
                </div>
                <div className="selected-charger-meta">
                  <span><MapPin size={14} /> {formatDistance(previewCharger.distanceKm)}</span>
                  <span><Zap size={14} /> {previewCharger.powerKw} kW · {previewCharger.connector}</span>
                  <span><Star size={14} /> {previewCharger.rating.toFixed(1)}</span>
                </div>
                <div className="selected-charger-bottom">
                  <div className="selected-charger-note">
                    <Clock3 size={15} />
                    {formatDayLabel(previewCharger.availability[0]?.day ?? 1)} · {previewCharger.availability[0]?.start ?? '18:00'}–{previewCharger.availability[0]?.end ?? '22:00'}
                  </div>
                  <button type="button" className="primary-action compact" onClick={() => navigate(`/chargers/${previewCharger.id}`)}>
                    View charger <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <section className="driver-results" aria-label="Recommended chargers">
            <div className="driver-results-header">
              <div>
                <h2>Nearby chargers</h2>
                <p>{userLocation ? 'Sorted by your location' : 'Available around Dublin'}</p>
              </div>
              <span className="muted-pill">{filteredChargers.length} available</span>
            </div>

            {filteredChargers.length === 0 ? (
              <div className="empty-results">
                <h3>No chargers match those filters.</h3>
                <p>Try increasing your distance or changing the time to see more nearby options.</p>
                <div className="empty-actions">
                  <button type="button" className="secondary-action compact" onClick={clearFilters}>Clear filters</button>
                  <button type="button" className="primary-action compact" onClick={() => setSearchTerm('')}>Expand search</button>
                </div>
              </div>
            ) : (
              <div className="driver-result-grid">
                {filteredChargers.map((charger) => (
                  <ChargerCard
                    key={charger.id}
                    charger={charger}
                    selected={effectiveSelectedId === charger.id || hoveredId === charger.id}
                    onSelect={setSelectedId}
                    onHover={setHoveredId}
                  />
                ))}
              </div>
            )}
          </section>
        </aside>

        <div className="driver-map-column">
          <div className="driver-map-shell">
            <MapPanel
              chargers={filteredChargers}
              selectedId={effectiveSelectedId}
              hoveredId={hoveredId}
              onSelect={setSelectedId}
              onHover={setHoveredId}
              center={userLocation ?? defaultDriverCenter}
              userLocation={userLocation ?? undefined}
              zoom={userLocation ? 15 : 11.5}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
