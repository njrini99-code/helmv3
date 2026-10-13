'use client';

import { m } from 'motion/react';
import { useId, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from 'react';
import { haptic } from '../lib/haptics';
import { chSpring } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';

export interface SegOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Accessible label when `label` is an icon. */
  aria?: string;
}

/**
 * The recessed well with a raised, pressed chip: the owner's "depth like the
 * toggles". The chip slides between options on the settle spring (base, bounce 0.1; CH-1615), so it arrives and
 * settles rather than stopping on a curve. Arrow keys move the selection like a native segmented control, with a
 * detent haptic on change. Reduced motion and Animations off move it at once.
 *
 * With `redraws` (a switch that swaps a whole view: a calendar's week for its day, a list's grouping), the chip moves in
 * the tap's own frame and the view renders as a transition after it, so a heavy view can't hold the chip back (motion
 * audit 2026-10-12: a Day/Week switch stalled the first frame 46 to 64ms in Safari). While that render runs the chip
 * shows the choice; once it lands it follows `value` again, so a caller that refuses the change puts it back. A caller
 * that runs its own loading for a change (Stats' window) leaves it off.
 */
export function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  redraws = false,
}: {
  label: string;
  value: V;
  options: ReadonlyArray<SegOption<V>>;
  onChange: (v: V) => void;
  size?: 'sm' | 'md';
  /** The change swaps a whole view: it renders after the chip has moved (see above). */
  redraws?: boolean;
}) {
  const id = useId();
  const reduced = useChReducedMotion();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [changing, startChange] = useTransition();
  const [chosen, setChosen] = useState<V | null>(null);
  const shown = changing && chosen !== null ? chosen : value;
  const pick = (v: V) => {
    if (v === shown) return;
    haptic('select');
    if (!redraws) return onChange(v);
    setChosen(v);
    startChange(() => onChange(v));
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + options.length) % options.length;
    const next = options[n];
    if (!next) return;
    pick(next.value);
    refs.current[n]?.focus();
  };
  return (
    <div className={`ch-seg ch-well ch-seg--${size}`} role="radiogroup" aria-label={label}>
      {options.map((o, i) => {
        const on = o.value === shown;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.aria}
            tabIndex={on ? 0 : -1}
            className={'ch-seg__b' + (on ? ' is-on' : '')}
            onClick={() => pick(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {on && (
              <m.span
                className="ch-seg__pill"
                layoutId={reduced ? undefined : `seg-${id}`}
                transition={chSpring('settle', reduced)}
                aria-hidden="true"
              />
            )}
            <span className="ch-seg__l">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Pill toggles in a row (for example Active · 7 / Inactive · 1 / All). Single choice. */
export function PillGroup<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: ReadonlyArray<SegOption<V>>;
  onChange: (v: V) => void;
}) {
  return (
    <div className="ch-pills" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="ch-pill ch-num"
          aria-pressed={o.value === value}
          aria-label={o.aria}
          onClick={() => {
            if (o.value !== value) haptic('select');
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
