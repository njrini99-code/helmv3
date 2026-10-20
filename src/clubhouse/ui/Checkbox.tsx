'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { haptic } from '../lib/haptics';

/**
 * A real checkbox (keyboard, form semantics and screen readers for free) with
 * the design system's 18px green box drawn over it. The label is the whole
 * row, so the hit area is the row, not the box.
 */
export function Checkbox({
  id,
  checked,
  onChange,
  children,
  disabled,
  className,
  describedBy,
  invalid,
}: {
  id?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  return (
    <label className={['ch-check', disabled && 'is-disabled', className].filter(Boolean).join(' ')}>
      <input
        id={id}
        type="checkbox"
        className="ch-check__input"
        checked={checked}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          haptic('select');
          onChange(e.target.checked);
        }}
      />
      <span className={'ch-check__box' + (checked ? ' is-on' : '')} aria-hidden="true">
        {checked && <Icon icon={Check} size={13} />}
      </span>
      {children}
    </label>
  );
}
