import { ArrowRight, BatteryCharging, Clock3, Gauge, MapPin, StopCircle, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { getBooking, getChargerById, getMeter, stopCharging } from '../lib/api';
import type { MeterReading } from '../lib/api';
import { formatCurrencyFromCents } from '../lib/format';
import type { Booking, Charger } from '../types';

function formatElapsedTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

export function ChargingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [charger, setCharger] = useState<Charger | null>(null);
  const [meter, setMeter] = useState<MeterReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      navigate('/chargers', { replace: true });
      return;
    }

    let mounted = true;
    void getBooking(id)
      .then(async (savedBooking) => {
        if (savedBooking.status === 'completed') {
          navigate(`/receipt/${id}`, { replace: true });
          return;
        }
        if (savedBooking.status === 'reserved') {
          navigate(`/booking/${id}`, { replace: true });
          return;
        }
        if (savedBooking.status !== 'charging') throw new Error('Start a reserved session before opening the live meter.');

        const savedCharger = await getChargerById(savedBooking.chargerId);
        if (!mounted) return;
        setBooking(savedBooking);
        setCharger(savedCharger);
      })
      .catch((loadError) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'We could not load this session.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, navigate]);

  useEffect(() => {
    if (!booking || booking.status !== 'charging') return;
    let mounted = true;

    const refreshMeter = () => {
      void getMeter(booking.id)
        .then((reading) => {
          if (!mounted) return;
          setMeter(reading);
          // The hold is used up: the back end stopped the session and captured the payment.
          if (reading.status === 'completed') navigate(`/receipt/${booking.id}`);
        })
        .catch((meterError) => {
          if (mounted) setError(meterError instanceof Error ? meterError.message : 'The meter could not be refreshed.');
        });
    };

    refreshMeter();
    const interval = window.setInterval(refreshMeter, 1000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [booking, navigate]);

  const handleStopCharging = async () => {
    if (!id) return;
    setPending(true);
    try {
      await stopCharging(id);
      navigate(`/receipt/${id}`);
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : 'The session could not be stopped.');
      setPending(false);
      setShowStopConfirm(false);
    }
  };

  if (loading) return <LoadingState message="Connecting to charger..." />;
  if (error) {
    return (
      <div className="charging-error container narrow">
        <ErrorState message={error} />
        <Link to="/chargers" className="primary-action">Back to charger map</Link>
      </div>
    );
  }
  if (!booking || !charger) return <ErrorState message="We could not find this charging session." />;

  const durationHours = (new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 3_600_000;
  const estimatedSessionKwh = charger.powerKw * durationHours;
  const chargeProgress = Math.min(100, (meter?.kwhDelivered ?? 0) / estimatedSessionKwh * 100);

  return (
    <div className="charging-page container narrow">
      <section className="live-charging-panel">
        <header className="live-charging-header">
          <div className="charging-status-label"><span className="charging-pulse" /> CHARGING</div>
          <button type="button" className="stop-button" onClick={() => setShowStopConfirm(true)}>
            <StopCircle size={18} />
            Stop charging
          </button>
        </header>

        <div className="live-meter" style={{ '--charge-progress': `${chargeProgress}%` } as React.CSSProperties}>
          <div className="live-meter-inner">
            <BatteryCharging size={24} />
            <strong>{(meter?.kwhDelivered ?? 0).toFixed(2)}</strong>
            <span>kWh delivered</span>
          </div>
        </div>

        <div className="live-cost-row">
          <span>Energy used</span>
          <strong>{formatCurrencyFromCents(meter?.runningCostCents ?? 0)}</strong>
        </div>
        <p className="live-session-time"><Clock3 size={16} /> Session time <strong>{formatElapsedTime((meter?.elapsedMinutes ?? 0) * 60)}</strong></p>

        <div className="charging-detail-grid">
          <div><Zap size={16} /><span>Charger</span><strong>{charger.powerKw} kW · {charger.connector}</strong></div>
          <div><MapPin size={16} /><span>Location</span><strong>{charger.area}, Dublin</strong></div>
          <div><Gauge size={16} /><span>Maximum hold</span><strong>{formatCurrencyFromCents(booking.holdCents)}</strong></div>
          <div><Clock3 size={16} /><span>Session limit</span><strong>{durationHours} {durationHours === 1 ? 'hour' : 'hours'}</strong></div>
        </div>

        <div className="charging-progress-track" aria-label={`${Math.round(chargeProgress)} percent of estimated session energy delivered`}>
          <span style={{ width: `${chargeProgress}%` }} />
        </div>
        <p className="charging-demo-note">Demo meter: the charger's clock runs 60 times faster, so one real minute is one hour of charging.</p>
      </section>

      <Link to={`/booking/${id}`} className="charging-back-link">Booking details</Link>

      {showStopConfirm ? (
        <div className="stop-confirm-backdrop">
          <section className="stop-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="stop-dialog-title">
            <h2 id="stop-dialog-title">Stop charging?</h2>
            <p>Stripe will capture only what you used and release the rest of the hold.</p>
            <div className="booking-actions">
              <button type="button" className="secondary-action" onClick={() => setShowStopConfirm(false)} disabled={pending}>
                Keep charging
              </button>
              <button type="button" className="primary-action" onClick={handleStopCharging} disabled={pending}>
                {pending ? 'Stopping…' : 'Stop and view receipt'}
                <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}