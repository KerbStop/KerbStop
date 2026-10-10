import { ArrowRight, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <div className="editorial-home">
      <div className="orbit-ring" aria-hidden="true" />

      <header className="editorial-topbar">
        <div className="brand-slogan">
          <span className="brand-mark-small">
            <Zap size={18} />
          </span>
          <span>Good energy. Shared.</span>
        </div>
        <div className="neighbour-note">
          <span className="live-dot" />
          Made for your neighbourhood
        </div>
      </header>

      <section className="editorial-hero" aria-label="Welcome to KerbStop">
        <p className="editorial-eyebrow">Your next charge is closer than you think.</p>
        <h1>KerbStop</h1>

        <div className="stripe-badge" aria-label="Payments powered by Stripe">
          <svg viewBox="0 0 14 18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M13 1.2C10.4-.1 4.1-.9 1.2 2.4-1 4.9.4 8.1 4.1 9.4l3 1c2.1.7 2 2.1.3 2.5-2 .5-4.9-.1-7.2-1.5v4.3c3.7 2.1 9.6 2 12-1 2.4-3.1 1-6.2-3-7.7l-2.7-1C4.4 5.3 4.8 4.2 6.5 4c2.1-.3 4.5.2 6.5 1.1Z"
            />
          </svg>
          <span>Powered by</span>
          <span className="stripe-name">stripe</span>
        </div>

        <p className="hero-tagline">Idle chargers. Shared possibilities.</p>

        <div className="hero-actions">
          <Link to="/host" className="editorial-btn primary" aria-label="Become a host">
            Become a host
            <ArrowRight size={15} />
          </Link>
          <Link to="/chargers" className="editorial-btn secondary" aria-label="I need a charge">
            I need a charge
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <footer className="editorial-footer">
        <div>
          <strong>A little closer. A little greener.</strong>
          <br />
          Home driveways &amp; business car parks.
        </div>
        <div className="footer-right">
          Dublin, Ireland
          <br />
          Stripe test mode · No real money
        </div>
      </footer>
    </div>
  );
}
