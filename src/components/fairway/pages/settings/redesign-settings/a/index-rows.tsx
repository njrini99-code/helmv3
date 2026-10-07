'use client';

/**
 * Direction A · the two row shapes the index adds on top of the settings kit.
 *
 *   IndexLinkRow — SettingsLinkRow through Next's Link, with the value token
 *                  rendered from a RowValue (muted when it is not a configured
 *                  value) or held by a placeholder while the reads settle.
 *   ActionRow    — the same 56px row geometry for a command (sign out, delete),
 *                  on PressTarget so it gets the shared focus/press contract.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PressTarget } from '@/components/fairway/controls/press-target';
import { SettingsLinkRow } from '@/components/fairway/settings/settings-list';
import type { RowValue } from './format';
import { InlineSkeleton } from './inline-skeleton';

export type IndexValue = RowValue | 'loading';

export function IndexLinkRow({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  /** Omit for rows that open something rather than show a setting (Privacy, Terms). */
  value?: IndexValue;
}) {
  const node =
    value === undefined ? undefined : value === 'loading' ? (
      <InlineSkeleton />
    ) : (
      <span className={value.muted ? 'text-text-tertiary' : undefined}>{value.text}</span>
    );
  return (
    <SettingsLinkRow
      as={Link}
      href={href}
      label={label}
      value={node}
      numericValue={value !== undefined && value !== 'loading' ? value.numeric : undefined}
    />
  );
}

export function ActionRow({
  label,
  icon,
  onClick,
  tone = 'default',
  busy = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger';
  busy?: boolean;
}) {
  return (
    <PressTarget
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      className={cn(
        'flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left',
        'font-fw-sans text-body-sm font-medium',
        'hover:bg-surface-sunken active:shadow-none',
        // Inside a clipped card an offset ring would be cut off; draw it inset.
        'focus-visible:ring-inset focus-visible:ring-offset-0',
        tone === 'danger' ? 'text-fw-danger-ink' : 'text-text-primary',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span
        aria-hidden
        className={cn('shrink-0', tone === 'danger' ? 'text-fw-danger-ink' : 'text-text-tertiary')}
      >
        {icon}
      </span>
    </PressTarget>
  );
}
