'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../ui/Icon';
import { haptic } from '../../lib/haptics';
import { useChPhone } from '../../lib/use-phone';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { isNativeApp } from '@/lib/utils/capacitor';
import { AuthFrame } from '../auth/AuthFrame';
import { SceneMount } from '../auth/SceneMount';
import { isDarkSky } from '../auth/scene-sky';
import { useLocalHour } from '../auth/use-hour';
import { dropHandoffCurtain } from '../../lib/handoff';
import { useFlow, type Draft } from './flow';
import { FULL_STEPS, codeFromSearch, railOf, zoomOf, type OnboardStep } from './logic';
import { MemberCard, cardOf, seasonLabel } from './MemberCard';
import { STEPS } from './Steps';
import '../../styles/onboard-tokens.css';
import '../../styles/onboard.css';

const MARK = '/clubhouse/auth/helm-golf-mark.png';

/** The hand-off's beats (design: lift 0 to 800ms, fold from 700ms; the route changes as the fold lands). */
const LIFT_MS = 700;
const NAVIGATE_MS = 1000;
const REDUCED_NAVIGATE_MS = 240;

type Phase = 'lift' | 'fold' | null;

/**
 * Sign up and onboarding, full screen: one question at a time on a stationery
 * pane over the painted course, with the member card filling in beside it.
 *
 * `start` is 'intro' on /golf/signup, and 'game' on /golf/player, where a new
 * player lands after the account is made (the session exists from then on, and
 * the sign-up route bounces a signed-in visitor). `seed` is what the server
 * already knows about that player.
 */
