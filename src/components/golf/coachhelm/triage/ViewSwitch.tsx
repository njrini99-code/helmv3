'use client';

/**
 * ============================================================================
 * ViewSwitch — the Triage Desk's Signals / Players / Effectiveness segmented
 * control (Triage Desk spec §2)
 * ----------------------------------------------------------------------------
 * URL-driven via the EXISTING `?view=` values every legacy shim redirect
 * (alerts/insights/patterns/development/analytics/coachhelm) already writes,
 * so every old bookmark keeps landing on the right tab — see
 * `resolveTriageView` in `buildTriageViewModel.ts`, the only place that
 * decodes the param.
 * ========================================================================== */

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { TriageView } from './buildTriageViewModel';

export interface ViewSwitchProps {
  view: TriageView;
  hrefFor: (view: TriageView) => string;
  onSelect: (view: TriageView) => void;
}

const OPTIONS: ReadonlyArray<{ value: TriageView; label: string }> = [
  { value: 'signals', label: 'Signals' },
  { value: 'players', label: 'Players' },
  { value: 'effectiveness', label: 'Effectiveness' },
];

export function ViewSwitch({ view, hrefFor, onSelect }: ViewSwitchProps) {
  return (
    <nav
      aria-label="CoachHelm view"
      className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-fw-sm border border-border-subtle bg-surface-sunken p-1"
    >
      {OPTIONS.map((option) => {
        const selected = option.value === view;
        return (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            replace
            scroll={false}
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }
              event.preventDefault();
              onSelect(option.value);
            }}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'relative inline-flex min-h-9 flex-shrink-0 items-center justify-center whitespace-nowrap rounded-md px-4',
              'font-fw-sans text-body-sm font-medium outline-none transition-colors',
              'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2',
              selected
                ? 'border border-border-subtle bg-surface text-text-primary shadow-soft'
                : 'text-text-secondary hover:bg-surface-tint hover:text-text-primary',
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
