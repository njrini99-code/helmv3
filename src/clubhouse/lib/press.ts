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

/** What shows a pressed look (B6): anything a finger can press. It carries `data-ch-pressed` while held. */
const PRESSED_TARGET = '[data-ch-pressable],button,a,[role="button"]';

/**
 * The press controller (CH-1606, A12, B6), mounted once by the shell. On pointer down inside Clubhouse:
 *
 * - The pressed look: the control under the finger (a button, link, `[role=button]` or `[data-ch-pressable]`) carries
 *   `data-ch-pressed` while it is held, and styles draw their pressed tint from it as well as `:active`. A finger's press
 *   waits 70ms and a move past 10px or a cancel drops it, so a scroll that starts on a row never flashes it; a tap that
 *   lifts sooner still shows it, and every press shows it for at least 90ms, so a quick tap is always acknowledged.
 *   This runs whatever the motion setting: it is a state, not a movement.
 * - The scale: a button (`.ch-btn`, `[data-ch-press]`, no wider than a button) shrinks over press (110ms, ease-out) and
 *   springs back over release (280ms) from wherever it had got to. It animates the `scale` property, which composes with
 *   `transform` and `translate`, so it never fights framer-motion or a sheet drag. Skipped without `motion` (reduced
 *   motion, Animations off) and where the Web Animations API is missing.
 *
 * Disabled controls and anything inside `[data-ch-nopress]` take neither.
 */
export function useChPress(motion: boolean): void {
  useEffect(() => {
    if (typeof Element === 'undefined') return;
    const scales = motion && !!Element.prototype.animate;
    type Press = { target: HTMLElement | null; el: HTMLElement | null; scale: number };
    let held: (Press & { anim: Animation | null; at: number }) | null = null;
    /** A touch press waiting out its delay (A12): where it started, and the timer that will press it. */
    let pending: (Press & { x: number; y: number; id: number; timer: number }) | null = null;
    let tapTimer = 0;
    /** A released control whose pressed look is still showing out its minimum. */
    let lingering: { target: HTMLElement; timer: number } | null = null;

    const unmark = () => {
      if (!lingering) return;
      window.clearTimeout(lingering.timer);
      lingering.target.removeAttribute('data-ch-pressed');
      lingering = null;
    };
    const press = ({ target, el, scale }: Press) => {
      unmark();
      target?.setAttribute('data-ch-pressed', '');
      const anim = el && scales ? el.animate([{ scale: '1' }, { scale: String(scale) }], { duration: CH_DUR.press * 1000, easing: bezier(CH_EASE), fill: 'forwards' }) : null;
      held = { target, el, scale, anim, at: Date.now() };
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
      unmark();
      drop();
      const from = e.target as Element | null;
      if (!from?.closest?.('[data-ui="clubhouse"]') || from.closest('[data-ch-nopress]')) return;
      const off = (n: Element | null) => !!n && ((n as HTMLButtonElement).disabled || n.getAttribute('aria-disabled') === 'true');
      const target = from.closest(PRESSED_TARGET) as HTMLElement | null;
      let el = from.closest(PRESSABLE) as HTMLElement | null;
      if (off(el)) el = null;
      const width = el?.getBoundingClientRect().width ?? 0;
      if (width > PRESS_MAX_WIDTH) el = null;
      const p: Press = { target: off(target) ? null : target, el, scale: pressScale(width) };
      if (!p.target && !p.el) return;
      // Mouse and pen press at once; a finger waits out the delay, as UIKit's delaysContentTouches does in a scroll view.
      if (e.pointerType !== 'touch') {
        press(p);
        return;
      }
      pending = {
        ...p,
        x: e.clientX,
        y: e.clientY,
        id: e.pointerId,
        timer: window.setTimeout(() => {
          const at = pending;
          pending = null;
          if (at) press(at);
        }, PRESS_TOUCH_DELAY_MS),
      };
    };
    const move = (e: PointerEvent) => {
      if (pending && e.pointerId === pending.id && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > PRESS_SLOP_PX) drop();
    };
    const up = (e: PointerEvent) => {
      // A quick tap lifted before the delay: it still shows its press, briefly, then springs back.
      if (pending && e.pointerId === pending.id) {
        const p = pending;
        drop();
        press(p);
        tapTimer = window.setTimeout(release, PRESS_TAP_SHOW_MS);
        return;
      }
      release();
    };
    const cancel = () => {
      drop();
      release(true);
    };
    /** Springs the scale back at once; the pressed look stays out its 90ms (unless the press was cancelled). */
    const release = (now = false) => {
      window.clearTimeout(tapTimer);
      if (!held) return;
      const { target, el, scale, anim, at } = held;
      held = null;
      if (target) {
        const left = now ? 0 : PRESS_TAP_SHOW_MS - (Date.now() - at);
        if (left > 0) lingering = { target, timer: window.setTimeout(unmark, left) };
        else target.removeAttribute('data-ch-pressed');
      }
      if (!el || !anim) return;
      // Spring back from where the press actually is: a release before the press finished starts from part-way.
      const current = parseFloat(getComputedStyle(el).scale);
      const fromScale = Number.isFinite(current) && current > 0 ? current : scale;
      el.animate([{ scale: String(fromScale) }, { scale: '1' }], { duration: CH_DUR.release * 1000, easing: bezier(CH_SPRING) });
      anim.cancel();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    for (const t of ['pointercancel', 'dragstart'] as const) document.addEventListener(t, cancel, true);
    return () => {
      cancel();
      unmark();
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      for (const t of ['pointercancel', 'dragstart'] as const) document.removeEventListener(t, cancel, true);
    };
  }, [motion]);
}
