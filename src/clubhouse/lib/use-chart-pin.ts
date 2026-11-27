'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { hapticScrub } from './haptics';

/**
 * One interaction for every stats chart (decisions Q2, Q12, Q13): the pointer over a mark, or an arrow key, reads it in the
 * chart's header line; a tap or click pins it (and again to let go); Esc, or a press anywhere outside, clears the pin. The
 * header line is an aria-live region that speaks only for a pin or a key, never for a hover, so a pointer drifting across a
 * chart does not flood a screen reader.
 *
 * `count` is how many marks the chart has. `axis` says which arrow keys step: 'y' for a list of rows, 'x' for a line of
 * columns. Marks are bound with `item(i)`; the chart's container takes `container`.
 *
 * A chart drawn as one surface (a line of rounds) binds `area` to its plot instead: a mouse over it reads the nearest column,
 * a finger dragged sideways after about 8 px (and mostly sideways) scrubs, a release after a drag keeps the last column
 * pinned, a tap pins the nearest. The plot's `touch-action: pan-y` lets a vertical swipe scroll the page, which cancels a
 * scrub. `inset` is the plot's share of the element's width, as [from, to] fractions (the axis labels sit outside it).
 *
 * A scrub ticks under the finger like a slider's detents (B5): 'start' warms the Taptic Engine as the scrub begins, a
 * 'step' for each point it reads (the first included, so three points give three ticks), 'end' on release or cancel.
 * Every chart that binds `area` ticks; a hover and a tap do not, and the arrow keys tick only on a press-and-read chart.
 *
 * `options.release: 'restore'` is the press-and-read chart (the Stats scoring feature chart, fidelity spec 08 criteria 68 and
 * 109): a mouse press reads at once, a finger held still for `options.hold` ms reads the round under it, and lifting, a cancel,
 * or leaving the chart for something else lets go of everything, so the card goes back to its average. A tap reads nothing.
 * Both modes share one scrub: the same sideways threshold, the same nearest-point pick and the same ticks.
 */
export const SCRUB_START_PX = 8;

export interface ChartPinOptions {
  /** 'keep' (default): a drag leaves its last point pinned and a tap toggles one. 'restore': lifting lets go. */
  release?: 'keep' | 'restore';
  /** With a finger, how long a still press waits before it reads (ms). Off when absent. */
  hold?: number;
  /**
   * Each mark's identity (a round's id), in mark order. With it a pin follows its datum, not its position: a round that
   * arrives while one is pinned (a refresh, a new window) leaves the pin on the same round, and a pinned round that leaves
   * drops the pin rather than moving it to whichever round took its index.
   */
  ids?: readonly string[];
}

