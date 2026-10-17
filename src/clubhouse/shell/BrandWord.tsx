'use client';

import { useId, useLayoutEffect, useState } from 'react';
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
    <span className={'ch-brand__line' + (write ? ' is-write' : '')}>
      <span className={'ch-brand__word is-script' + (write ? ' is-write' : '')}>
        Golf<b>helm</b>
      </span>
      <HelmMark write={write} />
    </span>
  );
}

/**
 * The GolfHelm logo, redrawn as a vector from the 300px master (`public/anim/helm-golf-icon.png`), measured rather than
 * eyeballed (owner, 2026-10-16: "pull up the actual logo and fix it. be detailed."): the rim (radius 84.9 to 105.7),
 * eight round-tipped spokes 23 wide reaching 146, the ball (radius 71.6) with its face where two circles overlap (the
 * crescent below it is the ball's shade), 13 dimples and the six highlights along the shade, each where the master has
 * it. The PNG blurred at 30px; this stays sharp at any size. Coloured for the green: the helm and ball in the mint
 * "helm" is set in, the face and highlights ivory, the dimples green, the gap open to the panel.
 */
const SPOKES = [0, 45, 90, 135, 180, 225, 270, 315];
const DIMPLES: readonly [number, number, number][] = [
  [154.4, 135.5, 6.1], [168.2, 157, 6], [120.7, 133.4, 5.8], [135.1, 157, 5.8], [139.5, 115, 5.8], [170, 115.2, 5.7], [185.7, 138.5, 5.7],
  [106.6, 154.1, 5.3], [155.4, 95, 5.1], [109.5, 113.2, 4.7], [193.3, 115.5, 4.6], [128.4, 96.4, 4.4], [97.8, 134.4, 4.2],
];
/** The highlights along the ball's shade: centre, half-length, half-width, angle (along the ball's edge). */
const SHINE: readonly [number, number, number, number, number][] = [
  [149.8, 197.9, 8.5, 5.5, 0], [176.5, 190.5, 7.6, 5.2, 148], [122.3, 192.2, 7.3, 6.2, 32.5],
  [197.2, 175.3, 8.3, 4.2, 119.6], [99.6, 180.2, 8.3, 4.8, 57.9], [210.5, 155.4, 7, 3.9, 96.5],
];

function HelmMark({ write }: { write: boolean }) {
  const clip = useId();
  return (
    <svg className={'ch-brand__mark' + (write ? ' is-write' : '')} viewBox="4 4 292 292" width={34} height={34} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <circle cx="143.16" cy="119.16" r="60.35" />
        </clipPath>
      </defs>
      <g className="ch-brand__mark-helm">
        <circle cx="150" cy="150" r="95.3" fill="none" strokeWidth="20.8" />
        {SPOKES.map((a) => (
          <line key={a} x1="150" y1="49" x2="150" y2="15.5" strokeWidth="23" strokeLinecap="round" transform={`rotate(${a} 150 150)`} />
        ))}
      </g>
      <circle className="ch-brand__mark-ball" cx="150.14" cy="148.54" r="71.6" />
      <circle className="ch-brand__mark-face" cx="149.41" cy="145.14" r="62.25" clipPath={`url(#${clip})`} />
      <g className="ch-brand__mark-dimples">
        {DIMPLES.map(([x, y, r]) => (
          <circle key={`${x},${y}`} cx={x} cy={y} r={r} />
        ))}
      </g>
      <g className="ch-brand__mark-face">
        {SHINE.map(([x, y, a, b, deg]) => (
          <ellipse key={`${x},${y}`} cx={x} cy={y} rx={a} ry={b} transform={`rotate(${deg} ${x} ${y})`} />
        ))}
      </g>
    </svg>
  );
}
