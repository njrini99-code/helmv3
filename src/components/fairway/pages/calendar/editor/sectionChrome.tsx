import * as React from 'react';
import { cn } from '@/lib/utils';

/** The editor's section card: `.paper` material, card radius, 16px inset. */
export const sectionCardCls = cn('rounded-card p-4', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]');

/** Section title for `FormSection`: a 32px tinted icon disc + a compact
 *  sans label (FormSection's own h2 is display-sized; the span overrides
 *  it so every editor section reads at one weight). */
export function sectionTitle(Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>, label: string) {
  return (
    <span className="inline-flex items-center gap-3 font-fw-sans text-body font-semibold text-text-primary">
      <span aria-hidden className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full', 'bg-surface-sunken text-text-secondary')}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      {label}
    </span>
  );
}
