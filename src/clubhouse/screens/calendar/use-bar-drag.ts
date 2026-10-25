'use client';

/**
 * P-4 4.5: the engine for the week's all-day lane. A bar (an all-day event or a timed run over several days) drags
 * sideways by whole days and keeps every time; a grip at either end moves that end by days, keeping at least one day.
 * The days are read from the pointer against the lane's current rect, as the time grid reads its hours.
 * Alt+Left/Right moves a bar a day; Alt+Shift+Left/Right moves its last day.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { hapticScrub } from '../../lib/haptics';
import { isOffline } from '../../lib/use-action';
import { barSpan, columnAt, draggable, moveSpan, resizeSpan, type ChBarTarget } from './drag-model';
import type { ChCalEvent } from './model';
import { MOUSE_DRAG_PX } from './use-time-drag';

export interface ChBarDrag {
  e: ChCalEvent;
  to: ChBarTarget;
  edge?: 'from' | 'to';
}

export function useBarDrag(opts: {
  lane: RefObject<HTMLElement | null>;
  dates: string[];
  rail: number;
  coach: boolean;
  onDrop: (e: ChCalEvent, to: ChBarTarget) => void;
  onRefused?: (e: ChCalEvent, why: 'offline') => void;
}) {
  const [state, setState] = useState<ChBarDrag | null>(null);
  const live = useRef(opts);
  live.current = opts;
  const moved = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const start = useCallback((e: ChCalEvent, ev: PointerEvent<HTMLElement>, edge?: 'from' | 'to') => {
    if (ev.button !== 0 || ev.pointerType === 'touch') return;
    const lane = live.current.lane.current;
    if (!lane) return;
    if (edge) ev.stopPropagation();
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    const n = live.current.dates.length;
    const col0 = columnAt(x0, lane.getBoundingClientRect(), live.current.rail, n);
    const origin = barSpan(e);
    let started = false;
    let last: ChBarTarget | null = null;
    moved.current = false;
    const move = (m: globalThis.PointerEvent) => {
      if (!started) {
        if (Math.hypot(m.clientX - x0, m.clientY - y0) < MOUSE_DRAG_PX) return;
        moved.current = true;
        if (isOffline()) {
          finish();
          live.current.onRefused?.(e, 'offline');
          return;
        }
        started = true;
        hapticScrub('start');
      }
      const el = live.current.lane.current;
      if (!el) return;
      const days = columnAt(m.clientX, el.getBoundingClientRect(), live.current.rail, n) - col0;
      const to = edge ? resizeSpan(origin, edge, days) : moveSpan(origin, days);
      if (last && last.from === to.from && last.to === to.to) return;
      if (last) hapticScrub('step');
      last = to;
      setState({ e, to, edge });
    };
    const key = (k: globalThis.KeyboardEvent) => {
      if (k.key !== 'Escape') return;
      k.preventDefault();
      last = null;
      finish();
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      if (started) hapticScrub('end');
      stop.current = null;
      setState(null);
      window.setTimeout(() => (moved.current = false), 0);
    };
    const up = () => {
      const to = last;
      const did = started && to && (to.from !== origin.from || to.to !== origin.to);
      finish();
      if (did) live.current.onDrop(e, to!);
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
  }, []);

  const nudge = useCallback((e: ChCalEvent, ev: KeyboardEvent<HTMLElement>) => {
    if (!ev.altKey || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    ev.preventDefault();
    const dir = ev.key === 'ArrowLeft' ? -1 : 1;
    const span = barSpan(e);
    const to = ev.shiftKey ? resizeSpan(span, 'to', dir) : moveSpan(span, dir);
    if (to.from === span.from && to.to === span.to) return;
    live.current.onDrop(e, to);
  }, []);

  const bind = (e: ChCalEvent) =>
    draggable(e, opts.coach) === 'bar'
      ? {
          moved: () => moved.current,
          onPointerDown: (ev: PointerEvent<HTMLElement>) => start(e, ev),
          onKeyDown: (ev: KeyboardEvent<HTMLElement>) => nudge(e, ev),
          grip: (edge: 'from' | 'to') => (ev: PointerEvent<HTMLElement>) => start(e, ev, edge),
        }
      : undefined;
  return { state, bind };
}
