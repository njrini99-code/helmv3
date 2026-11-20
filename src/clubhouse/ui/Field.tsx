'use client';

import { useId, type ReactNode } from 'react';

/**
 * A form field's frame (premium plan batch 5, 4.32): the label, an optional help line, the error and a counter, wired to
 * the control by id. The recipe is Radix Themes' and shadcn/ui's Form field: the label is a real <label for>, help and
 * error are joined to the control through aria-describedby, and an invalid control says so with aria-invalid. The error
 * is not role="alert": it is read when the field is reached, not shouted while the person types.
 *
 * `children` receives the ids to spread on the control: `{ id, 'aria-describedby', 'aria-invalid' }`.
 */
export interface ChFieldControl {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export function Field({
  label,
  help,
  error,
  count,
  max,
  optional,
  className,
  children,
}: {
  label: string;
  help?: ReactNode;
  error?: string | null;
  /** Characters used, shown as "count / max" when `max` is given. */
  count?: number;
  max?: number;
  optional?: boolean;
  className?: string;
  children: (control: ChFieldControl) => ReactNode;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const countId = max != null ? `${id}-count` : undefined;
  const described = [errorId, helpId, countId].filter(Boolean).join(' ') || undefined;
  const over = max != null && count != null && count > max;
  return (
    <div className={'ch-field' + (error ? ' is-invalid' : '') + (className ? ` ${className}` : '')}>
      <label className="ch-field__label" htmlFor={id}>
        {label}
        {optional && <span className="ch-field__opt"> (optional)</span>}
      </label>
      {children({ id, 'aria-describedby': described, 'aria-invalid': error || over ? true : undefined })}
      {(help || error || max != null) && (
        <div className="ch-field__foot">
          {error ? (
            <p id={errorId} className="ch-field__error">
              {error}
            </p>
          ) : (
            help && (
              <p id={helpId} className="ch-field__help">
                {help}
              </p>
            )
          )}
          {max != null && (
            <span id={countId} className={'ch-field__count ch-num' + (over ? ' is-over' : '')} aria-label={`${count ?? 0} of ${max} characters`}>
              {count ?? 0} / {max}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
