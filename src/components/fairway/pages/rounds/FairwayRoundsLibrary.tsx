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
 *   PLAYER → masthead eyebrow "Your Rounds" / title "Your rounds." (or the
 *            verdict sentence once trustworthy, see MASTHEAD below); a
 *            "New round" primary CTA; the player-only "In progress" banner
 *            (when any); honest "Submit First Round" empty state; NO Leaders
 *            rail (ranking teammates isn't meaningful for a player looking
 *            at their own rounds — the Ledger runs full width instead).
 *   COACH  → masthead eyebrow "Team Rounds" / title "The library." (or the
 *            verdict sentence); NO New-round CTA; NO in-progress section;
 *            each row shows the player's Avatar; empty state reads "Players'
 *            rounds will appear here"; the ONLY role that gets the Leaders
 *            rail (best-of-scope spotlight + season-avg leaderboard).
 *
 * ── v2 FACELIFT COMPOSITION (docs/design/fairway-facelift/screens/
 *    rounds-library.v2.md) — a ranked instrument reading of the season, not
 *    a card stack: Masthead → Cockpit → Spread → Toolbar → Ledger (+ Leaders
 *    rail) → Footer, each region a deliberately different shape.
 *   1. MASTHEAD — ONE ViewHeader. Once the honesty gate clears (the same
 *      6-scored-round `stats.trend` threshold the old "Scoring trend" pill
 *      used, AND a real first-month label), the H1 itself becomes the
 *      verdict sentence ("{N} rounds since {month}. {shots} shot(s) better/
 *      worse/even than where the season started.") and the old meta line is
 *      dropped — the verdict already carries the count + range. Starved:
 *      falls back to the static per-role title + the unchanged meta line.
 *   2. (player) FairwayUnfinishedBanner, ABOVE the Cockpit, when in-progress
 *      rounds exist.
 *   3. COCKPIT — an `InstrumentCluster` (focal `RadialGauge` "% under par" +
 *      a two-item Readout rail: avg score / avg to par, each with its own
 *      delta line gated on the SAME 6-scored-round honesty threshold + a
 *      four-up tertiary foot row of counts) replaces the five equal
 *      StatMatrix boxes. Starved (<3 rounds): the dial shows its own built-in
 *      honest "awaiting signal" gauge and both rail Readouts swap to
 *      `state="awaiting"` — never a fabricated 0.0.
 *   4. SPREAD — a borderless footnote (one top hairline, no Surface):
 *      `DivergingBars` showing each round type's avg score-to-par against
 *      the field average. A type with zero rounds in scope is omitted, never
 *      shown as a fabricated 0. This is NOT a second scoring-trend chart —
 *      each month's own sticky seam header already carries that Sparkline
 *      (≥6 scored rounds), the ONE trend chart for the page.
 *   5. TOOLBAR — unchanged: search (player/course) · filters (the coach-only
 *      player Select + the four round-type FilterPills, one horizontally-
 *      scrolling row with an edge fade via the Toolbar primitive's own
 *      `useScrollFade`) · viewToggle (a Segmented Month/Week control from
 *      `md` up; on phone the same choice moves into an overflow Menu).
 *   6. LEDGER (+ LEADERS rail, coach only) — the dominant object, still ONE
 *      matte Surface holding EVERY group (no per-group Surface, no nested
 *      cards): a sticky seam header (label · count · avg · a Sparkline only
 *      when the group has ≥6 and ≤20 scored rounds) followed by its
 *      FairwayRoundRow rows. Each row now also carries a `MicroBar` — this
 *      round's score-to-par against THAT PLAYER's own season average — a
 *      fact nothing else on the row states, gated on the player having ≥2
 *      scored rounds (honest; otherwise the row renders exactly as before).
 *      Coach only: a `320px` sticky rail beside the ledger holds the
 *      best-of-the-current-scope round (an `Elevated` spotlight card) and a
 *      season-avg-to-par leaderboard (`RankCell` rows); below `lg` it
 *      collapses to one tappable "Best: …" seam row that opens the same
 *      content in a `Sheet`.
 *   7. FOOTER — unchanged manual "Show 30 more" pagination, now paired with
 *      a printed "Showing N of M" footnote — honest, no auto-load.
 *
 * ── PAGINATION (perf follow-up, not in the original screen spec) ───────────
 *   A large team's ledger (90+ rounds) rendered every row eagerly — measured
 *   lag on real accounts. The Surface now paints only the first
 *   `ROWS_PAGE_SIZE` rows across ALL groups, in order, with a "Show 30 more"
 *   Button at the bottom; group headers still report each group's FULL
 *   count/avg/best/sparkline, never the truncated slice. The Cockpit is
 *   unaffected — it already summarizes the full dataset, not the rendered
 *   list. No per-row mount/layout animation, by design, on a list this long.
 *
 * Honest empties throughout: zero rounds → EmptyState; a narrowed filter
 * that matches nothing → EmptyState variant="search" + "Clear filters".
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in
 * rounds/page.tsx. Renders inside `.fairway-ds` on a bg-canvas page.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ViewHeader } from '@/components/fairway/view-header/view-header';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { IconButton } from '@/components/fairway/controls/button';
