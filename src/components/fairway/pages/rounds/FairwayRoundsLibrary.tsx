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
 *            CTA; NO in-progress section; each row shows the player's Avatar;
 *            empty state reads "Players' rounds will appear here".
 *
 * ── FACELIFT COMPOSITION (docs/design/fairway-facelift/screens/rounds-library.md) ──
 *   1. ONE ViewHeader masthead (eyebrow + title + honest meta + primary CTA).
 *   2. (player) FairwayUnfinishedBanner, ABOVE the strip, when in-progress
 *      rounds exist.
 *   3. ONE StatStrip band — Rounds · Avg score (delta chip) · Best ·
 *      Avg to par (delta chip) · % under par. No sparklines inside cells —
 *      the "Scoring trend" pill this used to float separately between the
 *      tiles and the toolbar is now folded into the avg-score/avg-to-par
 *      tiles' own delta chips (gated on the same `stats.trend` honesty
 *      threshold — 6+ scored rounds — the standalone pill used).
 *   4. A TickerStrip of the last 15 scored rounds, desktop (`md:`) only —
 *      the ONE scoring-trend chart for the page.
 *   5. ONE composed Toolbar row: search (player/course) · filters (the
 *      coach-only player Select + the four round-type FilterPills) ·
 *      viewToggle (Month/Week grouping Segmented).
 *   6. ONE matte Surface holding EVERY group — no per-group Surface, no
 *      nested cards. Each group is a sticky seam header (label · count ·
 *      avg; a Sparkline only when the group has ≥6 scored rounds) followed
 *      by its FairwayRoundRow rows, separated by hairlines.
 *
 * ── PAGINATION (perf follow-up, not in the original screen spec) ───────────
 *   A large team's ledger (90+ rounds) rendered every row eagerly — measured
 *   lag on real accounts. The Surface now paints only the first
 *   `ROWS_PAGE_SIZE` rows across ALL groups, in order, with a "Show 30 more"
 *   Button at the bottom; group headers still report each group's FULL
 *   count/avg/best/sparkline, never the truncated slice. The strip + ticker
 *   are unaffected — they already summarize the full dataset, not the
 *   rendered list. No per-row mount/layout animation, by design, on a list
 *   this long.
 *
 * Honest empties throughout: zero rounds → EmptyState; a narrowed filter
 * that matches nothing → EmptyState variant="search" + "Clear filters".
 * StatTile owns the STARVED swap (never a fabricated 0.0) — see its own file.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in
 * rounds/page.tsx. Renders inside `.fairway-ds` on a bg-canvas page.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import { ViewHeader } from '@/components/fairway/view-header/view-header';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { IconButton } from '@/components/fairway/controls/button';
import { Toolbar } from '@/components/fairway/controls/Toolbar';
import { FilterPill } from '@/components/fairway/controls/filter-pill';
import { Segmented } from '@/components/fairway/controls/segmented';
import { Input } from '@/components/fairway/forms/Input';
import { Select } from '@/components/fairway/forms/Select';
import { IconSearch, IconX } from '@/components/icons';
import { StatStrip } from '@/components/fairway/charts/StatStrip';
import { StatTile } from '@/components/fairway/charts/StatTile';
import { Sparkline } from '@/components/fairway/charts/Sparkline';
import { TickerStrip, type TickerItem } from '@/components/fairway/modules';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { FairwayRoundRow } from './FairwayRoundRow';
import { FairwayUnfinishedBanner } from './FairwayUnfinishedBanner';
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
  playerId?: string;
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

/** Signed change from the first to the last point of a chronological series
 *  (oldest → newest), or `null` when there aren't at least two points to
 *  compare — the same "last − first" math StatTile used to derive internally
 *  from a full `trendData` series, now computed here so the tile can show a
 *  delta chip WITHOUT also drawing a sparkline (facelift: no sparklines
 *  inside StatStrip cells). */
function seriesDelta(series: ReadonlyArray<number>): number | null {
  if (series.length < 2) return null;
  return series[series.length - 1]! - series[0]!;
}

/** Rows revealed per "Show 30 more" click. A season's worth of team rounds
 *  (90+) rendered eagerly in one 8,000px+ page is real, measured scroll/paint
 *  jank on accounts with a lot of history — this caps the first paint to a
 *  fast page and grows it on demand, same list otherwise. */
