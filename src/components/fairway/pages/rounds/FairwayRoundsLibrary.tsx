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
 *   count + month range; the server paginates past the PostgREST cap, so the
 *   meta reports the true total round count.
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
 *   stats; FairwayRoundRow ledger list)   4. Honest empties (zero → EmptyState;
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
import { IconButton } from '@/components/fairway/controls/button';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { FilterPill } from '@/components/fairway/controls/filter-pill';
import { Segmented } from '@/components/fairway/controls/segmented';
import { Input } from '@/components/fairway/forms/Input';
import { Select } from '@/components/fairway/forms/Select';
import { IconSearch, IconX } from '@/components/icons';
import { StatTile } from '@/components/fairway/charts/StatTile';
import { Sparkline } from '@/components/fairway/charts/Sparkline';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { FairwayRoundRow } from './FairwayRoundRow';
import { FairwayUnfinishedBanner } from './FairwayUnfinishedBanner';
import { FairwayUnsyncedRoundBanner } from './FairwayUnsyncedRoundBanner';
import { parseDateOnly, dateOnlyToUtcDate, type DateOnlyParts } from '@/lib/golf/date-only';

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
//
// #139: `round_date` is a DATE column ('YYYY-MM-DD'). `new Date(iso)` parses
// that as UTC midnight; reading it back via `.getFullYear()`/`.getMonth()`/
// `toLocaleDateString()` with no `timeZone: 'UTC'` pin uses the LOCAL
// timezone, printing the PREVIOUS calendar day in every US timezone (#916's
// class of bug). This library grouped rounds by month/week using exactly
// that unsafe round-trip, so a round could land in a different month/week
// bucket here than the identical-looking date the Recent Rounds widget (and
// this file's own FairwayRoundRow, which already goes through the shared
// date-only helper) showed for the SAME round. Every grouping/range helper
// below now parses the raw Y/M/D digits directly and formats pinned to UTC.

function getMonthKey(iso: string): string {
  const parts = parseDateOnly(iso);
  if (!parts) return 'Unknown';
  return dateOnlyToUtcDate(parts).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Monday (UTC) of the ISO week the date falls in, or `null` for unparseable input. */
function getWeekStart(iso: string): Date | null {
  const parts = parseDateOnly(iso);
  if (!parts) return null;
  const d = dateOnlyToUtcDate(parts);
  const day = d.getUTCDay() || 7; // Sunday → 7
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

function getWeekKey(iso: string): string {
  const start = getWeekStart(iso);
  if (!start) return 'Unknown';
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startLabel = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const endLabel = sameMonth
    ? String(end.getUTCDate())
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${startLabel} – ${endLabel}`;
}

/** A round's player display name (or null when unattributed). */
function playerName(round: RoundLibraryRound): string | null {
  const first = round.player?.first_name?.trim() ?? '';
  const last = round.player?.last_name?.trim() ?? '';
  const full = `${first} ${last}`.trim();
  return full.length > 0 ? full : null;
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
    .map((r) => parseDateOnly(r.round_date))
    .filter((p): p is DateOnlyParts => p !== null)
    .map(dateOnlyToUtcDate)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return null;
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const sameMonth =
    first.getUTCFullYear() === last.getUTCFullYear() && first.getUTCMonth() === last.getUTCMonth();
  if (sameMonth) {
    return first.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  const sameYear = first.getUTCFullYear() === last.getUTCFullYear();
  const firstLabel = first.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const lastLabel = last.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return sameYear
    ? `${firstLabel}–${lastLabel}`
    : `${first.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })} – ${lastLabel}`;
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
  // P210 — coach-scale filtering. A coach sees every team member's rounds, so
  // the toolbar needs a per-player filter + a free-text search to find one
  // player (or one course) without scrolling the whole ledger. Pure client
  // filters over the data already in memory — no extra fetch.
  const [playerFilter, setPlayerFilter] = React.useState<string>('all');
  const [search, setSearch] = React.useState<string>('');

  const isCoach = userRole === 'coach';

  // #129/#145 — dedupe pixel-identical "in progress" drafts before they ever
  // reach the banner. Multiple in-progress rows for the same course/hole/type
  // (an emergency-save retry, a double-tap on "New round", etc.) render as
  // indistinguishable clutter above the real history with no way to tell them
  // apart. This is a DISPLAY-layer resolve only — it never deletes anything
  // server-side (Golf's no-destructive-writes rule); it just keeps the single
  // most-recently-updated draft per distinct (course, current hole, holes
  // target, round type) fingerprint so a player sees ONE resumable card per
  // actual in-progress attempt.
  const dedupedInProgressRounds = React.useMemo(() => {
    const bestByKey = new Map<string, RoundLibraryRound>();
    for (const r of inProgressRounds) {
      const key = [
        r.course_name ?? '',
        r.current_hole ?? 0,
        r.holes_played ?? 18,
        r.round_type ?? '',
      ].join('|');
      const existing = bestByKey.get(key);
      if (!existing) {
        bestByKey.set(key, r);
        continue;
      }
      const existingTs = existing.updated_at ?? existing.created_at ?? '';
      const candidateTs = r.updated_at ?? r.created_at ?? '';
      if (candidateTs > existingTs) bestByKey.set(key, r);
    }
    return Array.from(bestByKey.values());
  }, [inProgressRounds]);

  // Coaches NEVER get the in-progress section or the New-round CTA.
  const showUnfinished = !isCoach && dedupedInProgressRounds.length > 0;

  // P210 — coach-only player roster derived from the rounds in memory. Built as
  // de-duped, alphabetically-sorted options so a coach can scope to one player.
  const playerOptions = React.useMemo(() => {
    if (!isCoach) return [];
    const names = new Set<string>();
    for (const r of rounds) {
      const name = playerName(r);
      if (name) names.add(name);
    }
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ label: name, value: name }));
  }, [rounds, isCoach]);

  // P210 — keep the active player filter valid: if the selected player drops out
  // of the data (e.g. a roster change), fall back to "all".
  React.useEffect(() => {
    if (playerFilter !== 'all' && !playerOptions.some((o) => o.value === playerFilter)) {
      setPlayerFilter('all');
    }
  }, [playerFilter, playerOptions]);

  // P210 — apply the coach player filter + free-text search BEFORE the round-type
  // counts/filter, so the type pills count the currently-scoped set and the
  // history list shows only matching rounds. Search matches player name OR
  // course name (case-insensitive). On the player surface there is no player
  // filter, so this collapses to the plain text search.
  const scopedRounds = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (playerFilter === 'all' && q === '') return rounds;
    return rounds.filter((r) => {
      if (isCoach && playerFilter !== 'all' && playerName(r) !== playerFilter) return false;
      if (q !== '') {
        const haystack = `${playerName(r) ?? ''} ${r.course_name ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rounds, isCoach, playerFilter, search]);

  // Real, tabular filter counts over the currently-scoped rounds.
  const filterCounts = React.useMemo(() => {
    const counts: Record<RoundFilter, number> = {
      all: scopedRounds.length,
      practice: 0,
      qualifier: 0,
      tournament: 0,
    };
    for (const r of scopedRounds) {
      const t = (r.round_type || '').toLowerCase();
      if (t === 'practice') counts.practice++;
      else if (t === 'qualifier' || t === 'qualifying') counts.qualifier++;
      else if (t === 'tournament') counts.tournament++;
    }
    return counts;
  }, [scopedRounds]);

  const filteredRounds = React.useMemo(() => {
    if (filter === 'all') return scopedRounds;
    return scopedRounds.filter((r) => {
      const t = (r.round_type || '').toLowerCase();
      if (filter === 'qualifier') return t === 'qualifier' || t === 'qualifying';
      return t === filter;
    });
  }, [scopedRounds, filter]);

  // Is any narrowing active (drives the filter-zero empty-state copy + reset)?
  const isNarrowed = filter !== 'all' || playerFilter !== 'all' || search.trim() !== '';
  const resetFilters = React.useCallback(() => {
    setFilter('all');
    setPlayerFilter('all');
    setSearch('');
  }, []);

  const grouped = React.useMemo(() => {
    const map: Record<string, { label: string; rounds: RoundLibraryRound[] }> = {};
    for (const r of filteredRounds) {
      const parts = parseDateOnly(r.round_date);
      if (!parts) continue;
      const key =
        grouping === 'month'
          ? `${parts.year}-${String(parts.month).padStart(2, '0')}`
          : `${parts.year}-${String(getWeekStart(r.round_date)?.getTime() ?? 0)}`;
      const label = grouping === 'month' ? getMonthKey(r.round_date) : getWeekKey(r.round_date);
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
        // round_date is a bare 'YYYY-MM-DD' — lexicographic string comparison
        // IS chronological order for that format, and sidesteps any
        // timezone-dependent Date parsing entirely (#139).
        .sort((a, b) => a.round_date.localeCompare(b.round_date)),
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
    // The server now paginates past the PostgREST cap (fetchAllRowsResult), so
    // `rounds` is the complete set — report the true count, no cap caveat.
    const parts = [noun, range].filter(Boolean);
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
        {/* Bug #33: 5 tiles in a mobile `grid-cols-2` grid lay out 2 / 2 / 1 —
            a lone orphaned tile on its own half-width row, with a dead gap
            beside it. Spanning this last tile full-width below `md` turns
            that into an even 2×2 + one full-width closer instead. */}
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
          className="col-span-2 bg-surface border border-border-subtle shadow-flat md:col-span-1"
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
      {showUnfinished && <FairwayUnfinishedBanner rounds={dedupedInProgressRounds} />}

      {/* ── 1b. (player only) Never-synced device recovery breadcrumb ──────--*/}
      {/* Surfaces a `_new` localStorage round that never reached the server
          (hard-offline session → boot). Self-suppresses when a SERVER
          in-progress round exists, so it never duplicates the banner above. */}
      {!isCoach && (
        <FairwayUnsyncedRoundBanner hasServerInProgress={dedupedInProgressRounds.length > 0} />
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
          {/* ── 2. Quiet toolbar — FilterPills + Month/Week toggle, plus the
              P210 coach player filter + free-text search row for scale. ────--*/}
          <div className="flex flex-col gap-3">
            {/* Scale row: coach-only player Select + search input. */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {isCoach && playerOptions.length > 1 && (
                <div className="w-full sm:w-56">
                  <Select
                    size="sm"
                    value={playerFilter}
                    onValueChange={(v) => setPlayerFilter(v ?? 'all')}
                    aria-label="Filter rounds by player"
                    options={[
                      { label: 'All players', value: 'all' },
                      ...playerOptions,
                    ]}
                  />
                </div>
              )}
              <div className="w-full sm:max-w-xs">
                <Input
                  size="sm"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.currentTarget.value)}
                  aria-label={isCoach ? 'Search rounds by player or course' : 'Search rounds by course'}
                  placeholder={isCoach ? 'Search player or course…' : 'Search course…'}
                  leading={<IconSearch size={16} aria-hidden className="text-text-tertiary" />}
                  trailing={
                    search ? (
                      <IconButton
                        aria-label="Clear search"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSearch('')}
                        className="-mr-1 h-7 w-7"
                      >
                        <IconX size={16} aria-hidden />
                      </IconButton>
                    ) : undefined
                  }
                />
              </div>
            </div>

            {/* Type pills + Month/Week toggle.
                Bug #148: pills + the `ml-auto` toggle used to share ONE
                `flex-wrap` row, so once the 4 pills overflowed onto a second
                line (a lopsided 3+1), the toggle — still pinned to the FIRST
                line by `ml-auto` — stranded itself with a dead gap where the
                4th pill should have been. Splitting them into their own
                `flex-wrap` groups inside a row that only becomes `sm:flex-row`
                lets the pills wrap evenly across full-width lines on mobile,
                and drops the toggle to its own full-width line below them
                instead of getting wedged onto the pills' first line. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <div className="shrink-0">
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
          </div>

          {/* ── 3. History period groups · 4. filter-zero honest empty ────--*/}
          {grouped.length === 0 ? (
            <Surface padding="lg">
              <EmptyState
                variant="search"
                title="No rounds in this view"
                description={
                  isNarrowed
                    ? 'No rounds match the current filters.'
                    : 'No rounds to show.'
                }
                action={
                  isNarrowed ? (
                    <Button variant="secondary" size="sm" onClick={resetFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
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
