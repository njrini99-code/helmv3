'use client';

/**
 * ============================================================================
 * Fairway · Rounds · FairwayRoundRow — ONE round as a ledger row
 * ----------------------------------------------------------------------------
 * The month-ledger row (the scannable alternative to FairwayRoundCard). The
 * whole row is a Link to the round detail — rounds stay clickable. Each row
 * shows its quick stats inline (the "snapshot" the wall-of-cards hid): score +
 * score-to-par pill, and Putts / FIR% / GIR% from real columns. On hover the
 * row tints (bg-surface-tint) and a chevron slides in — premium feedback, NO
 * layout shift.
 *
 * HONESTY: no fabricated zeros. FIR/GIR are shown only when the possible-count
 * is present and > 0; when NOTHING is loggable the stat cluster reads an honest
 * "No stats logged" instead of "— — —".
 *
 * Reuses the card's pure helpers (scoreToParTone / formatToPar /
 * getRoundTypeLabel) so the score grading + labels match the card exactly.
 * Rendered only inside FairwayRoundsLibrary's month blocks (.fairway-ds).
 * ========================================================================== */

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { Badge, Chip } from '@/components/fairway/controls/badge';
import { Avatar } from '@/components/fairway/controls/avatar';
import type { RoundLibraryRound } from './FairwayRoundsLibrary';
import { scoreToParTone, formatToPar, getRoundTypeLabel } from './FairwayRoundCard';
import { formatDateOnlyWeekdayShort, formatDateOnlyShort } from '@/lib/golf/date-only';

export interface FairwayRoundRowProps {
  round: RoundLibraryRound;
  /** Lowest score-to-par of its month — gets the accent rail + Best badge. */
  isBestOfPeriod: boolean;
  userRole: 'coach' | 'player';
}

// round_date is a DATE column ('YYYY-MM-DD') — parsed + formatted through the
// shared date-only helper so this row can never disagree with the round detail
// header on the calendar day (#916: `new Date(iso).toLocaleDateString()` with
// no timeZone pin read the previous day west of UTC).
function dateParts(iso: string): { weekday: string; md: string } {
  return {
    weekday: formatDateOnlyWeekdayShort(iso),
    md: formatDateOnlyShort(iso),
  };
}

