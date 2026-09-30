'use client';

import dynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';
import { chReport } from '../../lib/track';
import { useChPhone } from '../../lib/use-phone';
import type { SceneCamera } from './GolfScene';
import { useLocalHour } from './use-hour';

/**
 * The painted course is the heaviest thing on these screens and nothing on them
 * waits for it: it loads in its own chunk after the form has painted, and the
 * server never draws it (it needs the viewer's clock, which a server does not
 * have), so the server markup carries a flat placeholder instead and there is
 * nothing to mismatch. A crash in it leaves the placeholder and never touches
 * the form.
 */
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

export function SceneMount({ camera = 'rest', play = false, hour: fixedHour }: { camera?: SceneCamera; play?: boolean; /** A fixed hour, for the dev preview; otherwise the viewer's clock. */ hour?: number }) {
  const localHour = useLocalHour();
  const hour = fixedHour ?? localHour;
  const phone = useChPhone();
  if (hour === null) return null;
  return (
    <SceneBoundary>
      <GolfSceneLazy hour={hour} crop={phone ? 'tall' : 'wide'} camera={camera} play={play} />
    </SceneBoundary>
  );
}
