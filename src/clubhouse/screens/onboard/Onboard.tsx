'use client';

import { AnimatePresence, m, useIsPresent } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Component, createRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from '../../lib/haptics';
import { CH_DUR, CH_EASE } from '../../lib/motion';
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
import { Rail } from './Rail';
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
 * A question leaving (CH-15620): it goes the way the flow goes, up when moving on and down on Back, on the app's
 * quick beat, while the next question rises in on the design's step curve (`.ch-ox-q` in onboard.css). Reduced
 * motion and Animations off replace it at once.
 */
const TURN = {
  shown: { opacity: 1, y: 0 },
  leave: (dir: 'fwd' | 'back') => ({ opacity: 0, y: dir === 'back' ? 10 : -10, transition: { duration: CH_DUR.quick, ease: CH_EASE } }),
};
const TURN_INSTANT = {
  shown: { opacity: 1, y: 0 },
  leave: { opacity: 0, transition: { duration: 0 } },
};

type Spot = { top: number; left: number; width: number };

/**
 * Holds a leaving question where it stood, out of the flow, so the next one is laid out (and centred) on its own.
 * Measured before the commit that brings the next question in, and pinned before that commit is painted. Framer's
 * popLayout does the same through an injected stylesheet, which costs the whole painted course a style pass on
 * every turn; one element's inline style costs nothing.
 */
class Hold extends Component<{ present: boolean; turn: boolean; children: ReactNode }> {
  el = createRef<HTMLDivElement>();
  override getSnapshotBeforeUpdate(prev: { present: boolean }): Spot | null {
    const el = this.el.current;
    if (!el || !prev.present || this.props.present) return null;
    return { top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth };
  }
  override componentDidUpdate(_p: unknown, _s: unknown, spot: Spot | null) {
    const el = this.el.current;
    if (!el || !spot) return;
    Object.assign(el.style, { position: 'absolute', top: `${spot.top}px`, left: `${spot.left}px`, width: `${spot.width}px`, margin: '0' });
  }
  override render() {
    return (
      <div ref={this.el} className="ch-ox-turn" data-turn={this.props.turn ? '' : undefined}>
        {this.props.children}
      </div>
    );
  }
}

/** One question on the pane. Leaving, it keeps its pixels for the fade but leaves the accessibility tree and the focus order at once. */
function Turn({ turn, reduced, children }: { turn: boolean; reduced: boolean; children: ReactNode }) {
  const present = useIsPresent();
  return (
    <Hold present={present} turn={turn}>
      <m.div variants={reduced ? TURN_INSTANT : TURN} initial={false} animate="shown" exit="leave">
        <div className="ch-ox-turn__body" aria-hidden={present ? undefined : true} inert={!present}>
          {children}
        </div>
      </m.div>
    </Hold>
  );
}

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
  const stageRef = useRef<HTMLElement>(null);
  const colRef = useRef<HTMLDivElement>(null);

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

  // A long form scrolled down hands over to the next question at its top, before it is painted (the phone scrolls
  // the sheet, the desktop the column).
  useLayoutEffect(() => {
    if (f.n === 0) return;
    if (stageRef.current) stageRef.current.scrollTop = 0;
    if (colRef.current) colRef.current.scrollTop = 0;
  }, [f.n]);

  // Each new question takes focus at its heading, so a screen reader hears it and Tab starts from the top of it.
  useEffect(() => {
    if (f.n === 0) return;
    const live = colRef.current?.querySelector<HTMLElement>('.ch-ox-turn__body:not([aria-hidden])');
    const h = live?.querySelector<HTMLElement>('.ch-ox-h1');
    const field = live?.querySelector<HTMLElement>('input[autofocus], input:not([type=hidden]):not([hidden])');
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
  // Moving on is asked by the question on screen: a double tap, or a choice's timer after Back, moves nothing.
  const { next: flowNext } = f;
  const next = useCallback((patch?: Partial<Draft>, to?: OnboardStep) => flowNext(patch, to, step), [flowNext, step]);
  const full = FULL_STEPS.has(step);
  const dark = full && hour !== null && isDarkSky(hour);
  const issued = (step === 'done' || step === 'staffdone' || step === 'sent') && f.d.joinedTeam !== false;
  const request = f.path === 'request';
  const rail = railOf(f.path, step);
  const Step = STEPS[step];
  const face = cardOf(f.d, f.path, step, now);
  const season = seasonLabel(now);
  const note = issued ? (request ? 'Received today' : 'Issued today') : step === 'intro' ? 'Fills in as you go' : 'Updates as you answer';

  return (
    <AuthFrame screen="signup" phase={phase ? 'leaving' : 'login'}>
      <div className={`ch-ox${full ? ' ch-ox--full' : ''}${dark ? ' ch-ox--dark' : ''}`} data-phase={phase ?? undefined} data-moved={f.n > 0 ? '' : undefined}>
        <div className="ch-ox-canvas">
          <div className="ch-ox-land" aria-hidden="true">
            <SceneMount camera={phase === 'fold' ? 'leave' : zoomOf(f.path, step)} play={issued && !request} hour={fixedHour} />
          </div>
          <div className="ch-ox-paper" aria-hidden="true" />
          <div className="ch-ox-seal" aria-hidden="true">
            <img src={MARK} alt="" width={28} height={28} />
          </div>
          <header className="ch-ox-top">
            <span className="ch-ox-lock">
              <img src={MARK} alt="" width={28} height={28} />
              GolfHelm
            </span>
            <Rail sections={rail.sections} current={rail.current} full={full} />
            {!issued && !f.d.accountMade ? (
              <div className="ch-ox-signin">
                <span>Already a member?</span>
                <Link href={signInHref}>Sign in</Link>
              </div>
            ) : (
              <span />
            )}
          </header>
          <main className="ch-ox-stage" ref={stageRef}>
            <div className="ch-ox-col" ref={colRef}>
              <AnimatePresence initial={false} custom={f.dir}>
                <Turn key={f.n} turn={f.n > 0} reduced={reduced}>
                  <Step
                    d={f.d}
                    hist={f.hist}
                    up={f.up}
                    next={next}
                    back={f.canBack && !issued ? f.back : null}
                    dir={f.dir}
                    path={f.path}
                    hour={hour}
                    now={now}
                    phone={phone}
                    finish={finish}
                    signInHref={signInHref}
                  />
                </Turn>
              </AnimatePresence>
            </div>
            <aside className="ch-ox-side" aria-label={request ? 'Your request' : 'Your member card'} data-issued={issued && !request ? '' : undefined}>
              <MemberCard face={face} issued={issued && !request} season={season} />
              <div className="ch-ox-side__cap">
                <b>{request ? 'Your request' : 'Your member card'}</b>
                <span key={note}>{note}</span>
              </div>
            </aside>
          </main>
        </div>
        <div className="ch-ox-mhome" aria-hidden="true">
          <span>
            <img src={MARK} alt="" width={28} height={28} />
            Opening your dashboard
          </span>
        </div>
      </div>
    </AuthFrame>
  );
}
