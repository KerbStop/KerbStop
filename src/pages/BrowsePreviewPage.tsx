import { ArrowRight, LocateFixed, Maximize2, Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPanel } from '../components/MapPanel';
import { listChargers } from '../lib/api';
import { formatPricePerKwh } from '../lib/format';
import type { Charger } from '../types';

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

export function BrowsePreviewPage() {
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [query, setQuery] = useState('');
  const [connector, setConnector] = useState('All');
  const [maxPrice, setMaxPrice] = useState('Any');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const mapRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void listChargers().then((items) => {
      setChargers(items);
      setSelectedId(items[0]?.id ?? null);
    });
  }, []);

  const filteredChargers = useMemo(() => {
    const search = query.trim().toLowerCase();
    const limit = maxPrice === 'Any' ? Number.POSITIVE_INFINITY : Number(maxPrice);
    const chargersByDistance = userLocation
      ? chargers
          .map((charger) => ({
            ...charger,
            distanceKm: distanceFromLocation(userLocation[0], userLocation[1], charger),
          }))
          .sort((first, second) => (first.distanceKm ?? 0) - (second.distanceKm ?? 0))
      : chargers;

    return chargersByDistance.filter((charger) => {
      const matchesSearch =
        search.length === 0 ||
        charger.area.toLowerCase().includes(search) ||
        charger.title.toLowerCase().includes(search) ||
        charger.hostName.toLowerCase().includes(search);

      const matchesConnector = connector === 'All' || charger.connector === connector;
      const matchesPrice = charger.priceCentsPerKwh <= limit;

      return matchesSearch && matchesConnector && matchesPrice;
    });
  }, [chargers, connector, maxPrice, query, userLocation]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Location is not available in this browser.');
      return;
    }

    setIsLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation([coords.latitude, coords.longitude]);
        setIsLocating(false);
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Enable it in your browser settings to find nearby chargers.'
            : error.code === error.TIMEOUT
              ? 'Location took too long. Please try again.'
              : 'We could not get your location. Please try again.';
        setLocationError(message);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const activeId = filteredChargers.some((charger) => charger.id === selectedId)
    ? selectedId
    : filteredChargers[0]?.id ?? null;

  return (
    <div className="browse-preview container">
      <nav className="browse-nav">
        <Link to="/" className="browse-wordmark" aria-label="KerbStop home">
          KerbStop
        </Link>
        <span className="demo-badge">Driver preview</span>
        <Link to="/" className="back-home-link">
          ← Back home
        </Link>
      </nav>

      <header className="browse-header">
        <span className="eyebrow">An open spot. Just around the corner.</span>
        <h1>Find your next charge.</h1>
        <p>
          Explore shared chargers around Dublin. Choose a spot, book a slot, and pay only for what you use.
        </p>

        <div className="browse-controls">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search an area or charger…"
            aria-label="Search chargers"
          />

          <select value={connector} onChange={(event) => setConnector(event.target.value)} aria-label="Connector filter">
            <option value="All">All connectors</option>
            <option value="Type 2">Type 2</option>
            <option value="CCS">CCS</option>
          </select>

          <select value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} aria-label="Maximum price filter">
            <option value="Any">Any price</option>
            <option value="40">Up to €0.40 / kWh</option>
            <option value="50">Up to €0.50 / kWh</option>
            <option value="60">Up to €0.60 / kWh</option>
          </select>

          <button
            type="button"
            className="location-button"
            onClick={requestLocation}
            disabled={isLocating}
            aria-pressed={userLocation !== null}
          >
            <LocateFixed size={15} />
            {isLocating ? 'Locating…' : userLocation ? 'Near me' : 'Use my location'}
          </button>
        </div>
        {(locationError || userLocation) && (
          <p className={`location-message ${locationError ? 'error' : ''}`} role="status">
            {locationError ?? 'Showing nearby chargers, closest first.'}
          </p>
        )}
      </header>

      <div className="browse-layout">
        <section className="browse-list" aria-label="Available chargers">
          {filteredChargers.length === 0 ? (
            <div className="empty-preview">
              No example chargers match.<br />
              Try a different area, connector or price.
            </div>
          ) : (
            filteredChargers.slice(0, 4).map((charger) => (
              <button
                key={charger.id}
                type="button"
                className={`browse-card ${activeId === charger.id ? 'selected' : ''}`}
                aria-pressed={activeId === charger.id}
                onClick={() => setSelectedId(charger.id)}
                onMouseEnter={() => setHoveredId(charger.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div className="browse-card-top">
                  <span className="card-badge">
                    {charger.hostType === 'home' ? 'HOME DRIVEWAY' : 'BUSINESS CAR PARK'}
                  </span>
                  {charger.offPeak ? <span className="badge-soft">Off-peak</span> : <span className="badge-inline"><Star size={12} /> {charger.rating.toFixed(1)}</span>}
                </div>

                <h3>{charger.title}</h3>

                <p>
                  {charger.area} · {charger.distanceKm ?? 1.2} km away
                  <br />
                  {charger.connector} · {charger.powerKw} kW · {charger.availability[0]?.start ?? '18:00'}–
                  {charger.availability[0]?.end ?? '22:00'}
                </p>

                <div className="browse-price-row">
                  <span className="browse-price">{formatPricePerKwh(charger.priceCentsPerKwh)}</span>
                  <ArrowRight size={16} />
                </div>
              </button>
            ))
          )}
        </section>

        <section ref={mapRef} className="browse-map" aria-label="Map of available chargers">
          <MapPanel
            chargers={filteredChargers}
            selectedId={activeId}
            hoveredId={hoveredId}
            onSelect={setSelectedId}
            onHover={setHoveredId}
            center={userLocation ?? undefined}
            userLocation={userLocation ?? undefined}
            zoom={userLocation ? 15 : 12.5}
          />
          <button
            type="button"
            className="map-fullscreen"
            aria-label="View map fullscreen"
            title="View map fullscreen"
            onClick={() => void mapRef.current?.requestFullscreen()}
          >
            <Maximize2 size={18} />
          </button>
        </section>
      </div>

      <p className="browse-note">
        All prices include the 12% platform fee. Exact addresses would be shared after a confirmed booking.
      </p>
    </div>
  );
}
