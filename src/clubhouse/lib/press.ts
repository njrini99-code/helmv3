'use client';

import { useEffect } from 'react';
import { CH_DUR_MS, CH_EASE_IOS, CH_EASE_OUT } from './motion';
import { pressRules, sheetAnswersPress } from './press-rules';

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

type Rgba = [number, number, number, number];
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** A colour function's arguments: split on commas, spaces and the alpha's `/`. */
const args = (body: string) => body.trim().split(/\s*[,/]\s*|\s+/).filter(Boolean);
/** One argument: a number, a percentage of `full`, or `none` (zero). NaN when it is none of these. */
const arg = (s: string, full: number) => (s === 'none' ? 0 : s.endsWith('%') ? (Number(s.slice(0, -1)) / 100) * full : Number(s));
/** A hue in degrees, from a bare number or one with its unit. NaN when it is neither. */
const hue = (s: string) => {
  if (s === 'none') return 0;
  const m = /^(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$/.exec(s);
  if (!m) return NaN;
  const n = Number(m[1]);
  return m[2] === 'grad' ? n * 0.9 : m[2] === 'rad' ? (n * 180) / Math.PI : m[2] === 'turn' ? n * 360 : n;
};
/** Linear light to the sRGB curve, 0-1. */
const encode = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
/** OKLab to sRGB 0-255 (Björn Ottosson's matrices), clipped to the sRGB gamut. */
const fromOklab = (L: number, a: number, b: number) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return linear.map((x) => clamp(encode(x), 0, 1) * 255);
};
/** Three 0-255 channels and the alpha as written (absent: opaque), or null when any of them is not a number. */
const rgba = (c: readonly number[], alpha: string | undefined): Rgba | null => {
  const a = alpha === undefined ? 1 : arg(alpha, 1);
  if (c.length !== 3 || ![...c, a].every(Number.isFinite)) return null;
  return [clamp(c[0]!, 0, 255), clamp(c[1]!, 0, 255), clamp(c[2]!, 0, 255), clamp(a, 0, 1)];
};

/**
 * A colour as 0-255 sRGB channels and an alpha, from every form one reaches this file in. A colour property comes back
 * from getComputedStyle as `rgb()`/`rgba()`, or as `color(srgb …)` for a `color-mix(in srgb …)` and `oklab()` for a
 * `color-mix(in oklab …)` (both used across the sheets), or `oklch()`. A custom property comes back as its token was
 * written, which is how `--ch-sel` arrives: a hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) or `transparent`. Null for
 * anything else (`currentcolor`, a gradient, a `color-mix()` left unresolved), so a press never paints from a colour it
 * misread.
 */
