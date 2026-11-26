'use client';

import { Check } from 'lucide-react';
import { useState, type ReactNode } from 'react';
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
  // GES-17: the check draws in only when the person ticks it, never on first paint.
  const [drew, setDrew] = useState(false);
  return (
    <label className={['ch-check', disabled && 'is-disabled', className].filter(Boolean).join(' ')}>
      <input data-ctl="CTL-P000-001"
        id={id}
        type="checkbox"
        className="ch-check__input"
        checked={checked}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          haptic('select');
          setDrew(e.target.checked);
          onChange(e.target.checked);
        }}
      />
      <span className={'ch-check__box' + (checked ? ' is-on' : '')} aria-hidden="true">
        {checked && (
          // A left-to-right reveal by two opposite transforms (the window moves in, the mark holds still): only transform
          // animates, so it stays on the compositor (motion rule), and it reads as the check being drawn.
          <span className="ch-check__draw" data-draw={drew || undefined}>
            <span className="ch-check__ink">
              <Icon icon={Check} size={13} />
            </span>
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
