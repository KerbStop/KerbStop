import { ArrowRight, BadgeCheck, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { getMe, signIn, startIdentityCheck } from '../lib/api';
import type { Me } from '../lib/api';
import { rememberAfterVerify, useSignedInEmail } from '../lib/session';

type AccountGateProps = {
  /** Shown once the user is signed in and their ID is verified. */
  children: ReactNode;
  /** Where to return after the Stripe Identity page. */
  returnTo: string;
};

/** Email sign-in, then Stripe Identity (passport, licence or national ID plus a selfie), then children. */
export function AccountGate({ children, returnTo }: AccountGateProps) {
  const email = useSignedInEmail();
  const [me, setMe] = useState<Me | null>(null);
  const [draftEmail, setDraftEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) {
      setMe(null);
      return;
    }
    let mounted = true;
    getMe()
      .then((result) => mounted && setMe(result))
      .catch((failure) => mounted && setError(failure instanceof Error ? failure.message : 'Could not load your account.'));
    return () => {
      mounted = false;
    };
  }, [email]);

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!draftEmail.includes('@')) return setError('Enter a valid email address.');
    setPending(true);
    setError(null);
    try {
      setMe(await signIn(draftEmail));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sign-in failed.');
    } finally {
      setPending(false);
    }
  };

  const handleVerify = async () => {
    setPending(true);
    setError(null);
    try {
      rememberAfterVerify(returnTo);
      const url = await startIdentityCheck();
      if (url) window.location.assign(url);
      else setMe(await getMe());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not start the ID check.');
      setPending(false);
    }
  };

  if (!email) {
    return (
      <form className="account-gate" onSubmit={handleSignIn}>
        <strong><Mail size={16} /> Sign in to reserve</strong>
        <p>Enter your email. No password needed.</p>
        <label className="mini-field">
          <span>Email</span>
          <input type="email" autoComplete="email" value={draftEmail} onChange={(event) => setDraftEmail(event.target.value)} placeholder="you@example.com" />
        </label>
        <button type="submit" className="primary-action full-width" disabled={pending}>
          {pending ? 'Signing in…' : 'Continue'} <ArrowRight size={16} />
        </button>
        {error ? <p className="booking-error" role="alert">{error}</p> : null}
      </form>
    );
  }

  if (!me) {
    return error ? <p className="booking-error" role="alert">{error}</p> : <p className="account-gate-note">Checking your account…</p>;
  }

  if (me.identityStatus !== 'verified') {
    return (
      <div className="account-gate">
        <strong><BadgeCheck size={16} /> Verify your ID</strong>
        <p>To keep hosts safe, every driver verifies a passport, driving licence or national ID card with a quick selfie. It&apos;s handled by Stripe and takes about a minute.</p>
        {me.identityStatus === 'requires_input' ? <p className="booking-error">The last check didn&apos;t go through. Please try again.</p> : null}
        <button type="button" className="primary-action full-width" onClick={handleVerify} disabled={pending}>
          {pending ? 'Opening Stripe…' : 'Verify with Stripe Identity'} <ArrowRight size={16} />
        </button>
        <p className="account-gate-note">Signed in as {me.email}</p>
        {error ? <p className="booking-error" role="alert">{error}</p> : null}
      </div>
    );
  }

  return <>{children}</>;
}
