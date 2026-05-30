'use client';

/**
 * ============================================================================
 * Fairway · Rounds · FairwayRoundCard — ONE round in the library
 * ----------------------------------------------------------------------------
 * The redesigned round tile (re-skin of the legacy RoundCardV2). Built from the
 * Fairway interactive `Surface` (matte cream — NEVER bg-white), the whole card
 * is a Link to the round detail. It carries:
 *
 *   • the score (Numeric, tabular) + a color-graded score-to-par via StatusPill
 *     (accent under par · neutral E · AMBER over par — amber, NEVER red)
 *   • a type Chip, the date, course + city, a holes Badge
 *   • a best-of-period accent rail down the left edge
 *   • a hover/focus-reveal micro-stat row (Putts / FIR% / GIR% from real columns
 *     — FIR/GIR computed only when the possible-count > 0; an HONEST "No stats
 *     logged" line when every micro-stat is null)
 *   • (coach view only) a Fairway Avatar of the player who logged the round
 *
 * HONESTY: no fabricated zeros. FIR/GIR are omitted (not shown as 0%) when the
 * denominator is missing or zero; the micro-row falls back to a plain honest
 * "No stats logged" sentence when nothing real is loggable.
 *
 * ADDITIVE + GATED — rendered only inside the FairwayRoundsLibrary behind the
 * isRedesignEnabled() fork on the rounds route. Renders inside `.fairway-ds`.
 * ========================================================================== */

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway/surfaces/surface';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { Badge, Chip } from '@/components/fairway/controls/badge';
import { Avatar } from '@/components/fairway/controls/avatar';
import type { RoundLibraryRound } from './FairwayRoundsLibrary';

/** Score-to-par tone: under par = accent, level = neutral, over par = amber. */
type ScoreTone = 'under' | 'par' | 'over';

function scoreToParTone(stp: number): ScoreTone {
  if (stp < 0) return 'under';
  if (stp === 0) return 'par';
  return 'over';
}

/** "E" at level, signed otherwise. */
function formatToPar(stp: number): string {
  if (stp === 0) return 'E';
  return stp > 0 ? `+${stp}` : `${stp}`;
}

function getRoundTypeLabel(type: string | null): string {
  switch (type) {
    case 'tournament':
      return 'Tournament';
    case 'qualifier':
    case 'qualifying':
      return 'Qualifier';
    case 'practice':
      return 'Practice';
    case 'casual':
      return 'Casual';
    default:
      return type ? type.replace(/_/g, ' ') : 'Round';
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export interface FairwayRoundCardProps {
  round: RoundLibraryRound;
  /** Marks the lowest score-to-par card in its period — gets the accent rail. */
  isBestOfPeriod: boolean;
  userRole: 'coach' | 'player';
}

/** One round in the library. Whole card links to the round detail. */
export function FairwayRoundCard({ round, isBestOfPeriod, userRole }: FairwayRoundCardProps) {
  const stp = round.score_to_par ?? 0;
  const hasToPar = round.score_to_par !== null;
  const tone = scoreToParTone(stp);
  const holesPlayed = round.holes_played ?? 18;
  const playerName = round.player
    ? `${round.player.first_name || ''} ${round.player.last_name || ''}`.trim()
    : '';

  // Micro-stats — FIR / GIR are HONEST: computed only when the possible-count
  // is present and > 0 (never a fabricated 0%).
  const fir =
    round.total_fairways !== null && round.total_fairways > 0 && round.total_fairways_hit !== null
      ? Math.round((round.total_fairways_hit / round.total_fairways) * 100)
      : null;
  const gir =
    round.total_gir_possible !== null &&
    round.total_gir_possible > 0 &&
    round.total_gir !== null
      ? Math.round((round.total_gir / round.total_gir_possible) * 100)
      : null;
  const hasPutts = round.total_putts !== null;
  const hasAnyMicroStat = hasPutts || fir !== null || gir !== null;

  const city = [round.course_city, round.course_state].filter(Boolean).join(', ');

  return (
    <Link
      href={`/golf/dashboard/rounds/${round.id}`}
      className="group/card block rounded-card outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      <Surface interactive padding="none" className="overflow-hidden">
      {/* Best-of-period left rail accent */}
      {isBestOfPeriod && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] rounded-l-card bg-accent-500"
        />
      )}

      <div className="flex flex-col gap-2.5 px-4 py-3.5">
        {/* Top row: type chip (+ best badge) · date */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Chip tone="neutral" size="sm" className="uppercase tracking-[0.06em]">
              {getRoundTypeLabel(round.round_type)}
            </Chip>
            {isBestOfPeriod && (
              <Badge tone="accent" size="sm" className="uppercase tracking-[0.06em]">
                Best
              </Badge>
            )}
          </div>
          <span className="flex-shrink-0 font-fw-sans text-eyebrow font-medium tabular-nums text-text-tertiary">
            {formatDate(round.round_date)}
          </span>
        </div>

        {/* Hero score row: score + to-par pill · (coach) avatar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {round.total_score !== null ? (
              <span
                className={cn(
                  'font-fw-display text-h1 font-medium leading-none tabular-nums tracking-[-0.01em]',
                  tone === 'under' ? 'text-accent-700' : 'text-text-primary',
                )}
              >
                {round.total_score}
              </span>
            ) : (
              <span className="font-fw-display text-h1 font-medium leading-none text-text-tertiary">
                —
              </span>
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

          {userRole === 'coach' && round.player && (
            <Avatar
              src={round.player.avatar_url}
              name={playerName || undefined}
              size="sm"
              className="flex-shrink-0"
            />
          )}
        </div>

        {/* Course + city · holes badge */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
              {round.course_name ?? 'Unknown course'}
            </p>
            {city && (
              <p className="truncate font-fw-sans text-caption text-text-tertiary">{city}</p>
            )}
          </div>
          <Badge tone="neutral" size="sm" numeric className="flex-shrink-0">
            {holesPlayed}h
          </Badge>
        </div>

        {/* Hover/focus-reveal micro-stat row. Collapsed by default; expands on
            card hover or keyboard focus. Honest "No stats logged" when empty. */}
        <div
          className={cn(
            'grid grid-rows-[0fr] transition-[grid-template-rows,opacity] duration-[220ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]',
            'opacity-0 group-hover/card:grid-rows-[1fr] group-hover/card:opacity-100',
            'group-focus-visible/card:grid-rows-[1fr] group-focus-visible/card:opacity-100',
            'motion-reduce:transition-none',
          )}
        >
          <div className="overflow-hidden">
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle pt-2.5">
              {hasAnyMicroStat ? (
                <>
                  {hasPutts && <MicroStat label="Putts" value={`${round.total_putts}`} />}
                  {fir !== null && <MicroStat label="FIR" value={`${fir}%`} />}
                  {gir !== null && <MicroStat label="GIR" value={`${gir}%`} />}
                </>
              ) : (
                <span className="font-fw-sans text-eyebrow italic text-text-tertiary">
                  No stats logged
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      </Surface>
    </Link>
  );
}

function MicroStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
        {value}
      </span>
      <span className="font-fw-sans text-eyebrow uppercase tracking-[0.06em] text-text-tertiary">
        {label}
      </span>
    </span>
  );
}
