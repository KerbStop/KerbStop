import { ArrowRight, CheckCircle2, Clock3, MapPin, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { cancelBooking, getBooking, getChargerById, startCharging } from '../lib/api';
import { formatCurrencyFromCents } from '../lib/format';
import { formatDublinDate, formatDublinTime } from '../lib/slots';
import type { Booking, Charger } from '../types';

const riskLabels: Record<string, string> = {
  normal: 'Normal',
  elevated: 'Elevated',
  highest: 'Highest',
  not_assessed: 'Not assessed',
};

const endedMessages: Partial<Record<Booking['status'], { title: string; message: string }>> = {
  blocked: { title: 'Payment blocked', message: 'Stripe Radar blocked this card as high risk, so no booking was made and nothing was charged. Please try a different card.' },
  cancelled: { title: 'Booking cancelled', message: 'This booking was cancelled and the card hold has been released.' },
  expired: { title: 'Payment not completed', message: 'The payment was not finished in time, so the slot has been released. Nothing was charged.' },
  no_show: { title: 'Missed booking', message: 'This session was not started in time. A small no-show fee was taken and the rest of the hold released.' },
};

export function BookingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cancelled = searchParams.get('cancelled') === '1';
  const [booking, setBooking] = useState<Booking | null>(null);
  const [slow, setSlow] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [charger, setCharger] = useState<Charger | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      navigate('/chargers', { replace: true });
      return;
    }

    let mounted = true;
    let timer = 0;
    const startedAt = Date.now();

    const load = async () => {
      try {
        let saved = await getBooking(id);
        // Driver pressed "back" on Stripe Checkout: release the slot straight away.
        if (saved.status === 'pending_payment' && cancelled) saved = await cancelBooking(id);
        if (!mounted) return;
        if (saved.status === 'charging') return navigate(`/charging/${id}`, { replace: true });
        if (saved.status === 'completed') return navigate(`/receipt/${id}`, { replace: true });
        if (!charger) setCharger(await getChargerById(saved.chargerId));
        if (!mounted) return;
        setBooking(saved);
        setLoading(false);
        // Stripe's webhook confirms the hold a moment after Checkout returns.
        if (saved.status === 'pending_payment') {
          if (Date.now() - startedAt > 40_000) setSlow(true);
          timer = window.setTimeout(load, 1500);
        }
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : 'We could not load this booking.');
        setLoading(false);
      }
    };
    void load();

    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate, cancelled]);

  const handleStartCharging = async () => {
    if (!id) return;
    setPending(true);
    try {
      await startCharging(id);
      navigate(`/charging/${id}`);
    } catch (startError) {
      setStartError(startError instanceof Error ? startError.message : 'This session could not be started.');
      setPending(false);
    }
  };

  if (loading) return <LoadingState message="Preparing your reservation..." />;
  if (error) {
    return (
      <div className="booking-error-state container narrow">
        <ErrorState message={error} />
        <Link to="/chargers" className="primary-action">Back to charger map</Link>
      </div>
    );
  }
  if (!booking || !charger) return <ErrorState message="We could not find the charger for this booking." />;

  const ended = endedMessages[booking.status];
  if (ended) {
    return (
      <div className="booking-error-state container narrow">
        <ErrorState title={ended.title} message={ended.message} />
        <Link to={`/chargers/${charger.id}`} className="primary-action">Choose another time</Link>
      </div>
    );
  }

  const start = new Date(booking.start);
  const end = new Date(booking.end);
  const startTime = formatDublinTime(start);
  const endTime = formatDublinTime(end);
  const dateLabel = formatDublinDate(start);
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${charger.lat},${charger.lng}`;
  const canStartAt = start.getTime() - 30 * 60_000;

  return (
    <div className="booking-page container narrow">
      {booking.status === 'pending_payment' ? (
        <section className="payment-authorised-panel">
          <div className="spinner" aria-hidden="true" />
          <span className="eyebrow">Stripe Checkout</span>
          <h1>Confirming your payment…</h1>
          <p>{slow
            ? 'Still waiting for Stripe to confirm the hold. Check that the Stripe listener (npm run stripe:listen) is running.'
            : 'Stripe is confirming the hold on your card. This only takes a moment.'}</p>

          <div className="booking-summary-card">
            <div><span>{charger.title}</span><strong>{dateLabel}</strong></div>
            <div><span>Charging session</span><strong>{startTime}–{endTime}</strong></div>
            <div><span>Maximum temporary hold</span><strong>{formatCurrencyFromCents(booking.holdCents)}</strong></div>
          </div>
        </section>
      ) : (
        <section className="booking-confirmed-panel">
          <div className="confirmed-heading">
            <CheckCircle2 size={28} />
            <div>
              <span className="eyebrow">Hold placed by Stripe</span>
              <h1>Charger reserved</h1>
              <p>Your session is confirmed. Nothing is charged until you finish charging.</p>
            </div>
          </div>

          <div className="booking-confirmed-grid">
            <div className="booking-summary-card">
              <h2>{charger.title}</h2>
              <div><span>Date</span><strong>{dateLabel}</strong></div>
              <div><span>Session</span><strong>{startTime}–{endTime}</strong></div>
              <div><span>Maximum hold</span><strong>{formatCurrencyFromCents(booking.holdCents)}</strong></div>
              <div><span>Grace period</span><strong>{charger.graceMinutes} minutes</strong></div>
              <div><span>Stripe Radar risk</span><strong>{riskLabels[booking.riskLevel ?? ''] ?? 'Not assessed'}</strong></div>
              <div><span>Booking ID</span><strong className="booking-id">{booking.id}</strong></div>
            </div>

            <div className="confirmed-address-card">
              <MapPin size={20} />
              <span className="eyebrow">Charger location</span>
              <strong>{charger.area}, Dublin</strong>
              <a href={directionsUrl} target="_blank" rel="noreferrer" className="secondary-action compact">
                Get directions
              </a>
              <small>Hosted by {charger.hostName}</small>
            </div>
          </div>

          <button type="button" className="primary-action full-width" onClick={handleStartCharging} disabled={pending}>
            {pending ? 'Starting session…' : 'Start charging'}
            <ArrowRight size={16} />
          </button>
          <p className="mock-payment-caption"><Clock3 size={14} /> {Date.now() >= canStartAt
            ? 'You can start charging now.'
            : `Charging opens at ${formatDublinTime(new Date(canStartAt))}, 30 minutes before your slot.`}</p>
          {startError ? <p className="booking-error" role="alert">{startError}</p> : null}
        </section>
      )}

      <div className="status-card info">
        <ShieldCheck size={18} />
        <span>Maximum hold: {formatCurrencyFromCents(booking.holdCents)}. You&apos;ll only pay for energy delivered.</span>
      </div>

      <Link to="/chargers" className="booking-return-link">Back to charger map</Link>
    </div>
  );
}
