import { Activity, ArrowRight, CalendarDays, Clock3, MapPin, Plus, TrendingUp, Wallet, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getHost } from '../lib/api';
import type { HostSummary } from '../lib/api';
import { formatCurrencyFromCents } from '../lib/format';
import { loadMockHostState, startFreshMockHostListing } from '../lib/mockHostService';
import type { MockHostState } from '../lib/mockHostService';

export function HostDashboardPage() {
  const navigate = useNavigate();
  const [host, setHost] = useState<MockHostState>(loadMockHostState);
  const [summary, setSummary] = useState<HostSummary | null>(null);

  useEffect(() => {
    if (!host.hostId) return;
    getHost(host.hostId).then(setSummary).catch(() => undefined);
  }, [host.hostId]);

  const upcoming = summary?.bookings.filter((booking) => ['reserved', 'charging', 'pending_payment'].includes(booking.status)) ?? [];
  const availableDays = Object.entries(host.availability)
    .filter(([, available]) => available)
    .map(([day]) => day);
  const adjustedDateCount = Object.keys(host.availabilityExceptions).length;

  const handleStartAnother = () => {
    setHost(startFreshMockHostListing());
    navigate('/host');
  };

  if (!host.published) {
    return (
      <div className="dashboard-page container host-dashboard-empty">
        <span className="eyebrow">Host dashboard</span>
        <h1>Your charger is nearly ready.</h1>
        <p>Finish the host setup to review and publish your first listing.</p>
        <Link to="/host" className="primary-action">Continue host setup <ArrowRight size={16} /></Link>
      </div>
    );
  }

  return (
    <div className="dashboard-page container host-dashboard">
      <div className="host-dashboard-heading">
        <div>
          <span className="eyebrow">Host dashboard</span>
          <h1>Welcome, {host.fullName.split(' ')[0] || 'host'}.</h1>
          <p>Your charger is live on the KerbStop map.</p>
        </div>
        <button type="button" className="secondary-action" onClick={handleStartAnother}><Plus size={16} /> Add another charger</button>
      </div>

      <div className="dashboard-grid">
        <div className="metric-card"><Activity size={20} /><span>Earnings</span><strong>{formatCurrencyFromCents(summary?.earningsCents ?? 0)}</strong><small>Your share after KerbStop&apos;s 12%</small></div>
        <div className="metric-card"><CalendarDays size={20} /><span>Upcoming bookings</span><strong>{upcoming.length}</strong><small>{upcoming.length ? 'Drivers have reserved your charger' : 'Ready when your first driver books'}</small></div>
        <div className="metric-card"><TrendingUp size={20} /><span>Payouts</span><strong>{summary?.payoutsEnabled ? 'Enabled' : host.stripeConnected ? 'Being checked' : 'Not connected'}</strong><small>Stripe Connect status</small></div>
      </div>

      <div className="host-dashboard-content">
        <section className="host-card host-dashboard-listing">
          <div className="host-dashboard-card-heading">
            <div><span className="eyebrow">Published listing</span><h2>{host.chargerName || 'Shared EV charger'}</h2></div>
            <span className="host-live-status"><span /> Live</span>
          </div>
          <div className="host-dashboard-listing-details">
            <div><MapPin size={16} /><span>{host.area}, Dublin</span></div>
            <div><Zap size={16} /><span>{host.powerKw} kW · {host.connector}</span></div>
            <div><Wallet size={16} /><span>€{(host.priceCentsPerKwh / 100).toFixed(2)}/kWh</span></div>
            <div><Clock3 size={16} /><span>{availableDays.join(', ')} · {host.availableFrom}–{host.availableUntil}</span></div>
          </div>
          {adjustedDateCount ? <p className="host-calendar-adjustment-count">{adjustedDateCount} date{adjustedDateCount === 1 ? '' : 's'} adjusted in your calendar</p> : null}
          <div className="host-dashboard-listing-footer">
            <span>Listing ID · {host.listingId}</span>
            <div className="host-dashboard-listing-actions">
              <Link to="/host/calendar" className="secondary-action compact"><CalendarDays size={14} /> Manage calendar</Link>
              <Link to="/host" className="secondary-action compact">Review listing <ArrowRight size={14} /></Link>
            </div>
          </div>
        </section>

        <section className="host-card host-dashboard-payouts">
          <div className="card-icon"><Wallet size={20} /></div>
          <h2>Payout account</h2>
          <p>{summary?.payoutsEnabled ? 'Stripe pays your share after every session.' : 'Stripe is still checking your details. Payouts start once it finishes.'}</p>
          <span className={summary?.payoutsEnabled ? 'host-verified' : 'host-pending'}>{summary?.payoutsEnabled ? 'Payouts enabled' : 'Setup pending'}</span>
        </section>
      </div>

    </div>
  );
}