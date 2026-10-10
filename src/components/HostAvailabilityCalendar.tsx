import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { useState } from 'react';
import type { HostDay } from '../lib/mockHostService';

const hostDays: HostDay[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const calendarHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getHostDay(date: Date): HostDay {
  return hostDays[(date.getDay() + 6) % 7];
}

function getCalendarDates(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const firstCell = new Date(month.getFullYear(), month.getMonth(), 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    return date;
  });
}

type HostAvailabilityCalendarProps = {
  availability: Record<HostDay, boolean>;
  exceptions: Record<string, boolean>;
  availableFrom: string;
  availableUntil: string;
  onAvailabilityChange: (availability: Record<HostDay, boolean>) => void;
  onExceptionsChange: (exceptions: Record<string, boolean>) => void;
  onHoursChange: (hours: { availableFrom: string; availableUntil: string }) => void;
  showIntro?: boolean;
};

export function HostAvailabilityCalendar({
  availability,
  exceptions,
  availableFrom,
  availableUntil,
  onAvailabilityChange,
  onExceptionsChange,
  onHoursChange,
  showIntro = true,
}: HostAvailabilityCalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [todayKey] = useState(() => toDateKey(new Date()));
  const dates = getCalendarDates(visibleMonth);
  const monthLabel = new Intl.DateTimeFormat('en-IE', { month: 'long', year: 'numeric' }).format(visibleMonth);

  const toggleDate = (date: Date) => {
    const key = toDateKey(date);
    if (key < todayKey) return;

    const recurringAvailability = availability[getHostDay(date)];
    const currentAvailability = exceptions[key] ?? recurringAvailability;
    const nextAvailability = !currentAvailability;
    const nextExceptions = { ...exceptions };

    if (nextAvailability === recurringAvailability) delete nextExceptions[key];
    else nextExceptions[key] = nextAvailability;

    onExceptionsChange(nextExceptions);
  };

  return (
    <div className="host-calendar">
      {showIntro ? (
        <div className="host-calendar-intro">
          <span className="eyebrow">Your calendar</span>
          <h2>Set your availability</h2>
          <p>Choose your regular weekly hours, then tap individual dates to make one-off changes.</p>
        </div>
      ) : null}

      <section className="host-calendar-month" aria-label="Availability calendar">
        <div className="host-calendar-toolbar">
          <div>
            <strong>{monthLabel}</strong>
            <span>Tap a date to override your weekly schedule.</span>
          </div>
          <div className="host-calendar-nav">
            <button type="button" aria-label="Previous month" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <ChevronLeft size={17} />
            </button>
            <button type="button" aria-label="Next month" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <ChevronRight size={17} />
            </button>
          </div>
        </div>

        <div className="host-calendar-grid" role="grid" aria-label={monthLabel}>
          {calendarHeaders.map((day) => <span className="host-calendar-weekday" role="columnheader" key={day}>{day}</span>)}
          {dates.map((date) => {
            const key = toDateKey(date);
            const inMonth = date.getMonth() === visibleMonth.getMonth();
            const past = key < todayKey;
            const baseAvailability = availability[getHostDay(date)];
            const dateAvailability = exceptions[key] ?? baseAvailability;
            const overridden = Object.hasOwn(exceptions, key);
            const stateClass = dateAvailability ? 'available' : 'unavailable';

            return (
              <button
                type="button"
                role="gridcell"
                key={key}
                disabled={past}
                aria-pressed={dateAvailability}
                aria-label={`${new Intl.DateTimeFormat('en-IE', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)}: ${dateAvailability ? 'available' : 'unavailable'}${overridden ? ', one-off change' : ''}`}
                className={`host-calendar-date ${inMonth ? '' : 'outside-month'} ${stateClass} ${overridden ? 'overridden' : ''} ${past ? 'past' : ''}`}
                onClick={() => toggleDate(date)}
              >
                <span>{date.getDate()}</span>
                {overridden ? <i aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>

        <div className="host-calendar-legend">
          <span><i className="legend-available" /> Available</span>
          <span><i className="legend-unavailable" /> Unavailable</span>
          <span><i className="legend-override" /> One-off change</span>
        </div>
      </section>

      <section className="host-recurring-schedule" aria-label="Recurring weekly availability">
        <div className="host-recurring-heading">
          <CalendarDays size={17} />
          <div><strong>Repeat weekly</strong><span>Set the days you&apos;re usually available.</span></div>
        </div>
        <div className="host-recurring-days">
          {hostDays.map((day) => (
            <button
              key={day}
              type="button"
              className={availability[day] ? 'host-recurring-day active' : 'host-recurring-day'}
              aria-pressed={availability[day]}
              onClick={() => onAvailabilityChange({ ...availability, [day]: !availability[day] })}
            >
              {day}
            </button>
          ))}
        </div>
        <div className="host-calendar-hours">
          <label className="host-field">
            <span><Clock3 size={14} /> Available from</span>
            <input type="time" value={availableFrom} onChange={(event) => onHoursChange({ availableFrom: event.target.value, availableUntil })} />
          </label>
          <label className="host-field">
            <span><Clock3 size={14} /> Available until</span>
            <input type="time" value={availableUntil} onChange={(event) => onHoursChange({ availableFrom, availableUntil: event.target.value })} />
          </label>
        </div>
        <p className="host-calendar-saved">Changes are saved automatically to this demo listing. Hosts can return here anytime to update dates.</p>
      </section>
    </div>
  );
}