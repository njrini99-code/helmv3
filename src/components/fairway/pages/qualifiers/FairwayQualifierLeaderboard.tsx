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

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Flag } from 'lucide-react';

import { useQualifierRealtime } from '@/hooks/golf/use-qualifier-realtime';
import { Surface, EmptyState, InlineNotice, StatusPill, Skeleton } from '@/components/fairway';
import type { FwStatusTone } from '@/components/fairway/controls';
import { formatToPar } from '@/lib/golf/format-to-par';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

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
  /**
   * P31 — the Detail page's "Rounds submitted" summary tile is computed by a
   * SEPARATE server query (`golf_rounds` filtered `status='completed'` at
   * request time) than this component's live `useQualifierRealtime` feed, so
   * the two can visibly disagree ("Rounds Submitted: 0" over a leaderboard
   * showing every entrant with a posted round) whenever a round lands between
   * the page's initial fetch and now. Reporting OUR live total back up lets
   * the parent tile re-sync to the SAME data the leaderboard below it is
   * already showing, instead of trusting a snapshot that can go stale.
   */
  onRoundsSubmittedChange?: (roundsSubmitted: number) => void;
}

/** Where a scored player sits relative to the travel squad. */
type LineupTier = 'locked' | 'bubble' | 'out' | null;

/**
 * Derive the authoritative "committed selections" Set from the
 * `golf_qualifier_selections` fetch (audit W1 — "qual-contradict"). A FAILED
 * fetch (RLS denial, transient network error, …) must never be conflated
 * with "confirmed zero selections" — the old code did `sels ?? []`, which
 * silently turned a query error into an empty-but-truthy Set, rendering
 * EVERY entrant (including a genuine top-4) as "Not selected". Returns
 * `null` — "we don't have a committed answer, fall back to the honest
 * merit-tier projection" — whenever selection isn't finalized yet OR the
 * fetch errored; only a real, successful, zero-row read means "no one is
 * selected".
 */
export function deriveCommittedSelections(
  selectionState: string | null | undefined,
  sels: { data: Array<{ player_id: string }> | null; error: unknown },
): Set<string> | null {
  if (selectionState !== 'selected') return null;
  if (sels.error) return null;
  return new Set((sels.data ?? []).map((s) => s.player_id));
}

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