import { Toolbar } from '@/components/fairway/controls/Toolbar';
import { FilterPill } from '@/components/fairway/controls/filter-pill';
import { Segmented } from '@/components/fairway/controls/segmented';
import { Menu } from '@/components/fairway/overlays/Menu';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Input } from '@/components/fairway/forms/Input';
import { Select } from '@/components/fairway/forms/Select';
import { IconSearch, IconX } from '@/components/icons';
import {
  InstrumentCluster,
  InstrumentPanel,
  Readout,
  RadialGauge,
  DivergingBars,
  RankCell,
  Elevated,
  Avatar,
  StatusPill,
  type DivergingRow,
} from '@/components/fairway';
import { Sparkline } from '@/components/fairway/charts/Sparkline';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { FairwayRoundRow } from './FairwayRoundRow';
import { FairwayUnfinishedBanner } from './FairwayUnfinishedBanner';
import { scoreToParTone, formatToPar } from './FairwayRoundCard';
import { cleanCourseName } from '@/lib/golf/course-name';
import {
  parseDateOnly,
  dateOnlyToUtcDate,
  formatDateOnlyFull,
  type DateOnlyParts,
} from '@/lib/golf/date-only';

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

/** The earliest round's month label only, e.g. "Jan 2026" — mirrors
 *  `honestRange`'s own UTC-pinned date parsing, for the masthead's verdict
 *  sentence ("… rounds since {firstMonthLabel}."). `null` when unparseable. */
