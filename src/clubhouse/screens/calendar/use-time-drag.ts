'use client';

/**
 * P-4: the pointer engine for the desktop time grid (Week and Day). A coach presses an event and moves 5px: the event
 * becomes its footprint and the card, snapped to the quarter it would land on, glides there; the pill rides on it. A
 * grip on the top or bottom edge changes only that edge. Alt gives 5-minute steps; Escape cancels; near the canvas's
 * top or bottom the grid scrolls, and at the grid's last (or first) hour it grows an hour every 400ms up to 24:00.
 *
 * The time is read from the pointer against the grid's current rect on every move, scroll and auto-scroll step (P-4
 * changelog), so a scroll mid-drag moves the time with it. React state changes only when the landing (a new quarter,
 * day or clash) does; the pointer itself lives in refs.
 *
 * Touch on this layout (an iPad, a phone in landscape) is P-4 slice 7's: a press with a touch pointer is left to the
 * peek here.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { hapticScrub } from '../../lib/haptics';
import { chDragScrollBy, chDragScroller } from '../../lib/smooth-scroll';
import { isOffline } from '../../lib/use-action';
import { autoScrollStep, clashesAt, columnAt, draggable, FINE_SNAP_H, hourAt, MIN_LEN_H, moveTarget, resizeTarget, SNAP_H, type ChMoveTarget } from './drag-model';
import { addDays, type ChCalEvent } from './model';

export type ChDragKind = 'move' | 'resize';

export interface ChTimeDrag {
  e: ChCalEvent;
  to: ChMoveTarget;
  kind: ChDragKind;
  edge?: 'start' | 'end';
  pointer: 'mouse' | 'touch';
  clashes: Set<string>;
}

/** The mouse threshold before a press becomes a drag (GES-1's 10px is for touch). */
export const MOUSE_DRAG_PX = 5;
/** Auto-scroll zone at the canvas's top and bottom on desktop. */
export const DESK_ZONE_PX = 56;
/** One more hour every this long while the card holds the grid's edge. */
export const GROW_MS = 400;
/** Ticks no closer than this on top of haptics' own floor (a fast drag through an hour gives a few, not one a frame). */
const TICK_MS = 80;

export interface UseTimeDragOptions {
  grid: RefObject<HTMLElement | null>;
  dates: string[];
  bounds: { from: number; to: number };
  hourPx: number;
  /** The hour rail's width in px, left of the first column. */
  rail: number;
  events: ChCalEvent[];
  coach: boolean;
  onDrop: (e: ChCalEvent, to: ChMoveTarget, kind: ChDragKind) => void;
  onRefused?: (e: ChCalEvent, why: 'offline') => void;
  /** Ask the grid for one more hour on an edge; true when it added one. */
  onGrow?: (edge: 'before' | 'after') => boolean;
}

const same = (a: ChMoveTarget | null, b: ChMoveTarget | null) => !!a && !!b && a.date === b.date && a.start === b.start && a.end === b.end;

