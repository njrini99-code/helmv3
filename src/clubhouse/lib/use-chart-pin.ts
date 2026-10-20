'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * One interaction for every stats chart (decisions Q2, Q12, Q13): the pointer over a mark, or an arrow key, reads it in the
 * chart's header line; a tap or click pins it (and again to let go); Esc, or a press anywhere outside, clears the pin. The
 * header line is an aria-live region that speaks only for a pin or a key, never for a hover, so a pointer drifting across a
 * chart does not flood a screen reader.
 *
 * `count` is how many marks the chart has. `axis` says which arrow keys step: 'y' for a list of rows, 'x' for a line of
 * columns. Marks are bound with `item(i)`; the chart's container takes `container`.
 */
export function useChartPin(count: number, axis: 'x' | 'y' = 'y') {
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const root = useRef<HTMLElement | null>(null);

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

  return { active, pinned, hovered, clear, item, container };
}
