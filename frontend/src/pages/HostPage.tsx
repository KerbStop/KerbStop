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
import { Link, useNavigate } from 'react-router-dom';
import { HostAvailabilityCalendar } from '../components/HostAvailabilityCalendar';
import {
  hostOnboardingSteps,
  loadMockHostState,
  updateMockHostState,
} from '../lib/mockHostService';
import type { HostDay, MockHostState } from '../lib/mockHostService';

const weekdays: HostDay[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function HostPage() {
  const navigate = useNavigate();
  const [host, setHost] = useState<MockHostState>(loadMockHostState);
  const [password, setPassword] = useState('');
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [stepError, setStepError] = useState('');
  const stepIndex = hostOnboardingSteps.findIndex((step) => step.key === host.step);
  const progress = Math.round((stepIndex / (hostOnboardingSteps.length - 1)) * 100);

  useEffect(() => () => photoPreviews.forEach((url) => URL.revokeObjectURL(url)), [photoPreviews]);

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
        if (host.authMode === 'login') {
          if (password.length < 8) return setStepError('Enter your demo password to continue.');
          advanceTo('account');
        } else {
          advanceTo('account');
        }
        return;
      }
      case 'account':
        if (!host.fullName.trim() || host.phone.replace(/\D/g, '').length < 7) {
          return setStepError('Add your name and a valid phone number to continue.');
        }
        if (host.authMode === 'signup' && password.length < 8) {
          return setStepError('Use at least 8 characters for this demo account.');
        }
        patchHost({ accountCreated: true, step: 'identity' });
        setPassword('');
        return;
      case 'identity':
        if (!host.identityVerified) return setStepError('Run the demo identity check to continue.');
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
        if (!host.billAnalyzed) return setStepError('Run the demo electricity bill reader to continue.');
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
        if (!host.stripeConnected) return setStepError('Complete the mock payout connection to continue.');
        break;
      case 'review': {
        const listingId = host.listingId || `host-${Date.now().toString(36)}`;
        const published = updateMockHostState(host, {
          published: true,
          listingId,
          publishedAt: new Date().toISOString(),
        });
        setHost(published);
        navigate('/host/dashboard');
        return;
      }
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
            {host.authMode === 'login' ? (
              <label className="host-field">
                <span>Password · demo only</span>
                <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your demo password" />
              </label>
            ) : null}
            <p className="host-demo-hint">Prototype account only. No account is created on a server.</p>
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
            {host.authMode === 'signup' ? (
              <label className="host-field">
                <span>Password · demo only</span>
                <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
              </label>
            ) : null}
            <div className="host-private-note"><ShieldCheck size={16} /> Your personal details are not shown on your public listing.</div>
            <p className="host-demo-hint">This demo password stays in memory only and is never saved.</p>
          </>
        );

      case 'identity':
        return (
          <>
            <div className="host-step-icon"><BadgeCheck size={22} /></div>
            <span className="eyebrow">Verify identity</span>
            <h1>A quick identity check.</h1>
            <p className="host-step-intro">Choose the document you&apos;d use to verify your identity. This prototype simulates the check; don&apos;t upload or enter real ID details.</p>
            <div className="host-choice-list">
              {(['passport', 'driving licence', 'national ID'] as const).map((document) => (
                <button type="button" key={document} className={host.identityDocument === document ? 'host-choice selected' : 'host-choice'} onClick={() => patchHost({ identityDocument: document })} aria-pressed={host.identityDocument === document}>
                  <FileCheck2 size={18} /> <span>{document}</span>{host.identityDocument === document ? <Check size={16} /> : null}
                </button>
              ))}
            </div>
            <button type="button" className="secondary-action host-demo-action" onClick={() => patchHost({ identityVerified: true })}>
              <BadgeCheck size={16} /> Run demo identity check
            </button>
            {host.identityVerified ? <div className="host-success-note"><CheckCircle2 size={17} /> Demo identity check passed</div> : null}
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
            <p className="host-step-intro">Select a recent bill to try the demo flow. The mock reader does not upload or inspect the file.</p>
            <label className="host-photo-drop host-file-drop">
              <FileText size={24} />
              <strong>{host.billFileName || 'Choose an electricity bill'}</strong>
              <span>PDF or image · stays on this device</span>
              <input type="file" accept="application/pdf,image/*" onChange={(event) => patchHost({ billFileName: event.target.files?.[0]?.name ?? '', billAnalyzed: false })} />
            </label>
            <button type="button" className="secondary-action host-demo-action" onClick={() => patchHost({ billFileName: host.billFileName || 'sample-electricity-bill.pdf', billAnalyzed: true, electricityRateCents: 29, billConfidence: 96 })}>
              <Sparkles size={16} /> Run demo bill reader
            </button>
            {host.billAnalyzed ? <div className="host-analysis-result"><Sparkles size={18} /><div><strong>Demo rate found: €{(host.electricityRateCents / 100).toFixed(2)}/kWh</strong><span>{host.billConfidence}% confidence · Review before using</span></div><CheckCircle2 size={18} /></div> : null}
            <div className="host-demo-hint">No real OCR or bill upload is performed.</div>
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
            <div className="host-price-breakdown"><span>Electricity rate from demo bill</span><strong>€{(host.electricityRateCents / 100).toFixed(2)}/kWh</strong><span>Your estimated share after platform fee</span><strong>€{(hostShareCents / 100).toFixed(2)}/kWh</strong></div>
            <div className="host-info-note"><Sparkles size={16} /> Suggested from your demo bill: €0.37/kWh.</div>
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
            <p className="host-step-intro">Hosts use Stripe Connect for payouts. This prototype simulates the connection and does not open Stripe or collect banking details.</p>
            <div className="host-connect-card"><div className="host-connect-icon"><Wallet size={22} /></div><div><strong>{host.stripeConnected ? 'Demo payout account connected' : 'Payout account not connected'}</strong><span>{host.stripeConnected ? 'Ready for the future Stripe Connect integration.' : 'Connect a payout account before publishing.'}</span></div>{host.stripeConnected ? <CheckCircle2 size={20} /> : null}</div>
            <button type="button" className={host.stripeConnected ? 'secondary-action host-demo-action' : 'primary-action host-demo-action'} onClick={() => patchHost({ stripeConnected: true })}>
              {host.stripeConnected ? <><Check size={16} /> Connected in demo</> : <>Connect Stripe · demo <ArrowRight size={16} /></>}
            </button>
            <div className="host-demo-hint">No real Stripe account or payment details are involved.</div>
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
            <div className="host-demo-hint">Publishing is simulated. This listing is saved only in this browser.</div>
          </>
        );
    }
  };

  return (
    <div className="host-page host-wizard container">
      <div className="host-wizard-topline">
        <Link to="/" className="host-back-home">KerbStop home</Link>
        <span className="host-demo-badge">Host setup · demo</span>
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
              <button type="button" className="primary-action" onClick={continueFlow}>
                {host.step === 'account' ? host.authMode === 'signup' ? 'Create account' : 'Save and continue' : host.step === 'review' ? 'Publish listing' : host.step === 'welcome' ? 'Let’s list your charger' : 'Continue'}
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