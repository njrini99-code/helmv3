'use client';

/**
 * ============================================================================
 * Fairway · Rounds · FairwayRoundsLibrary — the flag-on /rounds surface
 * ----------------------------------------------------------------------------
 * The redesigned rounds library. ONE async-server-fed client surface that
 * re-skins the legacy RoundLibraryClient + LargeTitleHeader + PageHeader +
 * UnfinishedRoundsSection into the Fairway warm-premium system. It reuses the
 * legacy server queries + roundStats computation UNCHANGED (passed in as props)
 * — this is a re-skin, never a data rewrite.
 *
 * ── ROLE FORK (the spec's shared coach/player surface) ─────────────────────
 *   PLAYER → masthead eyebrow "Your Rounds" / title "Your rounds."; a "New round"
 *            primary CTA; the player-only "In progress" banner (when any);
 *            honest "Submit First Round" empty state.
 *   COACH  → masthead eyebrow "Team Rounds" / title "The library."; NO New-round
 *            CTA; NO in-progress section; each card shows the player's Avatar;
 *            empty state reads "Players' rounds will appear here".
 *
 * ── ONE MASTHEAD ───────────────────────────────────────────────────────────
 *   A single Fairway ViewHeader (kills the legacy double-title). Honest meta
 *   count + month range; when the coach query hits its 50-row cap the meta says
 *   "showing most recent 50" rather than fabricating a total it doesn't have.
 *
 * ── ONE HERO ───────────────────────────────────────────────────────────────
 *   A compact KPI strip of StatTile tiles on Inset wells (Rounds · Avg score ·
 *   Best · Avg to par · % under par). StatTile owns the STARVED swap → when
 *   stats is null / totalRounds < 3 / a figure is null it renders
 *   InsufficientData(compact) instead of a fabricated 0.0.
 *
 * ── SECTIONS (mental-model order) ──────────────────────────────────────────
 *   1. (player) In-progress banner   2. Quiet toolbar (FilterPills + Month/Week
 *   Segmented)   3. History period groups (header + Sparkline + honest mini-
 *   stats; FairwayRoundCard grid)   4. Honest empties (zero → EmptyState;
 *   filter-zero → EmptyState variant="search").
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in
 * rounds/page.tsx. Renders inside `.fairway-ds` on a bg-canvas page.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';

import { ViewHeader } from '@/components/fairway/view-header/view-header';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { FilterPill } from '@/components/fairway/controls/filter-pill';
import { Segmented } from '@/components/fairway/controls/segmented';
import { StatTile } from '@/components/fairway/charts/StatTile';
import { Sparkline } from '@/components/fairway/charts/Sparkline';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { FairwayRoundRow } from './FairwayRoundRow';
import { FairwayUnfinishedBanner } from './FairwayUnfinishedBanner';
import { FairwayUnsyncedRoundBanner } from './FairwayUnsyncedRoundBanner';

// ── Types ────────────────────────────────────────────────────────────────--

/**
 * One round row. Mirrors the legacy `RoundLibraryRound` shape EXACTLY (the
 * server `playerSelectFields` projection) so the page can pass the same data
 * verbatim — plus the in-progress fields the unfinished banner reads.
 */
export interface RoundLibraryRound {
  id: string;
  course_name: string | null;
  course_city: string | null;
  course_state: string | null;
  round_date: string;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  holes_played: number | null;
  status: string | null;
  // In-progress-only fields (present on inProgressRounds rows).
  current_hole?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  player: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}

/** The server-computed round stats summary (REUSED UNCHANGED from page.tsx). */
export interface RoundStats {
  totalRounds: number;
  avg: number;
  best: number;
  avgToPar: number | null;
  underParPct: number;
  trend: 'improving' | 'declining' | 'stable' | null;
}

export interface FairwayRoundsLibraryProps {
  rounds: RoundLibraryRound[];
  inProgressRounds: RoundLibraryRound[];
  userRole: 'coach' | 'player';
  stats: RoundStats | null;
}

type Grouping = 'month' | 'week';
type RoundFilter = 'all' | 'practice' | 'qualifier' | 'tournament';

// ── Date helpers (mirror the legacy grouping logic) ─────────────────────────

