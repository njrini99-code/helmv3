'use client';

import { useId } from 'react';
import { haptic } from '../lib/haptics';

/**
 * An immediate on/off setting (takes effect without Save): the handoff's
 * recessed track with a raised thumb, green when on. A detent haptic on
 * change. `label` is always the accessible name, even when it isn't shown.
 */
export function Switch({
  checked,
  onChange,
  label,
  hideLabel = false,
  disabled,
  busy,
  busyCode,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
  /** A save is in flight: the switch holds its new position but can't be flipped again. */
  busy?: boolean;
  /** Catalog number shown while busy (docs/clubhouse/catalog). */
  busyCode?: string;
}) {
  const id = useId();
  return (
    <label className={'ch-switch' + (disabled ? ' is-disabled' : '') + (busy ? ' is-busy' : '')} htmlFor={id} data-ch-code={busy ? busyCode : undefined}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        onChange={(e) => {
          haptic('select');
          onChange(e.target.checked);
        }}
      />
      <span className="ch-switch__track" aria-hidden>
        <span className="ch-switch__thumb" />
      </span>
      <span className={hideLabel ? 'ch-sr-only' : 'ch-switch__l'}>{label}</span>
    </label>
  );
}
