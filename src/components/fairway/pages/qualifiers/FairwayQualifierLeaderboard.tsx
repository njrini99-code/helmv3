'use client';

/**
 * ============================================================================
 * Fairway · Qualifiers · FairwayQualifierLeaderboard — the live standings
 * ----------------------------------------------------------------------------
 * The hero of the Qualifier Detail page: a tournament board, kept classy. It
 * reuses `useQualifierRealtime` VERBATIM (same subscription, same data shape)
 * and derives golf standings from it (`deriveStandings`: a shared to-par
 * shares the position, "1 / T2 / T2 / 4").
 *
 * The board (owner 2026-09-27/28, no green bands, no green row wash): a
 * sunken column-header row closed by a strong rule; the position (the leader
 * carries an ink bar), the player with their identity avatar and lineup chip,
 * rounds, average, total, and the to-par as the big scoreboard figure (only
 * under par is coloured, see `toParTone`). The travel squad's lines are
 * labelled rules: the top-score line (auto-qualify) and the stronger travel
 * cut. Each scored player opens a detail panel: their rounds (a coach can open
 * each round card), the round-to-round trend, where they sit against the lead
 * and the lines, and, for a coach, their scoring average over the rest of the
 * season (computed on the server, never sent to a player).
 *
 * Honest states (unchanged): "Awaiting first round" before anyone scores; a
 * completed qualifier with nothing posted says so; a 0-round player never gets
 * a position, an "E", or a "0". Once the coach has committed the squad,
 * "Selected" / "Not selected" (golf_qualifier_selections) replaces the merit
 * projection.
 * ========================================================================== */

import { Fragment, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Flag } from 'lucide-react';

import { useQualifierRealtime } from '@/hooks/golf/use-qualifier-realtime';
import { Surface, EmptyState, InlineNotice, StatusPill, Skeleton, Avatar, IconButton } from '@/components/fairway';
import type { FwStatusTone } from '@/components/fairway/controls';
import { formatToPar } from '@/lib/golf/format-to-par';
import { formatMetricText } from '@/lib/golf/metrics/display-registry';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

import { deriveStandings, positionLabel, toParTone, type Standing } from './qualifier-display';
import type { PlayerSeasonAverage } from './qualifier-season';

/** One of a player's qualifier rounds, from the linked round cards. */
export interface LeaderboardRound {
  roundNumber: number;
  score: number | null;
  toPar: number | null;
  /** The round card; the route page sends it to a coach only. */
  roundId?: string | null;
}

/** A player's scoring average over their other countable 18-hole rounds. */
export type SeasonAverage = PlayerSeasonAverage;

/** Coach only: season averages for the field, outside this qualifier. */
export interface LeaderboardSeason {
  /** The calendar year the averages cover (the qualifier's start year). */
  year: number;
  byPlayer: Readonly<Record<string, SeasonAverage>>;
}

