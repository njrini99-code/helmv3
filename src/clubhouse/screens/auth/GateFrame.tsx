'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { isNativeApp } from '@/lib/utils/capacitor';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { Icon } from '../../ui/Icon';
import { Swap } from '../../ui/Swap';
import { AuthFrame, type AuthPhase } from './AuthFrame';
import { SceneMount } from './SceneMount';
import { isDarkSky, paperTint } from './scene-sky';
import { useGlide, type Glider } from './use-glide';
import { useSkyHour } from './use-hour';
import { useKeyboardLift } from './use-keyboard-lift';

export interface GateBack {
  href: string;
  label: string;
  /** The App Store build has no marketing home to go back to, so a link to it is not drawn there. */
  hideInApp?: boolean;
}

/**
 * The frame of every way into the app that is not sign in itself (the reset link, a team code, a staff invitation, the
 * demo, waiting for approval): the sign-in screen's own course, lockup and panel (a sheet on the phone), with the panel's
 * content left to the screen. It draws what `SignIn` draws and nothing different, so a person moving from sign in to
 * one of these sees the same room (P015, front-door completion).
 *
 * `viewKey` names the state on show; when it changes the content slides the way the person is going (`dir`) and the
 * centred stage glides to its new height, as the sign-in panel's views do (CH-15612).
 */
export function GateFrame({
  label,
  say,
  back,
  foot,
  phase = 'login',
  viewKey,
  dir = 1,
  stageRef,
  children,
}: {
  /** The panel's name for assistive technology. */
  label: string;
  /** The line over the course: a short sentence and the thing it is about. */
  say: { title: string; line: string };
  back?: GateBack | null;
  /** The panel's own line above the legal links (sign in's "New here?"). */
  foot?: ReactNode;
  phase?: AuthPhase;
  viewKey: string;
  dir?: 1 | -1;
  stageRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  const panelRef = useRef<HTMLElement>(null);
  useKeyboardLift(panelRef);
  const opening = phase === 'opening';
  const hour = useSkyHour();
  const dark = hour !== null && isDarkSky(hour);
  const tint = hour === null ? null : paperTint(hour);

  return (
    <AuthFrame screen="signin" phase={phase}>
      <a className="ch-au-skip" href="#ch-au-form">
        Skip to the form
      </a>
      <div className="ch-au-photo" aria-hidden="true" data-dark={dark ? '' : undefined}>
        <SceneMount camera="rest" />
        <div className="ch-au-veil" />
        <div className="ch-au-mark">
          <img src="/clubhouse/auth/helm-golf-mark.png" alt="" width={28} height={28} />
          <span>
            Golf<b>Helm</b>
          </span>
        </div>
        <div className="ch-au-say">
          <h2>{say.title}</h2>
          <p>
            <i />
            {say.line}
          </p>
        </div>
      </div>
      <main
        ref={panelRef}
        className="ch-au-panel"
        style={tint ? ({ ['--ch-au-paper' as string]: tint } as CSSProperties) : undefined}
        aria-label={label}
        aria-hidden={opening || undefined}
        inert={opening || undefined}
      >
        <div className="ch-au-top">
          {back && !(back.hideInApp && native) && (
            <Link href={back.href} className="ch-au-back" aria-label={back.label === 'Home' ? 'Back to home' : `Back to ${back.label.toLowerCase()}`}>
              <Icon icon={ChevronLeft} size={16} />
              {back.label}
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
          <Swap swapKey={viewKey} kind="slide" dir={dir} className="ch-au-views">
            {children}
          </Swap>
        </div>
        <div className="ch-au-bottom">
          <div className="ch-au-foot">
            {foot}
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

/**
 * Which state a gate screen is in, and how it changes: the content slides the way the person is going and the centred
 * stage glides to its new height. `go` captures where the stage is before the change commits and plays the glide once
 * it has (FLIP, `useGlide`).
 */
export function useGateView<V extends string>(initial: V) {
  const [view, setView] = useState<V>(initial);
  const [dir, setDir] = useState<1 | -1>(1);
  // True once the person has moved it (not first paint), so the new state's heading takes focus and is read out.
  const [moved, setMoved] = useState(false);
  const [changes, setChanges] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const reduced = useChReducedMotion();
  const gliders = useMemo<Glider[]>(() => [{ ref: stageRef }], []);
  const glide = useGlide(reduced, gliders);
  const go = useCallback(
    (next: V, d: 1 | -1 = 1) => {
      glide.capture();
      setDir(d);
      setView(next);
      setMoved(true);
      setChanges((n) => n + 1);
    },
    [glide],
  );
  useLayoutEffect(() => {
    if (changes > 0) glide.play();
  }, [changes, glide]);
  return { view, dir, moved, go, stageRef };
}