export function useChartPin(count: number, axis: 'x' | 'y' = 'y', inset: [number, number] = [0, 1], positions?: readonly number[], options: ChartPinOptions = {}) {
  const restore = options.release === 'restore';
  const hold = options.hold;
  const [hover, setHover] = useState<number | null>(null);
  const [pinState, setPinState] = useState<{ i: number; id: string | null } | null>(null);
  const idsRef = useRef(options.ids);
  idsRef.current = options.ids;
  const setPin = useCallback((next: number | null | ((p: number | null) => number | null)) => {
    setPinState((was) => {
      const i = typeof next === 'function' ? next(was?.i ?? null) : next;
      return i == null ? null : { i, id: idsRef.current?.[i] ?? null };
    });
  }, []);
  // The pin's index now: found by its datum when the marks have ids, else its position.
  const ids = options.ids;
  const pin = pinState == null ? null : pinState.id != null && ids ? (ids.indexOf(pinState.id) >= 0 ? ids.indexOf(pinState.id) : null) : pinState.i;
  const root = useRef<HTMLElement | null>(null);
  const drag = useRef<{ x: number; y: number; scrubbing: boolean; at: number | null; timer: number | null } | null>(null);
  const stopHold = () => {
    const d = drag.current;
    if (d?.timer != null) window.clearTimeout(d.timer);
    if (d) d.timer = null;
  };
  // A hold timer never outlives the chart.
  useEffect(
    () => () => {
      const t = drag.current?.timer;
      if (t != null) window.clearTimeout(t);
    },
    [],
  );

  // A chart whose marks changed under it (a new window) drops a pin that no longer exists.
  const pinned = pin != null && pin < count ? pin : null;
  const hovered = hover != null && hover < count ? hover : null;
  const active = hovered ?? pinned;

  const clear = useCallback(() => {
    setHover(null);
    setPin(null);
  }, [setPin]);

  useEffect(() => {
    if (pinned == null) return;
    const away = (e: Event) => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target)) setPin(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [pinned, setPin]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Escape') {
        if (pinned != null || hovered != null) {
          e.preventDefault();
          // A press-and-read chart sits inside a card or sheet: its Esc lets go of the round, not the page around it.
          if (restore) e.stopPropagation();
          clear();
        }
        return;
      }
      if (count <= 0) return;
      const last = count - 1;
      const back = axis === 'y' ? 'ArrowUp' : 'ArrowLeft';
      const fwd = axis === 'y' ? 'ArrowDown' : 'ArrowRight';
      let next: number | null = null;
      if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = last;
      else if (e.key === back) next = pinned == null ? (axis === 'y' ? 0 : last) : Math.max(0, pinned - 1);
      // A press-and-read chart steps like a slider from rest: forward starts at the first round, back at the last.
      else if (e.key === fwd) next = pinned == null ? (axis === 'y' || restore ? 0 : last) : Math.min(last, pinned + 1);
      if (next == null) return;
      e.preventDefault();
      if (restore) {
        e.stopPropagation();
        // It steps like a slider, so each round it moves to ticks as a scrub does (08 criterion 68).
        if (next !== (hovered ?? pinned)) hapticScrub('step');
      }
      setHover(null);
      setPin(next);
    },
    [axis, clear, count, hovered, pinned, restore, setPin],
  );

  const item = useCallback(
    (i: number) => ({
      onPointerEnter: (e: PointerEvent<HTMLElement>) => {
        // Touch has no hover: a tap is a click, below.
        if (e.pointerType === 'mouse' || e.pointerType === 'pen') setHover(i);
      },
      onPointerLeave: (e: PointerEvent<HTMLElement>) => {
        if (e.pointerType === 'mouse' || e.pointerType === 'pen') setHover((h) => (h === i ? null : h));
      },
      onClick: () => {
        setHover(null);
        setPin((p) => (p === i ? null : i));
      },
      'data-active': active === i ? ('' as const) : undefined,
      'data-pinned': pinned === i ? ('' as const) : undefined,
    }),
    [active, pinned, setPin],
  );

  const [from, to] = inset;
  // A line spaced by time (`positions`, each point's share of the plot) reads the point nearest the pointer, not its slot.
  const spots = positions && positions.length === count ? positions.join(',') : '';
  const indexAt = useCallback(
    (e: { currentTarget: Element; clientX: number }) => {
      const box = e.currentTarget.getBoundingClientRect();
      const left = box.left + box.width * from;
      const width = box.width * (to - from);
      if (count <= 0) return -1;
      if (width <= 0) return 0;
      const share = (e.clientX - left) / width;
      if (spots) {
        const at = spots.split(',').map(Number);
        return at.reduce((best, p, i) => (Math.abs(p - share) < Math.abs(at[best]! - share) ? i : best), 0);
      }
      return Math.max(0, Math.min(count - 1, Math.floor(share * count)));
    },
    [count, from, to, spots],
  );

  /** The scrub begins: hold the pointer even off the plot, warm the haptics, and read the point under it. */
  const beginScrub = (el: Element, pointerId: number, clientX: number) => {
    const d = drag.current;
    if (!d) return;
    d.scrubbing = true;
    el.setPointerCapture?.(pointerId);
    hapticScrub('start');
    const i = indexAt({ currentTarget: el, clientX });
    if (i >= 0) {
      hapticScrub('step');
      d.at = i;
      setHover(i);
    }
  };

  const letGo = () => {
    setHover(null);
    setPin(null);
  };

  const area = {
    style: { touchAction: 'pan-y' } satisfies CSSProperties,
    onPointerDown: (e: PointerEvent<Element>) => {
      stopHold();
      drag.current = { x: e.clientX, y: e.clientY, scrubbing: false, at: null, timer: null };
      if (!restore || count <= 1) return;
      const el = e.currentTarget;
      const id = e.pointerId;
      const x0 = e.clientX;
      // A mouse press reads at once; a finger waits, so a scroll that starts on the chart lights nothing (MOB-STATS-4).
      if (e.pointerType !== 'touch') beginScrub(el, id, x0);
      else if (hold != null)
        drag.current.timer = window.setTimeout(() => {
          if (drag.current) drag.current.timer = null;
          beginScrub(el, id, x0);
        }, hold);
    },
    onPointerMove: (e: PointerEvent<Element>) => {
      const d = drag.current;
      if (d) {
        if (!d.scrubbing) {
          const dx = Math.abs(e.clientX - d.x);
          const dy = Math.abs(e.clientY - d.y);
          if (dx < SCRUB_START_PX || dx < dy * 1.5) return;
          stopHold();
          d.scrubbing = true;
          // Keep the scrub when the finger leaves the plot's box mid-drag.
          e.currentTarget.setPointerCapture?.(e.pointerId);
          hapticScrub('start');
        }
        const i = indexAt(e);
        if (i >= 0) {
          if (i !== d.at) hapticScrub('step');
          d.at = i;
          setHover(i);
        }
        return;
      }
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        const i = indexAt(e);
        if (i >= 0) setHover(i);
      }
    },
    onPointerUp: (e: PointerEvent<Element>) => {
      stopHold();
      const d = drag.current;
      drag.current = null;
      if (d?.scrubbing) hapticScrub('end');
      if (restore) {
        letGo();
        return;
      }
      const i = indexAt(e);
      if (i < 0) return;
      setHover(null);
      // A drag keeps where it ended; a tap or click toggles the nearest.
      if (d?.scrubbing) setPin(i);
      else setPin((p) => (p === i ? null : i));
    },
    onPointerCancel: () => {
      stopHold();
      if (drag.current?.scrubbing) hapticScrub('end');
      drag.current = null;
      if (restore) letGo();
      else setHover(null);
    },
    onPointerLeave: (e: PointerEvent<Element>) => {
      if ((e.pointerType === 'mouse' || e.pointerType === 'pen') && !drag.current?.scrubbing) setHover(null);
    },
  };

  const container = {
    ref: (el: HTMLElement | null) => {
      root.current = el;
    },
    onKeyDown,
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      // Leaving the chart for something outside it lets go; moving between its own marks does not.
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      if (restore) letGo();
      else setHover(null);
    },
  };

  return { active, pinned, hovered, clear, item, area, container };
}
