'use client';

/**
 * ============================================================================
 * SignalRow — one triage-queue row (Triage Desk spec §3)
 * ----------------------------------------------------------------------------
 * Severity dot, category label, one-line claim, age. A real PressTarget
 * (keyboard-activatable, focus-visible ring), `aria-selected` for the
 * containing `role="listbox"`, and a roving `tabIndex` so `SignalQueue`'s
 * arrow-key navigation only ever lands on the currently reachable row.
 * ========================================================================== */

import { forwardRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/fairway';
import type { GroupedSignal, SignalSeverity } from '@/lib/coachhelm/signal-grouping';
import { formatAgeDays, formatCategoryLabel, severityLabel } from './buildTriageViewModel';
import { toCoachVoice } from '@/lib/golf/claim-voice';

const SEVERITY_DOT: Record<SignalSeverity, string> = {
  urgent: 'bg-fw-danger',
  high: 'bg-fw-danger',
  medium: 'bg-fw-warning',
  low: 'bg-text-tertiary/50',
};

/** Severity chip — status tokens (danger/warning/neutral), used sparingly on
 *  chips/dots only per the Triage Desk palette rule. */
export function SeverityChip({ severity }: { severity: SignalSeverity }) {
  const tone = severity === 'urgent' || severity === 'high' ? 'danger' : severity === 'medium' ? 'warning' : 'neutral';
  return (
    <Badge tone={tone} size="sm">
      {severityLabel(severity)}
    </Badge>
  );
}

export interface SignalRowProps {
  signal: GroupedSignal;
  selected: boolean;
  /** Roving tab stop: true for the selected row, OR — when nothing is
   *  selected yet (first load, before a URL `signal`/mouse pick) — the first
   *  visible row, so a keyboard-only user always has one reachable row
   *  instead of every row landing on -1. */
  tabbable: boolean;
  href: string;
  onSelect: () => void;
  /**
   * Whose signal this is. The NLG layer writes every claim in the second
   * person for the player's own surfaces ("Across YOUR last 13 rounds…"), but
   * the reader here is a coach, not the subject (audit M12). Supplying the
   * name retells the claim in the third person; omitting it leaves the copy
   * exactly as generated, so the player-facing surfaces are unaffected.
   */
  subjectName?: string | null;
}

export const SignalRow = forwardRef<HTMLAnchorElement, SignalRowProps>(function SignalRow(
  { signal, selected, tabbable, href, onSelect, subjectName },
  ref,
) {
  return (
    <Link
      ref={ref}
      href={href}
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
        onSelect();
      }}
      role="option"
      aria-selected={selected}
      data-signal-id={signal.id}
      tabIndex={tabbable ? 0 : -1}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-fw-sm px-3 py-2.5 text-left',
        'border transition-colors [transition-duration:150ms]',
        selected ? 'border-accent-200 bg-accent-50' : 'border-transparent hover:bg-surface-sunken',
      )}
    >
      <span
        className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', SEVERITY_DOT[signal.severity])}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-fw-sans text-caption font-semibold uppercase tracking-wide text-text-tertiary">
            {formatCategoryLabel(signal.category)}
          </span>
          {signal.supersededCount > 0 ? (
            <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
              +{signal.supersededCount} earlier
            </span>
          ) : null}
        </span>
        {/* line-clamp-2, not truncate: single-line truncation hid ~95% of every
            claim — measured 2,300-2,500px of hidden text per row, and still
            ~2,500px at 1440px wide (audit 2026-07-24, H4). */}
        <span className="mt-0.5 block font-fw-sans text-body-sm text-text-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
          {toCoachVoice(signal.claim || signal.title, subjectName)}
        </span>
      </span>
      <span className="flex-shrink-0 font-fw-mono text-caption tabular-nums text-text-tertiary">
        {formatAgeDays(signal.ageDays)}
      </span>
    </Link>
  );
});
