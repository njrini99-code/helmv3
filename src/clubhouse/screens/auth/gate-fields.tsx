'use client';

import { Circle, CircleCheck, Eye, EyeOff } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { Icon } from '../../ui/Icon';
import { Spinner } from '../../ui/Spinner';
import { Tooltip } from '../../ui/Tooltip';
import { passwordRules, passwordScore } from '../onboard/logic';
import { AuthKeyLabel } from './AuthKey';

/**
 * The sign-in panel's field anatomy for the screens beside it (the label over a rounded box, the box ringed when it is
 * the one a refusal names), so a reset password, a staff invitation and the demo entry draw the same field as sign in.
 */
export function GateInput({
  id,
  label,
  invalid,
  inputRef,
  trailing,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: ReactNode;
  invalid?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** Sits inside the box, after the text (the password eye). */
  trailing?: ReactNode;
}) {
  return (
    <div className="ch-au-field">
      <label className="ch-au-label" htmlFor={id}>
        {label}
      </label>
      <div className="ch-au-input" data-invalid={invalid ? 'true' : undefined}>
        <input ref={inputRef} id={id} aria-invalid={invalid || undefined} {...input} />
        {trailing}
      </div>
    </div>
  );
}

/** A password box with the eye. The two boxes of a new password share one reveal, so `show` is the screen's. */
export function PasswordInput({
  show,
  onToggle,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  id: string;
  label: ReactNode;
  invalid?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <GateInput
      {...props}
      type={show ? 'text' : 'password'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <Tooltip>
          <button type="button" className="ch-au-eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} aria-controls={props.id} onClick={onToggle}>
            <Icon icon={Eye} size={16} className="ch-au-eye__show" />
            <Icon icon={EyeOff} size={16} className="ch-au-eye__hide" />
          </button>
        </Tooltip>
      }
    />
  );
}

/**
 * What a new password has to be, ticking off as it is typed. The four rules are the server's own (`validatePassword`
 * through `passwordRules`), so a password that ticks every line is never refused for a rule the screen did not show.
 */
export function PasswordRules({ id, password }: { id: string; password: string }) {
  const rules = passwordRules(password);
  return (
    <div className="ch-au-pwrules">
      <div className="ch-au-meter" data-s={passwordScore(password)} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <ul className="ch-au-rules" id={id} aria-label="Password needs">
        {rules.map((r) => (
          <li key={r.label} data-ok={r.ok ? '' : undefined}>
            <Icon icon={r.ok ? CircleCheck : Circle} size={13} />
            {r.label}
            <span className="ch-au-sr">{r.ok ? ', done' : ', not yet'}</span>
          </li>
        ))}
      </ul>
      {/* One short summary instead of announcing every keystroke. */}
      <p className="ch-au-sr" aria-live="polite">
        {password ? `${rules.filter((r) => r.ok).length} of ${rules.length} requirements met` : ''}
      </p>
    </div>
  );
}

/** The panel's primary key: the label and its working twin in one cell, so going in flight never reflows it. */
export function GateKey({ idle, working, busy = false, disabled = false, code, onClick, type = 'submit' }: { idle: string; working: string; busy?: boolean; disabled?: boolean; code?: string; onClick?: () => void; type?: 'submit' | 'button' }) {
  return (
    <div className="ch-au-submit">
      <button type={type} className="ch-btn ch-btn--primary ch-btn--lg" disabled={disabled || busy} aria-busy={busy || undefined} data-ch-code={busy ? code : undefined} onClick={onClick}>
        <AuthKeyLabel busy={busy} idle={idle} working={working} />
      </button>
    </div>
  );
}

/** A screen waiting on a read: its heading, one line with the spinner, and the shape of what is coming so nothing jumps when it arrives. */
export function GateChecking({ title, line, rows = 2, code }: { title: string; line: string; rows?: number; code?: string }) {
  return (
    <div className="ch-au-form" role="status" aria-live="polite" data-ch-code={code}>
      <h1>{title}</h1>
      <p className="ch-au-sub ch-au-checking">
        <Spinner tone="current" />
        {line}
      </p>
      <div className="ch-au-fields ch-au-ghost" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div className="ch-au-field" key={i}>
            <span className="ch-au-label">&nbsp;</span>
            <div className="ch-au-input" />
          </div>
        ))}
      </div>
    </div>
  );
}