function getMonthKey(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Monday of the ISO week the date falls in. */
function getWeekStart(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay() || 7; // Sunday → 7
  if (day !== 1) out.setDate(out.getDate() - (day - 1));
  return out;
}

function getWeekKey(date: Date): string {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = sameMonth
    ? String(end.getDate())
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

/** Normalize a round's score to its 18-hole equivalent (for charts). */
function normalizedScore(round: RoundLibraryRound): number | null {
  if (round.total_score === null || round.total_score <= 0) return null;
  const hp = round.holes_played ?? 18;
  return Math.round((round.total_score * 18) / Math.max(1, hp));
}

/** Honest month range over the rounds, e.g. "Jan–Apr 2026" or "Apr 2026". */
function honestRange(rounds: RoundLibraryRound[]): string | null {
  const dates = rounds
    .map((r) => new Date(r.round_date))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return null;
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const sameMonth =
    first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth();
  if (sameMonth) {
    return first.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  const sameYear = first.getFullYear() === last.getFullYear();
  const firstLabel = first.toLocaleDateString('en-US', { month: 'short' });
  const lastLabel = last.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
  return sameYear
    ? `${firstLabel}–${lastLabel}`
    : `${first.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} – ${lastLabel}`;
}

// ── Per-month summary (label + honest mini-stats + Sparkline) ───────────────

/** Compute a month group's honest summary: scored count, 18-equiv avg/best,
 *  and the oldest→newest spark series. */
function monthSummary(rounds: RoundLibraryRound[]) {
  const scored = rounds.filter((r) => r.total_score !== null && r.total_score > 0);
  const spark = scored
    .slice()
    .reverse()
    .map((r) => normalizedScore(r))
    .filter((v): v is number => v !== null);
  const avg = spark.length > 0 ? spark.reduce((s, v) => s + v, 0) / spark.length : null;
  const best = spark.length > 0 ? Math.min(...spark) : null;
  return { scoredCount: scored.length, spark, avg, best };
}

// ── Main ────────────────────────────────────────────────────────────────---

export function FairwayRoundsLibrary({
  rounds,
  inProgressRounds,
  userRole,
  stats,
}: FairwayRoundsLibraryProps) {
  const [grouping, setGrouping] = React.useState<Grouping>('month');
  const [filter, setFilter] = React.useState<RoundFilter>('all');

  const isCoach = userRole === 'coach';
  // Coaches NEVER get the in-progress section or the New-round CTA.
  const showUnfinished = !isCoach && inProgressRounds.length > 0;

  // Real, tabular filter counts straight from the rounds array.
  const filterCounts = React.useMemo(() => {
    const counts: Record<RoundFilter, number> = {
      all: rounds.length,
      practice: 0,
      qualifier: 0,
      tournament: 0,
    };
    for (const r of rounds) {
      const t = (r.round_type || '').toLowerCase();
      if (t === 'practice') counts.practice++;
      else if (t === 'qualifier' || t === 'qualifying') counts.qualifier++;
      else if (t === 'tournament') counts.tournament++;
    }
    return counts;
  }, [rounds]);

  const filteredRounds = React.useMemo(() => {
    if (filter === 'all') return rounds;
    return rounds.filter((r) => {
      const t = (r.round_type || '').toLowerCase();
      if (filter === 'qualifier') return t === 'qualifier' || t === 'qualifying';
      return t === filter;
    });
  }, [rounds, filter]);

  const grouped = React.useMemo(() => {
    const map: Record<string, { label: string; rounds: RoundLibraryRound[] }> = {};
    for (const r of filteredRounds) {
      const d = new Date(r.round_date);
      const key =
        grouping === 'month'
          ? `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
          : `${d.getFullYear()}-${String(getWeekStart(d).getTime())}`;
      const label = grouping === 'month' ? getMonthKey(d) : getWeekKey(d);
      if (!map[key]) map[key] = { label, rounds: [] };
      map[key]!.rounds.push(r);
    }
    return Object.entries(map)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([, v]) => v);
  }, [filteredRounds, grouping]);

  // Chronological (oldest → newest) scoring series for the hero sparklines.
  // HONEST: real scored rounds only — drives the Avg-score / Avg-to-par tile
  // trends (green improving / amber declining), never a fabricated line.
  const chronoScored = React.useMemo(
    () =>
      rounds
        .filter((r) => r.total_score !== null && r.total_score > 0)
        .slice()
        .sort((a, b) => new Date(a.round_date).getTime() - new Date(b.round_date).getTime()),
    [rounds],
  );
  const scoreSeries = React.useMemo(
    () => chronoScored.map((r) => normalizedScore(r)).filter((v): v is number => v !== null),
    [chronoScored],
  );
  const toParSeries = React.useMemo(
    () => chronoScored.map((r) => r.score_to_par).filter((v): v is number => v !== null),
    [chronoScored],
  );

  // ── Masthead copy + honest meta ────────────────────────────────────────--
  const eyebrow = isCoach ? 'Team Rounds' : 'Your Rounds';
  const title = isCoach ? 'The library.' : 'Your rounds.';

  const meta = (() => {
    const n = rounds.length;
    const range = honestRange(rounds);
    const noun = `${n} round${n === 1 ? '' : 's'} recorded`;
    // The coach completed query is capped at 50; when it's saturated, say so
    // honestly rather than implying it's the full count.
    const capNote = isCoach && n === 50 ? 'showing most recent 50' : null;
    const parts = [capNote ?? noun, range].filter(Boolean);
    return parts.join(' · ');
  })();

  const primaryAction = !isCoach ? (
    <Button asChild variant="primary" size="md">
      <Link href="/golf/dashboard/rounds/new">New round</Link>
    </Button>
  ) : undefined;

  // ── KPI hero — StatTile owns the starved swap (never a fabricated 0.0) ────--
  const starved = !stats || stats.totalRounds < 3;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-6 md:px-6">
      {/* ── ONE MASTHEAD ──────────────────────────────────────────────────--*/}
      <ViewHeader
        eyebrow={eyebrow}
        title={title}
        meta={rounds.length > 0 ? meta : undefined}
        primaryAction={primaryAction}
      />

      {/* ── ONE HERO — an elevated KPI band. Each tile is LIFTED onto bg-surface
          with a defined edge + resting shadow (NOT the old sunken-in-sunken
          well), and the two scoring tiles carry their real chronological series
          so a green/amber sparkline + delta reads at a glance. ─────────────--*/}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile
          label="Rounds"
          value={starved ? undefined : stats!.totalRounds}
          format={{ maximumFractionDigits: 0 }}
          starved={starved}
          unit="rounds"
          current={stats?.totalRounds ?? 0}
          required={3}
          starvedTitle="Awaiting rounds"
          className="bg-surface border border-border-subtle shadow-flat"
        />
        <StatTile
          label="Avg score"
          value={starved ? undefined : stats!.avg}
          format={{ maximumFractionDigits: 1 }}
          goodDirection="down"
          trendData={!starved && scoreSeries.length >= 2 ? scoreSeries : undefined}
          starved={starved}
          unit="rounds"
          current={stats?.totalRounds ?? 0}
          required={3}
          className="bg-surface border border-border-subtle shadow-flat"
        />
        <StatTile
          label="Best round"
          value={starved ? undefined : stats!.best}
          format={{ maximumFractionDigits: 0 }}
          goodDirection="down"
          starved={starved}
          unit="rounds"
          current={stats?.totalRounds ?? 0}
          required={3}
          className="bg-surface border border-border-subtle shadow-flat"
        />
        <StatTile
          label="Avg to par"
          // avgToPar can be null even with enough rounds → honest starve.
          value={starved || stats!.avgToPar === null ? undefined : stats!.avgToPar}
          format={{ maximumFractionDigits: 1, signDisplay: 'exceptZero' }}
          goodDirection="down"
          trendData={
            !starved && stats!.avgToPar !== null && toParSeries.length >= 2 ? toParSeries : undefined
          }
          starved={starved || (stats?.avgToPar ?? null) === null}
          unit="rounds"
          current={stats?.totalRounds ?? 0}
          required={3}
          className="bg-surface border border-border-subtle shadow-flat"
        />
        <StatTile
          label="% under par"
          value={starved ? undefined : stats!.underParPct}
          format={{ maximumFractionDigits: 0 }}
          suffix="%"
          // The categorical scoring trend ('improving'/'declining'/'stable',
          // null until 6+ scored rounds) is surfaced honestly as a separate
          // StatusPill below — never faked into a numeric delta chip here.
          hideTrend
          starved={starved}
          unit="rounds"
          current={stats?.totalRounds ?? 0}
          required={3}
          className="bg-surface border border-border-subtle shadow-flat"
        />
      </div>

      {/* Scoring-trend read — honest categorical pill, shown only when the
          server could classify a trend (needs 6+ scored rounds). */}
      {!starved && stats!.trend && (
        <div className="-mt-4 flex items-center gap-2 px-1">
          <span className="font-fw-sans text-eyebrow uppercase tracking-[0.06em] text-text-tertiary">
            Scoring trend
          </span>
          <StatusPill
            tone={
              stats!.trend === 'improving'
                ? 'accent'
                : stats!.trend === 'declining'
                  ? 'warning'
                  : 'neutral'
            }
            size="sm"
            className="capitalize"
          >
            {stats!.trend}
          </StatusPill>
        </div>
      )}

      {/* ── 1. (player only) In-progress banner ───────────────────────────--*/}
      {showUnfinished && <FairwayUnfinishedBanner rounds={inProgressRounds} />}

      {/* ── 1b. (player only) Never-synced device recovery breadcrumb ──────--*/}
      {/* Surfaces a `_new` localStorage round that never reached the server
          (hard-offline session → boot). Self-suppresses when a SERVER
          in-progress round exists, so it never duplicates the banner above. */}
      {!isCoach && (
        <FairwayUnsyncedRoundBanner hasServerInProgress={inProgressRounds.length > 0} />
      )}

      {/* ── Honest empty: zero completed rounds ───────────────────────────--*/}
      {rounds.length === 0 ? (
        <Surface padding="lg">
          <EmptyState
            title="No rounds yet"
            description={
              isCoach
                ? "Your players haven't submitted any rounds yet. Their rounds will appear here as they're recorded."
                : 'Start tracking your golf rounds to see scores, stats, and improvement over time.'
            }
            action={
              !isCoach ? (
                <Button asChild variant="primary" size="md">
                  <Link href="/golf/dashboard/rounds/new">Log your first round</Link>
                </Button>
              ) : undefined
            }
          />
        </Surface>
      ) : (
        <>
          {/* ── 2. Quiet toolbar — FilterPills + Month/Week toggle ────────--*/}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'practice', 'qualifier', 'tournament'] as RoundFilter[]).map((f) => (
                <FilterPill
                  key={f}
                  size="sm"
                  selected={filter === f}
                  showCheck={false}
                  count={filterCounts[f]}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </FilterPill>
              ))}
            </div>
            <div className="ml-auto">
              <Segmented<Grouping>
                size="sm"
                aria-label="Group rounds by"
                value={grouping}
                onValueChange={setGrouping}
                options={[
                  { value: 'month', label: 'Month' },
                  { value: 'week', label: 'Week' },
                ]}
              />
            </div>
          </div>

          {/* ── 3. History period groups · 4. filter-zero honest empty ────--*/}
          {grouped.length === 0 ? (
            <Surface padding="lg">
              <EmptyState
                variant="search"
                title="No rounds in this view"
                description={`No ${filter === 'all' ? '' : `${filter} `}rounds match the current filter.`}
                action={
                  <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
                    Clear filter
                  </Button>
                }
              />
            </Surface>
          ) : (
            <div className="flex flex-col gap-5">
              {grouped.map((group, gi) => {
                // Best (lowest score-to-par) of the month → accent rail + badge.
                let bestId: string | null = null;
                let bestScore = Infinity;
                for (const r of group.rounds) {
                  if (r.score_to_par !== null && r.score_to_par < bestScore) {
                    bestScore = r.score_to_par;
                    bestId = r.id;
                  }
                }
                const { scoredCount, spark, avg, best } = monthSummary(group.rounds);
                return (
                  // Each month is ONE premium block (a ledger), not a wall of
                  // cards: a summary header + a divided list of clickable rows.
                  <Surface key={`${group.label}-${gi}`} padding="none" className="overflow-hidden">
                    <div className="flex items-end justify-between gap-4 border-b border-border-subtle px-4 py-3">
                      <div className="flex min-w-0 items-baseline gap-3">
                        <h3 className="whitespace-nowrap font-fw-display text-body-lg font-semibold tracking-[-0.01em] text-text-primary">
                          {group.label}
                        </h3>
                        <div className="hidden items-baseline gap-2 font-fw-sans text-caption text-text-tertiary sm:flex">
                          <span className="tabular-nums">
                            {scoredCount} round{scoredCount === 1 ? '' : 's'}
                          </span>
                          {avg !== null && (
                            <>
                              <span className="text-border-strong">·</span>
                              <span className="tabular-nums">avg {avg.toFixed(1)}</span>
                            </>
                          )}
                          {best !== null && (
                            <>
                              <span className="text-border-strong">·</span>
                              <span className="tabular-nums text-accent-700">best {best}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Omit the sparkline when there are fewer than 2 scores. */}
                      {spark.length >= 2 && (
                        <Sparkline
                          data={spark}
                          goodDirection="down"
                          width={120}
                          height={24}
                          label={`${group.label} scores`}
                          className="flex-shrink-0"
                        />
                      )}
                    </div>

                    <div className="divide-y divide-border-subtle">
                      {group.rounds.map((round) => (
                        <FairwayRoundRow
                          key={round.id}
                          round={round}
                          isBestOfPeriod={round.id === bestId && group.rounds.length > 1}
                          userRole={userRole}
                        />
                      ))}
                    </div>
                  </Surface>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
