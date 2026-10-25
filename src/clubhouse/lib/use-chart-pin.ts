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
 * Every chart that binds `area` ticks; a hover, a tap and the arrow keys do not.
 */
export const SCRUB_START_PX = 8;

export function useChartPin(count: number, axis: 'x' | 'y' = 'y', inset: [number, number] = [0, 1], positions?: readonly number[]) {
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const root = useRef<HTMLElement | null>(null);
  const drag = useRef<{ x: number; y: number; scrubbing: boolean; at: number | null } | null>(null);

  // A chart whose marks changed under it (a new window) drops a pin that no longer exists.
  const pinned = pin != null && pin < count ? pin : null;
  const hovered = hover != null && hover < count ? hover : null;
  const active = hovered ?? pinned;

  const clear = useCallback(() => {
    setHover(null);
    setPin(null);
  }, []);

  useEffect(() => {
    if (pinned == null) return;
    const away = (e: Event) => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target)) setPin(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [pinned]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Escape') {
        if (pinned != null || hovered != null) {
          e.preventDefault();
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
      else if (e.key === fwd) next = pinned == null ? (axis === 'y' ? 0 : last) : Math.min(last, pinned + 1);
      if (next == null) return;
      e.preventDefault();
      setHover(null);
      setPin(next);
    },
    [axis, clear, count, hovered, pinned],
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
    [active, pinned],
  );

  const [from, to] = inset;
  // A line spaced by time (`positions`, each point's share of the plot) reads the point nearest the pointer, not its slot.
  const spots = positions && positions.length === count ? positions.join(',') : '';
  const indexAt = useCallback(
    (e: PointerEvent<Element>) => {
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

  const area = {
    style: { touchAction: 'pan-y' } satisfies CSSProperties,
    onPointerDown: (e: PointerEvent<Element>) => {
      drag.current = { x: e.clientX, y: e.clientY, scrubbing: false, at: null };
    },
    onPointerMove: (e: PointerEvent<Element>) => {
      const d = drag.current;
      if (d) {
        if (!d.scrubbing) {
          const dx = Math.abs(e.clientX - d.x);
          const dy = Math.abs(e.clientY - d.y);
          if (dx < SCRUB_START_PX || dx < dy * 1.5) return;
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
      const d = drag.current;
      drag.current = null;
      if (d?.scrubbing) hapticScrub('end');
      const i = indexAt(e);
      if (i < 0) return;
      setHover(null);
      // A drag keeps where it ended; a tap or click toggles the nearest.
      if (d?.scrubbing) setPin(i);
      else setPin((p) => (p === i ? null : i));
    },
    onPointerCancel: () => {
      if (drag.current?.scrubbing) hapticScrub('end');
      drag.current = null;
      setHover(null);
    },
    onPointerLeave: (e: PointerEvent<Element>) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') setHover(null);
    },
  };

  const container = {
    ref: (el: HTMLElement | null) => {
      root.current = el;
    },
    onKeyDown,
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      // Leaving the chart for something outside it lets go; moving between its own marks does not.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(null);
    },
  };

  return { active, pinned, hovered, clear, item, area, container };
}