/** One round, as a clickable ledger row. */
export function FairwayRoundRow({ round, isBestOfPeriod, userRole }: FairwayRoundRowProps) {
  const stp = round.score_to_par ?? 0;
  const hasToPar = round.score_to_par !== null;
  const tone = scoreToParTone(stp);
  const holesPlayed = round.holes_played ?? 18;
  const { weekday, md } = dateParts(round.round_date);
  const playerName = round.player
    ? `${round.player.first_name || ''} ${round.player.last_name || ''}`.trim()
    : '';

  // Quick stats — HONEST: FIR/GIR only when the denominator is real and > 0.
  const fir =
    round.total_fairways !== null && round.total_fairways > 0 && round.total_fairways_hit !== null
      ? Math.round((round.total_fairways_hit / round.total_fairways) * 100)
      : null;
  const gir =
    round.total_gir_possible !== null && round.total_gir_possible > 0 && round.total_gir !== null
      ? Math.round((round.total_gir / round.total_gir_possible) * 100)
      : null;
  const putts = round.total_putts;
  const hasAnyMicroStat = putts !== null || fir !== null || gir !== null;

  // A bare state code with no city ("Va") reads as a stray, unlabeled
  // fragment next to the type chip — only render a location when there's an
  // actual city to anchor it (course_state alone is dropped, not shown bare).
  const city = round.course_city
    ? [round.course_city, round.course_state].filter(Boolean).join(', ')
    : null;

  return (
    <Link
      href={`/golf/dashboard/rounds/${round.id}`}
      className={cn(
        'group/row relative flex items-center gap-3 px-4 py-3 outline-none transition-colors duration-150',
        'hover:bg-surface-tint focus-visible:bg-surface-tint',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
      )}
    >
      {/* Best-of-month accent rail */}
      {isBestOfPeriod && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-accent-500" />
      )}

      {/* Date */}
      <div className="w-12 flex-shrink-0 leading-tight">
        <div className="font-fw-sans text-eyebrow uppercase tracking-[0.06em] text-text-tertiary">
          {weekday}
        </div>
        <div className="font-fw-display text-body-sm font-medium tabular-nums text-text-primary">
          {md}
        </div>
      </div>

      {/* Course + type */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-fw-sans text-body font-medium text-text-primary">
            {round.course_name ?? 'Unknown course'}
          </span>
          {isBestOfPeriod && (
            <Badge tone="accent" size="sm" className="flex-shrink-0 uppercase tracking-[0.06em]">
              Best
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
          <Chip tone="neutral" size="sm" className="flex-shrink-0 uppercase tracking-[0.06em]">
            {getRoundTypeLabel(round.round_type)}
          </Chip>
          {city && <span className="truncate">{city}</span>}
          <span className="flex-shrink-0 tabular-nums">
            · {holesPlayed} {holesPlayed === 1 ? 'hole' : 'holes'}
          </span>
        </div>

        {/* Mobile-only condensed stat line — the quick stats are hidden on phones
            (the md:flex cluster below), so surface them here as a single caption
            row to keep mobile parity (the snapshot the cards hid). Honest: each
            stat shows only when its real value is present. */}
        {hasAnyMicroStat && (
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-fw-mono text-caption tabular-nums text-text-secondary md:hidden">
            {putts !== null && <span>P{putts}</span>}
            {fir !== null && (
              <>
                {putts !== null && <span aria-hidden="true" className="text-text-tertiary">·</span>}
                <span>FIR {fir}%</span>
              </>
            )}
            {gir !== null && (
              <>
                {(putts !== null || fir !== null) && (
                  <span aria-hidden="true" className="text-text-tertiary">·</span>
                )}
                <span>GIR {gir}%</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Quick stats — always visible (the snapshot the cards hid). Honest empty. */}
      <div className="hidden flex-shrink-0 items-center gap-4 md:flex">
        {hasAnyMicroStat ? (
          <>
            <RowStat label="Putts" value={putts !== null ? `${putts}` : '—'} />
            <RowStat label="FIR" value={fir !== null ? `${fir}%` : '—'} />
            <RowStat label="GIR" value={gir !== null ? `${gir}%` : '—'} />
          </>
        ) : (
          <span className="font-fw-sans text-eyebrow italic text-text-tertiary">No stats logged</span>
        )}
      </div>

      {/* Score + to-par */}
      <div className="flex w-[88px] flex-shrink-0 items-center justify-end gap-2">
        {round.total_score !== null ? (
          <span
            className={cn(
              'font-fw-display text-h3 font-medium leading-none tabular-nums',
              tone === 'under' ? 'text-accent-700' : 'text-text-primary',
            )}
          >
            {round.total_score}
          </span>
        ) : (
          <span className="font-fw-display text-h3 font-medium leading-none text-text-tertiary">—</span>
        )}
        {hasToPar && (
          <StatusPill
            tone={tone === 'under' ? 'accent' : tone === 'over' ? 'warning' : 'neutral'}
            size="sm"
            dot={false}
            className="font-fw-mono tabular-nums"
          >
            {formatToPar(stp)}
          </StatusPill>
        )}
      </div>

      {/* Coach: player avatar + name. The name text is `md:`-only — on mobile
          this block is `flex-shrink-0` (it never yields width to its
          siblings), so at a 390px viewport a long player name (up to the
          96px cap) plus the Date/Score columns' own fixed widths squeezed
          the "Course + type" column down to ~50px: too narrow for even one
          Putts/FIR/GIR chip, so the mobile condensed stat line's own
          `flex-wrap` (already correct) had almost nothing to wrap WITH and
          rendered every chip on its own line (audit W2 — pill-flow). The
          Avatar alone already carries the player's name accessibly (its own
          `alt`/`sr-only` fallback), so hiding the redundant text label below
          `md` is a lossless a11y trade that gives the stat line back its
          own line. */}
      {userRole === 'coach' && round.player && (
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <Avatar
            src={round.player.avatar_url}
            name={playerName || undefined}
            size="sm"
            className="flex-shrink-0"
          />
          {playerName && (
            <span className="hidden max-w-[96px] truncate font-fw-sans text-body-sm font-medium text-warm-700 md:inline-block">
              {playerName}
            </span>
          )}
        </div>
      )}

      {/* Hover affordance */}
      <ChevronRight
        aria-hidden="true"
        className="hidden h-4 w-4 flex-shrink-0 text-text-tertiary opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 md:block"
      />
    </Link>
  );
}

function RowStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex w-11 flex-col items-end leading-tight">
      <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
        {value}
      </span>
      <span className="font-fw-sans text-eyebrow uppercase tracking-[0.06em] text-text-tertiary">
        {label}
      </span>
    </span>
  );
}