export function parseColor(input: string): Rgba | null {
  const c = input.trim().toLowerCase();
  if (c === 'transparent') return [0, 0, 0, 0];
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.exec(c);
  if (hex) {
    const h = hex[1]!;
    const [r, g, b, a] = (h.length <= 4 ? Array.from(h, (d) => d + d) : h.match(/../g)!).map((p) => parseInt(p, 16));
    return [r!, g!, b!, a === undefined ? 1 : a / 255];
  }
  const fn = /^([a-z-]+)\(([^()]*)\)$/.exec(c);
  if (!fn) return null;
  const name = fn[1]!;
  const p = args(fn[2]!);
  if (name === 'color') {
    const space = p.shift();
    if ((space !== 'srgb' && space !== 'srgb-linear') || p.length < 3 || p.length > 4) return null;
    return rgba(p.slice(0, 3).map((x) => (space === 'srgb' ? arg(x, 1) : encode(arg(x, 1))) * 255), p[3]);
  }
  if (p.length < 3 || p.length > 4) return null;
  if (name === 'rgb' || name === 'rgba') return rgba(p.slice(0, 3).map((x) => arg(x, 255)), p[3]);
  if (name === 'oklab' || name === 'oklch') {
    // Lightness runs 0-1 (100%); a, b and chroma read 100% as 0.4 (CSS Color 4).
    const L = arg(p[0]!, 1);
    const one = arg(p[1]!, 0.4);
    const two = name === 'oklab' ? arg(p[2]!, 0.4) : hue(p[2]!);
    const [a, b] = name === 'oklab' ? [one, two] : [one * Math.cos((two * Math.PI) / 180), one * Math.sin((two * Math.PI) / 180)];
    if (![L, a, b].every(Number.isFinite)) return null;
    return rgba(fromOklab(L, a, b), p[3]);
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
 *   from wherever it had got to, to the colour the sheet gives it then. A colour, not a movement, so it runs under Reduce
 *   Motion; with Animations off it flips.
 * - The shared look (dsx-08): a control whose sheet draws no pressed look takes the wash, or on a plate the wash does
 *   not suit leans toward its own ink, the same way. A sheet that draws one anywhere (on the control, a sibling or an
 *   ancestor's layer through `:has()`) keeps it alone, and a bare hit area laid over its content takes none.
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
      if (probe) for (const a of target.getAnimations?.() ?? []) if (a.id === 'ch-press') a.cancel();
      const before = probe ? looks(target) : '';
      const had = probe ? running(target) : null;
      if (pressed) target.setAttribute('data-ch-pressed', '');
      else target.removeAttribute('data-ch-pressed');
      if (!pressed && fallbacks.has(target)) return letGo(target);
      // No sheet answered the mark (no colour changed, nothing started moving, and no pressed rule matches because of it,
      // as a `:has()` rule lighting a sibling or an ancestor's layer would): the shared look stands in (dsx-08).
      if (probe && looks(target) === before && !moved(target, had!) && !sheetAnswersPress(target)) return stand(target);
      if (!tween) return;
      for (const a of target.getAnimations?.() ?? []) if ((a as CSSTransition).transitionProperty === 'background-color') a.cancel();
      const to = getComputedStyle(target).backgroundColor;
      if (!from || !to || from === to) return;
      const wash = pressed ? target.animate([{ backgroundColor: from }, { backgroundColor: to }], PRESS_WASH_IN) : fadeBack(target, 'backgroundColor', from);
      if (wash) tweens.set(target, wash);
    };
    /**
     * Runs a property back from `from` over release to wherever the sheet puts it now, not to a colour read earlier: the
     * end keyframe is left open, so it is the live value under the animation. A control whose state changes as it is let go
     * (a day toggle turning on, a selection) fades to its new look instead of to its old one and then snapping. An engine
     * that cannot leave the end open skips the fade, and the sheet's colour shows at once.
     */
    const fadeBack = (t: HTMLElement, prop: 'backgroundColor' | 'opacity', from: string): Animation | null => {
      try {
        return t.animate([{ [prop]: from, offset: 0 }], PRESS_WASH_OUT);
      } catch {
        return null;
      }
    };
    /** The fallback look running on each control. */
    const fallbacks = new Map<HTMLElement, { anim: Animation; prop: 'backgroundColor' | 'opacity' }>();
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
    /**
     * A hit area laid over what it opens (out of the flow, with nothing of its own inside, as a step's open button sits over
     * its row): a fill on it would cover the very content it stands for, so it takes no shared look.
     */
    const laidOver = (t: HTMLElement, c: CSSStyleDeclaration) => (c.position === 'absolute' || c.position === 'fixed') && !t.firstElementChild && !t.textContent?.trim();
    const stand = (t: HTMLElement) => {
      const c = getComputedStyle(t);
      const svg = t instanceof SVGElement;
      if (!svg && laidOver(t, c)) return;
      const prop = svg ? 'opacity' : 'backgroundColor';
      const rest = svg ? c.opacity : c.backgroundColor;
      const to = svg ? String((Number(rest) || 1) * PRESS_FALLBACK_DIM) : pressWashColor(surface(t), c.getPropertyValue('--ch-sel'), c.color);
      if (!to) return;
      const anim = t.animate([{ [prop]: rest }, { [prop]: to }], animationsOff() ? { duration: 0, fill: 'forwards' } : { ...PRESS_WASH_IN, fill: 'forwards' });
      anim.id = 'ch-press';
      fallbacks.set(t, { anim, prop });
    };
    /** Lets the shared look go: from where it shows now back to the control's look at rest as the sheet draws it now. */
    const letGo = (t: HTMLElement) => {
      const f = fallbacks.get(t)!;
      fallbacks.delete(t);
      const now = getComputedStyle(t)[f.prop];
      f.anim.cancel();
      // Read at release, with the look gone: the colour the control rests at now, which a toggle may just have changed.
      const rest = getComputedStyle(t)[f.prop];
      if (animationsOff() || now === rest) return;
      const back = fadeBack(t, f.prop, now);
      if (back) back.id = 'ch-press';
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
    // The sheets' pressed rules are read once while the page is idle, so the first press does not wait on them.
    const idle = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(() => void pressRules(document)) : 0;
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
      if (idle) window.cancelIdleCallback(idle);
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
