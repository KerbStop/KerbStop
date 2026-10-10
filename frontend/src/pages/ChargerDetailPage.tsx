import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Gauge, MapPin, ShieldCheck, Star, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { getMockChargerDetails } from '../data/mockChargerDetails';
import { AccountGate } from '../components/AccountGate';
import { createBooking, getChargerById } from '../lib/api';
import { bookableDates, estimate, formatDateKey, formatDublinTime, startTimes, windowsOn } from '../lib/slots';
import { formatCurrencyFromCents, formatDistance, formatPricePerKwh } from '../lib/format';
import type { Charger } from '../types';

const durationChoices = [1, 2, 3];

export function ChargerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [charger, setCharger] = useState<Charger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [durationHours, setDurationHours] = useState(2);
  const [bookingPending, setBookingPending] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    if (!id) return;

    getChargerById(id)
      .then(setCharger)
      .catch(() => setError('This charger is no longer available. Please choose another nearby option.'))
      .finally(() => setLoading(false));
  }, [id]);

  const availableDates = useMemo(() => (charger ? bookableDates(charger) : []), [charger]);
  const selectedDate = availableDates.includes(date) ? date : availableDates[0] ?? '';

  const availableDurations = useMemo(
    () => (charger ? durationChoices.filter((duration) => startTimes(charger, selectedDate, duration).length > 0) : []),
    [charger, selectedDate],
  );
  const selectedDuration = availableDurations.includes(durationHours) ? durationHours : availableDurations[0] ?? 1;

  const availableSlots = useMemo(
    () => (charger ? startTimes(charger, selectedDate, selectedDuration) : []),
    [charger, selectedDate, selectedDuration],
  );
  const availableStartTimes = availableSlots.map((slot) => slot.label);
  const selectedSlot = availableSlots.find((slot) => slot.label === startTime) ?? availableSlots[0] ?? null;
  const selectedStartTime = selectedSlot?.label ?? '';
  const endTime = selectedSlot ? formatDublinTime(selectedSlot.end) : '';
  const { kwh, energyCents, serviceFeeCents, totalCents, holdCents } = useMemo(() => {
    if (!charger) return { kwh: 0, energyCents: 0, serviceFeeCents: 0, totalCents: 0, holdCents: 0 };
    return estimate(charger, selectedDuration);
  }, [charger, selectedDuration]);

  const handleReserve = async () => {
    if (!charger || !selectedSlot) return;

    setBookingPending(true);
    setBookingError(null);

    try {
      const booking = await createBooking({
        chargerId: charger.id,
        start: selectedSlot.start.toISOString(),
        end: selectedSlot.end.toISOString(),
      });
      // Stripe Checkout places the hold, then sends the driver back to /booking/:id.
      window.location.assign(booking.checkoutUrl);
    } catch (bookingFailure) {
      setBookingError(bookingFailure instanceof Error ? bookingFailure.message : 'We could not create your booking. Please try again.');
      setBookingPending(false);
      if (bookingFailure instanceof Error && 'code' in bookingFailure && bookingFailure.code === 'slot_taken') {
        getChargerById(charger.id).then(setCharger).catch(() => undefined);
      }
    }
  };

  if (loading) {
    return <LoadingState message="Loading charger details..." />;
  }

  if (error) {
    return (
      <div className="detail-error container narrow">
        <ErrorState message={error} />
        <button type="button" className="primary-action" onClick={() => navigate('/chargers')}>Back to charger map</button>
      </div>
    );
  }

  if (!charger) {
    return (
      <div className="detail-error container narrow">
        <ErrorState message="We could not find the charger you selected." />
        <button type="button" className="primary-action" onClick={() => navigate('/chargers')}>Back to charger map</button>
      </div>
    );
  }

  const mockDetails = getMockChargerDetails(charger.id);

  return (
    <div className="detail-page container">
      <div className="detail-hero">
        <div className="detail-visual">
          <img className="detail-photo" src={mockDetails.photoUrl} alt={`Shared EV charger near ${charger.area}`} />
        </div>

        <div className="detail-header-copy">
          <span className="eyebrow">{charger.area}, Dublin</span>
          <h1>{charger.title}</h1>
          <div className="detail-meta-row">
            <span><Star size={15} /> {charger.rating.toFixed(1)}</span>
            <span><MapPin size={15} /> {formatDistance(charger.distanceKm)}</span>
          </div>
          <p className="detail-description">Hosted by {charger.hostName}</p>
          <div className="detail-price-hero">{formatPricePerKwh(charger.priceCentsPerKwh)}</div>
          <p className="demo-address-note">General area only. Exact address is shared after reservation.</p>
        </div>
      </div>

      <div className="detail-layout">
        <div className="detail-main">
          <section className="info-card">
            <h2>Charger details</h2>
            <div className="detail-stats">
              <div><Gauge size={18} /> {charger.powerKw} kW</div>
              <div><Zap size={18} /> {charger.connector}</div>
              <div><MapPin size={18} /> {charger.area}, Dublin</div>
              <div><ShieldCheck size={18} /> Grace: {charger.graceMinutes} min</div>
            </div>
          </section>

          <section className="info-card">
            <h2>Availability</h2>
            {availableDates.slice(0, 5).map((dateKey) => {
              const windows = windowsOn(charger, dateKey);
              return (
                <div className="availability-row" key={dateKey}>
                  <span>{formatDateKey(dateKey)}</span>
                  <strong>{windows.map((window) => `${window.start}–${window.end}`).join(', ')}</strong>
                </div>
              );
            })}
            <p className="privacy-note">Hosted by {charger.hostName}. Exact residential address stays private until booking is confirmed.</p>
          </section>
        </div>

        <aside className="booking-panel">
          <div className="booking-box">
            {showReview ? (
              <>
                <button type="button" className="text-button" onClick={() => setShowReview(false)}>
                  <ArrowLeft size={15} /> Edit time
                </button>
                <h2>Review your booking</h2>
                <div className="review-charger-title">{charger.title} · {selectedDuration} {selectedDuration === 1 ? 'hour' : 'hours'}</div>
                <div className="review-line"><span>{formatDateKey(selectedDate)}</span><strong>{selectedStartTime}–{endTime}</strong></div>
                <div className="review-line"><span>{charger.powerKw} kW · {charger.connector}</span><strong>{formatPricePerKwh(charger.priceCentsPerKwh)}</strong></div>
                <div className="price-breakdown">
                  <div><span>Estimated charging</span><strong>{formatCurrencyFromCents(energyCents)}</strong></div>
                  <div><span>KerbStop service fee</span><strong>{formatCurrencyFromCents(serviceFeeCents)}</strong></div>
                  <div className="total-line"><span>Estimated total</span><strong>{formatCurrencyFromCents(totalCents)}</strong></div>
                  <div className="hold-line"><span>Maximum temporary hold</span><strong>{formatCurrencyFromCents(holdCents)}</strong></div>
                </div>
                <p className="friendly-payment-note">Stripe places a temporary hold on your card. You&apos;ll only pay for the energy you use, and the rest is released after charging.</p>
                <AccountGate returnTo={`/chargers/${charger.id}`}>
                  <button type="button" className="primary-action full-width" onClick={handleReserve} disabled={bookingPending || !selectedStartTime}>
                    {bookingPending ? 'Opening Stripe…' : 'Reserve and pay with Stripe'}
                    <ArrowRight size={16} />
                  </button>
                </AccountGate>
                {bookingError ? <p className="booking-error" role="alert">{bookingError}</p> : null}
              </>
            ) : (
              <>
                <h2>Choose a time</h2>
                <label className="mini-field">
                  <span><CalendarDays size={15} /> Date</span>
                  <select value={selectedDate} onChange={(event) => { setDate(event.target.value); setStartTime(''); }}>
                    {availableDates.map((dateKey) => <option key={dateKey} value={dateKey}>{formatDateKey(dateKey)}</option>)}
                  </select>
                </label>

                <fieldset className="choice-fieldset">
                  <legend><Clock3 size={15} /> Start time</legend>
                  <div className="choice-grid time-choice-grid">
                    {availableStartTimes.map((time) => (
                      <button key={time} type="button" className={selectedStartTime === time ? 'choice-button active' : 'choice-button'} onClick={() => setStartTime(time)} aria-pressed={selectedStartTime === time}>
                        {time}
                      </button>
                    ))}
                  </div>
                  {availableStartTimes.length === 0 ? <p className="booking-error">No start times fit this duration. Choose another date or duration.</p> : null}
                </fieldset>

                <fieldset className="choice-fieldset">
                  <legend>Duration</legend>
                  <div className="choice-grid duration-choice-grid">
                    {durationChoices.map((hours) => (
                      <button key={hours} type="button" className={selectedDuration === hours ? 'choice-button active' : 'choice-button'} onClick={() => { setDurationHours(hours); setStartTime(''); }} disabled={!availableDurations.includes(hours)} aria-pressed={selectedDuration === hours}>
                        {hours} {hours === 1 ? 'hour' : 'hours'}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="price-breakdown">
                  <div><span>Estimated charging · {Number(kwh.toFixed(1))} kWh</span><strong>{formatCurrencyFromCents(energyCents)}</strong></div>
                  <div><span>KerbStop service fee</span><strong>{formatCurrencyFromCents(serviceFeeCents)}</strong></div>
                  <div className="total-line"><span>Estimated total</span><strong>{formatCurrencyFromCents(totalCents)}</strong></div>
                  <div className="hold-line"><span>Maximum temporary hold</span><strong>{formatCurrencyFromCents(holdCents)}</strong></div>
                </div>

                <div className="friendly-payment-note">
                  <p>You&apos;ll only pay for the energy you actually use.</p>
                  <p>We&apos;ll hold the maximum cost temporarily and release anything unused when charging ends.</p>
                </div>

                <button type="button" className="primary-action full-width" onClick={() => setShowReview(true)} disabled={!selectedStartTime || !endTime}>
                  Review booking
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
