'use client';

import dynamic from 'next/dynamic';
import { Component, useLayoutEffect, type ReactNode } from 'react';
import { chReport } from '../../lib/track';
import { useChPhone } from '../../lib/use-phone';
import type { SceneCamera } from './GolfScene';
import { skyAt } from './scene-sky';
import { clearSkyBoot, SKY_OFFSET_KEY } from './SkyScript';
import { useLocalHour, useSkyHour } from './use-hour';

/**
 * The painted course is the heaviest thing on these screens and nothing on them
 * waits for it: it loads in its own chunk after the form has painted, and the
 * server never draws it (it needs the viewer's clock, which a server does not
 * have), so the server markup carries a still of the course instead and there is
 * nothing to mismatch. A crash in it leaves the placeholder and never touches
 * the form.
 */
// CH-15907: the form is in the server HTML and usable before the course, which loads in its own chunk.
const GolfSceneLazy = dynamic(() => import('./GolfScene').then((m) => m.GolfScene), { ssr: false, loading: () => null });

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error) {
    chReport(error, { surface: 'auth.scene', severity: 'low' });
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The still is a daytime photo. Until the course's chunk has drawn the real sky, the still takes the hour's light: at
 * dusk and night a wash of that sky over it, so the course that fades in over it is the same time of day and a sign in
 * at night does not open on a sunny course (owner, 2026-10-14). Clear by day. Null hour (the server, hydration): no
 * style, so auth.css draws what SkyScript worked out before first paint (clear when it has not run).
 */
export function posterWash(hour: number | null): { background: string; opacity: number } | undefined {
  if (hour === null) return undefined;
  const sky = skyAt(hour);
  return { background: `linear-gradient(to bottom, ${sky.top}, ${sky.amb})`, opacity: Math.min(0.88, Math.round(sky.ambA * 1.4 * 100) / 100) };
}

export function SceneMount({ camera = 'rest', play = false, hour: fixedHour }: { camera?: SceneCamera; play?: boolean; /** A fixed hour, for the dev preview; otherwise the viewer's clock. */ hour?: number }) {
  // P015-A1: the sky follows the sun where the viewer is, not the clock.
  const localHour = useSkyHour();
  const hour = fixedHour ?? localHour;
  const clockHour = useLocalHour();
  // React has the real hour: what SkyScript stamped before first paint gives way to it, and the sun's offset from the
  // clock is kept so the next cold load's first frame is this one (the offset moves by minutes a day).
  useLayoutEffect(() => {
    if (fixedHour !== undefined || localHour === null) return;
    clearSkyBoot();
    if (clockHour === null) return;
    const offset = ((((localHour - clockHour) % 24) + 36) % 24) - 12;
    try {
      localStorage.setItem(SKY_OFFSET_KEY, offset.toFixed(3));
    } catch {
      // Private mode or storage off: the next cold load starts from the clock alone.
    }
  }, [fixedHour, localHour === null, Math.round((localHour ?? 0) * 4)]); // eslint-disable-line react-hooks/exhaustive-deps
  // CH-15909: 820px or less is the phone layout: the course on top, the form on a sheet.
  const phone = useChPhone();
  return (
    <>
      {/* A still of the actual course is in the server HTML. The form and artwork never wait for the animation chunk. */}
      <div className="ch-au-poster" aria-hidden="true">
        <svg className="ch-au-poster__wide" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" focusable="false">
          <image href="/clubhouse/auth/course-arrival.jpg" width="1600" height="1000" />
        </svg>
        <svg className="ch-au-poster__tall" viewBox="650 0 760 1000" preserveAspectRatio="xMidYMax slice" focusable="false">
          <image href="/clubhouse/auth/course-arrival.jpg" width="1600" height="1000" />
        </svg>
        <div className="ch-au-poster__wash" style={posterWash(hour)} />
      </div>
      {hour !== null && (
        <SceneBoundary>
          <GolfSceneLazy hour={hour} crop={phone ? 'tall' : 'wide'} camera={camera} play={play} />
        </SceneBoundary>
      )}
    </>
  );
}
