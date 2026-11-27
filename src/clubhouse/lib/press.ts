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
/**
 * A touch that moves further than this is a scroll or a drag, not a press: before the delay it never presses, and after
 * it the press lets go at once (dsx-08), as UIKit's highlight does when a scroll view takes the touch.
 */
export const PRESS_SLOP_PX = 10;

/**
 * What shows a pressed look (B6): anything a finger can press. It carries `data-ch-pressed` while held. One list for every
 * control, native or drawn by hand (dsx-08): a tab, an option, a menu item, a switch, a checkbox or radio drawn as a
 * `[role]`, a disclosure's `summary` and a label wrapping its field press exactly as a button does, so a page never needs
 * its own pressed rule or its own `:active` (which iOS paints on the first frame of a scroll).
 */
export const PRESSED_TARGET = [
  '[data-ch-pressable]',
  'button',
  'a',
  'summary',
  'label',
  ...['button', 'link', 'tab', 'option', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'switch', 'checkbox', 'radio', 'treeitem'].map((r) => `[role="${r}"]`),
].join(',');

/** The wash's two beats (3.8): in over press on ease-out, out over release on the iOS curve. */
export const PRESS_WASH_IN: KeyframeAnimationOptions = { duration: CH_DUR_MS.press, easing: bezier(CH_EASE_OUT) };
export const PRESS_WASH_OUT: KeyframeAnimationOptions = { duration: CH_DUR_MS.release, easing: bezier(CH_EASE_IOS) };

