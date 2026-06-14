'use client';

/**
 * ============================================================================
 * Fairway · Qualifiers · FairwayQualifierLeaderboard — the matte live standings
 * ----------------------------------------------------------------------------
 * The HERO of the redesigned Qualifier Detail page (DESIGN-SYSTEM §5.2
 * "Qualifier leaderboard" + §0 #8 "honest emptiness"). A PRESENTATION rebuild
 * ONLY: it reuses the existing `useQualifierRealtime` hook VERBATIM (same
 * subscription, same data shape) and re-skins the presentation onto Fairway
 * tokens.
 *
 * REUSE (logic, UNCHANGED):
 *   • `useQualifierRealtime(qualifierId)` — the same hook the legacy
 *     `QualifierLeaderboardRealtime` consumed. Same realtime channel, same
 *     per-player round aggregates, same loading/error contract.
 *   • The leaderboard sort + tie + position derivation mirrors the legacy
 *     `QualifierViewTabs` table data path (total-to-par asc, players with 0
 *     rounds sink to the bottom).
 *
 * REBUILD vs the legacy surface (DROP the skeuomorphic bracket):
 *   • No gradient/ring/medal/progress-bar `QualifierBracket` — a flat matte
 *     standings table (tabular-nums, sticky-feel header hairline) instead.
 *   • Honest pre-event state: when NO player has a completed round, the body is
 *     an EmptyState ("Awaiting first round — N players entered…") rather than a
 *     table of all-dash rows or a bracket painting "E" for 0-round players
 *     (FIX: the legacy bracket bug that printed 'E' / even-par for players who
 *     have not posted a score).
 *   • A 0-round player is NEVER given a position, "E", or a "0" total — the
 *     to-par / total / avg cells read an em-dash until a real round posts.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork. Renders
 * inside the `.fairway-ds` scope on a bg-canvas page.
 * ========================================================================== */

import { Fragment, useMemo } from 'react';
import { Flag } from 'lucide-react';

import { useQualifierRealtime } from '@/hooks/golf/use-qualifier-realtime';
import { Surface, EmptyState, InlineNotice, StatusPill, Skeleton } from '@/components/fairway';
import type { FwStatusTone } from '@/components/fairway/controls';
import { cn } from '@/lib/utils';

interface FairwayQualifierLeaderboardProps {
  qualifierId: string;
  /** Entrant count from the server fetch — used in the honest "awaiting" copy. */
  entrantCount: number;
  /**
   * Travel-squad size (golf_qualifiers.selection_slots_total). The full lineup
   * that makes the trip. 0/undefined → no cut lines are drawn (the coach hasn't
   * declared a squad size, so we never invent one).
   */
  selectionSlotsTotal?: number;
  /**
   * How many of those spots are the coach's discretionary picks
   * (golf_qualifiers.selection_slots_coach_pick). The remainder
   * (`total − coachPick`) are the TOP-SCORE auto-qualify slots — players who lock
   * their spot on merit. Mirrors the coach-side QualifyingBoard math.
   */
  selectionSlotsCoachPick?: number;
}

/** Where a scored player sits relative to the travel squad. */
type LineupTier = 'locked' | 'bubble' | 'out' | null;

/** A presentation row derived from the realtime leaderboard entries. */
interface StandingRow {
  playerId: string;
  playerName: string;
  roundsCompleted: number;
  totalScore: number | null;
  totalToPar: number | null;
  /** Scoring average (total ÷ rounds) — the headline college stat; null until scored. */
  averageScore: number | null;
  hasScore: boolean;
  /** Display position (1-based among scored players); null until a score posts. */
  position: number | null;
  isTied: boolean;
}

