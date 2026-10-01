'use client';

import { ChevronRight, type LucideIcon } from 'lucide-react';
import { useId, useState, type ComponentProps, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from '../../../ui/Icon';
import { Slider } from '../../../ui/Slider';
import type { ChProblem } from '../model';
import { SettingSwitch } from '../parts';
import { PickerSheet } from './sheets';

/**
 * The parts of the phone's grouped list (docs/clubhouse/phone/settings.md): a group is a small heading over a rounded
 * card of rows, with a footnote under it. Rows are 52px (56 with a second line) on the design system's surface.
 */

/** A group of rows: heading, card, footnote. */
export function Group({ title, note, code, children }: { title?: string; note?: ReactNode; code?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="ch-setm-group" aria-labelledby={title ? id : undefined} data-ch-code={code}>
      {title && (
        <h2 id={id} className="ch-setm-gh">
          {title}
        </h2>
      )}
      <div className="ch-setm-card">{children}</div>
      {note && <p className="ch-setm-note">{note}</p>}
    </section>
  );
}

/** A row that opens something: label, what it holds now, a chevron. A destructive one is red and centred, with no chevron. */
export function NavRow({
  label,
  value,
  icon,
  dark,
  chevron = true,
  danger,
  disabled,
  onClick,
  code,
  ariaLabel,
}: {
  label: string;
  value?: ReactNode;
  icon?: LucideIcon;
  /** The dark-green tile (CoachHelm). */
  dark?: boolean;
  chevron?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  code?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={'ch-setm-row is-nav' + (danger ? ' is-danger' : '') + (icon ? ' has-tile' : '')}
      disabled={disabled}
      aria-label={ariaLabel}
      data-ch-code={code}
      onClick={onClick}
    >
      {icon && (
        <span className={'ch-setm-tile' + (dark ? ' is-dark' : '')} aria-hidden="true">
          <Icon icon={icon} size={17} />
        </span>
      )}
      <span className="ch-setm-row__l">{label}</span>
      {/* A space, so a screen reader reads "Handicap system USGA Handicap" and not one run-on word. */}
      {value != null && value !== '' && (
        <>
          {' '}
          <span className="ch-setm-row__v">{value}</span>
        </>
      )}
      {chevron && !danger && <Icon icon={ChevronRight} size={16} className="ch-setm-chev" />}
    </button>
  );
}

/** A row that is a link (Privacy policy, Terms of service). */
export function LinkRow({ label, href }: { label: string; href: string }) {
  return (
    <a className="ch-setm-row is-plain" href={href} target="_blank" rel="noreferrer">
      <span className="ch-setm-row__l">{label}</span>
    </a>
  );
}

/** A row that does something now, with no chevron (Report a problem). */
export function ActionRow({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="ch-setm-row is-plain" disabled={disabled} onClick={onClick}>
      <span className="ch-setm-row__l">{label}</span>
    </button>
  );
}

/**
 * A switch row: the whole row is the switch (tap anywhere toggles). The switch is the design system's, so it keeps the
 * selection tick, `role="switch"`, and the busy and disabled states; a second line explains a state the person needs.
 */
export function SwitchRow({ label, help, ...switchProps }: { label: string; help?: ReactNode } & Omit<ComponentProps<typeof SettingSwitch>, 'label' | 'hideLabel'>) {
  return (
    <div className={'ch-setm-row is-sw' + (help ? ' has-help' : '') + (switchProps.disabled ? ' is-dim' : '')}>
      <SettingSwitch label={label} {...switchProps} />
      {help && <span className="ch-setm-help">{help}</span>}
    </div>
  );
}

/** A slider row: the slider keeps the full width under its label and value. */
export function SliderRow(props: ComponentProps<typeof Slider>) {
  return (
    <div className="ch-setm-row is-slider">
      <Slider {...props} />
    </div>
  );
}

/** A row that opens a bottom sheet of choices; choosing one calls `onPick` and closes the sheet. */
export function PickerRow<V extends string>({
  label,
  value,
  options,
  onPick,
  disabled,
}: {
  label: string;
  value: V;
  options: ReadonlyArray<{ value: V; label: string }>;
  onPick: (v: V) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <NavRow label={label} value={options.find((o) => o.value === value)?.label ?? ''} disabled={disabled} onClick={() => setOpen(true)} />
      <PickerSheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        options={options}
        value={value}
        onPick={(v) => {
          setOpen(false);
          if (v !== value) onPick(v);
        }}
      />
    </>
  );
}

/**
 * A field inside a sheet. `inline` puts the label beside the value (a name); otherwise the label sits above it, which
 * fits the longer ones ("Confirm new password"). An error is read with the field.
 */
export function FieldRow({
  id,
  label,
  inline,
  error,
  help,
  ...input
}: {
  id: string;
  label: string;
  inline?: boolean;
  error?: ChProblem | null;
  help?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const described = error || help ? `${id}-h` : undefined;
  return (
    <div className="ch-setm-fieldwrap">
      <label className={'ch-setm-row is-field' + (inline ? ' is-inline' : '')} htmlFor={id}>
        <span className="ch-setm-field__l">{label}</span>
        <input id={id} className="ch-setm-field__i" aria-invalid={error ? true : undefined} aria-describedby={described} {...input} />
      </label>
      {(error || help) && (
        <span id={`${id}-h`} className={'ch-setm-field__h' + (error ? ' is-error' : '')} role={error ? 'alert' : undefined} data-ch-code={error?.code}>
          {error?.text || help}
        </span>
      )}
    </div>
  );
}

/** A problem with a form, in the sheet's footnote slot: read as an alert, with its catalog number. */
export function Problem({ problem }: { problem: ChProblem }) {
  return (
    <p className="ch-setm-problem is-error" role="alert" data-ch-code={problem.code}>
      {problem.text}
    </p>
  );
}
