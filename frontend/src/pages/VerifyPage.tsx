import { BadgeCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { getMe, startIdentityCheck } from '../lib/api';
import { rememberAfterVerify, takeAfterVerify } from '../lib/session';

/** Stripe Identity sends the user back here; wait for Stripe's webhook to mark them verified. */
export function VerifyPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'waiting' | 'failed' | 'slow'>('waiting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const startedAt = Date.now();
    const check = async () => {
      try {
        const me = await getMe();
        if (!mounted) return;
        if (me.identityStatus === 'verified') {
          navigate(takeAfterVerify() ?? '/chargers', { replace: true });
          return;
        }
        if (me.identityStatus === 'requires_input' || me.identityStatus === 'unverified') {
          setStatus('failed');
          return;
        }
        if (Date.now() - startedAt > 45_000) setStatus('slow');
        timer = window.setTimeout(check, 1500);
      } catch (failure) {
        if (mounted) setError(failure instanceof Error ? failure.message : 'Could not check your ID status.');
      }
    };
    let timer = window.setTimeout(check, 500);
    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [navigate]);

  const retry = async () => {
    const back = takeAfterVerify() ?? '/chargers';
    rememberAfterVerify(back);
    try {
      const url = await startIdentityCheck();
      if (url) window.location.assign(url);
      else navigate(back, { replace: true });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not start the ID check.');
    }
  };

  if (error) {
    return (
      <div className="container narrow verify-page">
        <ErrorState message={error} />
        <Link to="/chargers" className="primary-action">Back to charger map</Link>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="container narrow verify-page">
        <ErrorState title="ID check not completed" message="Stripe couldn't verify that document. You can try again with a passport, driving licence or national ID card." />
        <button type="button" className="primary-action" onClick={retry}><BadgeCheck size={16} /> Try again</button>
      </div>
    );
  }

  return (
    <div className="container narrow verify-page">
      <LoadingState message={status === 'slow'
        ? 'Still waiting for Stripe to confirm your ID. Check the Stripe listener terminal is running.'
        : 'Confirming your ID with Stripe…'} />
    </div>
  );
}