export function Onboard({ start = 'intro', seed = {}, preview = false, fixedHour }: { start?: OnboardStep; seed?: Partial<Draft>; preview?: boolean; fixedHour?: number }) {
  const router = useRouter();
  const phone = useChPhone();
  const reduced = useChReducedMotion();
  const localHour = useLocalHour();
  const hour = fixedHour ?? localHour;
  const [now] = useState(() => new Date());
  const f = useFlow(start, seed, !preview);
  const [phase, setPhase] = useState<Phase>(null);
  const [signInHref, setSignInHref] = useState('/golf/login');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const headRef = useRef<HTMLDivElement>(null);

  // Today's sign-up behaviour, kept: the iOS app is for existing members, and an invite link's code is carried in.
  useEffect(() => {
    if (preview) return;
    if (start !== 'intro') {
      // After the account: the join code the server put on the URL is the one the join uses.
      const joinCode = codeFromSearch(window.location.search);
      if (joinCode) f.up({ code: joinCode });
      return;
    }
    if (isNativeApp()) {
      router.replace('/golf/login');
      return;
    }
    const search = window.location.search;
    const code = codeFromSearch(search);
    if (code && !f.d.code) f.up({ code });
    const returnTo = new URLSearchParams(search).get('returnTo');
    if (returnTo) setSignInHref(`/golf/login?returnTo=${encodeURIComponent(returnTo)}`);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Each new question takes focus at its heading, so a screen reader hears it and Tab starts from the top of it.
  useEffect(() => {
    if (f.n === 0) return;
    const h = headRef.current?.querySelector<HTMLElement>('.ch-ox-h1');
    const field = headRef.current?.querySelector<HTMLElement>('input[autofocus], input:not([type=hidden]):not([hidden])');
    if (!phone && field && field.closest('.ch-ox-code, .ch-ox-names, .ch-ox-fields')) return;
    h?.focus({ preventScroll: true });
  }, [f.n, phone]);

  const finish = useCallback(
    (href: string) => {
      if (phase) return;
      haptic('success');
      // The preview plays the hand-off and stays put.
      const go = () => {
        if (preview) return;
        // Hold the folded frame over the route change until the dashboard is drawn (the dashboard lifts it).
        if (!reduced && !phone && href.startsWith('/golf/dashboard')) dropHandoffCurtain();
        router.push(href);
      };
      if (!preview) router.prefetch(href);
      if (reduced) {
        setPhase('fold');
        timers.current.push(setTimeout(go, REDUCED_NAVIGATE_MS));
        return;
      }
      setPhase('lift');
      timers.current.push(setTimeout(() => setPhase('fold'), LIFT_MS));
      timers.current.push(setTimeout(go, NAVIGATE_MS));
    },
    [phase, phone, preview, reduced, router],
  );

  const step = f.step;
  const full = FULL_STEPS.has(step);
  const dark = full && hour !== null && isDarkSky(hour);
  const issued = (step === 'done' || step === 'staffdone' || step === 'sent') && f.d.joinedTeam !== false;
  const rail = railOf(f.path, step);
  const Step = STEPS[step];
  const face = cardOf(f.d, f.path, step, now);
  const season = seasonLabel(now);

  return (
    <AuthFrame screen="signup" phase={phase ? 'leaving' : 'login'}>
      <div className={`ch-ox${full ? ' ch-ox--full' : ''}${dark ? ' ch-ox--dark' : ''}`} data-phase={phase ?? undefined}>
        <div className="ch-ox-canvas">
          <div className="ch-ox-land" aria-hidden="true">
            <SceneMount camera={phase === 'fold' ? 'leave' : zoomOf(f.path, step)} play={issued && f.path !== 'request'} hour={fixedHour} />
          </div>
          <div className="ch-ox-paper" aria-hidden="true" />
          <div className="ch-ox-seal" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small static mark */}
            <img src={MARK} alt="" width={28} height={28} />
          </div>
          <header className="ch-ox-top">
            <span className="ch-ox-lock">
              {/* eslint-disable-next-line @next/next/no-img-element -- a small static mark */}
              <img src={MARK} alt="" width={28} height={28} />
              GolfHelm
            </span>
            <nav className="ch-ox-rail" aria-label="Progress">
              {rail.sections.map((s, i) => (
                <span key={s} className="ch-ox-rail__s" data-state={i === rail.current ? 'cur' : i < rail.current ? 'done' : undefined} aria-current={i === rail.current ? 'step' : undefined}>
                  {i < rail.current && <Icon icon={Check} size={12} />}
                  {s}
                </span>
              ))}
            </nav>
            <span className="ch-ox-rail__m" aria-hidden={full ? true : undefined}>
              {rail.current >= 0 ? `${rail.current + 1} of ${rail.sections.length}` : ''}
            </span>
            {!issued && !f.d.accountMade ? (
              <div className="ch-ox-signin">
                <span>Already a member?</span>
                <Link href={signInHref}>Sign in</Link>
              </div>
            ) : (
              <span />
            )}
          </header>
          <main className="ch-ox-stage">
            <div className="ch-ox-col" key={f.n} ref={headRef}>
              <Step
                d={f.d}
                hist={f.hist}
                up={f.up}
                next={f.next}
                back={f.canBack && !issued ? f.back : null}
                dir={f.dir}
                path={f.path}
                hour={hour}
                now={now}
                phone={phone}
                finish={finish}
                signInHref={signInHref}
              />
            </div>
            <aside className="ch-ox-side" aria-label={f.path === 'request' ? 'Your request' : 'Your member card'}>
              <MemberCard face={face} issued={issued} season={season} />
              <div className="ch-ox-side__cap">
                <b>{f.path === 'request' ? 'Your request' : 'Your member card'}</b>
                <span>{issued ? 'Issued today' : step === 'intro' ? 'Fills in as you go' : 'Updates as you answer'}</span>
              </div>
            </aside>
          </main>
        </div>
        <div className="ch-ox-mhome" aria-hidden="true">
          <span>
            {/* eslint-disable-next-line @next/next/no-img-element -- a small static mark */}
            <img src={MARK} alt="" width={28} height={28} />
            Opening your dashboard
          </span>
        </div>
      </div>
    </AuthFrame>
  );
}