/** Format a to-par value honestly: only scored players get '+N' / 'E' / '-N'. */
function formatToPar(toPar: number | null, hasScore: boolean): string {
  if (!hasScore || toPar === null) return '—';
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

export function FairwayQualifierLeaderboard({
  qualifierId,
  entrantCount,
  selectionSlotsTotal = 0,
  selectionSlotsCoachPick = 0,
}: FairwayQualifierLeaderboardProps) {
  // VERBATIM: same hook, same realtime subscription as the legacy leaderboard.
  const { leaderboard: entries, qualifier, loading, error } = useQualifierRealtime(qualifierId);

  // Mirror the legacy QualifierViewTabs sort/tie data path, but track an honest
  // `hasScore` flag so 0-round players never render a position or even-par.
  const rows = useMemo<StandingRow[]>(() => {
    if (!entries || entries.length === 0) return [];

    const sorted = [...entries].sort((a, b) => {
      const aScored = a.rounds_completed > 0;
      const bScored = b.rounds_completed > 0;
      // Players with rounds sort above those without (legacy behavior).
      if (aScored && !bScored) return -1;
      if (!aScored && bScored) return 1;
      if (!aScored && !bScored) return 0;
      const aToPar = a.total_to_par ?? Infinity;
      const bToPar = b.total_to_par ?? Infinity;
      if (aToPar !== bToPar) return aToPar - bToPar;
      const aScore = a.total_score ?? Infinity;
      const bScore = b.total_score ?? Infinity;
      return aScore - bScore;
    });

    let scoredSeen = 0;
    return sorted.map((entry, index) => {
      const hasScore = entry.rounds_completed > 0;
      const position = hasScore ? ++scoredSeen : null;
      const prev = index > 0 ? sorted[index - 1] : undefined;
      const isTied =
        hasScore &&
        prev !== undefined &&
        prev.rounds_completed > 0 &&
        (prev.total_to_par ?? null) === (entry.total_to_par ?? null);

      const totalScore = hasScore ? entry.total_score ?? null : null;
      const averageScore =
        hasScore && totalScore !== null && entry.rounds_completed > 0
          ? totalScore / entry.rounds_completed
          : null;

      return {
        playerId: entry.player_id,
        playerName: entry.player_name,
        roundsCompleted: entry.rounds_completed,
        totalScore,
        totalToPar: hasScore ? entry.total_to_par ?? null : null,
        averageScore,
        hasScore,
        position,
        isTied,
      };
    });
  }, [entries]);

  const anyScored = rows.some((r) => r.hasScore);
  const isLive = qualifier?.status === 'in_progress';

  return (
    <Surface aria-label="Qualifier leaderboard">
      <Surface.Header
        title="Leaderboard"
        actions={
          isLive ? (
            <StatusPill tone="accent" pulse>
              Live
            </StatusPill>
          ) : undefined
        }
      />
      <Surface.Body>
        {loading ? (
          <LeaderboardSkeleton />
        ) : error ? (
          <InlineNotice tone="danger" title="Couldn't load the leaderboard">
            {error}
          </InlineNotice>
        ) : !anyScored ? (
          // HONEST pre-event hero state — no fabricated rows, no 'E', no zeros.
          <EmptyState
            variant="subtle"
            icon={Flag}
            title="Awaiting first round"
            description={
              entrantCount > 0
                ? `${entrantCount} player${entrantCount === 1 ? '' : 's'} entered — scores post here as rounds are submitted.`
                : 'Scores post here as rounds are submitted.'
            }
          />
        ) : (
          <StandingsTable
            rows={rows}
            selectionSlotsTotal={selectionSlotsTotal}
            selectionSlotsCoachPick={selectionSlotsCoachPick}
          />
        )}
      </Surface.Body>
    </Surface>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Matte standings table — flat, tabular-nums, no bracket / medals / rings
 * ──────────────────────────────────────────────────────────────────────── */

/** Tier badge config for a scored player's lineup standing. */
const TIER_BADGE: Record<'locked' | 'bubble', { tone: FwStatusTone; label: string }> = {
  locked: { tone: 'accent', label: 'In lineup' },
  bubble: { tone: 'warning', label: 'Bubble' },
};

function StandingsTable({
  rows,
  selectionSlotsTotal,
  selectionSlotsCoachPick,
}: {
  rows: StandingRow[];
  selectionSlotsTotal: number;
  selectionSlotsCoachPick: number;
}) {
  // ── College travel-squad model ────────────────────────────────────────────
  // total spots = (top-score auto-qualify) + (coach's discretionary picks).
  // The top-score line is where merit locks a spot; below it, up to the travel
  // line, players are on the "bubble" for a coach's pick. Mirrors the coach-side
  // QualifyingBoard (topScoreSlots = total − coachPick).
  const travelLine = selectionSlotsTotal > 0 ? selectionSlotsTotal : 0;
  const coachPicks = Math.min(Math.max(selectionSlotsCoachPick, 0), travelLine);
  const topScoreLine = travelLine > 0 ? travelLine - coachPicks : 0;
  const scoredCount = rows.reduce((n, r) => (r.hasScore ? n + 1 : n), 0);

  // Only draw a line when a real player actually falls below it.
  const drawTopScoreLine = topScoreLine > 0 && coachPicks > 0 && scoredCount > topScoreLine;
  const drawTravelLine = travelLine > 0 && scoredCount > travelLine;

  // Tier + cut lines key on the PHYSICAL scored rank (count of scored players
  // above + self), NOT the golf position — a tie (positions 3,3,5) would skip
  // the exact line number and the rule would never render.
  let scoredRank = 0;
  const decorated = rows.map((row) => ({
    row,
    scoredRank: row.hasScore ? ++scoredRank : null,
  }));

  const tierFor = (rank: number | null): LineupTier => {
    if (rank === null || travelLine <= 0) return null;
    if (rank <= topScoreLine) return 'locked';
    if (rank <= travelLine) return coachPicks > 0 ? 'bubble' : 'locked';
    return 'out';
  };

  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full border-collapse font-fw-sans text-body">
        <thead>
          <tr className="border-b border-border-strong text-left">
            <Th className="w-12">Pos</Th>
            <Th>Player</Th>
            <Th align="right">Rounds</Th>
            <Th align="right">Avg</Th>
            <Th align="right">Total</Th>
            <Th align="right">To par</Th>
          </tr>
        </thead>
        <tbody>
          {decorated.map(({ row, scoredRank: rank }) => {
            const leader = row.position === 1;
            const tier = tierFor(rank);
            const badge = tier === 'locked' || tier === 'bubble' ? TIER_BADGE[tier] : null;
            return (
              <Fragment key={row.playerId}>
                <tr
                  className={cn(
                    'border-b border-border-subtle last:border-b-0',
                    leader && 'bg-accent-50/60',
                    tier === 'out' && 'text-text-secondary',
                  )}
                >
                  <td className="py-2.5 pr-3 text-text-secondary tabular-nums">
                    {row.position === null ? (
                      <span className="text-text-tertiary">—</span>
                    ) : (
                      <span className={cn(leader && 'font-medium text-accent-700')}>
                        {row.isTied ? 'T' : ''}
                        {row.position}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-text-primary">
                    <span className="inline-flex items-center gap-2">
                      <span className={cn(tier === 'out' && 'text-text-secondary')}>
                        {row.playerName}
                      </span>
                      {badge ? (
                        <StatusPill tone={badge.tone} size="sm" className="flex-shrink-0">
                          {badge.label}
                        </StatusPill>
                      ) : null}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right text-text-secondary tabular-nums">
                    {row.roundsCompleted > 0 ? row.roundsCompleted : '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-fw-mono text-text-secondary tabular-nums">
                    {row.averageScore !== null ? row.averageScore.toFixed(1) : '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-fw-mono text-text-primary tabular-nums">
                    {row.hasScore && row.totalScore !== null ? row.totalScore : '—'}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 text-right font-fw-mono tabular-nums',
                      row.hasScore && row.totalToPar !== null && row.totalToPar < 0
                        ? 'text-accent-700'
                        : 'text-text-secondary',
                    )}
                  >
                    {formatToPar(row.totalToPar, row.hasScore)}
                  </td>
                </tr>

                {/* TOP-SCORE LINE — merit locks a spot above this rule */}
                {drawTopScoreLine && rank === topScoreLine ? (
                  <CutLineRow
                    tone="accent"
                    label={`Top-score line · ${topScoreLine} auto-qualify`}
                  />
                ) : null}

                {/* TRAVEL CUT — full squad (incl. coach's picks) makes the trip above this */}
                {drawTravelLine && rank === travelLine ? (
                  <CutLineRow
                    tone="muted"
                    label={`Travel cut · top ${travelLine} make the trip`}
                  />
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Honest ranking-basis caption */}
      <p className="mt-3 px-0.5 font-fw-sans text-caption text-text-tertiary">
        Ranked by cumulative to-par, lowest first. Every completed round counts.
        {travelLine > 0
          ? coachPicks > 0
            ? ` Top ${topScoreLine} auto-qualify; ${coachPicks} coach's-pick spot${
                coachPicks === 1 ? ' fills' : 's fill'
              } the ${travelLine}-player travel squad.`
            : ` Top ${travelLine} make the travel squad.`
          : ''}
      </p>
    </div>
  );
}

/** A full-width horizontal rule between table rows marking a selection cut. */
function CutLineRow({ tone, label }: { tone: 'accent' | 'muted'; label: string }) {
  const ruleClass = tone === 'accent' ? 'bg-accent-300' : 'bg-border-strong';
  const textClass = tone === 'accent' ? 'text-accent-700' : 'text-text-tertiary';
  return (
    <tr aria-hidden="true">
      <td colSpan={6} className="py-1.5">
        <div className="flex items-center gap-2.5">
          <span className={cn('h-px flex-1', ruleClass)} />
          <span
            className={cn(
              'whitespace-nowrap font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em]',
              textClass,
            )}
          >
            {label}
          </span>
          <span className={cn('h-px flex-1', ruleClass)} />
        </div>
      </td>
    </tr>
  );
}

function Th({
  children,
  align = 'left',
  className,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th
      className={cn(
        'pb-2 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary',
        align === 'right' ? 'pl-3 text-right' : 'pr-3 text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

function LeaderboardSkeleton() {
  return (
    <div role="status" aria-label="Loading leaderboard" className="space-y-3">
      <Skeleton className="h-3 w-full rounded" />
      <Skeleton className="h-3 w-5/6 rounded" />
      <Skeleton className="h-3 w-4/6 rounded" />
    </div>
  );
}
