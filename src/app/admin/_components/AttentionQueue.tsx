import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { AttentionRow } from '@/lib/admin/incidents/attention';
import type { StateTone } from '@/lib/admin/incidents/types';
import { RowHead, RowPath } from './Row';
import { PanelAllClear, PanelNoData } from './PanelStates';
import { RelativeTime } from './RelativeTime';

/**
 * ATTENTION QUEUE — "needs your eyes", ranked by what the evidence says
 * needs a human, not by severity alone.
 *
 * Purely presentational: every fact here already lives on an `AttentionRow`
 * built by `selectAttention` (`@/lib/admin/incidents/attention`). This
 * component's only job is rendering that list honestly, which mainly means
 * two things the rest of the file exists to get right:
 *
 *   1. EMPTY IS NOT ALWAYS GOOD NEWS. `rows.length === 0` under
 *      `canClaimAllClear` is a real all-clear — a quiet, one-line success
 *      state, never a decorated empty box (`PanelAllClear` already draws
 *      that line; see `ProofDebtPanel.tsx` for the identical contract on
 *      the proof-debt list). But `rows.length === 0` with
 *      `canClaimAllClear === false` means a source could not be read this
 *      refresh, and the queue is silent about it, not clean — rendering
 *      those two states identically is the single most damaging empty
 *      state a monitoring surface can show (`sources.ts`'s
 *      `canClaimAllClear` doc comment makes the same point about the Bridge
 *      as a whole). This is the guard that keeps a broken read from reading
 *      as a calm morning.
 *
 *   2. COLOUR IS NEVER THE ONLY SIGNAL. Every row's `state` word renders as
 *      real text next to its tone colour — never a bare coloured dot — so
 *      the queue is legible in greyscale, to a screen reader, and to anyone
 *      who has not memorised the palette. Same rule `TruthStrip.tsx` and
 *      `ChangeTimeline.tsx` already state for their own rows.
 *
 * The row language (`RowHead`, `RowPath`) is `Row.tsx`'s, reused rather than
 * reinvented — see that file's own header for why a hand-rolled row per tab
 * is the thing this whole language exists to stop. The tone-keyed rail and
 * ink tables below are NOT imported from `Row.tsx`, because `Row.tsx`'s
 * `RailRow` is keyed by `RowSeverity` (a five-value severity axis) and this
 * queue's rows carry `StateTone` (a five-value axis that also includes
 * `success`, for a reason `Row.tsx` never needs) — `TruthStrip.tsx` and
 * `ChangeTimeline.tsx` both hit the same mismatch and both keep a local
 * `StateTone`-keyed copy of the same `fw-*` token pairing rather than force
 * a shape onto `RailRow` it was not built for; this file follows that
 * precedent rather than inventing a third way to reconcile the two axes.
 */

/** Rails take the saturated token; text takes the `-ink` pairing — the split
 *  `Row.tsx`'s own header documents (`design-tokens.css` measured the
 *  semantic colours as text and they fail contrast: warning 2.08:1, danger
 *  4.01:1; the `-ink` pairings measure 7.27:1). */
const TONE_RAIL: Readonly<Record<StateTone, string>> = {
  danger: 'bg-fw-danger',
  warning: 'bg-fw-warning',
  success: 'bg-fw-success',
  accent: 'bg-accent-600',
  neutral: 'bg-warm-300',
};

const TONE_INK: Readonly<Record<StateTone, string>> = {
  danger: 'text-fw-danger-ink',
  warning: 'text-fw-warning-ink',
  success: 'text-fw-success-ink',
  accent: 'text-accent-700',
  neutral: 'text-warm-500',
};

function AttentionRowItem({ row }: { row: AttentionRow }) {
  const headline = row.href ? (
    <Link
      href={row.href}
      className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
    >
      {row.headline}
    </Link>
  ) : (
    row.headline
  );

  return (
    // `min-h-11` (44px) is the tap-target floor this repo's mobile rules
    // require for the row as a whole, even though only the headline inside
    // it is a link — the row itself is what a thumb has to be able to find
    // and read comfortably on a 390px screen.
    <li className="relative flex min-h-11 min-w-0 gap-2.5 py-2.5 pr-3">
      <span aria-hidden className={cn('absolute inset-y-1.5 left-0 w-1 rounded-r-sm', TONE_RAIL[row.tone])} />
      <div className="min-w-0 flex-1 pl-3">
        {/* The state WORD, always — colour alone never carries this. */}
        <span className={cn('text-eyebrow font-bold uppercase tracking-wide', TONE_INK[row.tone])}>
          {row.state}
        </span>
        <RowHead clamp={2}>{headline}</RowHead>
        {/* The reason `why` this row exists, verbatim — never shortened
            back down to the category the state word already says. */}
        <RowPath>{row.why}</RowPath>
        {row.ageMs !== null ? (
          <RelativeTime
            sinceMs={Date.now() - row.ageMs}
            className="mt-1 block font-fw-mono text-caption tabular-nums text-warm-400"
          />
        ) : null}
      </div>
    </li>
  );
}

export function AttentionQueue({
  rows,
  total,
  checkedAt,
  canClaimAllClear,
}: {
  rows: readonly AttentionRow[];
  /** Rows BEFORE the limit `selectAttention` applied, so overflow can be
   *  linked honestly instead of the list silently going quiet past the cut. */
  total: number;
  checkedAt: string;
  canClaimAllClear: boolean;
}) {
  if (rows.length === 0) {
    return canClaimAllClear ? (
      <PanelAllClear label="Needs your eyes — nothing right now" checkedAt={checkedAt} />
    ) : (
      <PanelNoData
        label="Could not fully compute what needs attention"
        description="At least one source could not be read, so this list may be incomplete."
      />
    );
  }

  return (
    <div className="min-w-0">
      <ul className="divide-y divide-warm-200/60">
        {rows.map((row) => (
          <AttentionRowItem key={row.key} row={row} />
        ))}
      </ul>
      {total > rows.length ? (
        <p className="mt-2 text-caption text-warm-500">
          <Link
            href="/admin/errors"
            className="text-accent-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            {total - rows.length} more needing attention
          </Link>
        </p>
      ) : null}
    </div>
  );
}
