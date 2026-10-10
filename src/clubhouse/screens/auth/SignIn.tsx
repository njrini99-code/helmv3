'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { isNativeApp } from '@/lib/utils/capacitor';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { Icon } from '../../ui/Icon';
import { Swap } from '../../ui/Swap';
import { AuthFrame, type AuthPhase } from './AuthFrame';
import { useAuthView } from './auth-view';
import { ResetForm, ResetSent } from './ForgotPassword';
import { SceneMount } from './SceneMount';
import { SignInForm, type SignInPreview } from './SignInForm';
import type { loginAction, requestPasswordResetAction } from '@/app/golf/actions/auth';
import { isDarkSky, paperTint } from './scene-sky';
import { useGlide, type Glider } from './use-glide';
import { useSkyHour } from './use-hour';
import { useQueryParam } from './use-query-param';

/**
 * /golf/login in Clubhouse: the painted course on the left and the form on the
 * right (a sheet under the course on a phone). When a sign-in lands, the form
 * leaves and the course takes the frame; the welcome route then draws itself
 * over the same frame. Everything that signs in is `SignInForm`.
 *
 * The panel also holds the reset form and its check-your-email (CH-15920, owner
 * 2026-10-07, up for owner review): the course stays put and the panel's content
 * slides between the views (CH-15612), the lockup and the panel's chrome still.
 */
export function SignIn({
  signIn,
  requestReset,
  initial,
  navigate,
}: {
  signIn?: typeof loginAction;
  requestReset?: typeof requestPasswordResetAction;
  initial?: SignInPreview;
  navigate?: (href: string) => void;
} = {}) {
  const [phase, setPhase] = useState<AuthPhase>('login');
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  const reduced = useChReducedMotion();
  // The stage is centred in the desktop panel: a view of another height recentres it, and it glides there (CH-15612).
  const stageRef = useRef<HTMLDivElement>(null);
  const stageGliders = useMemo<Glider[]>(() => [{ ref: stageRef }], []);
  const glide = useGlide(reduced, stageGliders);
  const { view, dir, moved, openForgot, showSent, backToSignIn } = useAuthView(glide.capture);
  // The address travels between the views, so it is typed once.
  const [carried, setCarried] = useState('');
  const [sentTo, setSentTo] = useState('');
  useLayoutEffect(() => {
    if (moved) glide.play();
  }, [view, moved, glide]);
  const returnTo = useQueryParam('returnTo');
  const signupHref = returnTo ? `/golf/signup?returnTo=${encodeURIComponent(returnTo)}` : '/golf/signup';
  const opening = phase === 'opening';
  // P015-A1: the sun decides dusk, as it does for the sky behind.
  const hour = useSkyHour();
  // At dusk and night the wordmark over the sky flips to ivory, as the welcome's type does.
  const dark = hour !== null && isDarkSky(hour);
  // P015-A2: the sheet takes a few percent of the light outside.
  const tint = hour === null ? null : paperTint(hour);

  return (
    <AuthFrame screen="signin" phase={phase}>
      <a className="ch-au-skip" href="#ch-au-form" data-ch-code="CH-15801">
        Skip to sign in
      </a>
      <div className="ch-au-photo" aria-hidden="true" data-ch-code="CH-15804" data-dark={dark ? '' : undefined}>
        <SceneMount camera="rest" />
        <div className="ch-au-veil" />
        <div className="ch-au-mark">
          <img src="/clubhouse/auth/helm-golf-mark.png" alt="" width={28} height={28} />
          <span>
            Golf<b>Helm</b>
          </span>
        </div>
        <div className="ch-au-say">
          <h2>GolfHelm for college golf.</h2>
          <p>
            <i />
            Rounds, stats, travel and qualifiers in one place
          </p>
        </div>
      </div>
      <main className="ch-au-panel" style={tint ? ({ ['--ch-au-paper' as string]: tint } as CSSProperties) : undefined} aria-label={view === 'signin' ? 'Sign in' : 'Reset your password'} aria-hidden={opening || undefined} inert={opening || undefined}>
        <div className="ch-au-top">
          {/* The App Store build has no marketing home to go back to (the proxy sends "/" straight back here), and no sign-up (Guideline 3.1.1).
              CH-15611: hovered, its chevron leans back the way it goes; pressed, it tints. */}
          {!native && (
            <Link href="/" className="ch-au-back" aria-label="Back to home" data-ch-code="CH-15905">
              <Icon icon={ChevronLeft} size={16} />
              Home
            </Link>
          )}
        </div>
        <div className="ch-au-stage" id="ch-au-form" ref={stageRef}>
          <div className="ch-au-lock">
            <img src="/clubhouse/auth/helm-golf-mark.png" alt="" width={46} height={46} />
            <span>
              Golf<b>Helm</b>
            </span>
          </div>
          {/* CH-15612: the views slide 12px the way the person is going (on to the reset form and the email, back to sign
              in) and crossfade; the leaving one is hidden from assistive technology at once (CH-15820). */}
          <Swap swapKey={view} kind="slide" dir={dir} className="ch-au-views">
            {view === 'signin' ? (
              <SignInForm
                onOpening={() => setPhase('opening')}
                signIn={signIn}
                // Back from the reset form, the address comes back with it; the first paint draws what the preview asked for.
                initial={moved ? { email: carried } : initial}
                navigate={navigate}
                onForgot={(email) => {
                  setCarried(email);
                  openForgot();
                }}
                focusOnMount={moved}
                stageRef={stageRef}
              />
            ) : view === 'forgot' ? (
              <ResetForm
                initialEmail={carried}
                focusOnMount={moved}
                stageRef={stageRef}
                requestReset={requestReset}
                onSent={(email) => {
                  setSentTo(email);
                  setCarried(email);
                  showSent();
                }}
                onBack={(email) => {
                  setCarried(email);
                  backToSignIn();
                }}
              />
            ) : (
              <ResetSent email={sentTo} focusOnMount={moved} onBack={backToSignIn} />
            )}
          </Swap>
        </div>
        <div className="ch-au-bottom">
          <div className="ch-au-foot">
            {!native && (
              <span>
                New here? <Link href={signupHref}>Create an account</Link>
              </span>
            )}
            <span className="ch-au-legal">
              <Link href="/privacy">Privacy</Link>
              <span aria-hidden="true">·</span>
              <Link href="/terms">Terms</Link>
            </span>
          </div>
          <div className="ch-au-hsl">
            <img src="/clubhouse/auth/helm-sports-labs-mark.png" alt="" width={18} height={18} />A Helm Sports Labs product
          </div>
        </div>
      </main>
    </AuthFrame>
  );
}