function firstMonthLabel(rounds: RoundLibraryRound[]): string | null {
  const dates = rounds
    .map((r) => parseDateOnly(r.round_date))
    .filter((p): p is DateOnlyParts => p !== null)
    .map(dateOnlyToUtcDate)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return null;
  return dates[0]!.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
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

  // v2 facelift — per-player season average score-to-par over the FULL
  // `rounds` array (never `scopedRounds`/`filteredRounds` — a player's season
  // average shouldn't shift because a search box narrowed the view). Built
  // the same de-duped-by-name way `playerOptions` already is, aggregating
  // `score_to_par` (+ a display avatar) instead of collecting names. Powers
  // BOTH the Leaders rail leaderboard and every row's `MicroBar` — one memo,
  // no new fetch. A min of 2 scored rounds to qualify: a season "average"
  // from a single round is a coin flip, not a comparison.
  const playerSeasonStats = React.useMemo(() => {
    type Agg = { sum: number; count: number; avatarUrl: string | null };
    const totals = new Map<string, Agg>();
    for (const r of rounds) {
      if (r.score_to_par === null) continue;
      const name = playerName(r);
      if (!name) continue;
      const entry = totals.get(name) ?? { sum: 0, count: 0, avatarUrl: null };
      entry.sum += r.score_to_par;
      entry.count += 1;
      if (!entry.avatarUrl && r.player?.avatar_url) entry.avatarUrl = r.player.avatar_url;
      totals.set(name, entry);
    }
    const qualified = new Map<string, { avgToPar: number; count: number; avatarUrl: string | null }>();
    for (const [name, { sum, count, avatarUrl }] of totals) {
      if (count < 2) continue;
      qualified.set(name, { avgToPar: sum / count, count, avatarUrl });
    }
    return qualified;
  }, [rounds]);

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

  // v2 facelift Spread — avg score-to-par per round type over the CURRENTLY
  // SCOPED rounds (player filter + search applied, same as `filterCounts`
  // above). A type with zero rounds in scope is simply absent from the map —
  // the Spread region below renders it as omitted, never a fabricated 0.
  const typeAvgToPar = React.useMemo(() => {
    const totals: Record<'practice' | 'qualifier' | 'tournament', { sum: number; count: number }> = {
      practice: { sum: 0, count: 0 },
      qualifier: { sum: 0, count: 0 },
      tournament: { sum: 0, count: 0 },
    };
    for (const r of scopedRounds) {
      if (r.score_to_par === null) continue;
      const t = (r.round_type || '').toLowerCase();
      if (t === 'practice') {
        totals.practice.sum += r.score_to_par;
        totals.practice.count += 1;
      } else if (t === 'qualifier' || t === 'qualifying') {
        totals.qualifier.sum += r.score_to_par;
        totals.qualifier.count += 1;
      } else if (t === 'tournament') {
        totals.tournament.sum += r.score_to_par;
        totals.tournament.count += 1;
      }
    }
    return totals;
  }, [scopedRounds]);

  const filteredRounds = React.useMemo(() => {
    if (filter === 'all') return scopedRounds;
    return scopedRounds.filter((r) => {
      const t = (r.round_type || '').toLowerCase();
      if (filter === 'qualifier') return t === 'qualifier' || t === 'qualifying';
      return t === filter;
    });
  }, [scopedRounds, filter]);

  // v2 facelift Leaders rail — the single best (lowest score_to_par) round
  // over the whole FILTERED scope, the same "lowest score_to_par wins"
  // computation each ledger group's own `bestId` already does, just over the
  // full filtered set instead of one month/week group.
  const bestOfScope = React.useMemo(() => {
    let best: RoundLibraryRound | null = null;
    let bestScoreToPar = Infinity;
    for (const r of filteredRounds) {
      if (r.score_to_par !== null && r.score_to_par < bestScoreToPar) {
        bestScoreToPar = r.score_to_par;
        best = r;
      }
    }
    return best;
  }, [filteredRounds]);

  // v2 facelift Leaders rail — the season-avg-to-par leaderboard, ranked
  // ascending (lower avg-to-par first). "Current scope" here means the
  // coach's player Select (not the free-text search, which also matches
  // course names and would otherwise narrow the ROSTER by an unrelated
  // field) — selecting one player collapses this to that one entry, which
  // is exactly the "fewer than 2 qualifying players" honest-empty case.
  const leaderboardEntries = React.useMemo(() => {
    const entries = Array.from(playerSeasonStats.entries());
    const scoped =
      isCoach && playerFilter !== 'all' ? entries.filter(([name]) => name === playerFilter) : entries;
    return scoped.sort((a, b) => a[1].avgToPar - b[1].avgToPar).slice(0, 5);
  }, [playerSeasonStats, isCoach, playerFilter]);

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
  // The Footer's printed "Showing N of M" footnote — the TRUE rendered count
  // (never `visibleCount` itself, which can overshoot `totalGroupedRounds`
  // once the page size exceeds what's left to show).
  const renderedRowCount = React.useMemo(
    () => visibleGroups.reduce((sum, g) => sum + g.rows.length, 0),
    [visibleGroups],
  );

  // Chronological (oldest → newest) scoring series for the Cockpit's Readout
  // delta lines and the Masthead's verdict sentence. HONEST: real scored
  // rounds only.
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

  // ── Cockpit + Masthead honesty ───────────────────────────────────────────
  const starved = !stats || stats.totalRounds < 3;

  // The delta lines on the Cockpit's two scoring Readouts are gated on the
  // SAME honesty threshold the old standalone "Scoring trend" pill used
  // (`stats.trend` is `null` under 6 scored rounds) — this replaces that
  // pill rather than adding a second, more permissive trend signal beside it.
  const hasScoreTrend = !starved && stats?.trend != null && scoreDelta !== null;
  const hasToParTrend =
    !starved && stats?.trend != null && stats?.avgToPar !== null && toParDelta !== null;

  // "+3.6" / "−2.1" / "0.0" — signDisplay:exceptZero, one decimal. Kept as a
  // plain helper (not `formatToPar`, which prints a bare "E" at level par and
  // a strokes-only integer) so this cell's precision matches its prior
  // StatTile rendering exactly.
  const avgToParDisplay =
    stats?.avgToPar != null
      ? stats.avgToPar > 0
        ? `+${stats.avgToPar.toFixed(1)}`
        : stats.avgToPar.toFixed(1)
      : null;

  // ── Masthead verdict sentence ─────────────────────────────────────────────
  // Reuses `hasScoreTrend` (same 6-scored-round threshold `stats.trend`
  // already gates) as the honesty gate for the H1 itself — a real verdict
  // ("N rounds since {month}. {shots} shot(s) better/worse/even than where
  // the season started.") once trustworthy, replacing the static per-role
  // title AND absorbing the old meta line (it already carries the count +
  // start date, so repeating it below would be redundant). Starved: falls
  // back to the unchanged per-role title + meta line, byte-for-byte what
  // this page has always shown.
  const firstMonth = firstMonthLabel(rounds);
  const showVerdict = hasScoreTrend && firstMonth !== null;
  const verdictTitle = showVerdict
    ? (() => {
        const n = rounds.length;
        const shots = Math.abs(Math.round(scoreDelta!));
        const direction = scoreDelta! < 0 ? 'better' : scoreDelta! > 0 ? 'worse' : 'even';
        return `${n} round${n === 1 ? '' : 's'} since ${firstMonth}. ${shots} shot${
          shots === 1 ? '' : 's'
        } ${direction} than where the season started.`;
      })()
    : null;

  // ── Leaders rail (coach only) — spotlight card + collapsed-row copy ─────--
  const bestName = bestOfScope ? playerName(bestOfScope) : null;
  const bestCourse = bestOfScope ? cleanCourseName(bestOfScope.course_name) || 'Unknown course' : null;
  const bestToParDisplay =
    bestOfScope && bestOfScope.score_to_par !== null ? formatToPar(bestOfScope.score_to_par) : null;
  const bestSummaryLine = bestOfScope
    ? `Best: ${bestName ?? 'Unnamed player'}, ${bestOfScope.total_score ?? '—'}${
        bestToParDisplay ? ` (${bestToParDisplay})` : ''
      } at ${bestCourse}`
    : null;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-6 md:px-6">
      {/* ── MASTHEAD — the one h1, now a verdict once trustworthy ──────────--*/}
      <ViewHeader
        eyebrow={eyebrow}
        title={verdictTitle ?? title}
        meta={verdictTitle ? undefined : rounds.length > 0 ? meta : undefined}
        primaryAction={primaryAction}
      />

      {/* ── (player only) In-progress banner — ABOVE the Cockpit. Rendered
          regardless of whether any COMPLETED round exists yet — a player can
          have zero finished rounds and one in-progress round, and that
          in-progress round must stay discoverable/resumable either way. ───--*/}
      {showUnfinished && playerId && (
        <FairwayUnfinishedBanner rounds={visibleInProgressRounds} playerId={playerId} />
      )}

      {/* ── COCKPIT — a ranked InstrumentCluster replaces the five equal
          StatMatrix boxes: a focal RadialGauge, a two-item Readout rail
          (each delta-gated on the same 6-scored-round honesty threshold the
          old "Scoring trend" pill used), a four-up tertiary count row.
          Rendered even with zero completed rounds — every instrument owns
          its own honest starved/awaiting swap, never a fabricated 0.0. ───--*/}
      <InstrumentCluster
        ariaLabel="Round summary instrument cluster"
        balance="focal"
        primary={
          <RadialGauge
            size="md"
            title="% under par"
            overline="SEASON"
            readoutLabel="of scored rounds"
            value={starved ? undefined : stats!.underParPct / 100}
            awaiting={starved}
            samples={stats?.totalRounds}
            minSamples={3}
            unit="rounds"
          />
        }
        secondary={[
          <InstrumentPanel key="avg-score" depth="base" padding="md">
            {starved ? (
              <Readout size="lg" label="Avg score" state="awaiting" />
            ) : (
              <Readout
                size="lg"
                label="Avg score"
                display={stats!.avg.toFixed(1)}
                delta={
                  hasScoreTrend
                    ? {
                        value: scoreDelta!,
                        // Golf is lower-is-better: a falling average is the
                        // GOOD ('up'/green) direction.
                        direction: scoreDelta! < 0 ? 'up' : scoreDelta! > 0 ? 'down' : 'flat',
                      }
                    : undefined
                }
              />
            )}
          </InstrumentPanel>,
          <InstrumentPanel key="avg-to-par" depth="base" padding="md">
            {starved || avgToParDisplay === null ? (
              <Readout size="lg" label="Avg to par" unit="strokes" state="awaiting" />
            ) : (
              <Readout
                size="lg"
                label="Avg to par"
                unit="strokes"
                display={avgToParDisplay}
                delta={
                  hasToParTrend
                    ? {
                        value: toParDelta!,
                        direction: toParDelta! < 0 ? 'up' : toParDelta! > 0 ? 'down' : 'flat',
                      }
                    : undefined
                }
              />
            )}
          </InstrumentPanel>,
        ]}
        tertiary={[
          <InstrumentPanel key="rounds" depth="base" padding="md">
            {starved ? (
              <Readout size="sm" label="Rounds" state="awaiting" />
            ) : (
              <Readout size="sm" label="Rounds" display={stats!.totalRounds} />
            )}
          </InstrumentPanel>,
          <InstrumentPanel key="best" depth="base" padding="md">
            {starved ? (
              <Readout size="sm" label="Best round" state="awaiting" />
            ) : (
              <Readout size="sm" label="Best round" display={stats!.best} />
            )}
          </InstrumentPanel>,
          <InstrumentPanel key="practice" depth="base" padding="md">
            <Readout size="sm" label="Practice" display={filterCounts.practice} />
          </InstrumentPanel>,
          <InstrumentPanel key="tournament" depth="base" padding="md">
            <Readout size="sm" label="Tournament" display={filterCounts.tournament} />
          </InstrumentPanel>,
        ]}
      />

      {/* ── SPREAD — a borderless footnote, no card, no Surface: where the
          team actually loses or gains strokes, by round type. Earns a shape
          none of its neighbors have (one top hairline only). A type with
          zero rounds in scope is omitted, never a fabricated 0. This is NOT
          a second scoring-trend chart — each month's own seam header
          already carries that Sparkline, the ONE trend chart for the page. */}
      {(() => {
        const spreadRows: DivergingRow[] = (
          [
            ['Practice', typeAvgToPar.practice],
            ['Qualifier', typeAvgToPar.qualifier],
            ['Tournament', typeAvgToPar.tournament],
          ] as const
        )
          .filter(([, agg]) => agg.count > 0)
          .map(([label, agg]) => {
            const delta = agg.sum / agg.count;
            return {
              label,
              delta,
              display: delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1),
            };
          });
        if (spreadRows.length === 0) return null;
        const max = Math.max(...spreadRows.map((r) => Math.abs(r.delta)));
        return (
          <div className="border-t border-border-subtle pt-4">
            <p className="mb-2 font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
              Against par, by type
            </p>
            <DivergingBars rows={spreadRows} max={max} />
          </div>
        );
      })()}

      {/* ── Honest empty: zero completed rounds ─────────────────────────────
          Below the Cockpit/banner (which stay honest on their own via the
          starved swap), this gate covers only the toolbar + ledger — there
          is nothing to filter or group yet. ─────────────────────────────--*/}
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
          {/* ── TOOLBAR — search · filters (coach player Select + round-type
              FilterPills) · viewToggle (grouping). Unchanged. ─────────────--*/}
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
            // #rounds-polish row 23: the Month/Week switch stays a visible
            // Segmented control from `md` up; on phone it moves into an
            // overflow Menu instead of competing with search/filters for
            // the toolbar's one line of room.
            viewToggle={
              <>
                <div className="hidden md:block">
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
                <div className="md:hidden">
                  <Menu
                    trigger={
                      <Button variant="secondary" size="sm" aria-label="Group rounds by">
                        {grouping === 'month' ? 'Month' : 'Week'}
                      </Button>
                    }
                  >
                    <Menu.Item
                      icon={grouping === 'month' ? <Check size={14} aria-hidden /> : undefined}
                      onSelect={() => setGrouping('month')}
                    >
                      Month
                    </Menu.Item>
                    <Menu.Item
                      icon={grouping === 'week' ? <Check size={14} aria-hidden /> : undefined}
                      onSelect={() => setGrouping('week')}
                    >
                      Week
                    </Menu.Item>
                  </Menu>
                </div>
              </>
            }
          />

          {/* ── LEDGER (+ LEADERS rail, coach only) ─────────────────────────
              Coach: a 320px sticky rail beside the ledger at `lg` and up;
              below `lg` it collapses to one tappable "Best: …" row that
              opens the same spotlight + leaderboard in a Sheet, directly
              above the ledger's first group header. Player: the grid
              collapses to a single column — ranking teammates isn't
              meaningful when `rounds` is already just their own. ─────────--*/}
          <div className={cn('grid grid-cols-1 gap-6', isCoach && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
            <div className="flex min-w-0 flex-col gap-4">
              {isCoach && bestOfScope && bestSummaryLine && (
                <div className="lg:hidden">
                  <Sheet
                    title="Leaders"
                    description="This season's best round and the season-avg leaderboard, for the current view."
                    trigger={
                      // Button's non-asChild CHILDREN CONTRACT wraps whatever
                      // is passed in ONE bare span — a flex-row layout needs
                      // its own pre-composed flex span as that single child.
                      <Button variant="secondary" fullWidth className="justify-between text-left">
                        <span className="flex w-full items-center justify-between gap-3">
                          <span className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                            {bestSummaryLine}
                          </span>
                          <ChevronRight aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-text-tertiary" />
                        </span>
                      </Button>
                    }
                  >
                    <LeadersRailPanel
                      bestOfScope={bestOfScope}
                      bestName={bestName}
                      bestCourse={bestCourse}
                      bestToParDisplay={bestToParDisplay}
                      leaderboardEntries={leaderboardEntries}
                    />
                  </Sheet>
                </div>
              )}

              {/* ── ONE matte ledger Surface · filter-zero honest empty ────--*/}
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
                            2-3 point line reads as noise, not a trend — and
                            above ~20, where a whole season's worth of scores at
                            this 120px width was a jagged, unreadable scribble
                            (#rounds-polish row 29). `flatThreshold` widens the
                            neutral deadzone so ordinary round-to-round noise (a
                            few strokes between the month's first and last round)
                            reads as the quiet neutral tone instead of flipping
                            this decorative header texture to amber on every
                            month whose LAST round happened to be a rough one —
                            the avg/best figures beside it, not this squiggle,
                            carry the real verdict. A genuinely bad month (a
                            real multi-round decline) still earns amber honestly. */}
                        {group.spark.length >= 6 && group.spark.length <= 20 && (
                          <Sparkline
                            data={group.spark}
                            goodDirection="down"
                            flatThreshold={4}
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
                            seasonAvgToPar={
                              playerSeasonStats.get(playerName(round) ?? '')?.avgToPar ?? null
                            }
                          />
                        ))}
                      </div>
                    </React.Fragment>
                  ))}

                  {/* ── FOOTER — quiet, manual pagination — never an
                      IntersectionObserver auto-load, so the coach controls
                      exactly how much of a long ledger renders — paired with
                      a printed "Showing N of M" footnote. No per-row mount/
                      layout animation here (or in FairwayRoundRow) on
                      purpose: a 90-row reveal animating in is its own jank
                      on a long list. */}
                  {hasMoreRows && (
                    <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
                      <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                        Showing {renderedRowCount} of {totalGroupedRounds}
                      </span>
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
            </div>

            {/* ── LEADERS rail (coach only, desktop) — sticky companion that
                survives the ledger scroll. Same `--golf-mobile-header-offset`
                + `--fw-hub-subnav-offset` static CSS custom-property chain
                the seam headers above already use — a static `top: calc()`,
                never the JS IntersectionObserver `rootMargin` string-math
                that caused the Toolbar's earlier route-error regression. ──--*/}
            {isCoach && (
              <div className="hidden lg:block">
                <div className="sticky top-[calc(var(--golf-mobile-header-offset)+var(--fw-hub-subnav-offset,0px))] flex flex-col gap-4">
                  <LeadersRailPanel
                    bestOfScope={bestOfScope}
                    bestName={bestName}
                    bestCourse={bestCourse}
                    bestToParDisplay={bestToParDisplay}
                    leaderboardEntries={leaderboardEntries}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * LeadersRailPanel — the Leaders rail's shared content. The desktop sticky
 * rail AND the phone collapsed-row Sheet render this exact same panel, so
 * the spotlight + leaderboard can never drift between the two presentations.
 * ─────────────────────────────────────────────────────────────────────────── */
interface LeadersRailPanelProps {
  bestOfScope: RoundLibraryRound | null;
  bestName: string | null;
  bestCourse: string | null;
  bestToParDisplay: string | null;
  leaderboardEntries: ReadonlyArray<
    readonly [string, { avgToPar: number; count: number; avatarUrl: string | null }]
  >;
}

function LeadersRailPanel({
  bestOfScope,
  bestName,
  bestCourse,
  bestToParDisplay,
  leaderboardEntries,
}: LeadersRailPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Spotlight — the single best round of the current filtered scope. */}
      <Elevated level="raise" padding="md">
        <p className="mb-3 font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
          Best of the scope
        </p>
        {bestOfScope ? (
          <div className="flex flex-col gap-3">
            <p className="truncate font-fw-sans text-body font-medium text-text-primary">{bestCourse}</p>
            <div className="flex items-center gap-2">
              <Avatar src={bestOfScope.player?.avatar_url} name={bestName} size="sm" />
              <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                {bestName ?? 'Unnamed player'}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-fw-display text-h3 font-medium tabular-nums text-text-primary">
                {bestOfScope.total_score ?? '—'}
              </span>
              {bestToParDisplay && bestOfScope.score_to_par !== null ? (
                <StatusPill
                  tone={
                    scoreToParTone(bestOfScope.score_to_par) === 'under'
                      ? 'accent'
                      : scoreToParTone(bestOfScope.score_to_par) === 'over'
                        ? 'warning'
                        : 'neutral'
                  }
                  size="sm"
                  dot={false}
                  className="font-fw-mono tabular-nums"
                >
                  {bestToParDisplay}
                </StatusPill>
              ) : null}
            </div>
            <p className="font-fw-sans text-caption text-text-tertiary">
              {formatDateOnlyFull(bestOfScope.round_date)}
            </p>
          </div>
        ) : (
          <p className="font-fw-sans text-body-sm text-text-tertiary">No rounds in this view yet.</p>
        )}
      </Elevated>

      {/* Leaderboard — season-avg score-to-par, ranked ascending. Honest
          one-line fallback when the current player scope is too narrow to
          rank (a coach filtered to one player, or too few players qualify). */}
      <div className="border-t border-border-subtle pt-4">
        {leaderboardEntries.length < 2 ? (
          <p className="font-fw-sans text-body-sm text-text-tertiary">Only one player in this view.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {leaderboardEntries.map(([name, entry], i) => (
              <div key={name} className="flex items-center gap-3">
                <RankCell rank={i + 1} of={leaderboardEntries.length} />
                <Avatar src={entry.avatarUrl} name={name} size="sm" />
                <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm text-text-primary">
                  {name}
                </span>
                <span className="font-fw-mono text-body-sm tabular-nums text-text-primary">
                  {entry.avgToPar > 0 ? `+${entry.avgToPar.toFixed(1)}` : entry.avgToPar.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
