'use client';

import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from '../lib/haptics';
import { CH_DUR, CH_EASE, chSpringCurve } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { chSupportsLinear, releaseSpeed } from '../lib/sheet-drag';
import { SWIPE_ACTION_PX, swipeArmed, swipeAxis, swipeLanding, swipeOffset, type SwipeSide } from '../lib/swipe-row';
import { Icon } from './Icon';
import { PresenceRow } from './ListPresence';

export interface SwipeAction {
  label: string;
  icon: LucideIcon;
  /** Danger reads red and gives the warning tick when a full swipe runs it (D-70); accent is the green fill. */
  tone: 'accent' | 'danger';
  run: () => void;
}

/**
 * A list row that swipes sideways to show an action on each side (C8, owner decision 14): leading (a swipe to the
 * right) and trailing (to the left). The rules are `lib/swipe-row.ts`: the row follows the finger 1:1 once the drag is
 * clearly sideways (10px), gives past the full mark, and on release lands where the throw would carry it (open on the
 * action, run it, or shut). Vertical drags stay the list's scroll (`touch-action: pan-y`), and iOS taking the pan
 * (`pointercancel`) springs the row shut.
 *
 * Every action must also be in the row's menu (long press, right-click, keyboard): a swipe is never the only way. The
 * revealed buttons are real buttons, inert while the row is shut. Reduced motion snaps instead of springing; the swipe
 * itself still works, being input. The root is the row's `PresenceRow`, so a list's arrivals and departures still run.
 */
