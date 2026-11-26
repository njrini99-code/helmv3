'use client';

import { useId, type ReactNode } from 'react';
import { haptic } from '../lib/haptics';

/**
 * One choice from a few, each with a line that explains it (premium plan batch 5): a fieldset of real radio inputs, as
 * Radix Themes' RadioCards. The legend names the question, each option is a row whose whole surface is its label, arrow
 * keys move between them (native radios), and the chosen row carries the mark. For two to five options; more belong in
 * a Select, and a plain switch of views is Segmented.
 */
export interface ChChoice<V extends string> {
  value: V;
  label: string;
  hint?: ReactNode;
  disabled?: boolean;
}

export function ChoiceGroup<V extends string>({ legend, value, options, onChange, hideLegend = false }: { legend: string; value: V | null; options: ReadonlyArray<ChChoice<V>>; onChange: (v: V) => void; hideLegend?: boolean }) {
  const name = useId();
  return (
    <fieldset className="ch-choices">
      <legend className={hideLegend ? 'ch-sr-only' : 'ch-choices__legend'}>{legend}</legend>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <label key={o.value} className={'ch-choice' + (on ? ' is-on' : '') + (o.disabled ? ' is-disabled' : '')}>
            <input data-ctl="CTL-P000-002"
              type="radio"
              className="ch-choice__input"
              name={name}
              value={o.value}
              checked={on}
              disabled={o.disabled}
              onChange={() => {
                haptic('select');
                onChange(o.value);
              }}
            />
            <span className="ch-choice__mark" aria-hidden="true" />
            <span className="ch-choice__t">
              <b>{o.label}</b>
              {o.hint && <span className="ch-choice__hint">{o.hint}</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
