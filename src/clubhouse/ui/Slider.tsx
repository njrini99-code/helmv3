'use client';

import { useId, type CSSProperties } from 'react';
import { haptic } from '../lib/haptics';

/**
 * A stepped range: label and current value above a recessed rail with a
 * green fill. Native <input type=range> underneath, so arrow keys, Page
 * Up/Down and Home/End all work. A detent haptic on every step.
 */
export function Slider({
  label,
  description,
  value,
  min,
  max,
  step,
  format = (v) => String(v),
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className={'ch-slider' + (disabled ? ' is-disabled' : '')}>
      <div className="ch-slider__top">
        <label htmlFor={id} className="ch-slider__l">
          {label}
        </label>
        <output htmlFor={id} className="ch-slider__v ch-num">
          {format(value)}
        </output>
      </div>
      {description && <p className="ch-slider__d">{description}</p>}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={format(value)}
        style={{ '--ch-fill': `${pct}%` } as CSSProperties}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v !== value) haptic('select');
          onChange(v);
        }}
      />
      <div className="ch-slider__ends ch-num" aria-hidden>
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