interface FairwayQualifierLeaderboardProps {
  qualifierId: string;
  /** Entrant count from the server fetch — used in the honest "awaiting" copy. */
  entrantCount: number;
  /**
   * Travel-squad size (golf_qualifiers.selection_slots_total). 0/undefined →
   * no cut lines are drawn (the coach hasn't declared a squad size).
   */
  selectionSlotsTotal?: number;
  /**
   * The coach's discretionary picks within the squad
   * (golf_qualifiers.selection_slots_coach_pick). The remainder are the
   * top-score auto-qualify spots. Mirrors the coach-side QualifyingBoard math.
   */
  selectionSlotsCoachPick?: number;
  /** The qualifier's rounds (golf_qualifiers.num_rounds). */
  numRounds?: number;
  /** Per-player rounds from the linked round cards; absent → totals only. */
  roundsByPlayer?: ReadonlyMap<string, LeaderboardRound[]>;
  /** Coach only: season scoring averages outside this qualifier. */
  season?: LeaderboardSeason | null;
  /** Coach only: each round chip opens its round card. */
  canOpenRounds?: boolean;
  /**
   * P31 — the live completed-round total, reported once the feed has loaded,
   * so a summary figure elsewhere re-syncs to the feed this board shows.
   */
  onRoundsSubmittedChange?: (roundsSubmitted: number) => void;
  /**
   * The derived standings, reported once the feed has loaded (never while it
   * is loading, never after a failed read), so the page's status card and
   * round-progress dots read the same rows this board shows. Pass a stable
   * function (a state setter): it is an effect dependency.
   */
  onStandingsChange?: (standings: Standing[]) => void;
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

export function FairwayQualifierLeaderboard({
  qualifierId,
  entrantCount,
  selectionSlotsTotal = 0,
  selectionSlotsCoachPick = 0,
  numRounds,
  roundsByPlayer,
  season = null,
  canOpenRounds = false,
  onRoundsSubmittedChange,
  onStandingsChange,
}: FairwayQualifierLeaderboardProps) {
  // VERBATIM: same hook, same realtime subscription as the legacy leaderboard.
  const { leaderboard: entries, qualifier, loading, error } = useQualifierRealtime(qualifierId);

  // W32 follow-up: once the coach confirms the roster, overlay the committed
  // "Selected"/"Not selected" from golf_qualifier_selections (a coach pick
  // can override merit). A self-contained query — useQualifierRealtime does
  // not track selection state; RLS (qualifier_selections_player_read) grants
  // players read access.
  const [committedSelections, setCommittedSelections] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function loadCommittedSelections() {
      const { data: q, error: qError } = await supabase
        .from('golf_qualifiers')
        .select('selection_state')
        .eq('id', qualifierId)
        .maybeSingle();

      // A failed read must not read as "not committed yet" silently: log it
      // and fall back to the merit projection (see deriveCommittedSelections,
      // which does the same for the selections read below).
      if (qError) {
        console.warn('[qualifier leaderboard] selection-state read failed:', qError.message);
        if (!cancelled) setCommittedSelections(null);
        return;
      }

      if (q?.selection_state !== 'selected') {
        if (!cancelled) setCommittedSelections(null);
        return;
      }

      const { data: sels, error: selsError } = await supabase
        .from('golf_qualifier_selections')
        .select('player_id')
        .eq('qualifier_id', qualifierId);

      if (!cancelled) {
        setCommittedSelections(deriveCommittedSelections(q.selection_state, { data: sels, error: selsError }));
      }
    }

    if (qualifierId) loadCommittedSelections();
    return () => {
      cancelled = true;
    };
  }, [qualifierId]);

  // Golf standings: a shared to-par shares the position ("T2") and the next
  // one skips; a player with no completed round never gets a position or "E".
  const rows = useMemo<Standing[]>(() => deriveStandings(entries ?? []), [entries]);

  // P31 — report OUR live totals up to the page so its status card and the
  // round-progress dots re-sync to the SAME feed this board renders from. Only
  // once the feed has answered: the hook starts with an empty list, and a
  // report then would flash "0" over the server's snapshot; a failed read
  // must not report "0" either.
  useEffect(() => {
    if (loading || error) return;
    onRoundsSubmittedChange?.((entries ?? []).reduce((sum, e) => sum + e.rounds_completed, 0));
    onStandingsChange?.(rows);
  }, [loading, error, entries, rows, onRoundsSubmittedChange, onStandingsChange]);

  const anyScored = rows.some((r) => r.hasScore);
  const isLive = qualifier?.status === 'in_progress';
  // #91 — a `completed` qualifier with zero scored rounds is NOT "awaiting"
  // anything; that copy is forward-looking and reads as a bug on a closed
  // event. Read the honest completed-with-no-data state instead.
  const isCompleted = qualifier?.status === 'completed';
  const rounds = Math.max(1, Math.floor(numRounds ?? qualifier?.num_rounds ?? 1));

  return (
    <Surface padding="none" aria-label="Qualifier leaderboard" className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-4 pb-3 pt-4 md:px-6">
        <h2 className="font-fw-sans text-h3 text-text-primary">Leaderboard</h2>
        {isLive ? (
          <StatusPill tone="accent" pulse>
            Live
          </StatusPill>
        ) : null}
      </div>

      {loading ? (
        <div className="px-4 pb-5 md:px-6">
          <LeaderboardSkeleton />
        </div>
      ) : error ? (
        <div className="px-4 pb-5 md:px-6">
          <InlineNotice tone="danger" title="Couldn't load the leaderboard">
            {error}
          </InlineNotice>
        </div>
      ) : !anyScored && isCompleted ? (
        <div className="px-4 pb-5 md:px-6">
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
        </div>
      ) : !anyScored ? (
        // HONEST pre-event state — no fabricated rows, no 'E', no zeros.
        <div className="px-4 pb-5 md:px-6">
          <EmptyState
            variant="subtle"
            icon={Flag}
            title="Awaiting first round"
            description={
              entrantCount > 0
                ? `${entrantCount} player${entrantCount === 1 ? '' : 's'} entered. Scores post here as rounds are submitted.`
                : 'Scores post here as rounds are submitted.'
            }
          />
        </div>
      ) : (
        <StandingsBoard
          rows={rows}
          numRounds={rounds}
          completed={isCompleted}
          selectionSlotsTotal={selectionSlotsTotal}
          selectionSlotsCoachPick={selectionSlotsCoachPick}
          committedSelections={committedSelections}
          roundsByPlayer={roundsByPlayer}
          season={season}
          canOpenRounds={canOpenRounds}
        />
      )}
    </Surface>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * The standings — phone rows and the md+ table, one derivation
 * ──────────────────────────────────────────────────────────────────────── */

const TIER_BADGE: Record<'locked' | 'bubble', { tone: FwStatusTone; label: string }> = {
  locked: { tone: 'info', label: 'In lineup' },
  bubble: { tone: 'warning', label: 'Bubble' },
};

/** What a player's detail panel reads, beyond their own row. */
interface BoardContext {
  numRounds: number;
  completed: boolean;
  /** Scored players in board order (index = rank − 1). */
  scored: Standing[];
  /** The last rank inside each drawn line; 0 when the line is not drawn. */
  topScoreLine: number;
  travelLine: number;
  roundsByPlayer?: ReadonlyMap<string, LeaderboardRound[]>;
  season: LeaderboardSeason | null;
  canOpenRounds: boolean;
}

function StandingsBoard({
  rows,
  numRounds,
  completed,
  selectionSlotsTotal,
  selectionSlotsCoachPick,
  committedSelections,
  roundsByPlayer,
  season,
  canOpenRounds,
}: {
  rows: Standing[];
  numRounds: number;
  completed: boolean;
  selectionSlotsTotal: number;
  selectionSlotsCoachPick: number;
  /** Authoritative golf_qualifier_selections player_ids once the coach has
   *  confirmed the roster; null while selection is still open/in progress. */
  committedSelections: Set<string> | null;
  roundsByPlayer?: ReadonlyMap<string, LeaderboardRound[]>;
  season: LeaderboardSeason | null;
  canOpenRounds: boolean;
}) {
  const baseId = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (playerId: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });

  // ── College travel-squad model ────────────────────────────────────────────
  // total spots = (top-score auto-qualify) + (coach's discretionary picks).
  // Mirrors the coach-side QualifyingBoard (topScoreSlots = total − coachPick).
  const travelLine = selectionSlotsTotal > 0 ? selectionSlotsTotal : 0;
  const coachPicks = Math.min(Math.max(selectionSlotsCoachPick, 0), travelLine);
  const topScoreLine = travelLine > 0 ? travelLine - coachPicks : 0;
  const scored = rows.filter((r) => r.hasScore);

  // Only draw a line when a real player falls below it. Lines key on the
  // PHYSICAL rank, not the golf position: a tie (3, T3, 5) would skip the
  // exact line number and the rule would never render.
  const drawTopScoreLine = topScoreLine > 0 && coachPicks > 0 && scored.length > topScoreLine;
  const drawTravelLine = travelLine > 0 && scored.length > travelLine;

  const tierFor = (rank: number | null): LineupTier => {
    if (rank === null || travelLine <= 0) return null;
    if (rank <= topScoreLine) return 'locked';
    if (rank <= travelLine) return coachPicks > 0 ? 'bubble' : 'locked';
    return 'out';
  };
  // Once the coach has confirmed, the committed ledger wins over the live
  // merit projection — a coach pick can put a player in the squad even when
  // their rank alone would read "bubble"/"out".
  const badgeFor = (row: Standing, tier: LineupTier): { tone: FwStatusTone; label: string } | null => {
    if (committedSelections) {
      return committedSelections.has(row.playerId)
        ? { tone: 'info', label: 'Selected' }
        : { tone: 'neutral', label: 'Not selected' };
    }
    return tier === 'locked' || tier === 'bubble' ? TIER_BADGE[tier] : null;
  };

  const ctx: BoardContext = {
    numRounds,
    completed,
    scored,
    topScoreLine: drawTopScoreLine ? topScoreLine : 0,
    travelLine: drawTravelLine ? travelLine : 0,
    roundsByPlayer,
    season,
    canOpenRounds,
  };
  const topScoreLabel = `Top-score line · ${topScoreLine} auto-qualify`;
  const travelLabel = `Travel cut · top ${travelLine} make the trip`;

  // The top-score line sits strictly above the travel cut whenever both are
  // drawn (it needs coach's picks), so a rank carries at most one rule.
  const views = rows.map((row) => {
    const tier = tierFor(row.rank);
    return {
      row,
      badge: badgeFor(row, tier),
      out: tier === 'out',
      expanded: open.has(row.playerId),
      lineBelow:
        ctx.topScoreLine > 0 && row.rank === ctx.topScoreLine
          ? ('line' as const)
          : ctx.travelLine > 0 && row.rank === ctx.travelLine
            ? ('cut' as const)
            : null,
    };
  });

  return (
    <div>
      {/* P29 — phone: card rows carry ALL FOUR competitive columns (Rounds,
          Avg, Total, To par), never dropped behind a scroll a phone user has
          no affordance to discover (Rule 8: a card, not a squeezed table). */}
      <ul className="border-t border-border-strong md:hidden">
        {views.map(({ row, badge, out, expanded, lineBelow }) => {
          const panelId = `${baseId}-m-${row.playerId}`;
          return (
            <Fragment key={row.playerId}>
              <li className="relative border-b border-border-subtle px-4 py-3 last:border-b-0">
                {row.position === 1 ? <LeaderBar /> : null}
                <div className="flex items-center gap-3">
                  <Position row={row} out={out} className="w-7 shrink-0 text-right" />
                  <Avatar name={row.playerName} identityKey={row.playerId} tone="identity" size="sm" decorative />
                  <div className="min-w-0 flex-1">
                    {/* The link's hit area grows to 44px without moving the layout. */}
                    <PlayerLink row={row} muted={out} className="-my-2.5 py-2.5" />
                    {badge ? (
                      <StatusPill tone={badge.tone} size="sm" className="mt-1">
                        {badge.label}
                      </StatusPill>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn('font-fw-sans text-h3 font-semibold tabular-nums', toParTone(row.totalToPar))}>
                      {formatToPar(row.totalToPar)}
                    </p>
                    <p className="font-fw-sans text-caption text-text-tertiary">to par</p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-2 pl-10">
                  <div className="grid min-w-0 flex-1 grid-cols-3 gap-3 rounded-fw-md bg-surface-sunken px-3 py-2">
                    <StatCell label="Rounds">
                      <RoundsPlayedValue row={row} numRounds={numRounds} />
                    </StatCell>
                    <StatCell label="Avg">{formatAverage(row.averageScore)}</StatCell>
                    <StatCell label="Total">{row.hasScore && row.totalScore !== null ? row.totalScore : '—'}</StatCell>
                  </div>
                  {row.hasScore ? (
                    <ExpandButton
                      size="md"
                      name={row.playerName}
                      expanded={expanded}
                      controls={panelId}
                      onToggle={() => toggle(row.playerId)}
                    />
                  ) : null}
                </div>
                {expanded ? (
                  <div id={panelId} className="mt-3 pl-10">
                    <StandingDetail row={row} ctx={ctx} />
                  </div>
                ) : null}
              </li>
              {lineBelow ? (
                <CutLine as="li" tone={lineBelow} label={lineBelow === 'line' ? topScoreLabel : travelLabel} />
              ) : null}
            </Fragment>
          );
        })}
      </ul>

      {/* md+ — the table: a sunken header row closed by a strong rule */}
      <div className="hidden overflow-x-auto overscroll-x-contain md:block">
        <table className="w-full border-collapse font-fw-sans text-body [&_tbody_tr:last-child]:border-b-0">
          <thead>
            <tr className="border-y border-b-border-strong border-t-border-subtle bg-surface-sunken text-left">
              <Th className="w-14 pl-6">Pos</Th>
              <Th>Player</Th>
              <Th align="right">Rounds</Th>
              <Th align="right">Avg</Th>
              <Th align="right">Total</Th>
              <Th align="right">To par</Th>
              <th className="w-14 pr-4">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {views.map(({ row, badge, out, expanded, lineBelow }) => {
              const panelId = `${baseId}-d-${row.playerId}`;
              return (
                <Fragment key={row.playerId}>
                  <tr
                    className={cn(
                      'border-b border-border-subtle transition-colors [transition-duration:160ms] motion-reduce:transition-none',
                      // Open, the row and its panel read as one sunken block.
                      expanded ? 'border-b-transparent bg-surface-sunken/60' : 'hover:bg-surface-sunken/40',
                    )}
                  >
                    <td className="relative py-3 pl-6 pr-3">
                      {row.position === 1 ? <LeaderBar /> : null}
                      <Position row={row} out={out} />
                    </td>
                    <td className="py-3 pr-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <Avatar name={row.playerName} identityKey={row.playerId} tone="identity" size="sm" decorative />
                        <span className="min-w-0">
                          <PlayerLink row={row} muted={out} />
                          {badge ? (
                            <StatusPill tone={badge.tone} size="sm" className="mt-1">
                              {badge.label}
                            </StatusPill>
                          ) : null}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 pl-3 text-right tabular-nums text-text-secondary">
                      <RoundsPlayedValue row={row} numRounds={numRounds} />
                    </td>
                    <td className="py-3 pl-3 text-right tabular-nums text-text-secondary">{formatAverage(row.averageScore)}</td>
                    <td className="py-3 pl-3 text-right font-medium tabular-nums text-text-primary">
                      {row.hasScore && row.totalScore !== null ? row.totalScore : '—'}
                    </td>
                    <td className={cn('py-3 pl-3 text-right text-h3 font-semibold tabular-nums', toParTone(row.totalToPar))}>
                      {/* Null for unscored players (see deriveStandings), so the
                          shared formatter's null → '—' is the honest empty. */}
                      {formatToPar(row.totalToPar)}
                    </td>
                    <td className="py-2 pl-2 pr-4 text-right">
                      {row.hasScore ? (
                        <ExpandButton
                          size="sm"
                          name={row.playerName}
                          expanded={expanded}
                          controls={panelId}
                          onToggle={() => toggle(row.playerId)}
                        />
                      ) : null}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr id={panelId} className="border-b border-border-subtle bg-surface-sunken/60">
                      <td colSpan={7} className="pb-5 pl-14 pr-6 pt-1">
                        <StandingDetail row={row} ctx={ctx} />
                      </td>
                    </tr>
                  ) : null}
                  {/* TOP-SCORE LINE — merit locks a spot above it; TRAVEL CUT —
                      the full squad (incl. coach's picks) makes the trip above it */}
                  {lineBelow ? (
                    <CutLine as="tr" tone={lineBelow} label={lineBelow === 'line' ? topScoreLabel : travelLabel} />
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The ranking basis, for both layouts. */}
      <p className="border-t border-border-subtle px-4 py-3 font-fw-sans text-caption text-text-tertiary md:px-6">
        Ranked by total to par, lowest first; a shared score shares the position. Every completed round counts.
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

/** One decimal, through the metric registry (never a raw toFixed). */
function formatAverage(value: number | null): string {
  return value === null ? '—' : formatMetricText('scoring_average', value);
}

function Position({ row, out, className }: { row: Standing; out: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'font-fw-sans text-body font-semibold tabular-nums',
        !row.hasScore ? 'text-text-tertiary' : out ? 'text-text-secondary' : 'text-text-primary',
        className,
      )}
    >
      {positionLabel(row)}
    </span>
  );
}

/** "2/3": rounds played of the qualifier's rounds; an em dash before any. */
function RoundsPlayedValue({ row, numRounds }: { row: Standing; numRounds: number }) {
  if (row.roundsCompleted <= 0) return <>—</>;
  return (
    <>
      {row.roundsCompleted}
      <span className="text-text-tertiary">/{numRounds}</span>
    </>
  );
}

/** The leader's mark: an ink bar down the row's left edge (never a wash). */
function LeaderBar() {
  return <span aria-hidden className="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-text-primary" />;
}

function PlayerLink({ row, muted, className }: { row: Standing; muted: boolean; className?: string }) {
  return (
    <Link
      href={`/golf/dashboard/stats?player=${row.playerId}`}
      className={cn(
        'block min-w-0 truncate rounded-fw-sm font-fw-sans text-body font-semibold underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        muted ? 'text-text-secondary' : 'text-text-primary',
        className,
      )}
    >
      {row.playerName}
    </Link>
  );
}

function ExpandButton({
  size,
  name,
  expanded,
  controls,
  onToggle,
}: {
  size: 'sm' | 'md';
  name: string;
  expanded: boolean;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <IconButton
      variant="ghost"
      size={size}
      aria-label={`${expanded ? 'Hide' : 'Show'} ${name}'s rounds`}
      aria-expanded={expanded}
      // Only point at the panel while it exists.
      aria-controls={expanded ? controls : undefined}
      onClick={onToggle}
      className="shrink-0"
    >
      <ChevronDown
        aria-hidden
        className={cn('transition-transform [transition-duration:200ms] motion-reduce:transition-none', expanded && 'rotate-180')}
      />
    </IconButton>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * A player's detail panel: rounds, trend, the lead and the lines, season
 * ──────────────────────────────────────────────────────────────────────── */

function StandingDetail({ row, ctx }: { row: Standing; ctx: BoardContext }) {
  const rounds = [...(ctx.roundsByPlayer?.get(row.playerId) ?? [])].sort((a, b) => a.roundNumber - b.roundNumber);
  const facts = standingFacts(row, ctx);
  const seasonAvg = ctx.season?.byPlayer[row.playerId] ?? null;
  const lastRound = rounds[rounds.length - 1]?.roundNumber ?? 0;
  const roundNumbers = Array.from({ length: Math.max(ctx.numRounds, lastRound) }, (_, i) => i + 1);

  return (
    <div className="grid gap-x-8 gap-y-4 motion-safe:animate-fade-in sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="font-fw-sans text-caption font-semibold text-text-secondary">By round</p>
        {rounds.length > 0 ? (
          <>
            <ol className="mt-2 flex flex-wrap gap-2">
              {roundNumbers.map((n) => (
                <RoundChip
                  key={n}
                  roundNumber={n}
                  round={rounds.find((r) => r.roundNumber === n)}
                  canOpen={ctx.canOpenRounds}
                  completed={ctx.completed}
                />
              ))}
            </ol>
            <RoundTrend rounds={rounds} />
          </>
        ) : (
          <p className="mt-1.5 font-fw-sans text-body-sm text-text-secondary">
            No round cards are linked to this entry, so the board has its total only.
          </p>
        )}
      </div>

      <dl className="min-w-0 space-y-2.5">
        {facts.map((fact) => (
          <div key={fact.label} className="flex items-baseline justify-between gap-4">
            <dt className="font-fw-sans text-caption text-text-tertiary">{fact.label}</dt>
            <dd className="text-right font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">{fact.value}</dd>
          </div>
        ))}
        {seasonAvg && row.averageScore !== null ? (
          <SeasonFact here={row.averageScore} season={seasonAvg} year={ctx.season?.year ?? null} />
        ) : null}
      </dl>
    </div>
  );
}

function RoundChip({
  roundNumber,
  round,
  canOpen,
  completed,
}: {
  roundNumber: number;
  round?: LeaderboardRound;
  canOpen: boolean;
  completed: boolean;
}) {
  if (!round) {
    return (
      <li className="flex min-w-16 flex-col rounded-fw-md px-3 py-2 [box-shadow:inset_0_0_0_1px_var(--fw-color-border-subtle)]">
        <span className="font-fw-sans text-caption text-text-tertiary">R{roundNumber}</span>
        <span className="font-fw-sans text-body-sm text-text-tertiary">{completed ? 'Not played' : 'To play'}</span>
      </li>
    );
  }
  const body = (
    <>
      <span className="font-fw-sans text-caption text-text-tertiary">R{roundNumber}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="font-fw-sans text-body font-semibold tabular-nums text-text-primary">{round.score ?? '—'}</span>
        <span className={cn('font-fw-sans text-caption font-semibold tabular-nums', toParTone(round.toPar))}>
          {formatToPar(round.toPar)}
        </span>
      </span>
    </>
  );
  const chip = 'flex min-w-16 flex-col rounded-fw-md bg-surface px-3 py-2 [box-shadow:inset_0_0_0_1px_var(--fw-color-border-subtle)]';
  return (
    <li>
      {canOpen && round.roundId ? (
        <Link
          href={`/golf/dashboard/rounds/${round.roundId}`}
          aria-label={`Round ${roundNumber}: ${round.score ?? 'no score'}, ${formatToPar(round.toPar)}. Open the round card`}
          className={cn(
            chip,
            'outline-none transition-[box-shadow,transform] [transition-duration:160ms] motion-reduce:transition-none motion-reduce:hover:translate-y-0',
            'hover:-translate-y-px hover:[box-shadow:inset_0_0_0_1px_var(--fw-color-border-strong),var(--fw-shadow-soft)]',
            'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          )}
        >
          {body}
        </Link>
      ) : (
        <span className={chip}>{body}</span>
      )}
    </li>
  );
}

/**
 * Scores by round as a small static line (data renders final on mount: no
 * draw-on). Lower is better, so a better round sits higher.
 */
function RoundTrend({ rounds }: { rounds: LeaderboardRound[] }) {
  const scored = rounds.flatMap((r) => (typeof r.score === 'number' ? [{ ...r, score: r.score }] : []));
  const first = scored[0];
  const last = scored[scored.length - 1];
  if (!first || !last || scored.length < 2) return null;

  // Compare on to-par when every round has it (courses can differ by round).
  const firstToPar = first.toPar;
  const lastToPar = last.toPar;
  const delta =
    typeof firstToPar === 'number' && typeof lastToPar === 'number' && scored.every((r) => typeof r.toPar === 'number')
      ? lastToPar - firstToPar
      : last.score - first.score;
  const shots = (n: number) => `${n} ${n === 1 ? 'shot' : 'shots'}`;
  const words =
    delta < 0
      ? `Round ${last.roundNumber} was ${shots(-delta)} better than round ${first.roundNumber}`
      : delta > 0
        ? `Round ${last.roundNumber} was ${shots(delta)} higher than round ${first.roundNumber}`
        : `Round ${last.roundNumber} matched round ${first.roundNumber}`;

  const W = 88;
  const H = 28;
  const pad = 4;
  const values = scored.map((r) => r.score);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = scored.map((r, i) => ({
    x: pad + (i * (W - pad * 2)) / (scored.length - 1),
    // Lower score → higher on the chart; a flat series sits mid-height.
    y: max === min ? H / 2 : pad + ((r.score - min) / (max - min)) * (H - pad * 2),
  }));

  return (
    <div className="mt-3 flex items-center gap-3">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="shrink-0 overflow-visible text-text-secondary">
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) =>
          i === points.length - 1 ? (
            <circle key={i} cx={p.x} cy={p.y} r={3} className="fill-text-primary" />
          ) : (
            <circle key={i} cx={p.x} cy={p.y} r={2.25} className="fill-surface" stroke="currentColor" strokeWidth={1.5} />
          ),
        )}
      </svg>
      <p className="min-w-0 font-fw-sans text-body-sm text-text-secondary">
        <span className="sr-only">Scores by round: {values.join(', ')}. </span>
        {words}
      </p>
    </div>
  );
}

/** "Leads by 3 shots", "3 shots back", "4 shots clear", "On the line". */
function standingFacts(row: Standing, ctx: BoardContext): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = [];
  const toPar = row.totalToPar;
  const rank = row.rank;
  if (toPar === null || rank === null) return facts;
  const toParAt = (r: number) => ctx.scored[r - 1]?.totalToPar ?? null;
  const shots = (n: number) => `${n} ${n === 1 ? 'shot' : 'shots'}`;

  // The lead.
  if (row.position === 1) {
    const sharing = ctx.scored.filter((s) => s.position === 1).length;
    const next = ctx.scored.find((s) => s.position !== 1)?.totalToPar ?? null;
    facts.push({
      label: 'Lead',
      value: sharing > 1 ? 'Shares the lead' : next !== null ? `Leads by ${shots(next - toPar)}` : 'Leads',
    });
  } else {
    const leader = toParAt(1);
    if (leader !== null) facts.push({ label: 'Lead', value: `${shots(toPar - leader)} back` });
  }

  // A line after rank `line`: inside it, the gap to the first player out;
  // outside it, the gap to the last player in. Level either way is "on" it.
  const lineFact = (label: string, line: number) => {
    if (line <= 0) return;
    const lastIn = toParAt(line);
    const firstOut = toParAt(line + 1);
    if (lastIn === null || firstOut === null) return;
    const gap = rank <= line ? firstOut - toPar : toPar - lastIn;
    facts.push({ label, value: gap > 0 ? `${shots(gap)} ${rank <= line ? 'clear' : 'back'}` : 'On the line' });
  };
  lineFact('Auto-qualify line', ctx.topScoreLine);
  lineFact('Travel cut', ctx.travelLine);
  return facts;
}

/** Coach only: this qualifier's average against the rest of the season. */
function SeasonFact({ here, season, year }: { here: number; season: SeasonAverage; year: number | null }) {
  const delta = here - season.average;
  const size = formatMetricText('scoring_average', Math.abs(delta));
  const comparison =
    size === '0.0' ? 'Level with it here' : delta < 0 ? `${size} better here` : `${size} higher here`;
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border-subtle pt-2.5">
      <dt className="font-fw-sans text-caption text-text-tertiary">
        Season avg
        <span className="block">
          {season.rounds} other {season.rounds === 1 ? 'round' : 'rounds'}
          {year ? ` in ${year}` : ''}
        </span>
      </dt>
      <dd className="text-right font-fw-sans">
        <span className="block text-body-sm font-semibold tabular-nums text-text-primary">
          {formatMetricText('scoring_average', season.average)}
        </span>
        <span className="block text-caption tabular-nums text-text-secondary">{comparison}</span>
      </dd>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Pieces
 * ──────────────────────────────────────────────────────────────────────── */

/** A single stat cell inside the phone card's 3-up Rounds/Avg/Total row. */
function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-fw-sans text-caption font-medium text-text-tertiary">{label}</span>
      <span className="font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">{children}</span>
    </div>
  );
}

/**
 * A labelled rule across the board. The travel cut (who makes the trip) is
 * the stronger ink; the top-score line above it is the quieter rule.
 */
function CutLine({ as, tone, label }: { as: 'li' | 'tr'; tone: 'line' | 'cut'; label: string }) {
  const rule = tone === 'cut' ? 'bg-text-secondary' : 'bg-border-strong';
  const inner = (
    <div className="flex items-center gap-3">
      <span className={cn('h-px flex-1', rule)} />
      <span
        className={cn(
          'whitespace-nowrap font-fw-sans text-caption font-semibold',
          tone === 'cut' ? 'text-text-primary' : 'text-text-secondary',
        )}
      >
        {label}
      </span>
      <span className={cn('h-px flex-1', rule)} />
    </div>
  );
  if (as === 'tr') {
    return (
      <tr aria-hidden="true" className="border-b border-border-subtle">
        <td colSpan={7} className="px-6 py-2">
          {inner}
        </td>
      </tr>
    );
  }
  return (
    <li aria-hidden="true" className="border-b border-border-subtle px-4 py-2">
      {inner}
    </li>
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
        'py-2.5 font-fw-sans text-caption font-semibold text-text-secondary',
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
