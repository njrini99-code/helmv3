'use client';

import { useEffect } from 'react';
import { CH_DUR, CH_EASE, CH_SPRING } from './motion';

const bezier = (c: readonly number[]) => `cubic-bezier(${c.join(', ')})`;

/**
 * What compresses when pressed: buttons, and anything that opts in with `data-ch-press`. Rows, links, tabs, switches
 * and cards do not scale; they answer with their own pressed or selected look (owner 2026-10-01, audit F02: a whole
 * row or label shrinking read as rubbery and softened its text).
 */
const PRESSABLE = '.ch-btn,[data-ch-press]';
/** Wider than this is a row or a full-width bar, not a button: it does not scale either. */
export const PRESS_MAX_WIDTH = 240;

/** v2: shrink by about 6px whatever the width, never below 0.96. */
export function pressScale(width: number): number {
  return Math.max(0.96, 1 - 6 / (width || 80));
}

/**
 * The press: a button inside Clubhouse shrinks on pointer down over press (110ms, ease-out) and springs back over
 * release (280ms), from wherever it had got to, so a quick tap never snaps to the full press first. It
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
      // A second press while one is held lets the first go first.
      release();
      const el = (e.target as Element | null)?.closest?.(PRESSABLE) as HTMLElement | null;
      if (!el || !el.closest('[data-ui="clubhouse"]') || el.closest('[data-ch-nopress]')) return;
      if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
      const width = el.getBoundingClientRect().width;
      if (width > PRESS_MAX_WIDTH) return;
      const scale = pressScale(width);
      held = { el, scale, anim: el.animate([{ scale: '1' }, { scale: String(scale) }], { duration: CH_DUR.press * 1000, easing: bezier(CH_EASE), fill: 'forwards' }) };
    };
    const release = () => {
      if (!held) return;
      const { el, scale, anim } = held;
      held = null;
      // Spring back from where the press actually is: a release before the press finished starts from part-way.
      const now = parseFloat(getComputedStyle(el).scale);
      const from = Number.isFinite(now) && now > 0 ? now : scale;
      el.animate([{ scale: String(from) }, { scale: '1' }], { duration: CH_DUR.release * 1000, easing: bezier(CH_SPRING) });
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
