'use client';

import { ChevronsUpDown } from 'lucide-react';
import { Icon } from './Icon';

/** A native select dressed as a Clubhouse field: short choice lists (handicap system, timezone). */
export function Select<V extends string>({
  id,
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  id?: string;
  value: V;
  options: ReadonlyArray<{ value: V; label: string }>;
  onChange: (v: V) => void;
  disabled?: boolean;
  /** Accessible name when no <label htmlFor> points at it. */
  label?: string;
}) {
  return (
    <span className={'ch-select' + (disabled ? ' is-disabled' : '')}>
      <select id={id} value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.value as V)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon icon={ChevronsUpDown} size={14} />
    </span>
  );
}