/** A colour as computed (`rgb()`, `rgba()` or `color(srgb …)`), as 0-255 channels and an alpha; null when it is none of these. */
export function parseColor(c: string): [number, number, number, number] | null {
  const m = /^rgba?\(([^)]+)\)$/.exec(c.trim());
  if (m) {
    const n = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    if (n.length < 3 || n.some((x) => !Number.isFinite(x))) return null;
    return [n[0]!, n[1]!, n[2]!, n[3] ?? 1];
  }
  const s = /^color\(srgb\s+([^)]+)\)$/.exec(c.trim());
  if (s) {
    const n = s[1]!.split(/[\s/]+/).filter(Boolean).map(Number);
    if (n.length < 3 || n.some((x) => !Number.isFinite(x))) return null;
    return [n[0]! * 255, n[1]! * 255, n[2]! * 255, n[3] ?? 1];
  }
  return null;
}
const luminance = ([r, g, b]: readonly number[]) => (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
const rgb = (c: readonly number[]) => `rgb(${c.slice(0, 3).map((x) => Math.round(x)).join(', ')})`;
const mix = (a: readonly number[], b: readonly number[], t: number) => a.slice(0, 3).map((x, i) => x + (b[i]! - x) * t);

/** How far a pressed control with no pressed rule of its own leans toward its own ink, on a surface the wash does not suit. */
export const PRESS_FALLBACK_INK = 0.08;
/** What a pressed SVG mark with no pressed rule of its own fades to, as iOS dims a pressed glyph. */
export const PRESS_FALLBACK_DIM = 0.6;

/**
 * The pressed colour for a control whose sheet draws none (dsx-08), from the surface it shows (`base`: its own fill, or
 * the first fill behind it), the linen wash `--ch-sel` and its own ink. On a surface of the wash's family (an ivory card
 * or the page in light, the dark plates in dark) it is the wash itself, the same colour a row takes; on any other surface
 * (a green feature card, a fill already the wash) the surface leans toward the control's ink, so a press reads on every
 * plate without painting linen on green. Null when the surface cannot be read.
 */
export function pressWashColor(base: string, sel: string, ink: string): string | null {
  const b = parseColor(base);
  if (!b) return null;
  const s = parseColor(sel);
  const i = parseColor(ink);
  const same = s && Math.max(...s.slice(0, 3).map((x, k) => Math.abs(x - b[k]!))) < 6;
  if (s && !same && Math.abs(luminance(s) - luminance(b)) < 0.15) return rgb(s);
  return i ? rgb(mix(b, i, PRESS_FALLBACK_INK)) : null;
}

/**
 * Pressed but already showing its chosen state: no fallback look. A selected segment, day or option does not answer a press
 * (by design), and a label wrapping a field leaves the field to answer.
 */
const NO_FALLBACK = [
  '[aria-selected="true"]',
  '[aria-pressed="true"]',
  '[aria-checked="true"]',
  '[aria-current]:not([aria-current="false"])',
  '.is-on',
  'label',
].join(',');

/** What ends a press outright: the browser taking the pointer, a drag, and a long press's menu (dsx-08). */
const CANCELS = ['pointercancel', 'dragstart', 'contextmenu'] as const;

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
 * - The cancel (dsx-08): a press ends with no linger the moment the touch becomes something else: the finger moves past
 *   10px, anything under it scrolls, the browser cancels the pointer, a long press opens a menu, or the page is left (app
 *   switch, lock). WebKit does not always send `pointercancel` when a scroll begins inside a nested scroller, so the move
 *   and the scroll are watched as well; the tap that becomes a scroll never leaves a row lit.
 *
 * Disabled controls and anything inside `[data-ch-nopress]` take none of these.
 */
export function useChPress(motion: boolean): void {
  useEffect(() => {
    if (typeof Element === 'undefined') return;
    const scales = motion && !!Element.prototype.animate;
    type Press = { target: HTMLElement | null; el: HTMLElement | null; scale: number };
    /** Where the pointer went down, so a move past the slop can end a press that is already showing (dsx-08). */
    type Origin = { x: number; y: number; id: number; touch: boolean };
    let held: (Press & Origin & { anim: Animation | null; at: number }) | null = null;
    /** A touch press waiting out its delay (A12): where it started, and the timer that will press it. */
    let pending: (Press & Origin & { timer: number }) | null = null;
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
      const probe = pressed && washes && !!target.animate && !target.matches(NO_FALLBACK);
      // A fallback still fading out from the last press lets go first, so this one reads the control at rest.
      if (probe) for (const a of target.getAnimations()) if (a.id === 'ch-press') a.cancel();
      const before = probe ? looks(target) : '';
      const had = probe ? running(target) : null;
      if (pressed) target.setAttribute('data-ch-pressed', '');
      else target.removeAttribute('data-ch-pressed');
      if (!pressed && fallbacks.has(target)) return letGo(target);
      // No sheet answered the mark (no colour changed, nothing started moving): the shared look stands in (dsx-08).
      if (probe && looks(target) === before && !moved(target, had!)) return stand(target);
      if (!tween) return;
      for (const a of target.getAnimations?.() ?? []) if ((a as CSSTransition).transitionProperty === 'background-color') a.cancel();
      const to = getComputedStyle(target).backgroundColor;
      if (!from || !to || from === to) return;
      tweens.set(target, target.animate([{ backgroundColor: from }, { backgroundColor: to }], pressed ? PRESS_WASH_IN : PRESS_WASH_OUT));
    };
    /** The fallback look running on each control, and the value it rests at. */
    const fallbacks = new Map<HTMLElement, { anim: Animation; prop: 'backgroundColor' | 'opacity'; rest: string }>();
    /** What a pressed rule could change: on the control and its `::before`/`::after`, its parent (a `:has()` rule), its first children (a thumb). */
    const looks = (t: HTMLElement) =>
      [[t], [t, '::before'], [t, '::after'], [t.parentElement], ...Array.from(t.children).slice(0, 8).map((n) => [n])]
        .map(([n, pseudo]) => {
          if (!n) return '';
          const c = getComputedStyle(n as Element, pseudo as string | undefined);
          return [c.backgroundColor, c.color, c.opacity, c.boxShadow, c.borderColor, c.outlineStyle, c.textDecorationLine, c.filter, c.scale, c.transform].join('|');
        })
        .join('/');
    const running = (t: HTMLElement) => new Set([...(t.getAnimations?.({ subtree: true }) ?? []), ...(t.parentElement?.getAnimations?.() ?? [])]);
    const moved = (t: HTMLElement, had: Set<Animation>) => [...running(t)].some((a) => !had.has(a) && a.id !== 'ch-press');
    /** The surface a control shows: its own fill, or the first one behind it. */
    const surface = (t: HTMLElement) => {
      for (let n: Element | null = t, k = 0; n && k < 16; n = n.parentElement, k++) {
        const bg = getComputedStyle(n).backgroundColor;
        const c = parseColor(bg);
        if (c && c[3] > 0.5) return bg;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    const stand = (t: HTMLElement) => {
      const c = getComputedStyle(t);
      const svg = t instanceof SVGElement;
      const prop = svg ? 'opacity' : 'backgroundColor';
      const rest = svg ? c.opacity : c.backgroundColor;
      const to = svg ? String((Number(rest) || 1) * PRESS_FALLBACK_DIM) : pressWashColor(surface(t), c.getPropertyValue('--ch-sel'), c.color);
      if (!to) return;
      const anim = t.animate([{ [prop]: rest }, { [prop]: to }], animationsOff() ? { duration: 0, fill: 'forwards' } : { ...PRESS_WASH_IN, fill: 'forwards' });
      anim.id = 'ch-press';
      fallbacks.set(t, { anim, prop, rest });
    };
    const letGo = (t: HTMLElement) => {
      const f = fallbacks.get(t)!;
      fallbacks.delete(t);
      const now = getComputedStyle(t)[f.prop];
      f.anim.cancel();
      if (!animationsOff() && now !== f.rest) t.animate([{ [f.prop]: now }, { [f.prop]: f.rest }], PRESS_WASH_OUT).id = 'ch-press';
    };
    const unmark = () => {
      if (!lingering) return;
      window.clearTimeout(lingering.timer);
      mark(lingering.target, false, lingering.washes);
      lingering = null;
    };
    const press = ({ target, el, scale }: Press, origin: Origin) => {
      unmark();
      // A control that scales is a button: its fill answers at once and the scale is its motion. Everything else washes.
      if (target) mark(target, true, !el);
      const anim = el && scales ? el.animate([{ scale: '1' }, { scale: String(scale) }], { duration: CH_DUR_MS.press, easing: bezier(CH_EASE_OUT), fill: 'forwards' }) : null;
      held = { target, el, scale, anim, at: Date.now(), ...origin };
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
      const origin: Origin = { x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType === 'touch' };
      // Mouse and pen press at once; a finger waits out the delay, as UIKit's delaysContentTouches does in a scroll view.
      if (!origin.touch) {
        press(p, origin);
        return;
      }
      pending = {
        ...p,
        ...origin,
        timer: window.setTimeout(() => {
          const at = pending;
          pending = null;
          if (at) press(at, at);
        }, PRESS_TOUCH_DELAY_MS),
      };
    };
    const strayed = (o: Origin, e: PointerEvent) => e.pointerId === o.id && Math.hypot(e.clientX - o.x, e.clientY - o.y) > PRESS_SLOP_PX;
    const move = (e: PointerEvent) => {
      if (pending && strayed(pending, e)) drop();
      // A touch already pressing that moves on is a scroll or a drag taking over (dsx-08): it lets go at once. A mouse
      // keeps its press while held, as a desktop button does, and loses it only if it leaves the control.
      if (held && strayed(held, e) && (held.touch || !held.target?.contains(e.target as Node))) cancel();
    };
    const up = (e: PointerEvent) => {
      // A quick tap lifted before the delay: it still flashes its press for the press beat, then lets go.
      if (pending && e.pointerId === pending.id) {
        const p = pending;
        drop();
        press(p, p);
        tapTimer = window.setTimeout(release, PRESS_TAP_SHOW_MS);
        return;
      }
      release();
    };
    const cancel = () => {
      drop();
      release(true);
    };
    /** Anything scrolling while a finger is down means the finger is scrolling (dsx-08); a mouse press survives a scroll. */
    const scrolled = () => {
      if (pending || held?.touch) cancel();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') cancel();
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
    const passive = { capture: true, passive: true } as const;
    document.addEventListener('pointerdown', down, passive);
    document.addEventListener('pointermove', move, passive);
    document.addEventListener('pointerup', up, passive);
    for (const t of CANCELS) document.addEventListener(t, cancel, passive);
    // Scroll does not bubble, so a nested scroller's scroll is caught on the way down.
    document.addEventListener('scroll', scrolled, passive);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', cancel);
    return () => {
      cancel();
      unmark();
      document.removeEventListener('pointerdown', down, passive);
      document.removeEventListener('pointermove', move, passive);
      document.removeEventListener('pointerup', up, passive);
      for (const t of CANCELS) document.removeEventListener(t, cancel, passive);
      document.removeEventListener('scroll', scrolled, passive);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', cancel);
    };
  }, [motion]);
}
