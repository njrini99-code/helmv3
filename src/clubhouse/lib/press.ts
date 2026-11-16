'use client';

import { useEffect } from 'react';
import { CH_DUR_MS, CH_EASE_IOS, CH_EASE_OUT } from './motion';

const bezier = (c: readonly number[]) => `cubic-bezier(${c.join(', ')})`;

/**
 * What compresses when pressed: buttons, the shared chip (`.ch-pill`, MOTION-AND-VISUAL 3.8) and anything that opts in
 * with `data-ch-press`. Rows, links, tabs, switches and cards do not scale; they answer with the wash or their own pressed
 * or selected look (owner 2026-10-01, audit F02: a whole row or label shrinking read as rubbery and softened its text).
 */
const PRESSABLE = '.ch-btn,.ch-pill,[data-ch-press],[data-ch-press-scale]';
/** Wider than this is a row or a full-width bar, not a button: it does not scale either. */
export const PRESS_MAX_WIDTH = 240;

/** A button pressed (production audit 2026-11-15, S3.11): scale 0.97 whatever its width, as an iOS button does. */
export const PRESS_SCALE = 0.97;
/** The scale a button takes under the finger. One value at every width: about 6px at 200px, 1px on a 44px key. */
export function pressScale(_width?: number): number {
  return PRESS_SCALE;
}

/**
 * A card that opens something opts in with `data-ch-press-scale=".97"`: that scale at any width (the width cap is for a row or a
 * bar that did not ask). Null: no opt-in, or a value that is not a scale.
 */
export function pressScaleOptIn(el: Element | null): number | null {
  const raw = el?.getAttribute('data-ch-press-scale');
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return n > 0 && n < 1 ? n : null;
}

/**
 * A finger's press waits this long before it shows (A12; MOTION-AND-VISUAL 3.2 and 3.8): a scroll that starts on a row or a
 * button cancels first, so it never flashes. The beat lives here only; the CSS token that delayed a row's tint is gone (3.2).
 */
export const PRESS_TOUCH_DELAY_MS = 50;
/** Every press shows for at least this long (3.8): a tap that lifts before the delay still flashes, as on iOS. The press beat. */
export const PRESS_TAP_SHOW_MS = CH_DUR_MS.press;
/** A touch that moves further than this before the delay is a scroll, not a press. */
const PRESS_SLOP_PX = 10;

/** What shows a pressed look (B6): anything a finger can press. It carries `data-ch-pressed` while held. */
const PRESSED_TARGET = '[data-ch-pressable],button,a,[role="button"]';

/** The wash's two beats (3.8): in over press on ease-out, out over release on the iOS curve. */
export const PRESS_WASH_IN: KeyframeAnimationOptions = { duration: CH_DUR_MS.press, easing: bezier(CH_EASE_OUT) };
export const PRESS_WASH_OUT: KeyframeAnimationOptions = { duration: CH_DUR_MS.release, easing: bezier(CH_EASE_IOS) };

/** Settings > Animations off, as ThemeScript marks it on <html>: the wash then flips, as every other change does. */
const animationsOff = () => document.documentElement.dataset.motion === 'off';