export function SwipeRow({
  leading,
  trailing,
  className,
  onClaim,
  children,
}: {
  leading?: SwipeAction | null;
  trailing?: SwipeAction | null;
  className?: string;
  /** Runs once a drag is claimed as a swipe, e.g. to cancel the row's long press (its events stop reaching it). */
  onClaim?: () => void;
  children: ReactNode;
}) {
  const reduced = useChReducedMotion();
  const root = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  /** Which side is open and resting on its action (its button can be pressed), or null when shut. */
  const [open, setOpen] = useState<SwipeSide | null>(null);
  /** Which side's actions show while the row is moving or open: the layer behind the row. */
  const [showing, setShowing] = useState<SwipeSide | null>(null);
  const drag = useRef<{ id: number; x0: number; y0: number; base: number; axis: 'x' | 'y' | null; offset: number; armed: boolean; samples: Array<[number, number]> } | null>(null);
  const offsetNow = useRef(0);
  /** The tap a drag ends in (or one that shuts an open row) never lands on the row. */
  const swallow = useRef(false);
  const sides = { leading: !!leading, trailing: !!trailing };

  const paint = useCallback((offset: number) => {
    offsetNow.current = offset;
    const el = content.current;
    if (el) el.style.translate = offset ? `${offset}px 0` : '';
    root.current?.style.setProperty('--ch-swipe-reveal', `${Math.abs(offset)}px`);
  }, []);

  /** Springs the row to `to` (px), starting at `speed` (px per ms): the smooth spring, or a snap with reduced motion. */
  const settle = useCallback(
    (to: number, speed = 0) => {
      const el = content.current;
      if (!el) return;
      const from = offsetNow.current;
      const distance = Math.abs(to - from);
      if (reduced || distance < 0.5) el.style.transition = 'none';
      else if (chSupportsLinear()) {
        const toward = Math.sign(to - from) === Math.sign(speed) ? Math.abs(speed) : 0;
        const curve = chSpringCurve('smooth', { velocity: (toward * 1000) / distance, rest: 0.5 / distance });
        el.style.transition = `translate ${curve.ms}ms ${curve.linear}`;
      } else el.style.transition = `translate ${CH_DUR.base * 1000}ms cubic-bezier(${CH_EASE.join(', ')})`;
      paint(to);
      setShowing(to > 0 ? 'leading' : to < 0 ? 'trailing' : null);
    },
    [paint, reduced],
  );

  const shut = useCallback(() => {
    setOpen(null);
    settle(0);
  }, [settle]);

  // An open row shuts when a press lands anywhere else, as iOS does.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (e.target instanceof Node && root.current?.contains(e.target)) return;
      shut();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open, shut]);

  const runSide = (side: SwipeSide, speed: number) => {
    const action = side === 'leading' ? leading : trailing;
    setOpen(null);
    settle(0, speed);
    if (!action) return;
    // A destructive one warns (it then asks to confirm); the other's own write gives its success.
    if (action.tone === 'danger') haptic('warning');
    action.run();
  };

  return (
    <PresenceRow
      as="div"
      ref={root}
      className={'ch-swipe' + (className ? ` ${className}` : '')}
      data-ch-swipe-row=""
      data-side={showing ?? undefined}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        // A press on a revealed action is a fresh tap. The drag that opened the row may have ended with no click to
        // swallow (a touch that moved fires none), so its swallow must not eat this tap.
        if (e.target instanceof Element && e.target.closest('.ch-swipe__act')) {
          swallow.current = false;
          return;
        }
        if (!e.isPrimary) return;
        swallow.current = false;
        const el = content.current;
        // A row caught mid-spring is taken from where it is.
        const caught = el ? parseFloat(getComputedStyle(el).translate.split(' ')[0] ?? '0') : 0;
        if (el) el.style.transition = 'none';
        if (Number.isFinite(caught) && caught !== offsetNow.current) paint(caught);
        drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, base: offsetNow.current, axis: null, offset: offsetNow.current, armed: false, samples: [[e.timeStamp, e.clientX]] };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId || d.axis === 'y') return;
        const dx = e.clientX - d.x0;
        if (d.axis == null) {
          d.axis = swipeAxis(dx, e.clientY - d.y0);
          if (d.axis !== 'x') return;
          // Claimed: the row is the finger's now, not the list's scroll or the tap underneath.
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          onClaim?.();
          swallow.current = true;
          setOpen(null);
        }
        d.samples.push([e.timeStamp, e.clientX]);
        if (d.samples.length > 12) d.samples.shift();
        const width = root.current?.offsetWidth || 390;
        d.offset = swipeOffset(d.base + dx, width, sides);
        const armed = swipeArmed(d.offset, width);
        if (armed !== d.armed) {
          d.armed = armed;
          haptic('select');
        }
        paint(d.offset);
        setShowing(d.offset > 0 ? 'leading' : d.offset < 0 ? 'trailing' : null);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.id !== e.pointerId) return;
        if (d.axis !== 'x') {
          // A tap on an open row shuts it rather than opening what is under it.
          if (open && d.axis == null) {
            swallow.current = true;
            shut();
          }
          return;
        }
        const width = root.current?.offsetWidth || 390;
        const speed = releaseSpeed(d.samples, e.timeStamp);
        const landing = swipeLanding(d.offset, speed, width);
        if (landing.kind === 'full') runSide(landing.side, speed);
        else if (landing.kind === 'open') {
          setOpen(landing.side);
          settle(landing.offset, speed);
        } else {
          setOpen(null);
          settle(0, speed);
        }
      }}
      onPointerCancel={() => {
        // iOS took the pan (a scroll won): the row springs shut.
        if (!drag.current) return;
        drag.current = null;
        shut();
      }}
      onClickCapture={(e) => {
        if (!swallow.current) return;
        swallow.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {leading && <SwipeButton side="leading" action={leading} open={open === 'leading'} onRun={() => runSide('leading', 0)} />}
      {trailing && <SwipeButton side="trailing" action={trailing} open={open === 'trailing'} onRun={() => runSide('trailing', 0)} />}
      <div ref={content} className="ch-swipe__c">
        {children}
      </div>
    </PresenceRow>
  );
}

function SwipeButton({ side, action, open, onRun }: { side: SwipeSide; action: SwipeAction; open: boolean; onRun: () => void }) {
  return (
    <div className={`ch-swipe__acts is-${side}`} inert={!open} aria-hidden={!open || undefined}>
      <button type="button" className={`ch-swipe__act is-${action.tone}`} style={{ minWidth: SWIPE_ACTION_PX }} onClick={onRun}>
        <Icon icon={action.icon} size={18} />
        <span>{action.label}</span>
      </button>
    </div>
  );
}
