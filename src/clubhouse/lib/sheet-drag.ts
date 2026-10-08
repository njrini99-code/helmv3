'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { haptic } from './haptics';
import { CH_DUR, chSpringCurve } from './motion';

/** A drag down past this many pixels closes the sheet. */
export const CH_SHEET_CLOSE_PX = 80;
/** So does a flick faster than this (px per ms), once it has moved a little. */
const FLICK_PX_PER_MS = 0.5;
/** A finger that stops before it lets go is no longer flicking: its speed fades to nothing over this long. */
const FLICK_MAX_AGE_MS = 80;
/** The release speed is read over the last stretch of the drag, not from its last two events alone. */
const VELOCITY_WINDOW_MS = 60;
/** Past its open position the sheet gives like a UIKit rubber band, (1 − 1 / (x·c / d + 1))·d: firm, and never more than d. */
const BAND_C = 0.55;
const BAND_D = 100;
/** While a sheet is lifted, its own colour reaches this far below it, so no gap ever opens under it. */
const FLOOR_PX = 120;
/** A drag that starts in the body waits for this much travel, so taps and scrolls stay native. */
const BODY_SLOP_PX = 6;
/** The sheet claims a touch from the scroll (iOS can't hand it back) only once it has clearly gone this far down. */
const BODY_CLAIM_PX = 3;
/** …and never starts while the body is still settling from a scroll (Vaul's guard). */
const SCROLL_GUARD_MS = 100;
/** After a drag from the body, the tap it started as never lands on the row underneath. */
const CLICK_GUARD_MS = 300;
const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** How far the sheet moves for `over` pixels of finger past its open position. */
export function rubberBand(over: number): number {
  return (1 - 1 / ((over * BAND_C) / BAND_D + 1)) * BAND_D;
}

/** The finger travel that put the sheet `shown` pixels past its open position. */
function unband(shown: number): number {
  return shown >= BAND_D ? 4 * BAND_D : (BAND_D / BAND_C) * (1 / (1 - shown / BAND_D) - 1);
}

const flings = new WeakMap<Element, { speed: number; at: number }>();
/** A throw is handed to the exit that follows it; one whose close was refused (unsaved changes) lapses after this. */
const FLING_TTL_MS = 1000;

/**
 * The speed (px per ms, toward closing) of the drag that just closed this sheet, so the throw carries on into the
 * close; 0 when it wasn't thrown. A framer exit reads it with `peek` (framer resolves an exit variant more than once);
 * lib/dialog-lifetime.ts takes it, since a dialog stays mounted and is thrown again later.
 */
export function takeSheetFling(el: Element | null | undefined, { peek = false }: { peek?: boolean } = {}): number {
  const fling = el ? flings.get(el) : undefined;
  if (!el || !fling) return 0;
  if (!peek) flings.delete(el);
  return performance.now() - fling.at <= FLING_TTL_MS ? fling.speed : 0;
}

/** Whether CSS `linear()` easing runs here (Safari 17.2, Chrome 113): the springs below need it, else a curve stands in. */
export function chSupportsLinear(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('transition-timing-function', 'linear(0, 1)');
}

