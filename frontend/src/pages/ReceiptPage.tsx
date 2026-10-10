import { ArrowRight, CheckCircle2, ReceiptText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { getBooking } from '../lib/api';
import { formatCurrencyFromCents } from '../lib/format';
import type { Booking } from '../types';

export function ReceiptPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      navigate('/chargers', { replace: true });
      return;
    }

    let mounted = true;
    void getBooking(id)
      .then((savedBooking) => {
        if (!mounted) return;
        if (savedBooking.status !== 'completed' || !savedBooking.receipt) {
          navigate(savedBooking.status === 'charging' ? `/charging/${id}` : `/booking/${id}`, { replace: true });
          return;
        }
        setBooking(savedBooking);
      })
      .catch((loadError) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'We could not load this receipt.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, navigate]);

  if (loading) return <LoadingState message="Preparing your receipt..." />;
  if (error) {
    return (
      <div className="receipt-error container narrow">
        <ErrorState message={error} />
        <Link to="/chargers" className="primary-action">Find a charger</Link>
      </div>
    );
  }
  if (!booking?.receipt) return <ErrorState message="This receipt is not available." />;

  const receipt = booking.receipt;
  const serviceFeeCents = receipt.totalCents - receipt.hostEarnsCents;

  return (
    <div className="receipt-page container narrow">
      <div className="receipt-card">
        <div className="receipt-header">
          <CheckCircle2 size={26} className="success-icon" />
          <div>
            <span className="eyebrow">Receipt</span>
            <h1>Charging complete</h1>
            <p>You only paid for the energy you used.</p>
          </div>
        </div>

        <div className="price-breakdown receipt-breakdown">
          <div><span>Energy used</span><strong>{booking.kwhDelivered.toFixed(2)} kWh</strong></div>
          <div><span>Energy</span><strong>{formatCurrencyFromCents(receipt.energyCents)}</strong></div>
          {receipt.overstayCents > 0 ? <div><span>Overstay</span><strong>{formatCurrencyFromCents(receipt.overstayCents)}</strong></div> : null}
          <div><span>Includes KerbStop fee</span><strong>{formatCurrencyFromCents(serviceFeeCents)}</strong></div>
          <div className="total-line"><span>Total charged</span><strong>{formatCurrencyFromCents(receipt.totalCents)}</strong></div>
          <div><span>Maximum hold</span><strong>{formatCurrencyFromCents(booking.holdCents)}</strong></div>
          <div><span>Released</span><strong>{formatCurrencyFromCents(receipt.releasedCents)}</strong></div>
        </div>

        <div className="receipt-host-earnings">
          <ReceiptText size={16} />
          <span>Host earned (paid out via Stripe Connect)</span>
          <strong>{formatCurrencyFromCents(receipt.hostEarnsCents)}</strong>
        </div>

        <div className="booking-actions">
          <Link to="/" className="secondary-action">
            Done
          </Link>
          <Link to="/chargers" className="primary-action">
            Find another charger <ArrowRight size={16} />
          </Link>
        </div>
        <p className="receipt-demo-caption">Stripe test mode · Captured {formatCurrencyFromCents(receipt.totalCents)} and released {formatCurrencyFromCents(receipt.releasedCents)} of the hold.</p>
      </div>
    </div>
  );
}
