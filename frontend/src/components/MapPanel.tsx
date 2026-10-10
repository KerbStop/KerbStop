import { AdvancedMarker, APIProvider, Circle, Map, useMap } from '@vis.gl/react-google-maps';
import { Home, ParkingSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Charger } from '../types';
import { formatPricePerKwh } from '../lib/format';

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

if (typeof window !== 'undefined') {
  window.gm_authFailure = () => window.dispatchEvent(new Event('kerbstop-google-maps-auth-failure'));
}

const defaultCenter = { lat: 53.3093, lng: -6.2272 };
const defaultMapId = 'DEMO_MAP_ID';
const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';

type MapCenter = { lat: number; lng: number };

function RecenterMap({ center, zoom }: { center: MapCenter; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.panTo(center);
    map.setZoom(zoom);
  }, [center, map, zoom]);

  return null;
}

type MapPanelProps = {
  chargers: Charger[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (chargerId: string) => void;
  onHover: (chargerId: string | null) => void;
  zoom?: number;
  center?: [number, number];
  userLocation?: [number, number];
};

export function MapPanel({
  chargers,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  zoom = 11.5,
  center,
  userLocation,
}: MapPanelProps) {
  const [mapError, setMapError] = useState(false);
  const mapCenter = center ? { lat: center[0], lng: center[1] } : defaultCenter;
  const userPosition = userLocation ? { lat: userLocation[0], lng: userLocation[1] } : null;

  useEffect(() => {
    const handleAuthFailure = () => setMapError(true);
    window.addEventListener('kerbstop-google-maps-auth-failure', handleAuthFailure);
    return () => window.removeEventListener('kerbstop-google-maps-auth-failure', handleAuthFailure);
  }, []);

  if (!apiKey) {
    return (
      <div className="map-panel google-map-unconfigured" role="status">
        <div className="map-setup-message">
          <span className="eyebrow">Google Maps</span>
          <h2>Map key needed</h2>
          <p>Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to your local <code>.env</code> file to load the live map.</p>
          <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noreferrer">
            Open Google Maps credentials
          </a>
        </div>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="map-panel google-map-unconfigured" role="alert">
        <div className="map-setup-message">
          <span className="eyebrow">Google Maps</span>
          <h2>Google Maps needs setup</h2>
          <p>Google rejected this map key. Enable Maps JavaScript API for the key&apos;s Cloud project, confirm billing and localhost referrer access, then reload.</p>
          <a href="https://console.cloud.google.com/google/maps-apis/api-list" target="_blank" rel="noreferrer">
            Check Maps API settings
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="map-panel google-map-panel">
      <APIProvider apiKey={apiKey} region="IE" language="en" onError={() => setMapError(true)}>
        <Map
          className="map-shell google-map-shell"
          defaultCenter={mapCenter}
          defaultZoom={zoom}
          mapId={import.meta.env.VITE_GOOGLE_MAP_ID || defaultMapId}
          gestureHandling="greedy"
          zoomControl
          fullscreenControl
          mapTypeControl={false}
          streetViewControl={false}
          clickableIcons={false}
        >
          {center ? <RecenterMap center={mapCenter} zoom={zoom} /> : null}

          {chargers.map((charger) => {
            const position = { lat: charger.lat, lng: charger.lng };
            const isActive = selectedId === charger.id || hoveredId === charger.id;
            const MarkerIcon = charger.hostType === 'home' ? Home : ParkingSquare;

            return (
              <AdvancedMarker
                key={charger.id}
                position={position}
                title={`${charger.hostType === 'home' ? 'Home charger' : 'Parking charger'} · ${charger.area} · ${formatPricePerKwh(charger.priceCentsPerKwh)}`}
                zIndex={isActive ? 10 : 1}
                onClick={() => onSelect(charger.id)}
                onMouseEnter={() => onHover(charger.id)}
                onMouseLeave={() => onHover(null)}
              >
                <div className={`google-price-marker ${isActive ? 'active' : ''}`}>
                  <MarkerIcon size={14} strokeWidth={2.2} />
                  <span>{formatPricePerKwh(charger.priceCentsPerKwh)}</span>
                </div>
              </AdvancedMarker>
            );
          })}

          {userPosition ? (
            <>
              <Circle
                center={userPosition}
                radius={55}
                options={{ strokeColor: '#4285f4', strokeOpacity: 0.15, strokeWeight: 1, fillColor: '#4285f4', fillOpacity: 0.12, clickable: false }}
              />
              <AdvancedMarker position={userPosition} title="Your precise location" zIndex={20}>
                <span className="google-user-location" />
              </AdvancedMarker>
            </>
          ) : null}
        </Map>
      </APIProvider>
    </div>
  );
}
