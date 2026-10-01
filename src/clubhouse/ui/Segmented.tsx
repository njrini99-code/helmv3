'use client';

import { m } from 'framer-motion';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { haptic } from '../lib/haptics';
import { chTween } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';

export interface SegOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Accessible label when `label` is an icon. */
  aria?: string;
}

/**
 * The recessed well with a raised, pressed chip: the owner's "depth like the
 * toggles". The chip slides between options (220ms). Arrow keys move the
 * selection like a native segmented control, with a detent haptic on change.
 */
export function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
}: {
  label: string;
  value: V;
  options: ReadonlyArray<SegOption<V>>;
  onChange: (v: V) => void;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  const reduced = useChReducedMotion();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const pick = (v: V) => {
    if (v === value) return;
    haptic('select');
    onChange(v);
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
        const on = o.value === value;
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
                transition={chTween('base')}
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
