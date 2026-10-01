'use client';

import { useEffect } from 'react';
import { CH_DUR, CH_EASE, CH_SPRING } from './motion';

const bezier = (c: readonly number[]) => `cubic-bezier(${c.join(', ')})`;

/** What counts as tappable (v2 gh-core.js). */
const TAP = 'button,[role="button"],[role="tab"],[role="radio"],[role="switch"],[role="checkbox"],a[href],summary';

/** v2: shrink by about 6px whatever the width, never below 0.96. */
export function pressScale(width: number): number {
  return Math.max(0.96, 1 - 6 / (width || 80));
}

/**
 * The press (D-64): every tappable inside Clubhouse shrinks on pointer down
 * over press (110ms, ease-out) and springs back over release (280ms). It
 * animates the `scale` property, which composes with `transform` and
 * `translate`, so it never fights framer-motion or a sheet drag. Skipped for
 * disabled controls, anything inside `[data-ch-nopress]`, with reduced motion
 * or Animations off (pass `enabled: false`), and where the Web Animations API
 * is missing. Mounted once, by the shell. CH-1606.
 */
export function useChPress(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof Element === 'undefined' || !Element.prototype.animate) return;
    let held: { el: HTMLElement; scale: number; anim: Animation } | null = null;

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = (e.target as Element | null)?.closest?.(TAP) as HTMLElement | null;
      if (!el || !el.closest('[data-ui="clubhouse"]') || el.closest('[data-ch-nopress]')) return;
      if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
      const scale = pressScale(el.getBoundingClientRect().width);
      held = { el, scale, anim: el.animate([{ scale: '1' }, { scale: String(scale) }], { duration: CH_DUR.press * 1000, easing: bezier(CH_EASE), fill: 'forwards' }) };
    };
    const release = () => {
      if (!held) return;
      const { el, scale, anim } = held;
      held = null;
      el.animate([{ scale: String(scale) }, { scale: '1' }], { duration: CH_DUR.release * 1000, easing: bezier(CH_SPRING) });
      anim.cancel();
    };
    document.addEventListener('pointerdown', down, true);
    for (const t of ['pointerup', 'pointercancel', 'dragstart'] as const) document.addEventListener(t, release, true);
    return () => {
      release();
      document.removeEventListener('pointerdown', down, true);
      for (const t of ['pointerup', 'pointercancel', 'dragstart'] as const) document.removeEventListener(t, release, true);
    };
  }, [enabled]);
}
