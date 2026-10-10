import { Bolt } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { clearSession, useSignedInEmail } from '../lib/session';

type LayoutProps = {
  children: ReactNode;
};

export function Layout({ children }: LayoutProps) {
  const isHome = useLocation().pathname === '/';
  const email = useSignedInEmail();

  return (
    <div className="site-shell">
      {!isHome && (
        <header className="topbar">
          <div className="container topbar-inner">
            <NavLink to="/" className="brand" aria-label="KerbStop home">
              <span className="brand-mark"><Bolt size={18} /></span>
              <span>KerbStop</span>
            </NavLink>

            {email ? (
              <span className="mini-topnote account-chip">
                {email}
                <button type="button" className="text-button" onClick={clearSession}>Sign out</button>
              </span>
            ) : (
              <span className="mini-topnote">Made for your neighbourhood</span>
            )}
          </div>
        </header>
      )}

      <main className={isHome ? 'page-shell home-shell' : 'page-shell'}>{children}</main>
    </div>
  );
}
