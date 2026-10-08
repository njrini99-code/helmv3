'use client';

import { useIsPresent } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type RefObject } from 'react';
import { loginAction } from '@/app/golf/actions/auth';
import { logError } from '@/lib/error-logging';
import {
  EMPTY_FIELDS_MESSAGE,
  SIGN_IN_NOTICES,
  STALE_BUNDLE_MESSAGE,
  UNEXPECTED_MESSAGE,
  getErrorMessage,
  hasReloadedForStaleBundle,
  isStaleBundleError,
  markReloadedForStaleBundle,
  resolveSignInHref,
  type InvalidField,
} from '@/lib/auth/golf-sign-in-logic';
import { haptic } from '../../lib/haptics';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { Icon } from '../../ui/Icon';
import { AuthKeyLabel } from './AuthKey';
import { AuthNotice } from './AuthNotice';
import { OPENING_MS } from './auth-motion';
import { isPlainClick } from './ForgotPassword';
import { failureFor, failureForServer, type SignInFailure } from './sign-in-state';
import { useGlide, type Glider } from './use-glide';
import { useQueryParam } from './use-query-param';

const ERROR_ID = 'golf-signin-error';

/**
 * The sign-in form. What it does is exactly what the current form does
 * (`components/auth/golf-sign-in-form.tsx`): it calls the same `loginAction`
 * (which resets the shared idle marker in the response that sets the session
 * cookies, so middleware never signs a fresh session straight out), keeps the
 * invite's returnTo and the demo ref through the round trip, and reloads once
 * on a stale bundle. The words, the destinations and the stale-bundle guard come
 * from `@/lib/auth/golf-sign-in-logic`, shared with that form. Only the drawing
 * and the haptics are new.
 */
export interface SignInPreview {
  email?: string;
  failure?: SignInFailure;
}

/**
 * `signIn` is the server action by default; the preview and the tests hand in their own. `initial` is for the
 * preview only: it draws a chosen failure without a round trip.
 */
