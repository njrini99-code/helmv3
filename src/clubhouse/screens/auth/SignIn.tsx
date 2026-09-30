'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isNativeApp } from '@/lib/utils/capacitor';
import { Icon } from '../../ui/Icon';
import { AuthFrame, type AuthPhase } from './AuthFrame';
import { SceneMount } from './SceneMount';
import { SignInForm, type SignInPreview } from './SignInForm';
import type { loginAction } from '@/app/golf/actions/auth';
import { isDarkSky } from './scene-sky';
import { useLocalHour } from './use-hour';
import { useQueryParam } from './use-query-param';

/**
 * /golf/login in Clubhouse: the painted course on the left and the form on the
 * right (a sheet under the course on a phone). When a sign-in lands, the form
 * leaves and the course takes the frame; the welcome route then draws itself
 * over the same frame. Everything that signs in is `SignInForm`.
 */
export function SignIn({ signIn, initial, navigate }: { signIn?: typeof loginAction; initial?: SignInPreview; navigate?: (href: string) => void } = {}) {
  const [phase, setPhase] = useState<AuthPhase>('login');
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  const returnTo = useQueryParam('returnTo');
  const signupHref = returnTo ? `/golf/signup?returnTo=${encodeURIComponent(returnTo)}` : '/golf/signup';
  const opening = phase === 'opening';
  const hour = useLocalHour();
  // At dusk and night the wordmark over the sky flips to ivory, as the welcome's type does.
  const dark = hour !== null && isDarkSky(hour);

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
      <main className="ch-au-panel" aria-label="Sign in" aria-hidden={opening || undefined} inert={opening || undefined}>
        <div className="ch-au-top">
          {/* The App Store build has no marketing home to go back to (the proxy sends "/" straight back here), and no sign-up (Guideline 3.1.1). */}
          {!native && (
            <Link href="/" className="ch-au-back" aria-label="Back to home" data-ch-code="CH-15905">
              <Icon icon={ChevronLeft} size={16} />
              Home
            </Link>
          )}
        </div>
        <SignInForm onOpening={() => setPhase('opening')} signIn={signIn} initial={initial} navigate={navigate} />
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
