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

/** A touch press waits this long before it shrinks (A12): a scroll that starts on a button cancels first, so it never flinches. */
export const PRESS_TOUCH_DELAY_MS = 70;
/** A tap that lifts before the delay still shows its press for this long. */
export const PRESS_TAP_SHOW_MS = 90;
/** A touch that moves further than this before the delay is a scroll, not a press. */
const PRESS_SLOP_PX = 10;

/**
 * The press: a button inside Clubhouse shrinks on pointer down over press (110ms, ease-out) and springs back over
 * release (280ms), from wherever it had got to, so a quick tap never snaps to the full press first. A finger's press
 * waits 70ms first and a move past 10px cancels it, so a scroll that starts on a button never shrinks it; a tap that
 * lifts sooner still shows its press for 90ms (A12). It
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
    /** A touch press waiting out its delay (A12): where it started, and the timer that will shrink the button. */
    let pending: { el: HTMLElement; scale: number; x: number; y: number; id: number; timer: number } | null = null;
    let tapTimer = 0;

    const press = (el: HTMLElement, scale: number) => {
      held = { el, scale, anim: el.animate([{ scale: '1' }, { scale: String(scale) }], { duration: CH_DUR.press * 1000, easing: bezier(CH_EASE), fill: 'forwards' }) };
    };
    const drop = () => {
      if (!pending) return;
      window.clearTimeout(pending.timer);
      pending = null;
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // A second press while one is held lets the first go first.
      release();
      drop();
      const el = (e.target as Element | null)?.closest?.(PRESSABLE) as HTMLElement | null;
      if (!el || !el.closest('[data-ui="clubhouse"]') || el.closest('[data-ch-nopress]')) return;
      if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
      const width = el.getBoundingClientRect().width;
      if (width > PRESS_MAX_WIDTH) return;
      const scale = pressScale(width);
      // Mouse and pen press at once; a finger waits out the delay, as UIKit's delaysContentTouches does in a scroll view.
      if (e.pointerType !== 'touch') {
        press(el, scale);
        return;
      }
      const at = { el, scale, x: e.clientX, y: e.clientY, id: e.pointerId };
      pending = {
        ...at,
        timer: window.setTimeout(() => {
          pending = null;
          press(at.el, at.scale);
        }, PRESS_TOUCH_DELAY_MS),
      };
    };
    const move = (e: PointerEvent) => {
      if (pending && e.pointerId === pending.id && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > PRESS_SLOP_PX) drop();
    };
    const up = (e: PointerEvent) => {
      // A quick tap lifted before the delay: it still shows its press, briefly, then springs back.
      if (pending && e.pointerId === pending.id) {
        const { el, scale } = pending;
        drop();
        press(el, scale);
        tapTimer = window.setTimeout(release, PRESS_TAP_SHOW_MS);
        return;
      }
      release();
    };
    const cancel = () => {
      drop();
      release();
    };
    const release = () => {
      window.clearTimeout(tapTimer);
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
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    for (const t of ['pointercancel', 'dragstart'] as const) document.addEventListener(t, cancel, true);
    return () => {
      cancel();
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      for (const t of ['pointercancel', 'dragstart'] as const) document.removeEventListener(t, cancel, true);
    };
  }, [enabled]);
}
