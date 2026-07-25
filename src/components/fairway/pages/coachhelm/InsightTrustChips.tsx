'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · InsightTrustChips (P1-12 — the UX payoff)
 * ----------------------------------------------------------------------------
 * The inline "did this actually work?" trust row for an insight card — the
 * effectiveness layer surfaced exactly where a coach reads the signal, so the
 * payoff is visible at the point of decision (not buried in an analytics tab).
 *
 * HONESTY CONTRACT (this component cannot lie):
 *   • It is PURELY PRESENTATIONAL. Every number comes from a `TrustSignal`
 *     rolled up from real ledger rows (golf_insight_exposure / _action /
 *     _outcome). There is NO default/optimistic seeding here — absence of a
 *     signal renders as a quiet "New" chip (never as success).
 *   • The status chip's WORD always carries the meaning; color is a second
 *     channel only (WCAG 1.4.1) — amber for caution, red ONLY for a measured
 *     regression, solid/soft green for working, neutral gray for unproven.
 *   • Chips wrap gracefully, never overflow the card, carry title tooltips +
 *     accessible labels, and introduce no layout shift (the row is just inline
 *     content that grows with the card it sits in).
 *
 * Visual language reuses the locked Fairway tokens (the same families the
 * StatusPill / Badge primitives use): bg-surface-sunken / accent-* / fw-* and
 * the warm text scale. No arbitrary hex, no bg-white, no dark theme.
 * ============================================================================
 */

import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { TrustSignal, TrustStatus } from '@/lib/coachhelm/v3/effectiveness/event-ledger';

/* -------------------------------------------------------------------------- */
/* Status → visual + copy contract (the ONE source for chip presentation)     */
/* -------------------------------------------------------------------------- */

interface TrustChipTone {
  /** Pill fill + text classes (tokens only). */
  pill: string;
  /** Leading status dot color. */
  dot: string;
  /** Short verbal verdict for screen readers / tooltip prefix. */
  word: string;
}

const STATUS_TONE: Record<TrustStatus, TrustChipTone> = {
  // Proven — solid green: a confident, earned positive.
  proven: {
    pill: 'bg-accent-600 text-white',
    dot: 'bg-white',
    word: 'Proven',
  },
  // Promising — soft green: working, but not yet proven.
  promising: {
    pill: 'bg-fw-success-bg text-accent-700',
    dot: 'bg-fw-success',
    word: 'Working',
  },
  // Needs validation — amber caution: too few measured outcomes to trust.
  needs_validation: {
    pill: 'bg-fw-warning-bg text-fw-warning-ink',
    dot: 'bg-fw-warning',
    word: 'Needs validation',
  },
  // New hypothesis — neutral gray: no evidence yet, honestly unproven.
  new_hypothesis: {
    pill: 'bg-surface-sunken text-text-secondary',
    dot: 'bg-text-tertiary',
    word: 'New hypothesis',
  },
  // Underperforming — danger red: a MEASURED regression (the only red use).
  underperforming: {
    pill: 'bg-fw-danger-bg text-fw-danger-ink',
    dot: 'bg-fw-danger',
    word: 'Underperforming',
  },
};

/**
 * The visible label for the status chip. For the two outcome-bearing states it
 * reads as a fraction ("Worked 7/11" / "Working 4/9") so the coach sees the
 * actual numerator/denominator, not a vague word. The other three states have
 * no meaningful work-rate, so they read as their plain verdict.
 */
function statusLabel(signal: TrustSignal): string {
  switch (signal.status) {
    case 'proven':
      return `Worked ${signal.worked}/${signal.measured}`;
    case 'promising':
      return `Working ${signal.worked}/${signal.measured}`;
    case 'needs_validation':
      return 'Needs validation';
    case 'new_hypothesis':
      return 'New hypothesis';
    case 'underperforming':
      // "Last N worsened" reads honestly when a recent down-trend drove it;
      // otherwise fall back to the fraction so the chip is never misleading.
      return signal.recentTrend === 'down' && signal.measured >= 3
        ? `Last ${Math.min(3, signal.measured)} worsened`
        : `Worked ${signal.worked}/${signal.measured}`;
  }
}

