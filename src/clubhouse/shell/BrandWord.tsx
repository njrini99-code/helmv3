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

/**
 * The wheel, the real logo (owner, 2026-10-16: an ivory border so it stands out, "matte and matching the greens", "use
 * the actual logo", "outline the spokes", "make it look better"). A purpose-made asset from the 300px source
 * (`scripts/clubhouse/make-brand-wheel.py`): recoloured to the mint "helm" is set in, the ball ivory, the gap
 * round it deep green so it reads filled ("now its not filled in its all white"), with a clean
 * ivory line traced round the rim and spokes, at 3x so it stays sharp; CSS filters on the small PNG blurred it.
 */
function HelmMark({ write }: { write: boolean }) {
  return (
    <span className={'ch-brand__mark' + (write ? ' is-write' : '')} aria-hidden="true">
      <img src="/clubhouse/brand/helm-wheel-sidebar.png" alt="" width={30} height={30} />
    </span>
  );
}
