import { ArrowLeft, CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HostAvailabilityCalendar } from '../components/HostAvailabilityCalendar';
import { loadMockHostState, updateMockHostState } from '../lib/mockHostService';
import type { MockHostState } from '../lib/mockHostService';

export function HostCalendarPage() {
  const [host, setHost] = useState<MockHostState>(loadMockHostState);

  const patchHost = (changes: Partial<MockHostState>) => {
    setHost((current) => updateMockHostState(current, changes));
  };

  if (!host.published) {
    return (
      <div className="host-calendar-page container">
        <div className="host-calendar-empty">
          <CalendarDays size={28} />
          <h1>Publish a charger first.</h1>
          <p>Once your listing is published, you can manage bookable dates here without repeating host setup.</p>
          <Link to="/host" className="primary-action">Continue host setup</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="host-calendar-page container">
      <Link to="/host/dashboard" className="host-calendar-back"><ArrowLeft size={15} /> Host dashboard</Link>
      <div className="host-calendar-page-header">
        <span className="eyebrow">{host.chargerName || 'Your charger'}</span>
        <h1>Manage availability</h1>
        <p>Update your calendar whenever your plans change. Your listing, pricing, and verification stay as they are.</p>
      </div>

      <section className="host-calendar-page-card">
        <HostAvailabilityCalendar
          availability={host.availability}
          exceptions={host.availabilityExceptions}
          availableFrom={host.availableFrom}
          availableUntil={host.availableUntil}
          onAvailabilityChange={(availability) => patchHost({ availability })}
          onExceptionsChange={(availabilityExceptions) => patchHost({ availabilityExceptions })}
          onHoursChange={(hours) => patchHost(hours)}
          showIntro
        />
      </section>
    </div>
  );
}