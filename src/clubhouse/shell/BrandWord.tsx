'use client';

import { useLayoutEffect, useState } from 'react';
import { useChReducedMotion } from '../lib/reduced-motion';

const KEY = 'ch-brand-write';

/** The welcome's hand-off asks the sidebar to write its wordmark in once, as the app opens. */
export function markBrandWrite(): void {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Storage blocked: the wordmark is simply drawn whole.
  }
}

function asked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The sidebar's brand (owner, 2026-10-16): "Golfhelm" in script, then the wheel, helm in the green. Right after the sign
 * in's welcome hands over, the dashboard draws first, then the word writes itself in left to right, then the wheel
 * turns into place; every other time it is simply there. The ask is read once and cleared.
 */
export function useBrandWrite(): boolean {
  const reduced = useChReducedMotion();
  const [write, setWrite] = useState(false);
  // Read before the first paint, so the word is hidden for its write rather than drawn and then wiped; after mount, so
  // the server's markup (the word drawn whole) is what hydrates.
  useLayoutEffect(() => {
    if (!asked()) return;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
    setWrite(true);
  }, []);
  return write && !reduced;
}

/** The brand's line (owner, 2026-10-16: "script then logo"): the word first, then the wheel after it. */
export function BrandLine({ write }: { write: boolean }) {
  return (
    <span className="ch-brand__line">
      <span className={'ch-brand__word is-script' + (write ? ' is-write' : '')}>
        Golf<b>helm</b>
      </span>
      <HelmMark write={write} />
    </span>
  );
}

const SPOKES = [0, 45, 90, 135, 180, 225, 270, 315];
const DIMPLES: [number, number][] = [
  [-2.6, -2.2], [0, -2.9], [2.6, -2.2], [-3.3, 0.4], [-1.1, -0.3], [1.1, -0.3], [3.3, 0.4], [-2.2, 2.4], [0, 1.9], [2.2, 2.4], [0, 4],
];

/**
 * The wheel, drawn rather than the bright PNG (owner, 2026-10-16: "an ivory border around the logo so it stands out a
 * little more, and make it matte and matching the greens"): an ivory ring round a deep-green disc, the helm in the
 * mint "helm" is set in, the ball ivory with green dimples. Flat fills, so it sits on the frosted panel without a glow.
 */
function HelmMark({ write }: { write: boolean }) {
  return (
    <svg className={'ch-brand__mark' + (write ? ' is-write' : '')} viewBox="0 0 32 32" width={30} height={30} aria-hidden="true" focusable="false">
      <circle className="ch-brand__mark-disc" cx="16" cy="16" r="15" />
      <g className="ch-brand__mark-helm">
        {SPOKES.map((a) => (
          <line key={a} x1="16" y1="7.4" x2="16" y2="4.6" transform={`rotate(${a} 16 16)`} />
        ))}
        <circle cx="16" cy="16" r="7.6" fill="none" />
      </g>
      <circle className="ch-brand__mark-ball" cx="16" cy="16" r="5.7" />
      <g className="ch-brand__mark-dimples">
        {DIMPLES.map(([x, y]) => (
          <circle key={`${x},${y}`} cx={16 + x} cy={16 + y} r="0.62" />
        ))}
      </g>
    </svg>
  );
}
