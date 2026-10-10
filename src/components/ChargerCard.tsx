import { CarFront, Clock3, MapPin, Star, Zap } from 'lucide-react';
import type { Charger } from '../types';
import { formatDistance, formatPricePerKwh } from '../lib/format';

type ChargerCardProps = {
  charger: Charger;
  selected: boolean;
  onSelect: (chargerId: string) => void;
  onHover?: (chargerId: string | null) => void;
};

export function ChargerCard({ charger, selected, onSelect, onHover }: ChargerCardProps) {
  const availability = charger.availability[0] ?? { start: '18:00', end: '22:00' };

  return (
    <button
      type="button"
      className={selected ? 'charger-card selected' : 'charger-card'}
      onClick={() => onSelect(charger.id)}
      onMouseEnter={() => onHover?.(charger.id)}
      onMouseLeave={() => onHover?.(null)}
      aria-pressed={selected}
    >
      <div className="charger-thumb" aria-hidden="true">
        <CarFront size={28} />
      </div>

      <div className="charger-card-body">
        <div className="card-header-row">
          <span className="chip light">{charger.area}</span>
          <span className="distance">{formatDistance(charger.distanceKm)}</span>
        </div>

        <h3>{charger.title}</h3>

        <div className="meta-grid">
          <span>
            <Zap size={14} /> {charger.powerKw} kW
          </span>
          <span>
            <Star size={14} /> {charger.rating.toFixed(1)}
          </span>
        </div>

        <div className="meta-row">
          <span className="price">{formatPricePerKwh(charger.priceCentsPerKwh)}</span>
          <span className="connector">{charger.connector}</span>
        </div>

        <div className="meta-row compact-row">
          <span>
            <MapPin size={14} /> {charger.area}
          </span>
          <span>
            <Clock3 size={14} /> {availability.start}–{availability.end}
          </span>
        </div>

        {charger.offPeak ? <span className="chip success">Off-peak</span> : null}
      </div>
    </button>
  );
}
