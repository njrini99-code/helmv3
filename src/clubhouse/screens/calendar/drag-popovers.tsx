'use client';

/**
 * P-4 4.8: the series question on a drop. A repeating event dropped at a new time asks "This event" (focused, the
 * default) or "This and following"; dropped on another day only "This event" can be chosen, because moving the rest
 * by days would leave the series' rule naming the old weekday (6.4, BYDAY drift). Esc, Cancel or a tap outside puts the
 * card back. Anchored to the dropped block, in the shared menu material, flipping to stay on screen.
 *
 * The tournament round confirm ("Move Pinehurst R1 to Fri 8:42 AM?") is P-5's; it lands here when P-5's rounds exist.
 */
import { m } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../../lib/haptics';
import { CH_POP, chTween } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { menuKeyDown } from '../../ui/Menu';
import type { ChMoveScope } from './move-write';

const W = 248;

export function SeriesScopeMenu({ anchorId, dayChanged, onPick, onCancel }: { anchorId: string; dayChanged: boolean; onPick: (scope: Extract<ChMoveScope, 'this' | 'thisAndFuture'>) => void; onCancel: () => void }) {
  const reduced = useChReducedMotion();
  const list = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const anchor = document.querySelector<HTMLElement>(`[data-ev-id="${CSS.escape(anchorId)}"]`);
    const r = anchor?.getBoundingClientRect() ?? { top: window.innerHeight / 2, bottom: window.innerHeight / 2, left: window.innerWidth / 2 - W / 2 };
    const h = list.current?.offsetHeight || 180;
    const below = window.innerHeight - r.bottom - 8;
    const top = below >= h ? r.bottom + 8 : Math.max(8, r.top - h - 8);
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)), top });
    const frame = requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus({ preventScroll: true }));
    const outside = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node)) onCancel();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', outside, true);
    };
  }, [anchorId, onCancel]);
  const pick = (scope: 'this' | 'thisAndFuture') => {
    haptic('select');
    onPick(scope);
  };
  if (typeof document === 'undefined') return null;
  return createPortal(
    <m.div
      ref={list}
      role="menu"
      aria-label="Repeating event"
      className="ch-menu ch-popover ch-dd-scope"
      data-ui="clubhouse"
      style={{ left: pos?.left ?? -9999, top: pos?.top, width: W }}
      initial={reduced ? { opacity: 0 } : CH_POP.initial}
      animate={reduced ? { opacity: 1 } : CH_POP.animate}
      transition={chTween('quick', reduced)}
      onKeyDown={(e) => menuKeyDown(e, list.current, { onEscape: onCancel, onTab: onCancel })}
    >
      <div className="ch-dd-scope__h" aria-hidden="true">
        Repeating event
      </div>
      <button type="button" role="menuitemradio" aria-checked="true" className="ch-menu__item" onClick={() => pick('this')}>
        This event
      </button>
      <button type="button" role="menuitemradio" aria-checked="false" aria-disabled={dayChanged || undefined} aria-describedby={dayChanged ? 'ch-dd-scope-help' : undefined} className="ch-menu__item" onClick={() => !dayChanged && pick('thisAndFuture')}>
        This and following
      </button>
      {dayChanged && (
        <p id="ch-dd-scope-help" className="ch-dd-scope__help">
          To move the series to another day, use Edit.
        </p>
      )}
      <div className="ch-menu__sep" role="separator" />
      <button type="button" role="menuitem" className="ch-menu__item ch-dd-scope__cancel" onClick={onCancel}>
        Cancel
      </button>
    </m.div>,
    document.querySelector('.ch-root') ?? document.body,
  );
}
