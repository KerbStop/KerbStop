import { ArrowRight, CheckCircle2, Clock3, MapPin, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { getMockChargerDetails } from '../data/mockChargerDetails';
import { getChargerById } from '../lib/api';
import { formatCurrencyFromCents } from '../lib/format';
import { confirmPayment, getBooking, startCharging } from '../lib/mockBookingService';
import type { Charger } from '../types';

function formatBookingDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const label = new Intl.DateTimeFormat('en-IE', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  return isToday ? `Today · ${label}` : label;
}

export function BookingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Awaited<ReturnType<typeof getBooking>>>(null);
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
    void getBooking(id)
      .then(async (savedBooking) => {
        if (!savedBooking) throw new Error('This booking could not be found. Start with a charger map search.');
        const savedCharger = await getChargerById(savedBooking.chargerId);
        if (!mounted) return;

        if (savedBooking.status === 'charging') {
          navigate(`/charging/${id}`, { replace: true });
          return;
        }
        if (savedBooking.status === 'completed') {
          navigate(`/receipt/${id}`, { replace: true });
          return;
        }

        setBooking(savedBooking);
        setCharger(savedCharger);
      })
      .catch((loadError) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'We could not load this booking.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, navigate]);

  const handlePaymentConfirmation = async () => {
    if (!id) return;
    setPending(true);
    try {
      setBooking(await confirmPayment(id));
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Mock payment confirmation failed.');
    } finally {
      setPending(false);
    }
  };

  const handleStartCharging = async () => {
    if (!id) return;
    setPending(true);
    try {
      await startCharging(id);
      navigate(`/charging/${id}`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'This session could not be started.');
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

  const isReserved = booking.status === 'reserved';
  const date = booking.start.slice(0, 10);
  const startTime = booking.start.slice(11, 16);
  const endTime = booking.end.slice(11, 16);
  const dateLabel = formatBookingDate(date);
  const demoAddress = getMockChargerDetails(charger.id).exactAddress;
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${charger.area}, Dublin`)}`;

  return (
    <div className="booking-page container narrow">
      {!isReserved ? (
        <section className="payment-authorised-panel">
          <div className="payment-success-mark"><CheckCircle2 size={30} /></div>
          <span className="eyebrow">Demo payment · No charge made</span>
          <h1>Payment authorised</h1>
          <p>Your charger is ready to reserve. Confirm the mock payment to see your booking details.</p>

          <div className="booking-summary-card">
            <div><span>{charger.area} charger</span><strong>{dateLabel}</strong></div>
            <div><span>Charging session</span><strong>{startTime}–{endTime}</strong></div>
            <div><span>Estimated total</span><strong>{formatCurrencyFromCents(booking.estimatedTotalCents)}</strong></div>
            <div><span>Maximum temporary hold</span><strong>{formatCurrencyFromCents(booking.holdCents)}</strong></div>
          </div>

          <button type="button" className="primary-action full-width" onClick={handlePaymentConfirmation} disabled={pending}>
            {pending ? 'Confirming…' : 'Continue to booking'}
            <ArrowRight size={16} />
          </button>
          <p className="mock-payment-caption">This simulates a successful Stripe Checkout return. No payment details are collected.</p>
        </section>
      ) : (
        <section className="booking-confirmed-panel">
          <div className="confirmed-heading">
            <CheckCircle2 size={28} />
            <div>
              <span className="eyebrow">Payment authorised</span>
              <h1>Charger reserved</h1>
              <p>Your session is confirmed. The exact demo address is now available.</p>
            </div>
          </div>

          <div className="booking-confirmed-grid">
            <div className="booking-summary-card">
              <h2>{charger.area}, Dublin</h2>
              <div><span>Date</span><strong>{dateLabel}</strong></div>
              <div><span>Arrival time</span><strong>{startTime}</strong></div>
              <div><span>Session</span><strong>{startTime}–{endTime}</strong></div>
              <div><span>Booking ID</span><strong className="booking-id">{booking.id}</strong></div>
              <div><span>Maximum hold</span><strong>{formatCurrencyFromCents(booking.holdCents)}</strong></div>
              <div><span>Grace period</span><strong>{charger.graceMinutes} minutes</strong></div>
            </div>

            <div className="confirmed-address-card">
              <MapPin size={20} />
              <span className="eyebrow">Demo exact address</span>
              <strong>{demoAddress}</strong>
              <a href={directionsUrl} target="_blank" rel="noreferrer" className="secondary-action compact">
                Get directions
              </a>
              <small>Fictional address for this frontend demo.</small>
            </div>
          </div>

          <button type="button" className="primary-action full-width" onClick={handleStartCharging} disabled={pending}>
            {pending ? 'Starting session…' : 'Start charging'}
            <ArrowRight size={16} />
          </button>
          <p className="mock-payment-caption"><Clock3 size={14} /> You can start the mock charging session now.</p>
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
