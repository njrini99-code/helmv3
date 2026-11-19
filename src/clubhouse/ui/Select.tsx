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
  describedBy,
}: {
  id?: string;
  value: V;
  options: ReadonlyArray<{ value: V; label: string }>;
  onChange: (v: V) => void;
  disabled?: boolean;
  /** Accessible name when no <label htmlFor> points at it. */
  label?: string;
  /** The id of the help or error line read with the field. */
  describedBy?: string;
}) {
  return (
    // L-086: an unpicked select ("Pick an event") reads in the placeholder ink, as an empty text field does.
    <span className={'ch-select' + (disabled ? ' is-disabled' : '') + (value === '' ? ' is-empty' : '')}>
      <select id={id} value={value} disabled={disabled} aria-label={label} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value as V)}>
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