export function FairwayQualifierLeaderboard({
  qualifierId,
  entrantCount,
  selectionSlotsTotal = 0,
  selectionSlotsCoachPick = 0,
  onRoundsSubmittedChange,
}: FairwayQualifierLeaderboardProps) {
  // VERBATIM: same hook, same realtime subscription as the legacy leaderboard.
  const { leaderboard: entries, qualifier, loading, error } = useQualifierRealtime(qualifierId);

  // W32 follow-up: once the coach confirms the roster, the "Locked"/"Bubble"
  // tiers below are a live merit PROJECTION that never reflects the coach's
  // actual committed decision (coach picks can override merit). When the
  // qualifier's selection has been finalized, overlay an authoritative
  // "Selected"/"Not selected" badge sourced straight from
  // golf_qualifier_selections instead. A self-contained query (not routed
  // through useQualifierRealtime, which doesn't track selection state) — RLS
  // (qualifier_selections_player_read) already grants players read access.
  const [committedSelections, setCommittedSelections] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function loadCommittedSelections() {
      const { data: q } = await supabase
        .from('golf_qualifiers')
        .select('selection_state')
        .eq('id', qualifierId)
        .maybeSingle();

      if (q?.selection_state !== 'selected') {
        if (!cancelled) setCommittedSelections(null);
        return;
      }

      const { data: sels, error: selsError } = await supabase
        .from('golf_qualifier_selections')
        .select('player_id')
        .eq('qualifier_id', qualifierId);

      if (!cancelled) {
        setCommittedSelections(
          deriveCommittedSelections(q.selection_state, { data: sels, error: selsError }),
        );
      }
    }

    if (qualifierId) loadCommittedSelections();
    return () => {
      cancelled = true;
    };
  }, [qualifierId]);

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

  // P31 — report OUR live rounds-submitted total (sum of each player's
  // completed-round count) up to the parent so its summary tile can re-sync
  // to the SAME feed this leaderboard renders from, instead of the separate
  // server snapshot it was built from at request time.
  useEffect(() => {
    if (!onRoundsSubmittedChange || !entries) return;
    const liveTotal = entries.reduce((sum, e) => sum + e.rounds_completed, 0);
    onRoundsSubmittedChange(liveTotal);
  }, [entries, onRoundsSubmittedChange]);

  const anyScored = rows.some((r) => r.hasScore);
  const isLive = qualifier?.status === 'in_progress';
  // #91 — a `completed` qualifier with zero scored rounds is NOT "awaiting"
  // anything; that copy is forward-looking and reads as a bug on a closed
  // event. Read the honest completed-with-no-data state instead.
  const isCompleted = qualifier?.status === 'completed';

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
        ) : !anyScored && isCompleted ? (
          // #91 — completed-with-no-data reads as COMPLETED, never a
          // forward-looking "awaiting" message (the event already ended).
          <EmptyState
            variant="subtle"
            icon={Flag}
            title="Completed: no rounds were recorded"
            description={
              entrantCount > 0
                ? `${entrantCount} player${entrantCount === 1 ? '' : 's'} entered, but no rounds were posted before this qualifier closed.`
                : 'This qualifier closed with no rounds posted.'
            }
          />
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
            committedSelections={committedSelections}
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
  committedSelections,
}: {
  rows: StandingRow[];
  selectionSlotsTotal: number;
  selectionSlotsCoachPick: number;
  /** Authoritative golf_qualifier_selections player_ids once the coach has
   *  confirmed the roster; null while selection is still open/in progress. */
  committedSelections: Set<string> | null;
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
    <div>
      {/* P29 — phone: card rows carry ALL FOUR competitive columns (Rounds,
          Avg, Total, To par), never silently dropped behind a scroll a phone
          user has no affordance to discover. Rule 8 (card, not a squeezed
          table) — matches FairwayQualifierDetail's RoundBreakdownTable. */}
      <ul className="divide-y divide-border-subtle md:hidden">
        {decorated.map(({ row, scoredRank: rank }) => {
          const leader = row.position === 1;
          const tier = tierFor(rank);
          const badge = committedSelections
            ? committedSelections.has(row.playerId)
              ? { tone: 'success' as FwStatusTone, label: 'Selected' }
              : { tone: 'neutral' as FwStatusTone, label: 'Not selected' }
            : tier === 'locked' || tier === 'bubble'
              ? TIER_BADGE[tier]
              : null;
          return (
            <Fragment key={row.playerId}>
              <li className={cn('flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0', leader && 'bg-accent-50/60')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        'w-6 shrink-0 text-right font-fw-mono text-body-sm tabular-nums',
                        leader ? 'font-medium text-accent-700' : 'text-text-tertiary',
                      )}
                    >
                      {row.position === null ? '—' : `${row.isTied ? 'T' : ''}${row.position}`}
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/golf/dashboard/stats?player=${row.playerId}`}
                        className={cn(
                          'truncate rounded-fw-sm font-fw-sans text-body font-medium text-text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                          tier === 'out' && 'text-text-secondary',
                        )}
                      >
                        {row.playerName}
                      </Link>
                      {badge ? (
                        <StatusPill tone={badge.tone} size="sm" className="ml-2 inline-flex flex-shrink-0 align-middle">
                          {badge.label}
                        </StatusPill>
                      ) : null}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 rounded-fw-md bg-surface-sunken px-3 py-2">
                  <StatCell label="Rounds">
                    {row.roundsCompleted > 0 ? row.roundsCompleted : '—'}
                  </StatCell>
                  <StatCell label="Avg">
                    {row.averageScore !== null ? row.averageScore.toFixed(1) : '—'}
                  </StatCell>
                  <StatCell label="Total">
                    {row.hasScore && row.totalScore !== null ? row.totalScore : '—'}
                  </StatCell>
                </div>
                <p
                  className={cn(
                    'text-right font-fw-mono text-body-sm tabular-nums',
                    row.hasScore && row.totalToPar !== null && row.totalToPar < 0
                      ? 'text-accent-700'
                      : 'text-text-secondary',
                  )}
                >
                  {formatToPar(row.totalToPar)} <span className="text-text-tertiary">to par</span>
                </p>
              </li>
              {drawTopScoreLine && rank === topScoreLine ? (
                <CutLineCard tone="accent" label={`Top-score line · ${topScoreLine} auto-qualify`} />
              ) : null}
              {drawTravelLine && rank === travelLine ? (
                <CutLineCard tone="muted" label={`Travel cut · top ${travelLine} make the trip`} />
              ) : null}
            </Fragment>
          );
        })}
      </ul>

      {/* Desktop (md+) — the flat matte table, unchanged. */}
      <div className="hidden overflow-x-auto overscroll-x-contain md:block">
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
            // Once the coach has confirmed, the committed ledger wins over the
            // live merit projection — a coach pick can put a player in the
            // squad even when their rank alone would read "bubble"/"out".
            const badge = committedSelections
              ? committedSelections.has(row.playerId)
                ? { tone: 'success' as FwStatusTone, label: 'Selected' }
                : { tone: 'neutral' as FwStatusTone, label: 'Not selected' }
              : tier === 'locked' || tier === 'bubble'
                ? TIER_BADGE[tier]
                : null;
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
                      <Link
                        href={`/golf/dashboard/stats?player=${row.playerId}`}
                        className={cn(
                          'rounded-fw-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                          tier === 'out' && 'text-text-secondary',
                        )}
                      >
                        {row.playerName}
                      </Link>
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
                    {/* `row.totalToPar` is already null for unscored players
                        (see the `rows` derivation above), so the shared
                        formatter's null → '—' path covers the honest-empty
                        case without a separate `hasScore` param. */}
                    {formatToPar(row.totalToPar)}
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
      </div>

      {/* Honest ranking-basis caption — shared by both the phone card list
          and the desktop table. */}
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

/** A single stat cell inside the phone card's 3-up Rounds/Avg/Total row. */
function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </span>
      <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
        {children}
      </span>
    </div>
  );
}

/** Phone equivalent of `CutLineRow` — a labelled rule between card rows. */
function CutLineCard({ tone, label }: { tone: 'accent' | 'muted'; label: string }) {
  const ruleClass = tone === 'accent' ? 'bg-accent-300' : 'bg-border-strong';
  const textClass = tone === 'accent' ? 'text-accent-700' : 'text-text-tertiary';
  return (
    <li aria-hidden="true" className="flex items-center gap-2.5 py-1.5">
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
    </li>
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