/**
 * The press controller (CH-1606, A12, B6; MOTION-AND-VISUAL 3.8), mounted once by the shell. On pointer down inside Clubhouse:
 *
 * - The pressed look: the control under the finger (a button, link, `[role=button]` or `[data-ch-pressable]`) carries
 *   `data-ch-pressed` while it is held, and styles draw their pressed look from it as well as `:active`. A finger's press
 *   waits 50ms and a move past 10px or a cancel drops it, so a scroll that starts on a row never presses it; a tap that
 *   lifts sooner still shows it, and every press shows for at least the press beat (110ms), so a quick tap is always
 *   acknowledged. This runs whatever the motion setting: it is a state, not a movement.
 * - The wash: a row, a menu item or an option (anything pressed that does not scale) paints `--ch-sel` from its pressed
 *   rule, and its background runs there over press (110ms, ease-out) and fades back over release (280ms, the iOS curve)
 *   from wherever it had got to. A colour, not a movement, so it runs under Reduce Motion; with Animations off it flips.
 * - The scale: a button (`.ch-btn`, `[data-ch-press]`, no wider than a button) goes to 0.97 over press (110ms, ease-out)
 *   and comes back over release (280ms, the iOS curve, no overshoot) from wherever it had got to. It animates the
 *   `scale` property, which composes with `transform` and `translate`, so it never fights framer-motion or a sheet drag.
 *   Skipped without `motion` (reduced motion, Animations off) and where the Web Animations API is missing.
 *
 * Disabled controls and anything inside `[data-ch-nopress]` take none of these.
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
    /** A released control whose pressed look is still showing out its minimum, and whether it washes. */
    let lingering: { target: HTMLElement; washes: boolean; timer: number } | null = null;
    /** The wash running on each control, so the next one starts from where it is. */
    const tweens = new WeakMap<HTMLElement, Animation>();

    /**
     * Marks or clears a control's pressed state. A control that washes runs its background from the colour it shows now
     * to the one the mark gives it; a CSS transition the mark starts on the background is cancelled, so this is the one.
     */
    const mark = (target: HTMLElement, pressed: boolean, washes: boolean) => {
      const tween = washes && !!target.animate && !animationsOff();
      const from = tween ? getComputedStyle(target).backgroundColor : '';
      tweens.get(target)?.cancel();
      tweens.delete(target);
      if (pressed) target.setAttribute('data-ch-pressed', '');
      else target.removeAttribute('data-ch-pressed');
      if (!tween) return;
      for (const a of target.getAnimations?.() ?? []) if ((a as CSSTransition).transitionProperty === 'background-color') a.cancel();
      const to = getComputedStyle(target).backgroundColor;
      if (!from || !to || from === to) return;
      tweens.set(target, target.animate([{ backgroundColor: from }, { backgroundColor: to }], pressed ? PRESS_WASH_IN : PRESS_WASH_OUT));
    };
    const unmark = () => {
      if (!lingering) return;
      window.clearTimeout(lingering.timer);
      mark(lingering.target, false, lingering.washes);
      lingering = null;
    };
    const press = ({ target, el, scale }: Press) => {
      unmark();
      // A control that scales is a button: its fill answers at once and the scale is its motion. Everything else washes.
      if (target) mark(target, true, !el);
      const anim = el && scales ? el.animate([{ scale: '1' }, { scale: String(scale) }], { duration: CH_DUR_MS.press, easing: bezier(CH_EASE_OUT), fill: 'forwards' }) : null;
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
      const optIn = pressScaleOptIn(el);
      if (optIn == null && width > PRESS_MAX_WIDTH) el = null;
      const p: Press = { target: off(target) ? null : target, el, scale: optIn ?? pressScale(width) };
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
      // A quick tap lifted before the delay: it still flashes its press for the press beat, then lets go.
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
    /** Brings the scale back at once; the pressed look stays out the press beat (unless the press was cancelled), then fades. */
    const release = (now = false) => {
      window.clearTimeout(tapTimer);
      if (!held) return;
      const { target, el, scale, anim, at } = held;
      held = null;
      if (target) {
        const left = now ? 0 : PRESS_TAP_SHOW_MS - (Date.now() - at);
        if (left > 0) lingering = { target, washes: !el, timer: window.setTimeout(unmark, left) };
        else mark(target, false, !el);
      }
      if (!el || !anim) return;
      // Back from where the press actually is: a release before the press finished starts from part-way. No overshoot (MOT-08).
      const current = parseFloat(getComputedStyle(el).scale);
      const fromScale = Number.isFinite(current) && current > 0 ? current : scale;
      el.animate([{ scale: String(fromScale) }, { scale: '1' }], { duration: CH_DUR_MS.release, easing: bezier(CH_EASE_IOS) });
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
