import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Cable,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileCheck2,
  FileText,
  Home,
  MapPin,
  Plug,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wallet,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { HostAvailabilityCalendar } from '../components/HostAvailabilityCalendar';
import { becomeHost, getMe, publishCharger, readBill, signIn, startIdentityCheck } from '../lib/api';
import {
  areaToLatLng,
  hostOnboardingSteps,
  loadMockHostState,
  toAvailabilityWindows,
  updateMockHostState,
} from '../lib/mockHostService';
import { rememberAfterVerify, useSignedInEmail } from '../lib/session';
import type { HostDay, MockHostState } from '../lib/mockHostService';

const weekdays: HostDay[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function HostPage() {
  const navigate = useNavigate();
  const [host, setHost] = useState<MockHostState>(loadMockHostState);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [stepError, setStepError] = useState('');
  const [busy, setBusy] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const signedInEmail = useSignedInEmail();
  const stepIndex = hostOnboardingSteps.findIndex((step) => step.key === host.step);
  const progress = Math.round((stepIndex / (hostOnboardingSteps.length - 1)) * 100);

  useEffect(() => () => photoPreviews.forEach((url) => URL.revokeObjectURL(url)), [photoPreviews]);

  // Back from Stripe Identity or Stripe Connect: pick up where the host left off.
  useEffect(() => {
    if (!signedInEmail) return;
    void getMe().then((me) => {
      setHost((current) => updateMockHostState(current, {
        email: current.email || me.email,
        accountCreated: true,
        identityVerified: me.identityStatus === 'verified',
        hostId: current.hostId || me.hostId || '',
      }));
    }).catch(() => undefined);
  }, [signedInEmail]);

  useEffect(() => {
    if (searchParams.get('onboarding') !== 'done') return;
    setHost((current) => updateMockHostState(current, { stripeConnected: true, step: 'payouts' }));
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const runBusy = async (work: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setStepError('');
    try {
      await work();
    } catch (failure) {
      setStepError(failure instanceof Error ? failure.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const handleIdentityCheck = () => runBusy(async () => {
    rememberAfterVerify('/host');
    const url = await startIdentityCheck();
    if (url) window.location.assign(url);
    else patchHost({ identityVerified: true });
  }, 'Could not start the ID check.');

  const handleBillFile = (file: File | undefined) => {
    patchHost({ billFileName: file?.name ?? '', billAnalyzed: false });
    if (!file || !file.type.startsWith('image/')) return;
    void runBusy(async () => {
      const reading = await readBill(file);
      if (reading.dayRateCents === null) throw new Error(reading.notes || 'That doesn’t look like an electricity bill. Try a clearer photo.');
      patchHost({
        billFileName: file.name,
        billAnalyzed: true,
        electricityRateCents: reading.dayRateCents,
        billConfidence: Math.round(reading.confidence * 100),
        priceCentsPerKwh: reading.suggestedPriceCents ?? host.priceCentsPerKwh,
      });
    }, 'The bill reader could not read that file.');
  };

  const handleConnectStripe = () => runBusy(async () => {
    const { hostId, onboardingUrl } = await becomeHost(host.fullName || host.email, host.hostKind);
    setHost((current) => updateMockHostState(current, { hostId }));
    window.location.assign(onboardingUrl);
  }, 'Could not open Stripe Connect.');

  const handlePublish = () => runBusy(async () => {
    let hostId = host.hostId;
    if (!hostId) hostId = (await becomeHost(host.fullName || host.email, host.hostKind)).hostId;
    const charger = await publishCharger({
      hostId,
      title: host.chargerName.trim(),
      ...areaToLatLng(host.area),
      area: host.area.trim(),
      connector: host.connector,
      powerKw: host.powerKw,
      // The price the host typed includes Kerb's 12% fee; the back end stores the host's share.
      hostPriceCentsPerKwh: Math.max(1, Math.round(host.priceCentsPerKwh / 1.12)),
      availability: toAvailabilityWindows(host),
    });
    setHost(updateMockHostState(host, { hostId, published: true, listingId: charger.id, publishedAt: new Date().toISOString() }));
    navigate('/host/dashboard');
  }, 'Could not publish the listing.');

  const patchHost = (changes: Partial<MockHostState>) => {
    setHost((current) => updateMockHostState(current, changes));
    setStepError('');
  };

  const advanceTo = (step: MockHostState['step']) => patchHost({ step });

  const goBack = () => {
    const previous = hostOnboardingSteps[stepIndex - 1];
    if (previous) advanceTo(previous.key);
  };

  const handlePhotoSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []).slice(0, 6);
    const previews = files.map((file) => URL.createObjectURL(file));
    setPhotoPreviews(previews);
    patchHost({ photoCount: files.length });
  };

  const continueFlow = () => {
    const nextStep = hostOnboardingSteps[stepIndex + 1];

    switch (host.step) {
      case 'access': {
        if (!host.email.includes('@')) return setStepError('Enter a valid email address to continue.');
        if (signedInEmail === host.email.trim().toLowerCase()) return advanceTo('account');
        void runBusy(async () => {
          const me = await signIn(host.email);
          patchHost({ step: 'account', identityVerified: me.identityStatus === 'verified', hostId: me.hostId ?? '' });
        }, 'Sign-in failed.');
        return;
      }
      case 'account':
        if (!host.fullName.trim() || host.phone.replace(/\D/g, '').length < 7) {
          return setStepError('Add your name and a valid phone number to continue.');
        }
        patchHost({ accountCreated: true, step: 'identity' });
        return;
      case 'identity':
        if (!host.identityVerified) return setStepError('Verify your ID with Stripe to continue.');
        break;
      case 'contact':
        if (!host.contactVerified) return setStepError('Verify your email and phone in this demo to continue.');
        break;
      case 'welcome':
        break;
      case 'charger':
        if (!host.chargerName.trim() || host.powerKw <= 0) return setStepError('Add a charger name and valid power rating.');
        break;
      case 'location':
        if (!host.area.trim() || !host.address.trim() || !host.eircode.trim()) {
          return setStepError('Add the area, private charger address, and Eircode to continue.');
        }
        patchHost({ locationConfirmed: true });
        break;
      case 'photos':
        if (host.photoCount < 1) return setStepError('Add at least one charger photo to continue.');
        break;
      case 'bill':
        if (!host.billAnalyzed) return setStepError('Upload a photo of your bill, or use the sample bill, to continue.');
        break;
      case 'price':
        if (host.priceCentsPerKwh < 1 || host.priceCentsPerKwh > 200) {
          return setStepError('Choose a price between €0.01 and €2.00 per kWh.');
        }
        break;
      case 'availability':
        if (!Object.values(host.availability).some(Boolean) && !Object.values(host.availabilityExceptions).some(Boolean)) {
          return setStepError('Choose at least one recurring day or available date.');
        }
        break;
      case 'payouts':
        if (!host.stripeConnected) return setStepError('Connect Stripe to continue.');
        break;
      case 'review':
        void handlePublish();
        return;
      default:
        break;
    }

    if (nextStep) advanceTo(nextStep.key);
  };

  const renderStep = () => {
    switch (host.step) {
      case 'access':
        return (
          <>
            <div className="host-step-icon"><UserRound size={22} /></div>
            <span className="eyebrow">Host account</span>
            <h1>Good energy starts at home.</h1>
            <p className="host-step-intro">Create a host account to list your charger and keep every booking in one place.</p>
            <div className="host-mode-switch" role="group" aria-label="Account action">
              <button type="button" className={host.authMode === 'signup' ? 'active' : ''} onClick={() => patchHost({ authMode: 'signup' })}>Sign up</button>
              <button type="button" className={host.authMode === 'login' ? 'active' : ''} onClick={() => patchHost({ authMode: 'login' })}>Log in</button>
            </div>
            <label className="host-field">
              <span>Email address</span>
              <input type="email" autoComplete="email" value={host.email} onChange={(event) => patchHost({ email: event.target.value })} placeholder="you@example.com" />
            </label>
            <p className="host-demo-hint">No password needed: your email signs you in, and Stripe checks your ID next.</p>
          </>
        );

      case 'account':
        return (
          <>
            <div className="host-step-icon"><ShieldCheck size={22} /></div>
            <span className="eyebrow">Account &amp; personal information</span>
            <h1>Your host details, all in one place.</h1>
            <p className="host-step-intro">We&apos;ll use these details for booking updates and verification. They stay private from drivers.</p>
            <label className="host-field">
              <span>Email address</span>
              <input type="email" autoComplete="email" value={host.email} readOnly />
            </label>
            <label className="host-field"><span>Full name</span><input autoComplete="name" value={host.fullName} onChange={(event) => patchHost({ fullName: event.target.value })} placeholder="Your full name" /></label>
            <label className="host-field"><span>Phone number</span><input type="tel" autoComplete="tel" value={host.phone} onChange={(event) => patchHost({ phone: event.target.value })} placeholder="+353 85 000 0000" /></label>
            <div className="host-private-note"><ShieldCheck size={16} /> Your personal details are not shown on your public listing.</div>
          </>
        );

      case 'identity':
        return (
          <>
            <div className="host-step-icon"><BadgeCheck size={22} /></div>
            <span className="eyebrow">Verify identity</span>
            <h1>A quick identity check.</h1>
            <p className="host-step-intro">Stripe Identity checks a passport, driving licence or national ID card against a quick selfie. In test mode Stripe lets you simulate the result, so no real ID is needed.</p>
            <div className="host-choice-list">
              {(['passport', 'driving licence', 'national ID'] as const).map((document) => (
                <button type="button" key={document} className={host.identityDocument === document ? 'host-choice selected' : 'host-choice'} onClick={() => patchHost({ identityDocument: document })} aria-pressed={host.identityDocument === document}>
                  <FileCheck2 size={18} /> <span>{document}</span>{host.identityDocument === document ? <Check size={16} /> : null}
                </button>
              ))}
            </div>
            {host.identityVerified ? <div className="host-success-note"><CheckCircle2 size={17} /> ID verified by Stripe Identity</div> : (
              <button type="button" className="primary-action host-demo-action" onClick={handleIdentityCheck} disabled={busy}>
                <BadgeCheck size={16} /> {busy ? 'Opening Stripe…' : 'Verify with Stripe Identity'}
              </button>
            )}
          </>
        );

      case 'contact':
        return (
          <>
            <div className="host-step-icon"><CheckCircle2 size={22} /></div>
            <span className="eyebrow">Phone / email verified</span>
            <h1>Make sure we can reach you.</h1>
            <p className="host-step-intro">We&apos;ll simulate both confirmation messages. No SMS or email will be sent.</p>
            <div className="host-verify-row"><span>Email</span><strong>{host.email || 'Your email'}</strong><span className={host.contactVerified ? 'host-verified' : 'host-pending'}>{host.contactVerified ? 'Verified' : 'Ready to verify'}</span></div>
            <div className="host-verify-row"><span>Phone</span><strong>{host.phone || 'Your phone'}</strong><span className={host.contactVerified ? 'host-verified' : 'host-pending'}>{host.contactVerified ? 'Verified' : 'Ready to verify'}</span></div>
            <button type="button" className="secondary-action host-demo-action" onClick={() => patchHost({ contactVerified: true })}>
              <CheckCircle2 size={16} /> Simulate email and phone verification
            </button>
            {host.contactVerified ? <div className="host-success-note"><CheckCircle2 size={17} /> Email and phone verified in demo</div> : null}
          </>
        );

      case 'welcome':
        return (
          <>
            <div className="host-step-icon"><Zap size={22} /></div>
            <span className="eyebrow">You&apos;re ready</span>
            <h1>Let&apos;s list your charger.</h1>
            <p className="host-step-intro">A few details help drivers find the right spot. Your exact address stays private until they book.</p>
            <div className="host-summary-strip"><span><Check size={16} /> Host account</span><span><Check size={16} /> Identity check</span><span><Check size={16} /> Contact verified</span></div>
          </>
        );

      case 'charger':
        return (
          <>
            <div className="host-step-icon"><Plug size={22} /></div>
            <span className="eyebrow">Charger details</span>
            <h1>What are you sharing?</h1>
            <div className="host-kind-switch" role="group" aria-label="Charger host type">
              <button type="button" className={host.hostKind === 'home' ? 'active' : ''} onClick={() => patchHost({ hostKind: 'home' })}><Home size={16} /> Home</button>
              <button type="button" className={host.hostKind === 'business' ? 'active' : ''} onClick={() => patchHost({ hostKind: 'business' })}><Building2 size={16} /> Business</button>
            </div>
            <label className="host-field"><span>Listing name</span><input value={host.chargerName} onChange={(event) => patchHost({ chargerName: event.target.value })} placeholder={host.hostKind === 'home' ? 'Clonskeagh driveway charger' : 'Belfield workplace charger'} /></label>
            <div className="host-form-row">
              <label className="host-field"><span>Connector</span><select value={host.connector} onChange={(event) => patchHost({ connector: event.target.value as MockHostState['connector'] })}><option>Type 2</option><option>CCS</option></select></label>
              <label className="host-field"><span>Power</span><span className="host-number-wrap"><input type="number" min="1" max="400" step="0.1" value={host.powerKw} onChange={(event) => patchHost({ powerKw: Number(event.target.value) })} /><b>kW</b></span></label>
            </div>
            <div className="host-info-note"><Cable size={16} /> Drivers will see the connector and charging speed on your listing.</div>
          </>
        );

      case 'location':
        return (
          <>
            <div className="host-step-icon"><MapPin size={22} /></div>
            <span className="eyebrow">Charger location</span>
            <h1>Where can drivers find it?</h1>
            <p className="host-step-intro">Your public listing shows the general area. The exact address is shared only after a confirmed booking.</p>
            <label className="host-field"><span>General area</span><input value={host.area} onChange={(event) => patchHost({ area: event.target.value })} placeholder="Clonskeagh" /></label>
            <label className="host-field"><span>Full charger address · private</span><input autoComplete="street-address" value={host.address} onChange={(event) => patchHost({ address: event.target.value })} placeholder="Street address" /></label>
            <label className="host-field"><span>Eircode · private</span><input autoComplete="postal-code" value={host.eircode} onChange={(event) => patchHost({ eircode: event.target.value.toUpperCase() })} placeholder="D04 XXXX" /></label>
            <div className="host-private-note"><ShieldCheck size={16} /> Only the general area appears before booking.</div>
          </>
        );

      case 'photos':
        return (
          <>
            <div className="host-step-icon"><Camera size={22} /></div>
            <span className="eyebrow">Photos</span>
            <h1>Show drivers the spot.</h1>
            <p className="host-step-intro">Choose up to six photos of the charger, parking space, and approach. Previews stay in this browser.</p>
            <label className="host-photo-drop">
              <Camera size={24} />
              <strong>Add charger photos</strong>
              <span>JPG, PNG, or HEIC · up to 6 photos</span>
              <input type="file" accept="image/*" multiple onChange={handlePhotoSelection} />
            </label>
            {photoPreviews.length ? (
              <div className="host-photo-grid">{photoPreviews.map((src, index) => <img key={src} src={src} alt={`Charger photo ${index + 1}`} />)}</div>
            ) : host.photoCount > 0 ? <div className="host-success-note"><CheckCircle2 size={17} /> {host.photoCount} photo{host.photoCount === 1 ? '' : 's'} saved in this demo listing</div> : null}
            <div className="host-demo-hint">Files are not uploaded to a server in this prototype.</div>
          </>
        );

      case 'bill':
        return (
          <>
            <div className="host-step-icon"><FileText size={22} /></div>
            <span className="eyebrow">AI electricity bill reader</span>
            <h1>Find your electricity rate.</h1>
            <p className="host-step-intro">Upload a photo of a recent bill. Our AI reads your unit rate and suggests a price that always covers your electricity.</p>
            <label className="host-photo-drop host-file-drop">
              <FileText size={24} />
              <strong>{host.billFileName || 'Choose an electricity bill'}</strong>
              <span>{busy ? 'Reading your bill…' : 'JPG, PNG or WebP photo'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handleBillFile(event.target.files?.[0])} disabled={busy} />
            </label>
            <button type="button" className="secondary-action host-demo-action" onClick={() => patchHost({ billFileName: host.billFileName || 'sample-electricity-bill.pdf', billAnalyzed: true, electricityRateCents: 29, billConfidence: 96 })}>
              <Sparkles size={16} /> Use a sample bill instead
            </button>
            {host.billAnalyzed ? <div className="host-analysis-result"><Sparkles size={18} /><div><strong>Rate found: €{(host.electricityRateCents / 100).toFixed(2)}/kWh</strong><span>{host.billConfidence}% confidence · Review before using</span></div><CheckCircle2 size={18} /></div> : null}
          </>
        );

      case 'price': {
        const hostShareCents = Math.round(host.priceCentsPerKwh * 0.88);
        return (
          <>
            <div className="host-step-icon"><Wallet size={22} /></div>
            <span className="eyebrow">Set your price</span>
            <h1>Choose a fair rate.</h1>
            <p className="host-step-intro">This rate includes the KerbStop service fee. You can change your price any time.</p>
            <div className="host-price-control"><span>€</span><input aria-label="Price per kilowatt hour in cents" type="number" min="1" max="200" step="1" value={host.priceCentsPerKwh} onChange={(event) => patchHost({ priceCentsPerKwh: Number(event.target.value) })} /><strong>¢ / kWh</strong></div>
            <input className="host-price-slider" aria-label="Price per kilowatt hour slider" type="range" min="15" max="100" step="1" value={host.priceCentsPerKwh} onChange={(event) => patchHost({ priceCentsPerKwh: Number(event.target.value) })} />
            <div className="host-price-breakdown"><span>Electricity rate from your bill</span><strong>€{(host.electricityRateCents / 100).toFixed(2)}/kWh</strong><span>Your estimated share after platform fee</span><strong>€{(hostShareCents / 100).toFixed(2)}/kWh</strong></div>
            <div className="host-info-note"><Sparkles size={16} /> Drivers pay this price. You keep 88% and KerbStop keeps 12%.</div>
          </>
        );
      }

      case 'availability':
        return (
          <>
            <div className="host-step-icon"><Clock3 size={22} /></div>
            <span className="eyebrow">Set availability</span>
            <h1>Only share when it suits you.</h1>
            <p className="host-step-intro">Set your regular weekly schedule, then tap dates to open or block individual days.</p>
            <HostAvailabilityCalendar
              availability={host.availability}
              exceptions={host.availabilityExceptions}
              availableFrom={host.availableFrom}
              availableUntil={host.availableUntil}
              onAvailabilityChange={(availability) => patchHost({ availability })}
              onExceptionsChange={(availabilityExceptions) => patchHost({ availabilityExceptions })}
              onHoursChange={(hours) => patchHost(hours)}
              showIntro={false}
            />
          </>
        );

      case 'payouts':
        return (
          <>
            <div className="host-step-icon"><CreditCard size={22} /></div>
            <span className="eyebrow">Stripe Connect</span>
            <h1>Get ready for payouts.</h1>
            <p className="host-step-intro">Hosts get paid through Stripe Connect. Stripe checks your details and bank account, then pays your share after every session. In test mode, use Stripe&apos;s test details.</p>
            <div className="host-connect-card"><div className="host-connect-icon"><Wallet size={22} /></div><div><strong>{host.stripeConnected ? 'Stripe account connected' : 'Payout account not connected'}</strong><span>{host.stripeConnected ? 'Your share of each session is paid out by Stripe.' : 'Connect a payout account before publishing.'}</span></div>{host.stripeConnected ? <CheckCircle2 size={20} /> : null}</div>
            {host.stripeConnected ? null : (
              <button type="button" className="primary-action host-demo-action" onClick={handleConnectStripe} disabled={busy}>
                {busy ? 'Opening Stripe…' : <>Connect with Stripe <ArrowRight size={16} /></>}
              </button>
            )}
          </>
        );

      case 'review':
        return (
          <>
            <div className="host-step-icon"><FileCheck2 size={22} /></div>
            <span className="eyebrow">Review listing</span>
            <h1>One last look before you publish.</h1>
            <div className="host-listing-review">
              <div className="host-listing-photo">
                {photoPreviews[0] ? <img src={photoPreviews[0]} alt={`Photo of ${host.chargerName || 'the charger'}`} /> : <Zap size={30} />}
                <span>{host.photoCount} {host.photoCount === 1 ? 'photo' : 'photos'}</span>
              </div>
              <div className="host-listing-review-info">
                <span className="chip light">{host.area || 'Your area'}</span>
                <h2>{host.chargerName || 'Shared EV charger'}</h2>
                <p>{host.hostKind === 'home' ? 'Home driveway' : 'Business parking'} · {host.connector} · {host.powerKw} kW</p>
                <strong className="host-review-price">€{(host.priceCentsPerKwh / 100).toFixed(2)}/kWh</strong>
              </div>
            </div>
            <div className="host-review-availability"><Clock3 size={16} /><span>{weekdays.filter((day) => host.availability[day]).join(', ')} · {host.availableFrom}–{host.availableUntil}</span></div>
            <div className="host-private-note"><ShieldCheck size={16} /> Public listing shows {host.area || 'your general area'} only. Exact address stays private until a booking is confirmed.</div>
            <div className="host-demo-hint">Publishing puts your charger on the driver map straight away.</div>
          </>
        );
    }
  };

  return (
    <div className="host-page host-wizard container">
      <div className="host-wizard-topline">
        <Link to="/" className="host-back-home">KerbStop home</Link>
        <span className="host-demo-badge">Host setup</span>
      </div>

      <div className="host-wizard-layout">
        <aside className="host-steps-rail" aria-label="Onboarding progress">
          <span className="eyebrow">Become a host</span>
          <h2>Share your charger.</h2>
          <div className="host-progress-track"><span style={{ width: `${progress}%` }} /></div>
          <p className="host-progress-copy">Step {stepIndex + 1} of {hostOnboardingSteps.length} · {hostOnboardingSteps[stepIndex]?.label}</p>
        </aside>

        <main className="host-wizard-main">
          <section className="host-step-card" aria-live="polite">
            {renderStep()}
            {stepError ? <p className="host-step-error" role="alert">{stepError}</p> : null}
            <div className="host-step-actions">
              {stepIndex > 0 ? <button type="button" className="secondary-action" onClick={goBack}><ArrowLeft size={15} /> Back</button> : <span />}
              <button type="button" className="primary-action" onClick={continueFlow} disabled={busy}>
                {busy ? 'Working…' : host.step === 'account' ? host.authMode === 'signup' ? 'Create account' : 'Save and continue' : host.step === 'review' ? 'Publish listing' : host.step === 'welcome' ? 'Let’s list your charger' : 'Continue'}
                <ArrowRight size={16} />
              </button>
            </div>
          </section>
          <p className="host-step-footer">You&apos;re always in control of your charger, availability, and price.</p>
        </main>
      </div>
    </div>
  );
}