/** The sheet's offset now, mid spring-back included, so a new drag takes it from where it is. */
function offsetNow(el: HTMLElement, direction: 'down' | 'left'): number {
  const parts = getComputedStyle(el).translate.split(' ').map(parseFloat);
  const v = direction === 'left' ? -(parts[0] ?? 0) : (parts[1] ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/**
 * The sheet's speed toward closing as the finger lets go: over the last stretch of the drag, fading with the time since
 * the finger last moved (a still finger sends no moves), and 0 once it has come to rest.
 */
export function releaseSpeed(samples: ReadonlyArray<readonly [number, number]>, now: number): number {
  const last = samples[samples.length - 1];
  const prev = samples[samples.length - 2];
  if (!last || !prev || now - last[0] > FLICK_MAX_AGE_MS) return 0;
  // Held still for a frame or more before letting go: no longer moving.
  if (last[0] - prev[0] >= 16 && Math.abs(last[1] - prev[1]) < 1) return 0;
  let first = prev;
  for (let i = samples.length - 2; i >= 0; i--) {
    const age = last[0] - samples[i]![0];
    if (age < 0 || age > VELOCITY_WINDOW_MS) break;
    first = samples[i]!;
  }
  const dt = last[0] - first[0];
  const fade = 1 - Math.max(0, now - last[0]) / FLICK_MAX_AGE_MS;
  return dt > 0 ? ((last[1] - first[1]) / dt) * fade : 0;
}

/** An exit starts on the frame after it is asked for; a thrown sheet has already travelled that frame at its speed. */
const EXIT_LEAD_MS = 16;

/**
 * The close after a throw (CH-1611): the smooth spring over `travel` pixels (to out of sight), starting at the throw's
 * `speed` (px per ms), and `lead`, how far the sheet has already gone in the frame the exit waits for, so it never
 * stalls between the finger and the close. The curve ends within a pixel of the mark.
 */
export function chThrownExit(speed: number, travel: number): { lead: number; ms: number; ease: (p: number) => number; linear: string } {
  const lead = Math.min(travel / 4, Math.max(0, speed) * EXIT_LEAD_MS);
  const left = Math.max(1, travel - lead);
  return { lead, ...chSpringCurve('smooth', { velocity: (Math.max(0, speed) * 1000) / left, rest: 1 / left }) };
}

/**
 * A phone sheet follows the finger down, and closes past 80px or on a quick flick with the medium settle haptic;
 * let go sooner and it springs back on the smooth spring, starting at the speed it was moving, and a finger can catch
 * it on the way. Pulled up past its open position it gives like a rubber band, its own colour reaching under it, and
 * thrown back up hard it carries on a little past that position over the same floor. Its body drags it too, once that is
 * scrolled to the top and the finger's first move is down; a scroll, a sideways move or a tap stays the body's, and
 * the row a drag started on doesn't open. A closing throw hands its speed to the exit (takeSheetFling). With reduced
 * motion there is no drag (pass `enabled: false`); Close, the scrim and Esc still close it. CH-1611.
 *
 * The sheet moves by the CSS `translate` property, which composes with the `transform` its open and close
 * animations use, so a closing sheet leaves from where the finger let go. Spread the returned handler on the parts
 * that always start a drag (the grab and the header, with `touch-action: none` there); a press on a control inside
 * them is left alone.
 */
export function useSheetDrag(sheet: RefObject<HTMLElement | null>, onClose: () => void, { enabled = true, direction = 'down' }: { enabled?: boolean; direction?: 'down' | 'left' } = {}) {
  const stop = useRef<(() => void) | null>(null);
  const settling = useRef<(() => void) | null>(null);
  const fromBody = useRef(false);
  /** The grab and header this sheet's handler is spread on: the body never starts a drag inside them. */
  const handles = useRef(new WeakSet<Element>());
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  // A sheet that mounts only while open (More, the bell) arrives after the hook: follow the element itself. It runs
  // after every render on purpose, since a ref changing is no dependency React can see; it settles once it matches.
  const [host, setHost] = useState<HTMLElement | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- see above: no list can name the element's arrival
  useLayoutEffect(() => {
    if (sheet.current !== host) setHost(sheet.current);
  });
  useEffect(() => {
    if (!enabled) {
      stop.current?.();
      settling.current?.();
      if (sheet.current) sheet.current.style.translate = '';
    }
    return () => {
      stop.current?.();
      settling.current?.();
    };
  }, [enabled, sheet]);

  const begin = useCallback(
    (el: HTMLElement, pointerId: number, at: number, timeStamp: number, capture: Element | null) => {
      const coordinate = (event: { clientX: number; clientY: number }) => (direction === 'left' ? -event.clientX : event.clientY);
      flings.delete(el);
      const shown = settling.current ? offsetNow(el, direction) : 0;
      settling.current?.();
      // Mid spring-back above its open position, the finger takes it from where the band had it.
      const from = shown >= 0 ? shown : -unband(-shown);
      let floored = false;
      /** Above its open position: the sheet's own colour reaches under it, so no gap opens at the foot of the screen. */
      const floor = () => {
        if (floored) return;
        floored = true;
        const face = [el, el.firstElementChild].find((n): n is Element => !!n && getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)');
        const shadow = getComputedStyle(el).boxShadow;
        // First in the list, so the sheet's own elevation blur never draws a seam across it.
        el.style.boxShadow = `0 ${FLOOR_PX}px 0 ${face ? getComputedStyle(face).backgroundColor : 'var(--ch-sheet-bg)'}${shadow && shadow !== 'none' ? `, ${shadow}` : ''}`;
      };
      const put = (offset: number) => {
        if (offset < 0 && direction === 'down') floor();
        el.style.translate = direction === 'left' ? `${-offset}px 0` : `0 ${offset}px`;
      };
      el.style.transition = 'none';
      // Caught mid spring-back, it stays under the finger (dropping its transition would jump it to rest).
      if (shown) put(shown);
      let dy = shown;
      const samples: Array<[number, number]> = [[timeStamp, dy]];
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const raw = from + coordinate(ev) - at;
        // Only a sheet rising from the bottom has a floor to stretch over; a drawer stops at its open edge.
        dy = raw >= 0 ? raw : direction === 'down' ? -rubberBand(-raw) : 0;
        put(dy);
        samples.push([ev.timeStamp, dy]);
        if (samples.length > 12) samples.shift();
      };
      const springBack = (speed: number) => {
        let timer = 0;
        const settle = () => {
          window.clearTimeout(timer);
          el.removeEventListener('transitionend', onEnd);
          if (floored) el.style.boxShadow = '';
          settling.current = null;
        };
        const onEnd = (e: TransitionEvent) => {
          if (e.target === el && e.propertyName === 'translate') settle();
        };
        let ms = CH_DUR.release * 1000;
        if (Math.abs(dy) >= 0.5 && chSupportsLinear()) {
          // Toward rest from wherever it is, at the speed it was moving (progress per second), cut within half a pixel.
          // Thrown back hard, a sheet carries on past its open position as when pulled there, over its floor; a drawer
          // stops at its open edge, so thrown back too hard to stop there it starts slower instead.
          const curve = chSpringCurve('smooth', { velocity: (-speed * 1000) / dy, rest: 0.5 / Math.abs(dy), hold: direction === 'left' });
          if (direction === 'down' && dy > 0 && Array.from({ length: 49 }, (_, i) => curve.ease(i / 48)).some((p) => p > 1)) floor();
          ms = curve.ms;
          el.style.transition = `translate ${curve.ms}ms ${curve.linear}`;
        } else {
          el.style.transition = 'translate var(--ch-dur-release) var(--ch-ease)';
        }
        el.style.translate = '';
        el.addEventListener('transitionend', onEnd);
        timer = window.setTimeout(settle, ms + 80);
        settling.current = settle;
      };
      const end = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        stop.current?.();
        const speed = releaseSpeed(samples, ev.timeStamp);
        if (ev.type === 'pointerup' && (dy > CH_SHEET_CLOSE_PX || (dy > 10 && speed > FLICK_PX_PER_MS))) {
          if (floored) el.style.boxShadow = '';
          flings.set(el, { speed: Math.max(0, speed), at: performance.now() });
          haptic('commit');
          close.current();
          return;
        }
        springBack(speed);
      };
      stop.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        if (capture?.hasPointerCapture?.(pointerId)) capture.releasePointerCapture(pointerId);
        stop.current = null;
        fromBody.current = false;
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [direction],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      handles.current.add(e.currentTarget);
      const el = sheet.current;
      if (!enabled || !el || el.closest('[data-closing]') || e.button !== 0) return;
      if (e.isPrimary === false || stop.current) return;
      if ((e.target as Element).closest('button, a, input, textarea, select')) return;
      if (typeof e.pointerId === 'number') e.currentTarget.setPointerCapture?.(e.pointerId);
      begin(el, e.pointerId, direction === 'left' ? -e.clientX : e.clientY, e.timeStamp, e.currentTarget);
    },
    [sheet, enabled, direction, begin],
  );

  // The body: a press there drags the sheet once the content under it is at the top and the finger's first move is down.
  useEffect(() => {
    const el = host;
    if (!enabled || !el || direction !== 'down') return;
    let pending: { id: number; x: number; y: number; target: Element } | null = null;
    let scrolledAt = -Infinity;
    let guard: ((c: MouseEvent) => void) | null = null;
    const unguard = () => {
      if (guard) window.removeEventListener('click', guard, { capture: true });
      guard = null;
    };
    const inside = (target: Element, test: (n: Element) => boolean) => {
      for (let n: Element | null = target; n; n = n === el ? null : n.parentElement) if (test(n)) return true;
      return false;
    };
    const down = (e: PointerEvent) => {
      pending = null;
      if (stop.current || e.button !== 0 || e.isPrimary === false || el.closest('[data-closing]')) return;
      const target = e.target as Element;
      if (target.closest(TEXT_ENTRY) || inside(target, (n) => n.scrollTop > 0) || performance.now() - scrolledAt < SCROLL_GUARD_MS) return;
      pending = { id: e.pointerId, x: e.clientX, y: e.clientY, target };
    };
    const move = (e: PointerEvent) => {
      if (!pending || e.pointerId !== pending.id) return;
      // The grab or the header owns this press (their handler runs after this listener, so check on the first move).
      if (stop.current || inside(pending.target, (n) => handles.current.has(n))) {
        pending = null;
        return;
      }
      const dx = e.clientX - pending.x;
      const dy = e.clientY - pending.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < BODY_SLOP_PX) return;
      pending = null;
      if (dy <= 0 || Math.abs(dx) > dy) return;
      fromBody.current = true;
      unguard();
      guard = (c: MouseEvent) => {
        c.preventDefault();
        c.stopPropagation();
        unguard();
      };
      window.addEventListener('click', guard, { capture: true });
      begin(el, e.pointerId, e.clientY, e.timeStamp, null);
    };
    const up = (e: PointerEvent) => {
      if (pending && e.pointerId === pending.id) pending = null;
      if (guard) window.setTimeout(unguard, CLICK_GUARD_MS);
    };
    // A downward move at the top belongs to the sheet, not to an overscroll: claim it before the browser starts panning
    // (within iOS's own slop), but not on a pixel or two of jitter at the start of a scroll up.
    const touchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !e.cancelable) return;
      const down = pending ? t.clientY - pending.y : 0;
      if (fromBody.current || (pending && down >= BODY_CLAIM_PX && down >= Math.abs(t.clientX - pending.x))) e.preventDefault();
    };
    const scrolled = () => {
      scrolledAt = performance.now();
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('touchmove', touchMove, { passive: false });
    el.addEventListener('scroll', scrolled, { capture: true, passive: true });
    return () => {
      unguard();
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('touchmove', touchMove);
      el.removeEventListener('scroll', scrolled, { capture: true });
    };
  }, [host, enabled, direction, begin]);

  return { onPointerDown };
}