const ROWS_PAGE_SIZE = 30;

// ── Main ────────────────────────────────────────────────────────────────---

export function FairwayRoundsLibrary({
  rounds,
  inProgressRounds,
  userRole,
  playerId,
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
  // Ledger pagination — how many rows (across every group, in order) are
  // currently painted. Plain component state, not a URL param: it survives
  // re-renders and a client-side back-navigation from a round detail page
  // (the coach's place in a long ledger is preserved), while a genuine scope
  // change (filter/search/grouping, below) collapses it back to page one.
  const [visibleCount, setVisibleCount] = React.useState<number>(ROWS_PAGE_SIZE);

  const isCoach = userRole === 'coach';

  // Every durable in-progress parent must remain discoverable. Rows that look
  // alike can still be distinct rounds (including a qualifier recovery), and
  // hiding an older card makes a player's saved progress unreachable.
  // Server-side identity protections prevent future duplicates; the UI never
  // chooses a winner or silently removes a Continue Round link.
  const visibleInProgressRounds = inProgressRounds;

  // Coaches NEVER get the in-progress section or the New-round CTA.
  const showUnfinished = !isCoach && visibleInProgressRounds.length > 0;

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

  // A genuine scope change collapses pagination back to the first page —
  // "90 rows of All" carrying over as "90 rows of Practice" would be a
  // surprise, not a convenience. Coming back from a round detail page is
  // NOT one of these (this effect doesn't run on mount for that), so the
  // coach's place in the ledger is preserved either way.
  React.useEffect(() => {
    setVisibleCount(ROWS_PAGE_SIZE);
  }, [filter, playerFilter, search, grouping]);

  // Budget the first `visibleCount` rows across ALL groups, in order — never
  // per group — so a long ledger paints only a fast first page. Each
  // rendered group's header (count/avg/best/sparkline) still reflects its
  // FULL membership, not the truncated slice: a group cut off mid-list must
  // still honestly read "5 rounds · 74.2 avg", not silently shrink to "3".
  const visibleGroups = React.useMemo(() => {
    const result: Array<{
      key: string;
      label: string;
      scoredCount: number;
      spark: number[];
      avg: number | null;
      best: number | null;
      bestId: string | null;
      hasMultiple: boolean;
      rows: RoundLibraryRound[];
    }> = [];
    let remaining = visibleCount;
    for (let i = 0; i < grouped.length; i++) {
      if (remaining <= 0) break;
      const group = grouped[i]!;
      const rows = group.rounds.slice(0, remaining);
      remaining -= rows.length;

      // Best (lowest score-to-par) of the FULL period → accent rail + badge,
      // computed over every round in the group, not just the visible slice.
      let bestId: string | null = null;
      let bestScoreToPar = Infinity;
      for (const r of group.rounds) {
        if (r.score_to_par !== null && r.score_to_par < bestScoreToPar) {
          bestScoreToPar = r.score_to_par;
          bestId = r.id;
        }
      }
      const { scoredCount, spark, avg, best } = monthSummary(group.rounds);
      result.push({
        key: `${group.label}-${i}`,
        label: group.label,
        scoredCount,
        spark,
        avg,
        best,
        bestId,
        hasMultiple: group.rounds.length > 1,
        rows,
      });
    }
    return result;
  }, [grouped, visibleCount]);

  const totalGroupedRounds = React.useMemo(
    () => grouped.reduce((sum, g) => sum + g.rounds.length, 0),
    [grouped],
  );
  const hasMoreRows = visibleCount < totalGroupedRounds;

  // Chronological (oldest → newest) scoring series for the hero delta chips +
  // the desktop TickerStrip. HONEST: real scored rounds only.
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
  const scoreDelta = React.useMemo(() => seriesDelta(scoreSeries), [scoreSeries]);
  const toParDelta = React.useMemo(() => seriesDelta(toParSeries), [toParSeries]);

  // The desktop-only TickerStrip: the last 15 rounds that have a real
  // score-to-par, oldest → newest. `chronoScored` only guarantees a
  // `total_score`, and a completed round can still have a null `to_par`
  // (e.g. an incomplete hole-by-hole capture) — FairwayRoundRow already
  // guards this same case (`hasToPar`) rather than coercing it to 0, and
  // this bar chart must too: a coerced 0 reads as an even-par round, which
  // beats most real scores and can wrongly win `emphasis` as the "best" bar.
  // Height is min–max normalized WITHIN this window (not against an absolute
  // scale) so the strip always uses its full vertical range regardless of a
  // player's typical scoring band; the BEST (lowest score-to-par) round is
  // the tallest bar and carries `emphasis`. TickerItem has no click hook
  // (modules/TickerStrip.tsx is outside this file's scope), so this renders
  // read-only — see the PR notes for that deviation from the screen spec's
  // "tap → round".
  const tickerItems = React.useMemo<TickerItem[]>(() => {
    const window_ = chronoScored.filter((r) => r.score_to_par !== null).slice(-15);
    if (window_.length === 0) return [];
    const toPars = window_.map((r) => r.score_to_par!);
    const min = Math.min(...toPars);
    const max = Math.max(...toPars);
    const range = Math.max(1, max - min);
    return window_.map((r) => {
      const tp = r.score_to_par!;
      return {
        label: String(r.total_score ?? '—'),
        // best (lowest to-par) → 100%, worst (highest to-par) → 40%.
        heightPct: 100 - ((tp - min) / range) * 60,
        emphasis: tp === min,
      };
    });
  }, [chronoScored]);

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

  // The delta chips on the two scoring tiles are gated on the SAME honesty
  // threshold the old standalone "Scoring trend" pill used (`stats.trend` is
  // `null` under 6 scored rounds) — this replaces that pill rather than
  // adding a second, more permissive trend signal beside it.
  const hasScoreTrend = !starved && stats?.trend != null && scoreDelta !== null;
  const hasToParTrend =
    !starved && stats?.trend != null && stats?.avgToPar !== null && toParDelta !== null;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-6 md:px-6">
      {/* ── ONE MASTHEAD ──────────────────────────────────────────────────--*/}
      <ViewHeader
        eyebrow={eyebrow}
        title={title}
        meta={rounds.length > 0 ? meta : undefined}
        primaryAction={primaryAction}
      />

      {/* ── 1. (player only) In-progress banner — ABOVE the strip. Rendered
          regardless of whether any COMPLETED round exists yet — a player can
          have zero finished rounds and one in-progress round, and that
          in-progress round must stay discoverable/resumable either way. ───--*/}
      {showUnfinished && playerId && (
        <FairwayUnfinishedBanner rounds={visibleInProgressRounds} playerId={playerId} />
      )}

      {/* ── 2. ONE StatStrip band. StatTile owns the starved swap; the two
          scoring tiles carry a delta chip (magnitude, no sparkline) instead
          of the old inline Sparkline + the separate floating "Scoring trend"
          pill. Rendered even with zero completed rounds — every tile just
          renders its honest starved state (unchanged prior behavior). ─────--*/}
      <StatStrip count={5} columns={5} ariaLabel="Round summary">
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
          delta={hasScoreTrend ? scoreDelta! : undefined}
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
          delta={hasToParTrend ? toParDelta! : undefined}
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
          // No categorical/derived trend on this tile — never fake a delta.
          hideTrend
          starved={starved}
          unit="rounds"
          current={stats?.totalRounds ?? 0}
          required={3}
          className="bg-surface border border-border-subtle shadow-flat"
        />
      </StatStrip>

      {/* ── 3. Desktop-only scoring chronology — the ONE trend chart. Empty
          when there are no scored rounds yet, same as the strip above. ────--*/}
      {tickerItems.length >= 2 && (
        <div className="hidden md:block">
          <TickerStrip items={tickerItems} />
        </div>
      )}

      {/* ── Honest empty: zero completed rounds ─────────────────────────────
          Below the strip/ticker/banner (which stay honest on their own via
          the starved swap / empty ticker), this gate covers only the
          toolbar + ledger — there is nothing to filter or group yet. ───────--*/}
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
          {/* ── 4. ONE composed Toolbar row — search · filters (coach player
              Select + round-type FilterPills) · viewToggle (grouping). ─────--*/}
          <Toolbar
            aria-label="Rounds filters"
            search={
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
            }
            filters={
              <>
                {isCoach && playerOptions.length > 1 && (
                  <div className="w-44 shrink-0">
                    <Select
                      size="sm"
                      value={playerFilter}
                      onValueChange={(v) => setPlayerFilter(v ?? 'all')}
                      aria-label="Filter rounds by player"
                      options={[{ label: 'All players', value: 'all' }, ...playerOptions]}
                    />
                  </div>
                )}
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
              </>
            }
            viewToggle={
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
            }
          />

          {/* ── 5. ONE matte ledger Surface · filter-zero honest empty ─────--*/}
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
            // `overflow-clip`, NOT `overflow-hidden`: an `overflow-hidden`
            // ancestor becomes the scroll container `position: sticky`
            // resolves against, and this box never scrolls itself (the PAGE
            // does) — so the group seam headers below would never engage.
            // `overflow-clip` still clips content to the rounded corners
            // without creating that scroll container.
            <Surface padding="none" className="overflow-clip">
              {visibleGroups.map((group) => (
                // Each period is a sticky seam header + a divided run of
                // rows — ONE surface for the whole ledger, not a card per
                // group. `--golf-mobile-header-offset` is the shared
                // AppShell offset every other sticky-under-the-top-bar
                // strip in this app pins to (0 on desktop); this route also
                // renders inside FairwayHubSubNav, so the seam must also
                // clear `--fw-hub-subnav-offset` (2.5rem when the sub-nav
                // is present, 0px otherwise) the same way
                // FairwayCalendarHero/FairwayAgendaView do, or the header
                // would slide underneath it instead of stopping below it.
                <React.Fragment key={group.key}>
                  <div
                    className={cn(
                      'sticky top-[calc(var(--golf-mobile-header-offset)+var(--fw-hub-subnav-offset,0px))] z-10',
                      'flex items-end justify-between gap-4 border-b border-border-subtle bg-surface px-4 py-3',
                    )}
                  >
                    <div className="flex min-w-0 items-baseline gap-3">
                      <h3 className="whitespace-nowrap font-fw-display text-body-lg font-semibold tracking-[-0.01em] text-text-primary">
                        {group.label}
                      </h3>
                      <div className="hidden items-baseline gap-2 font-fw-sans text-caption text-text-tertiary sm:flex">
                        <span className="tabular-nums">
                          {group.scoredCount} round{group.scoredCount === 1 ? '' : 's'}
                        </span>
                        {group.avg !== null && (
                          <>
                            <span className="text-border-strong">·</span>
                            <span className="tabular-nums">avg {group.avg.toFixed(1)}</span>
                          </>
                        )}
                        {group.best !== null && (
                          <>
                            <span className="text-border-strong">·</span>
                            <span className="tabular-nums text-accent-700">best {group.best}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Omit the group sparkline under 6 scored rounds — a
                        2-3 point line reads as noise, not a trend. */}
                    {group.spark.length >= 6 && (
                      <Sparkline
                        data={group.spark}
                        goodDirection="down"
                        width={120}
                        height={24}
                        label={`${group.label} scores`}
                        className="flex-shrink-0"
                      />
                    )}
                  </div>

                  <div className="divide-y divide-border-subtle">
                    {group.rows.map((round) => (
                      <FairwayRoundRow
                        key={round.id}
                        round={round}
                        isBestOfPeriod={round.id === group.bestId && group.hasMultiple}
                        userRole={userRole}
                      />
                    ))}
                  </div>
                </React.Fragment>
              ))}

              {/* Quiet, manual pagination — never an IntersectionObserver
                  auto-load, so the coach controls exactly how much of a long
                  ledger renders. No per-row mount/layout animation here (or
                  in FairwayRoundRow) on purpose: a 90-row reveal animating in
                  is its own jank on a long list. */}
              {hasMoreRows && (
                <div className="flex justify-center border-t border-border-subtle px-4 py-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setVisibleCount((c) => c + ROWS_PAGE_SIZE)}
                  >
                    Show 30 more
                  </Button>
                </div>
              )}
            </Surface>
          )}
        </>
      )}
    </div>
  );
}