export function SignInForm({
  onOpening,
  signIn = loginAction,
  initial,
  navigate,
  onForgot,
  focusOnMount = false,
  stageRef,
}: {
  onOpening: () => void;
  signIn?: typeof loginAction;
  initial?: SignInPreview;
  /** The preview replaces where a successful sign-in goes. */
  navigate?: (href: string) => void;
  /** CH-15920: "Forgot password?" opens the reset form in the panel, with what is typed in Email. Without it, the link navigates. */
  onForgot?: (email: string) => void;
  /** Come back to from the reset form (not first paint): the heading takes focus so the change is read out (CH-15820). */
  focusOnMount?: boolean;
  /** The centred stage the form sits in, which a refusal recentres (CH-15608). */
  stageRef?: RefObject<HTMLElement | null>;
}) {
  const [email, setEmail] = useState(initial?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [failure, setFailure] = useState<SignInFailure | null>(initial?.failure ?? null);
  // Bumped on every failed attempt so a repeated identical error still moves focus.
  const [errorNonce, setErrorNonce] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  // False until the client has mounted; gates submit so a pre-hydration tap cannot fire the action with React's empty initial state (#1245).
  const [hydrated, setHydrated] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitRowRef = useRef<HTMLDivElement>(null);
  const forgotBelowRef = useRef<HTMLAnchorElement>(null);
  const reduced = useChReducedMotion();
  const router = useRouter();
  // CH-15608: what a refusal moves (the button, the phone's forgot link and, on the desktop, the centred stage) glides there.
  const anchor = stageRef ?? formRef;
  const gliders = useMemo<Glider[]>(() => [{ ref: anchor }, { ref: submitRowRef, within: anchor }, { ref: forgotBelowRef, within: anchor }], [anchor]);
  const glide = useGlide(reduced, gliders);

  // /golf/login?returnTo=/golf/join/ABC123, and ?ref=coach_nick_rini for demo-login tracing: kept for the round trip.
  const returnTo = useQueryParam('returnTo');
  const refParam = useQueryParam('ref');
  // CH-15901: an invite or demo link's returnTo and ref are kept through the round trip.
  useEffect(() => {
    if (returnTo) sessionStorage.setItem('golf_login_returnTo', returnTo);
  }, [returnTo]);
  useEffect(() => {
    if (refParam) sessionStorage.setItem('golf_login_ref', refParam);
  }, [refParam]);

  const messageKey = useQueryParam('message');
  const notice = messageKey ? SIGN_IN_NOTICES[messageKey] ?? null : null;

  // A successful sign-in goes straight to the welcome: have its code ready before the tap needs it.
  useEffect(() => {
    router.prefetch('/golf/welcome');
  }, [router]);

  /**
   * #1245: adopt whatever is already in the inputs at mount. The inputs are controlled and seeded from `useState('')`;
   * anything that put text in the DOM before hydration (a fast typist on a cold load, a password manager, a test) is
   * invisible to React, hydration paints the empty state back over it, and the submit that follows would carry an empty
   * credential pair and record a failed attempt against a blank identity.
   */
  const adoptDomValues = useCallback(() => {
    const emailEl = document.getElementById('golf-signin-email') as HTMLInputElement | null;
    const passwordEl = document.getElementById('golf-signin-password') as HTMLInputElement | null;
    if (emailEl?.value) setEmail((cur) => cur || emailEl.value);
    if (passwordEl?.value) setPassword((cur) => cur || passwordEl.value);
  }, []);
  useEffect(() => {
    adoptDomValues();
    setHydrated(true);
  }, [adoptDomValues]);

  useLayoutEffect(() => {
    if (errorNonce > 0) glide.play();
  }, [errorNonce, glide]);
  // In the panel's swap a view that comes back while it is still leaving is the same copy re-entering, not a new one: so
  // focus follows presence (never into the leaving copy) and the carried address is taken whenever it changes.
  const present = useIsPresent();
  useEffect(() => {
    if (present && focusOnMount) titleRef.current?.focus({ preventScroll: true });
  }, [present, focusOnMount]);
  const carriedEmail = initial?.email;
  useEffect(() => {
    if (carriedEmail !== undefined) setEmail(carriedEmail);
  }, [carriedEmail]);

  // After a failed attempt focus moves to the first invalid field; role="alert" on the message covers the announcement.
  useEffect(() => {
    if (errorNonce === 0 || !failure?.field) return;
    (failure.field === 'password' ? passwordRef.current : emailRef.current)?.focus();
  }, [errorNonce, failure]);

  // With the keyboard up, bring the button into view so it is not hidden under it.
  const revealSubmit = () => {
    window.setTimeout(() => submitRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }), 320);
  };

  const fail = (f: SignInFailure) => {
    glide.capture();
    // CH-15703 a warning-toned refusal, CH-15704 a danger-toned one (failureFor picks the tone); CH-15802 it is read out.
    haptic(f.haptic);
    setFailure(f);
    setErrorNonce((n) => n + 1);
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // A disabled button cannot guard a second submit dispatched before React commits the busy state.
    if (inFlight.current) return;
    // Never hand the server an empty credential pair: it would say the password is wrong when nothing was sent, and
    // `login_attempts` would accrue a failure under a blank email, a bucket shared by everyone who hits this.
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      fail({ message: EMPTY_FIELDS_MESSAGE, tone: 'danger', haptic: 'warning', field: !trimmedEmail ? 'email' : 'password', code: 'CH-15101' });
      return;
    }

    inFlight.current = true;
    setBusy(true);
    // The last refusal stays (stepped back) until this attempt answers: clearing it here pulled the button up under the
    // pointer, and the next refusal pushed it straight back down (CH-15608).
    // CH-15701: Sign in is tapped.
    haptic('press');

    try {
      const storedRef = sessionStorage.getItem('golf_login_ref') ?? undefined;
      const result = await signIn(trimmedEmail, password, storedRef);

      if (!result.success) {
        fail(failureForServer(result.error || 'Login failed', getErrorMessage(result.error || 'Login failed')));
        inFlight.current = false;
        setBusy(false);
        return;
      }

      // CH-15702: a sign-in lands; CH-15902: where it goes is decided once, for both forms (below).
      haptic('success');
      // No router.refresh() here: refreshing /golf/login with the new session makes the proxy redirect the signed-in
      // user to /golf/dashboard, which painted the dashboard skeleton and a blank Home before the welcome (swap audit
      // F-29). The push below is a fresh dynamic request, so it carries the new cookies; give them a beat to settle.
      await new Promise((resolve) => setTimeout(resolve, 100));

      const storedReturnTo = sessionStorage.getItem('golf_login_returnTo');
      // The ref has been forwarded to the server; a returnTo is spent whichever branch used it or dropped it.
      sessionStorage.removeItem('golf_login_ref');
      const href = resolveSignInHref(result.redirectTo, storedReturnTo);
      if (storedReturnTo) sessionStorage.removeItem('golf_login_returnTo');

      // The form leaves and the course takes the frame before the welcome route draws itself; onboarding has no
      // name to greet yet, so it goes straight there.
      if (href.startsWith('/golf/welcome')) {
        onOpening();
        if (!reduced) await new Promise((resolve) => setTimeout(resolve, OPENING_MS));
      }
      if (navigate) navigate(href);
      else router.push(href);
    } catch (err) {
      // "An unexpected response was received from the server" is Next's message for a Server Action whose response it
      // could not parse. It is not a login failure, and pressing the same button again reproduces it: the client is
      // holding something it cannot use, and one reload replaces it (once per tab, so a broken deploy cannot loop).
      const message = err instanceof Error ? err.message : String(err);
      const stale = isStaleBundleError(message);
      // CH-15906: a stale bundle reloads the page once per tab, silently.
      if (stale && !hasReloadedForStaleBundle()) {
        markReloadedForStaleBundle();
        logError(err instanceof Error ? err : new Error(message), { component: 'ClubhouseSignInForm', action: 'loginAction.staleBundle', sport: 'golf' }, 'low');
        window.location.reload();
        return;
      }
      logError(err instanceof Error ? err : new Error(String(err)), { component: 'ClubhouseSignInForm', action: 'loginAction', sport: 'golf' }, 'high');
      fail(failureFor(stale ? STALE_BUNDLE_MESSAGE : UNEXPECTED_MESSAGE));
      inFlight.current = false;
      setBusy(false);
    }
    // On success the loading state stays: we are navigating away.
  }

  const canSubmit = hydrated && email.trim().length > 0 && password.length > 0;
  const field: InvalidField = failure?.field ?? null;
  const emailInvalid = field === 'email' || field === 'both';
  const passwordInvalid = field === 'password' || field === 'both';
  const describedBy = failure ? ERROR_ID : undefined;
  // CH-15609: a refusal about the fields shakes them once (credentials, or an empty field). The name alternates so a second
  // refusal restarts the animation; reduced motion holds them still (the shake token is 1ms).
  const shake = errorNonce > 0 && field ? (errorNonce % 2 ? 'a' : 'b') : undefined;
  const openForgot = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!onForgot || !isPlainClick(e)) return;
    e.preventDefault();
    onForgot(email.trim());
  };
  // CH-15920: the href stays today's reset page, for a new tab and for no JavaScript; a plain click opens the panel's.
  const forgot = (cls: string, ref?: RefObject<HTMLAnchorElement | null>) => (
    <Link ref={ref} href="/golf/forgot-password" className={`ch-au-forgot ${cls}`} onClick={openForgot}>
      Forgot password?
    </Link>
  );

  return (
    <form
      ref={formRef}
      className="ch-au-form"
      onSubmit={handleSubmit}
      // A password manager can fill fields without firing React's onChange, leaving a visibly filled form behind a disabled button.
      onFocus={adoptDomValues}
      onPointerDown={adoptDomValues}
      noValidate
      aria-label="Sign in to GolfHelm"
    >
      <h1 ref={titleRef} tabIndex={-1}>
        Sign in
      </h1>
      <p className="ch-au-sub">
        Coaches and players use the same <span className="ch-au-nowrap">sign-in.</span>
        <span className="ch-au-sub__more"> We’ll open the right clubhouse for you.</span>
      </p>
      {notice && (
        <div className="ch-au-notice-top">
          <AuthNotice tone="positive" code="CH-15904">
            {notice}
          </AuthNotice>
        </div>
      )}
      <div className="ch-au-fields" data-invalid={field === 'both' ? '' : undefined} data-shake={shake} data-ch-code={shake ? 'CH-15609' : undefined}>
        <div className="ch-au-field">
          <label className="ch-au-label" htmlFor="golf-signin-email">
            Email
          </label>
          <div className="ch-au-input" data-invalid={emailInvalid ? 'true' : undefined}>
            <input
              ref={emailRef}
              id="golf-signin-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              // CH-15910: Enter in Email moves to Password; Enter in Password signs in.
              enterKeyHint="next"
              required
              aria-required="true"
              aria-invalid={emailInvalid || undefined}
              aria-describedby={describedBy}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={revealSubmit}
              onKeyDown={(e) => {
                // "next" on the keyboard moves to the password row instead of attempting an implicit submit.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  passwordRef.current?.focus();
                }
              }}
            />
          </div>
        </div>
        <div className="ch-au-field ch-au-pw">
          <label className="ch-au-label" htmlFor="golf-signin-password">
            Password
          </label>
          {forgot('ch-au-forgot--field')}
          <div className="ch-au-input" data-invalid={passwordInvalid ? 'true' : undefined}>
            <input
              ref={passwordRef}
              id="golf-signin-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              required
              aria-required="true"
              aria-invalid={passwordInvalid || undefined}
              aria-describedby={describedBy}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={revealSubmit}
            />
            {/* CH-15805: a named, pressed-state button with a hit area past 44px. CH-15610: the eye turns, crossfading to its slashed state. */}
            <button type="button" className="ch-au-eye" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} aria-controls="golf-signin-password" onClick={() => setShowPassword((v) => !v)}>
              <Icon icon={Eye} size={16} className="ch-au-eye__show" />
              <Icon icon={EyeOff} size={16} className="ch-au-eye__hide" />
            </button>
          </div>
        </div>
      </div>
      {failure && (
        // A new refusal is a new node, so it is announced again; while the next attempt is in flight this one steps back.
        <div className="ch-au-err" key={errorNonce} data-stale={busy ? '' : undefined}>
          <AuthNotice tone={failure.tone} id={ERROR_ID} code={failure.code}>
            {failure.message}
            {failure.detail && (
              <>
                <br />
                {failure.detail}
              </>
            )}
          </AuthNotice>
        </div>
      )}
      <div className="ch-au-submit" ref={submitRowRef}>
        <button ref={submitRef} type="submit" className="ch-btn ch-btn--primary ch-btn--lg" disabled={!canSubmit || busy} aria-busy={busy || undefined} data-ch-code={busy ? 'CH-15402' : undefined}>
          <AuthKeyLabel busy={busy} idle="Sign in" working="Signing in…" />
        </button>
      </div>
      {forgot('ch-au-forgot--below', forgotBelowRef)}
    </form>
  );
}