/**
 * A full-sentence accessible description — the chip's WORD is the screen-reader
 * meaning, plus the measured context so it never relies on color alone.
 */
function statusAria(signal: TrustSignal): string {
  const tone = STATUS_TONE[signal.status];
  if (signal.measured === 0) {
    return `Effectiveness: ${tone.word} — not measured yet`;
  }
  const worked = `${signal.worked} of ${signal.measured} measured outcomes improved`;
  if (signal.status === 'underperforming' && signal.recentTrend === 'down') {
    return `Effectiveness: ${tone.word} — recent outcomes worsened (${worked})`;
  }
  return `Effectiveness: ${tone.word} — ${worked}`;
}

/** A concise hover tooltip mirroring the accessible description. */
function statusTitle(signal: TrustSignal): string {
  return statusAria(signal);
}

/* -------------------------------------------------------------------------- */
/* InsightTrustChips                                                            */
/* -------------------------------------------------------------------------- */

export interface InsightTrustChipsProps {
  /**
   * The rolled-up trust signal for THIS insight. May be undefined when the
   * batched fetch hasn't resolved (or failed) — the component renders nothing
   * in that case (failure-silent; no layout shift beyond its own absence).
   */
  signal?: TrustSignal;
  className?: string;
}

const InsightTrustChipsImpl = function InsightTrustChips({
  signal,
  className,
}: InsightTrustChipsProps) {
  // No signal at all → render nothing. The chips only ever reflect real ledger
  // data; we never invent a placeholder when the fetch is missing/failed.
  if (!signal) return null;

  const tone = STATUS_TONE[signal.status];
  const label = statusLabel(signal);
  const title = statusTitle(signal);
  const aria = statusAria(signal);

  // The muted exposure/action micro-stat. Only shown once the insight has
  // actually been surfaced at least once — a never-shown insight has nothing
  // honest to report here, so we suppress the "Shown 0 · Acted 0" noise.
  const showMicroStat = signal.shown > 0;

  return (
    <div
      data-slot="insight-trust-chips"
      className={cn(
        'mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5',
        className,
      )}
    >
      {/* Status chip — small rounded pill, mono-ish numerals, leading dot. The
          WORD carries the meaning; the color/dot is a second channel only. */}
      <span
        title={title}
        aria-label={aria}
        className={cn(
          'inline-flex items-center gap-1 rounded-full',
          'h-5 px-2 text-eyebrow font-fw-sans font-medium leading-none normal-case tracking-normal',
          'whitespace-nowrap align-middle tabular-nums',
          tone.pill,
        )}
      >
        <span
          aria-hidden="true"
          className={cn('inline-flex h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)}
        />
        {label}
      </span>

      {/* Muted exposure/action micro-stat. Recessive by design — it sits
          beneath the verdict in the visual hierarchy (one accent, restrained).
          tabular-nums keeps the counts from jittering as they grow. */}
      {showMicroStat ? (
        <span
          title={`Shown ${signal.shown} time${signal.shown === 1 ? '' : 's'} · acted on ${signal.acted} time${signal.acted === 1 ? '' : 's'}`}
          aria-label={`Shown ${signal.shown} ${signal.shown === 1 ? 'time' : 'times'}, acted on ${signal.acted} ${signal.acted === 1 ? 'time' : 'times'}`}
          className="font-fw-mono text-eyebrow normal-case tracking-normal tabular-nums leading-none text-text-tertiary"
        >
          Shown {signal.shown} · Acted {signal.acted}
        </span>
      ) : null}
    </div>
  );
};

/**
 * Memoized: this renders once per insight card in a potentially long list, and
 * the parent Signals workspace churns state on every filter/URL/transition.
 * Re-render only when the row's own signal reference changes.
 */
export const InsightTrustChips = memo(InsightTrustChipsImpl);
InsightTrustChips.displayName = 'InsightTrustChips';