export function useTimeDrag(opts: UseTimeDragOptions) {
  const [state, setState] = useState<ChTimeDrag | null>(null);
  const live = useRef(opts);
  live.current = opts;
  /** True from the 5px threshold until the click that follows the release has been swallowed. */
  const moved = useRef(false);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);

  const start = useCallback((e: ChCalEvent, ev: PointerEvent<HTMLElement>, kind: ChDragKind, edge?: 'start' | 'end') => {
    if (ev.button !== 0 || ev.pointerType === 'touch') return;
    const o = live.current;
    const grid = o.grid.current;
    if (!grid || e.start == null || e.end == null) return;
    if (kind === 'resize') ev.stopPropagation();
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    const r0 = grid.getBoundingClientRect();
    const grabH = hourAt(y0, r0.top, o.hourPx, o.bounds.from) - e.start;
    const origin: ChMoveTarget = { date: e.date, start: e.start, end: e.end };
    const at = { x: x0, y: y0, alt: ev.altKey };
    let started = false;
    let last: ChMoveTarget | null = null;
    let lastTick = 0;
    let raf = 0;
    let frameAt = 0;
    let grewAt = 0;
    moved.current = false;

    const place = () => {
      const g = live.current;
      const el = g.grid.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const step = at.alt ? FINE_SNAP_H : SNAP_H;
      const h = hourAt(at.y, rect.top, g.hourPx, g.bounds.from);
      let to: ChMoveTarget;
      if (kind === 'move') {
        const col = columnAt(at.x, rect, g.rail, g.dates.length);
        to = { date: g.dates[col] ?? e.date, ...moveTarget(origin, h, grabH, g.bounds, step) };
      } else {
        to = { date: e.date, ...resizeTarget(origin, edge!, h, g.bounds, step) };
      }
      if (same(to, last)) return;
      const clashes = clashesAt(e, to, g.events);
      const now = performance.now();
      if (last && now - lastTick >= TICK_MS) {
        hapticScrub('step');
        lastTick = now;
      }
      last = to;
      setState({ e, to, kind, edge, pointer: 'mouse', clashes });
    };

    // Auto-scroll and grid growth: a frame loop while the pointer is in a zone.
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = frameAt ? t - frameAt : 16;
      frameAt = t;
      const g = live.current;
      const el = g.grid.current;
      if (!el) return;
      const scroller = chDragScroller();
      const sr = scroller === document.documentElement || scroller === document.body ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
      // The zone starts under the sticky week header, not under the canvas's top.
      const head = el.closest('.ch-wk')?.querySelector('.ch-wk__top')?.getBoundingClientRect().bottom ?? sr.top;
      const top = Math.max(sr.top, head);
      const bottom = sr.bottom;
      let dy = 0;
      if (at.y < top + DESK_ZONE_PX) dy = -autoScrollStep(at.y - top, DESK_ZONE_PX, dt);
      else if (at.y > bottom - DESK_ZONE_PX) dy = autoScrollStep(bottom - at.y, DESK_ZONE_PX, dt);
      if (!dy) return;
      const before = scroller.scrollTop;
      chDragScrollBy(dy);
      const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      const atTop = scroller.scrollTop <= 0;
      if (g.onGrow && last && t - grewAt >= GROW_MS) {
        if (dy > 0 && atEnd && last.end >= g.bounds.to && g.bounds.to < 24 && g.onGrow('after')) grewAt = t;
        else if (dy < 0 && atTop && last.start <= g.bounds.from && g.bounds.from > 0 && g.onGrow('before')) {
          grewAt = t;
          // The hour lands above the visible top: hold the view where it was, in the same layout pass.
          chDragScrollBy(g.hourPx, { immediate: true });
        }
      }
      if (scroller.scrollTop !== before) place();
    };

    const move = (m: globalThis.PointerEvent) => {
      at.x = m.clientX;
      at.y = m.clientY;
      at.alt = m.altKey;
      if (!started) {
        if (Math.hypot(m.clientX - x0, m.clientY - y0) < MOUSE_DRAG_PX) return;
        if (isOffline()) {
          // Refused at the threshold: no footprint, and the click that follows doesn't open it either.
          moved.current = true;
          finish();
          live.current.onRefused?.(e, 'offline');
          return;
        }
        started = true;
        moved.current = true;
        hapticScrub('start');
        raf = requestAnimationFrame(frame);
      }
      place();
    };
    const key = (k: globalThis.KeyboardEvent) => {
      if (k.key === 'Escape') {
        k.preventDefault();
        last = null;
        finish();
        return;
      }
      if (k.key === 'Alt' && started) {
        at.alt = k.type === 'keydown';
        place();
      }
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', key, true);
      cancelAnimationFrame(raf);
      if (started) hapticScrub('end');
      stop.current = null;
      setState(null);
      // The click that follows this pointerup still sees `moved`; clear it after.
      window.setTimeout(() => (moved.current = false), 0);
    };
    const up = () => {
      const to = last;
      const did = started && to && !same(to, origin);
      finish();
      if (did) live.current.onDrop(e, to!, kind);
    };
    const cancel = () => {
      last = null;
      finish();
    };
    stop.current = cancel;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', key, true);
  }, []);

  /** Alt with the arrows (P-4 6.2): 15 minutes, a day, or (with Shift) the end; each one a held move that coalesces. */
  const nudge = useCallback((e: ChCalEvent, ev: KeyboardEvent<HTMLElement>): boolean => {
    if (!ev.altKey || e.start == null || e.end == null) return false;
    const { onDrop } = live.current;
    const q = SNAP_H;
    let to: ChMoveTarget | null = null;
    let kind: ChDragKind = 'move';
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      const dir = ev.key === 'ArrowUp' ? -1 : 1;
      if (ev.shiftKey) {
        const end = e.end + dir * q;
        if (end - e.start < MIN_LEN_H || end > 24) return true;
        to = { date: e.date, start: e.start, end };
        kind = 'resize';
      } else {
        if (e.start + dir * q < 0 || e.end + dir * q > 24) return true;
        to = { date: e.date, start: e.start + dir * q, end: e.end + dir * q };
      }
    } else if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && !ev.shiftKey) {
      const date = addDays(e.date, ev.key === 'ArrowLeft' ? -1 : 1);
      // A day off the grid's visible days still moves (focus follows it into the next week by id).
      to = { date, start: e.start, end: e.end };
    }
    if (!to) return false;
    ev.preventDefault();
    onDrop(e, to, kind);
    return true;
  }, []);

  /** The props an event block takes, or none when this viewer can't move it in time. */
  const bind = (e: ChCalEvent) =>
    draggable(e, opts.coach) === 'timed' && !e.span
      ? {
          moved: () => moved.current,
          onPointerDown: (ev: PointerEvent<HTMLElement>) => start(e, ev, 'move'),
          onKeyDown: (ev: KeyboardEvent<HTMLElement>) => nudge(e, ev),
          grip: (edge: 'start' | 'end') => (ev: PointerEvent<HTMLElement>) => start(e, ev, 'resize', edge),
        }
      : undefined;

  return { state, bind, cancel: () => stop.current?.() };
}
