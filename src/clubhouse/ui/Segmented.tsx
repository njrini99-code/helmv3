'use client';

import { useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from 'react';
import { haptic } from '../lib/haptics';
import { useChReducedMotion } from '../lib/reduced-motion';
import { useSlidePlate } from '../lib/slide-plate';

export interface SegOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Accessible label when `label` is an icon. */
  aria?: string;
  /** Not available right now: unlit, skipped by the arrow keys, not chosen by a press. */
  disabled?: boolean;
  /** A tone class on the option's key (`is-late`), for a page rule that tints the chosen one. */
  className?: string;
  /** A `data-*` hook on the option's button. */
  data?: Record<string, string>;
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
 *
 * Two weights (owner, 11 Nov 2026). A mode switch, which swaps what the page is (Team / Ask, Day / Month / List, a round's
 * type, Tournaments' Events / Compare / History, Practice's tabs), is the heavy one: the green chip in the recessed well.
 * A filter or sort, which narrows or orders the same list (Last 5 / 10 / 20, Avg / SG / Name, a window, a status, a
 * grouping), is the light one, `weight="filter"`: a lifted ivory chip in ink on a pale flat track. A form field's choice
 * keeps the default.
 */
export function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  redraws = false,
  block = false,
  hook,
  plate,
  weight = 'mode',
}: {
  label: string;
  value: V;
  options: ReadonlyArray<SegOption<V>>;
  onChange: (v: V) => void;
  size?: 'sm' | 'md' | 'lg';
  /** The change swaps a whole view: it renders after the chip has moved (see above). */
  redraws?: boolean;
  /** Fill the row: the options share its width equally, as a form field's choice does. */
  block?: boolean;
  /** A capture hook on each option (`data-ch`, with `data-v`); absent, none is drawn. */
  hook?: string;
  /** `thumb` (Messages' filter, MOT-X-2): the chip slides for 360 ms on the overshooting CSS spring instead of the settle spring. */
  plate?: 'thumb';
  /** `filter`: the light chip on a pale track, for a filter or sort; `mode` (the default): the green chip (see above). */
  weight?: 'mode' | 'filter';
}) {
  const reduced = useChReducedMotion();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const well = useRef<HTMLDivElement>(null);
  const [changing, startChange] = useTransition();
  const [chosen, setChosen] = useState<V | null>(null);
  const shown = changing && chosen !== null ? chosen : value;
  useSlidePlate(well, '.is-on > .ch-seg__pill', shown, { reduced, ink: '.ch-seg__b', tween: plate });
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
    // The next option that is available: an unavailable one is stepped over, not stopped on.
    let n = i;
    for (let step = 0; step < options.length; step++) {
      n = (n + d + options.length) % options.length;
      if (!options[n]?.disabled) break;
    }
    const next = options[n];
    if (!next || next.disabled) return;
    pick(next.value);
    refs.current[n]?.focus();
  };
  return (
    <div ref={well} className={`ch-seg ch-well ch-seg--${size}${block ? ' ch-seg--block' : ''}${weight === 'filter' ? ' ch-seg--filter' : ''}`} role="radiogroup" aria-label={label}>
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
            disabled={o.disabled}
            className={'ch-seg__b' + (on ? ' is-on' : '') + (o.className ? ` ${o.className}` : '')}
            {...o.data}
            data-ch={hook}
            data-v={hook ? o.value : undefined}
            onClick={() => pick(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {on && <span className="ch-seg__pill" aria-hidden="true" />}
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
