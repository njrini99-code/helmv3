'use client';

import { ChevronLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * The phone top bar's parts (owner design, m-shell.jsx `MTop`; foundation.md):
 * a back link (chevron plus the parent's name), a title, and at most one
 * trailing action, an icon button or a text action. `PhoneBar` is the whole
 * bar for a pushed screen; the shell's top bar hosts the same parts for a
 * page's own top (`PhoneTop`).
 */
export interface ChPhoneBarParts {
  /** The back link. `label` is the parent's name; leave it empty for a bare chevron (a conversation). */
  back?: { label?: string; onBack: () => void; ariaLabel?: string } | null;
  title: ReactNode;
  /** Left-aligned title block (a conversation's avatar, name and subline) instead of a centred title. */
  lead?: boolean;
  action?: ReactNode;
  /** The title's id, for the screen's aria-labelledby. */
  titleId?: string;
}

export function PhoneBarParts({ back, title, lead = false, action, titleId }: ChPhoneBarParts) {
  return (
    <>
      {back && (
        <button
          type="button"
          className={'ch-pbar__back' + (back.label ? '' : ' is-bare')}
          onClick={back.onBack}
          aria-label={back.ariaLabel ?? (back.label ? `Back to ${back.label}` : 'Back')}
        >
          <Icon icon={ChevronLeft} size={20} />
          {back.label && <span aria-hidden="true">{back.label}</span>}
        </button>
      )}
      {lead ? (
        <div className="ch-pbar__lead" id={titleId}>
          {title}
        </div>
      ) : (
        <h1 className="ch-pbar__title" id={titleId} tabIndex={-1}>
          {title}
        </h1>
      )}
      <span className="ch-pbar__right">{action}</span>
    </>
  );
}

/** The whole top bar of a pushed screen: the parts under the status bar, on the phone's glass. */
export function PhoneBar(props: ChPhoneBarParts) {
  return (
    <header className={'ch-pbar' + (props.lead ? ' is-lead' : '')}>
      <PhoneBarParts {...props} />
    </header>
  );
}

/** A 44px icon action in the top bar. */
export function PhoneIconAction({ icon, label, onClick, pressed }: { icon: LucideIcon; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" className="ch-pbar__icon" aria-label={label} aria-pressed={pressed} onClick={onClick}>
      <Icon icon={icon} size={20} />
    </button>
  );
}

/** A text action in the top bar ("Next", "Create group", "Post"). Inert, in tertiary ink, while `disabled`. */
export function PhoneTextAction({ children, onClick, disabled, busy }: { children: ReactNode; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      className="ch-pbar__text"
      onClick={() => !(disabled || busy) && onClick()}
      aria-disabled={disabled || busy || undefined}
      data-busy={busy || undefined}
    >
      {children}
    </button>
  );
}
