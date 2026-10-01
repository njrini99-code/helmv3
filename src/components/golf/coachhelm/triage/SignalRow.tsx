'use client';

/**
 * ============================================================================
 * SignalRow — one row of The Lab's signal queue
 * ----------------------------------------------------------------------------
 * Severity dot, category, the claim in two lines. A real link (so a modified
 * click opens the signal in a new tab), `aria-selected` for the containing
 * `role="listbox"`, and a roving `tabIndex` so `SignalQueue`'s arrow-key
 * navigation only ever lands on the currently reachable row.
 *
 * Selection is a deeper cream well with a control-weight edge, never a green
 * wash (owner: no green highlights; `surface-sunken` is the row-highlight
 * token).
 * ========================================================================== */

import { forwardRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/fairway';
import type { GroupedSignal, SignalSeverity } from '@/lib/coachhelm/signal-grouping';
import { formatCategoryLabel, severityLabel } from './buildTriageViewModel';
import { toCoachVoice } from '@/lib/golf/claim-voice';

const SEVERITY_DOT: Record<SignalSeverity, string> = {
  urgent: 'bg-fw-danger',
  high: 'bg-fw-danger',
  medium: 'bg-fw-warning',
  low: 'bg-border-control',
};

/** Severity chip — status tokens (danger/warning/neutral), used sparingly on
 *  chips/dots only. */
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
  /** Roving tab stop: true for the selected row, OR, when nothing is
   *  selected yet, the first visible row, so a keyboard-only user always has
   *  exactly one reachable row. */
  tabbable: boolean;
  href: string;
  onSelect: () => void;
  /**
   * Whose signal this is. The NLG layer writes every claim in the second
   * person for the player's own surfaces ("Across YOUR last 13 rounds…"), but
   * the reader here is a coach (audit M12). Supplying the name retells the
   * claim in the third person; omitting it leaves the copy as generated.
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
        'flex min-h-[44px] w-full items-start gap-3 rounded-fw-md border px-3 py-2.5 text-left outline-none',
        'transition-[background-color,border-color] [transition-duration:var(--fw-dur-fast)]',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
        selected ? 'border-border-control bg-surface-sunken' : 'border-transparent hover:bg-surface-sunken',
        // MOT-19: the row the coach just came back from lights at once, holds
        // for SignalQueue's 900ms, then eases out when the attribute clears.
        'data-[returned=true]:border-border-strong data-[returned=true]:bg-surface-sunken data-[returned=true]:[transition-duration:0ms]',
      )}
    >
      <span
        className={cn('mt-[7px] h-2 w-2 flex-shrink-0 rounded-full', SEVERITY_DOT[signal.severity])}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-fw-sans text-caption font-medium text-text-tertiary">
            {formatCategoryLabel(signal.category)}
          </span>
          {signal.supersededCount > 0 ? (
            <span className="shrink-0 font-fw-sans text-caption tabular-nums text-text-tertiary">
              +{signal.supersededCount} earlier
            </span>
          ) : null}
        </span>
        {/* line-clamp-2, not truncate: single-line truncation hid ~95% of every
            claim (audit 2026-07-24, H4). */}
        <span
          className={cn(
            'mt-0.5 block overflow-hidden font-fw-sans text-body-sm text-text-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]',
            selected && 'font-medium',
          )}
        >
          {toCoachVoice(signal.claim || signal.title, subjectName)}
        </span>
      </span>
      {/* No age: `ageDays` is the insert batch, not content freshness. See
          SignalDossier. Restore with `content_generated_at`. */}
    </Link>
  );
});
