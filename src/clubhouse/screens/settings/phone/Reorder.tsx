'use client';

import { Menu } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../../../ui/Icon';
import { haptic } from '../../../lib/haptics';
import { moveOrder, PRIORITY_LABEL, type PriorityKey } from '../model';

/** Touch and hold this long before a row lifts; a finger that moves first is scrolling. */
const HOLD_MS = 250;
/** How far the finger may drift during the hold before it counts as a scroll. */
const SLOP_PX = 8;
/** A row is 56px tall with a 1px hairline: one step is this far. */
const PITCH_PX = 57;

/** `key` moved to `to`, the rest keeping their order. */
function moveTo(order: PriorityKey[], key: PriorityKey, to: number): PriorityKey[] {
  const rest = order.filter((k) => k !== key);
  rest.splice(to, 0, key);
  return rest;
}

/**
 * The priority ranker with the native reorder handle: touch and hold a row, then drag; each step it passes ticks
 * (selection). The order is saved once, when the row is let go. With a keyboard, the handle takes the arrow keys, and
 * VoiceOver users get Move up and Move down.
 */
export function Reorder({ order, onCommit }: { order: PriorityKey[]; onCommit: (next: PriorityKey[]) => void }) {
  const hintId = useId();
  const list = useRef<HTMLOListElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const lifted = useRef(false);
  const [drag, setDrag] = useState<{ key: PriorityKey; from: number; at: number; dy: number } | null>(null);
  const [said, setSaid] = useState('');
  const shown = drag ? moveTo(order, drag.key, drag.at) : order;

  useEffect(() => () => stop.current?.(), []);
  // A lifted row must not scroll the page under the finger. The listener is registered up front, and not passive, so the
  // browser lets it cancel the scroll (a listener added mid-gesture is too late on iOS).
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const hold = (e: TouchEvent) => {
      if (lifted.current && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', hold, { passive: false });
    return () => el.removeEventListener('touchmove', hold);
  }, []);

  const step = (key: PriorityKey, dir: -1 | 1) => {
    const next = moveOrder(order, key, dir);
    if (next === order) return;
    haptic('select');
    setSaid(`${PRIORITY_LABEL[key].label}, number ${next.indexOf(key) + 1} of ${next.length}`);
    onCommit(next);
  };

  const begin = (e: ReactPointerEvent<HTMLLIElement>, key: PriorityKey, from: number) => {
    if (e.button !== 0) return;
    stop.current?.();
    const startY = e.clientY;
    let armed = false;
    let at = from;
    const timer = window.setTimeout(() => {
      armed = true;
      lifted.current = true;
      setDrag({ key, from, at, dy: 0 });
    }, HOLD_MS);
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (!armed) {
        if (Math.abs(dy) > SLOP_PX) finish(false);
        return;
      }
      const to = Math.max(0, Math.min(order.length - 1, Math.round(from + dy / PITCH_PX)));
      if (to !== at) {
        at = to;
        haptic('select');
      }
      setDrag({ key, from, at, dy });
    };
    const end = (ev: PointerEvent) => finish(ev.type === 'pointerup');
    const finish = (drop: boolean) => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      stop.current = null;
      if (!armed) return;
      lifted.current = false;
      setDrag(null);
      if (drop && at !== from) {
        setSaid(`${PRIORITY_LABEL[key].label}, number ${at + 1} of ${order.length}`);
        onCommit(moveTo(order, key, at));
      }
    };
    stop.current = () => finish(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, key: PriorityKey) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    step(key, e.key === 'ArrowUp' ? -1 : 1);
  };

  return (
    <>
      <ol ref={list} className="ch-setm-rank" aria-label="Priorities, most important first">
        {shown.map((k, i) => {
          const held = drag?.key === k;
          return (
            <li
              key={k}
              className={'ch-setm-rank__i' + (held ? ' is-held' : '')}
              style={held && drag ? { transform: `translateY(${drag.from * PITCH_PX + drag.dy - i * PITCH_PX}px)` } : undefined}
              onPointerDown={(e) => begin(e, k, order.indexOf(k))}
              onContextMenu={(e) => e.preventDefault()}
            >
              <b className="ch-setm-rank__n ch-num">{i + 1}</b>
              <span className="ch-setm-rank__txt">
                <span>{PRIORITY_LABEL[k].label}</span>
                <span>{PRIORITY_LABEL[k].hint}</span>
              </span>
              <button type="button" className="ch-setm-rank__h" aria-label={`Reorder ${PRIORITY_LABEL[k].label}`} aria-describedby={hintId} onKeyDown={(e) => onKey(e, k)}>
                <Icon icon={Menu} size={20} />
              </button>
              <span className="ch-sr-only">
                <button type="button" disabled={i === 0} onClick={() => step(k, -1)}>
                  Move {PRIORITY_LABEL[k].label} up
                </button>
                <button type="button" disabled={i === shown.length - 1} onClick={() => step(k, 1)}>
                  Move {PRIORITY_LABEL[k].label} down
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <span id={hintId} className="ch-sr-only">
        Touch and hold, then drag. With a keyboard, press the up or down arrow.
      </span>
      <span className="ch-sr-only" aria-live="polite">
        {said}
      </span>
    </>
  );
}
