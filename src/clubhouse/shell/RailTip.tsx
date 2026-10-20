'use client';

import { useEffect, useState, type CSSProperties, type FocusEvent, type PointerEvent } from 'react';

export type ChRailTipState = { label: string; y: number; shown: boolean } | null;

/**
 * On the folded rail, the name of the row under the pointer or keyboard focus, in a small plate beside it (a row's
 * label is hidden there, though it stays its accessible name). Measured from the row, so it follows the row wherever
 * the sidebar has scrolled. Nothing while the sidebar is open.
 */
export function useRailTip(folded: boolean) {
  const [tip, setTip] = useState<ChRailTipState>(null);

  // Opening the sidebar drops the tip at once; the labels are back.
  useEffect(() => {
    if (!folded) setTip(null);
  }, [folded]);

  const show = (target: EventTarget | null) => {
    if (!folded || !(target instanceof Element)) return;
    const row = target.closest<HTMLElement>('.ch-navitem');
    const label = row?.dataset.label;
    if (!row || !label) return;
    const r = row.getBoundingClientRect();
    setTip({ label, y: r.top + r.height / 2, shown: true });
  };
  const hide = () => setTip((t) => (t ? { ...t, shown: false } : t));

  return {
    shown: tip,
    handlers: {
      onPointerOver: (e: PointerEvent) => show(e.target),
      onPointerLeave: hide,
      onFocus: (e: FocusEvent) => show(e.target),
      onBlur: hide,
    },
  };
}

export function RailTip({ tip }: { tip: ChRailTipState }) {
  if (!tip) return null;
  return (
    <span
      className="ch-railtip"
      data-shown={tip.shown ? '' : undefined}
      style={{ '--ch-railtip-y': `${tip.y}px` } as CSSProperties}
      aria-hidden="true"
    >
      {tip.label}
    </span>
  );
}
