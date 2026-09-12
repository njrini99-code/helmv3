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
 *   PLAYER → v2 (player-rounds.v2.md), UNCHANGED by this pass: masthead
 *            eyebrow "Your Rounds" / title "Your rounds."; a "New round"
 *            primary CTA; the player-only "In progress" banner; the
 *            RoundsStage/ScoreBandHistogram/RoundTypeSegment/MonthDeviationBars
 *            instruments (rounds-instruments.tsx:252-491); NO Leaders/Score
 *            bands ledger row (ranking teammates isn't meaningful for a
 *            player looking at their own rounds).
 *   COACH  → v3 field-sheet (docs/design/fairway-facelift/screens/
 *            rounds-library.v3.md), replacing the v2 "Cockpit" (InstrumentCluster
 *            + RadialGauge + tertiary panels) + "Spread" (DivergingBars
 *            footnote) + "Leaders rail" (sticky Elevated spotlight + sidebar
 *            leaderboard) — the masthead/panel-grid pattern LANGUAGE.md was
 *            written to kill.
 *
 * ── v3 FACELIFT COMPOSITION (coach only) ────────────────────────────────────
 *   1. MASTHEAD — bare eyebrow + `text-display` title (unchanged per-role
 *      strings) + a separate verdict sentence (`text-h3`, built from
 *      `rounds-library-logic.ts#buildRoundsVerdict`), always describing the
 *      whole roster regardless of the stage's own player-scope. No primary
 *      action, no overflow menu (nothing to add one for on this page today).
 *   2. THE STAGE — the one Surface: `RoundField`, a new page-local instrument
 *      plotting every round in view as a mark on a shared date axis (position
 *      by date, height/color by score-to-par, size by round type), with the
 *      scoped average drawn as a dashed line. Header row carries the overline/
 *      title/legend and the player-scope Select (relocated out of the
 *      Toolbar). A readouts column (Rounds/Avg/Best/Qualifier share) sits
 *      beside it on desktop, above it on phone.
 *   3. THE LEDGER ROW — two bare columns divided by a hairline: Leaders (the
 *      unscoped season-avg-to-par leaderboard, clicking a row scopes the
 *      player-Select) and Score bands (`scoreBands` from rounds-instruments,
 *      clicking a row narrows the table below via `bandFilter`).
 *   4. THE TABLE — a real, dense `<table>` (Date/Player/Course/Type/Score/
 *      To par/Putts/GIR) replacing the div/flex `FairwayRoundRow` markup,
 *      with sticky spanning `<tr><td colSpan={8}>` group headers (label +
 *      full round count only — the stage's own Avg/Best readouts already own
 *      those numbers at the scope level). Grouping/search/type-pills/
 *      pagination are unchanged.
 *
 * Honest empties throughout: zero rounds → EmptyState; a narrowed filter that
 * matches nothing → EmptyState variant="search" + "Clear filters"; a selected
 * player with zero rounds in scope → EmptyState variant="subtle" on the stage.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in
 * rounds/page.tsx. Renders inside `.fairway-ds` on a bg-canvas page.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';

import { ViewHeader } from '@/components/fairway/view-header/view-header';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { IconButton } from '@/components/fairway/controls/button';
import { Toolbar } from '@/components/fairway/controls/Toolbar';
import { FilterPill } from '@/components/fairway/controls/filter-pill';
import { Segmented } from '@/components/fairway/controls/segmented';
import { Menu } from '@/components/fairway/overlays/Menu';
import { Input } from '@/components/fairway/forms/Input';
import { Select } from '@/components/fairway/forms/Select';
import { IconSearch, IconX } from '@/components/icons';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { RoundField } from './RoundField';
import {
  RoundsVerdictLine,
  RoundsReadouts,
  RoundsLeadersColumn,
  RoundsScoreBandsColumn,
  RoundsTable,
  type RoundsReadoutItem,
  type RoundsTableGroup,
} from './rounds-library-parts';
import { FairwayUnfinishedBanner } from './FairwayUnfinishedBanner';
import { FairwayRoundRow } from './FairwayRoundRow';
import {
  RoundsStage,
  ScoreBandHistogram,
  RoundTypeSegment,
  MonthDeviationBars,
  SeamSpark,
  normalizedScore,
  monthDeviations,
  recentShift,
  scoreBands,
  scoreBandIndex,
} from './rounds-instruments';
import { cleanCourseName } from '@/lib/golf/course-name';
import { parseDateOnly, dateOnlyToUtcDate, formatDateOnlyShort } from '@/lib/golf/date-only';
import {
  playerName,
  firstMonthLabel,
  honestRange,
  seriesDelta,
  chronoNormalizedScores,
  roundFieldCap,
  roundsDateDomain,
  computeScopedSummary,
  buildRoundFieldMarks,
  bestOfRounds,
  rankPlayersByAvgToPar,
  buildRoundsVerdict,
} from './rounds-library-logic';

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

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
// this file's own table row, which already goes through the shared date-only
// helper) showed for the SAME round. Every grouping/range helper below now
// parses the raw Y/M/D digits directly and formats pinned to UTC.

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
  // Player seam headers at `md`+ (player-rounds.v2.md): putts and GIR% lines
  // beside the score line, each over the rounds that logged that column.
  const chrono = rounds.slice().reverse();
  const puttsSpark = chrono
    .map((r) => r.total_putts)
    .filter((v): v is number => v !== null && v > 0);
  const girSpark = chrono
    .map((r) =>
      r.total_gir_possible !== null && r.total_gir_possible > 0 && r.total_gir !== null
        ? Math.round((r.total_gir / r.total_gir_possible) * 100)
        : null,
    )
    .filter((v): v is number => v !== null);
  return { scoredCount: scored.length, spark, avg, best, puttsSpark, girSpark };
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
  const router = useRouter();
  const [grouping, setGrouping] = React.useState<Grouping>('month');
  const [filter, setFilter] = React.useState<RoundFilter>('all');
  // P210 — coach-scale filtering. A coach sees every team member's rounds, so
  // the toolbar needs a per-player filter + a free-text search to find one
  // player (or one course) without scrolling the whole ledger. Pure client
  // filters over the data already in memory — no extra fetch.
  const [playerFilter, setPlayerFilter] = React.useState<string>('all');
  const [search, setSearch] = React.useState<string>('');
  // v3 facelift — the ledger row's Score bands column narrows the table to
  // one band (a 0-4 `scoreBandIndex`) when set; `null` is no narrowing.
  const [bandFilter, setBandFilter] = React.useState<number | null>(null);
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
  // the masthead's unscoped leader and the Leaders ledger column — one memo,
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

  // v3 facelift — the unscoped ranking (ascending avg-to-par), read by both
  // the masthead's leader (top entry) and the Leaders ledger column (top 5).
  const rankedLeaders = React.useMemo(() => rankPlayersByAvgToPar(playerSeasonStats), [playerSeasonStats]);

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

  // v3 facelift — the coach player-Select-only scope the stage plots
  // (rounds-library.v3.md "Scope"): NOT search/type — those narrow the table,
  // never the season-wide stage.
  const playerScopedRounds = React.useMemo(() => {
    if (!isCoach || playerFilter === 'all') return rounds;
    return rounds.filter((r) => playerName(r) === playerFilter);
  }, [rounds, isCoach, playerFilter]);

  // v3 facelift — the Score bands ledger column narrows the TABLE only (never
  // the bands column's own `filteredRounds` scope, which would make a
  // selected band always read "100%").
  const tableRounds = React.useMemo(() => {
    if (bandFilter === null) return filteredRounds;
    return filteredRounds.filter((r) => r.score_to_par !== null && scoreBandIndex(r.score_to_par) === bandFilter);
  }, [filteredRounds, bandFilter]);

  // Is any narrowing active (drives the filter-zero empty-state copy + reset)?
  const isNarrowed = filter !== 'all' || playerFilter !== 'all' || search.trim() !== '' || bandFilter !== null;
  const resetFilters = React.useCallback(() => {
    setFilter('all');
    setPlayerFilter('all');
    setSearch('');
    setBandFilter(null);
  }, []);

  const grouped = React.useMemo(() => {
    const map: Record<string, { label: string; rounds: RoundLibraryRound[] }> = {};
    for (const r of tableRounds) {
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
  }, [tableRounds, grouping]);

  // A genuine scope change collapses pagination back to the first page —
  // "90 rows of All" carrying over as "90 rows of Practice" would be a
  // surprise, not a convenience. Coming back from a round detail page is
  // NOT one of these (this effect doesn't run on mount for that), so the
  // coach's place in the ledger is preserved either way.
  React.useEffect(() => {
    setVisibleCount(ROWS_PAGE_SIZE);
  }, [filter, playerFilter, search, grouping, bandFilter]);

  // Budget the first `visibleCount` rows across ALL groups, in order — never
  // per group — so a long ledger paints only a fast first page. Each
  // rendered group's header still reports its FULL round count, never the
  // truncated slice.
  const visibleGroups: RoundsTableGroup[] = React.useMemo(() => {
    const result: RoundsTableGroup[] = [];
    let remaining = visibleCount;
    for (let i = 0; i < grouped.length; i++) {
      if (remaining <= 0) break;
      const group = grouped[i]!;
      const rows = group.rounds.slice(0, remaining);
      remaining -= rows.length;

      // Best (lowest score-to-par) of the FULL period → the player branch's
      // accent rail + "Best" badge on `FairwayRoundRow`, computed over every
      // round in the group, not just the visible slice. The coach table
      // doesn't read these two fields (v3 drops the badge, see the spec's
      // "Grouping stays"), but they're cheap to keep on every group so the
      // player branch's pre-facelift row logic needs no separate pass.
      let bestId: string | null = null;
      let bestScoreToPar = Infinity;
      for (const r of group.rounds) {
        if (r.score_to_par !== null && r.score_to_par < bestScoreToPar) {
          bestScoreToPar = r.score_to_par;
          bestId = r.id;
        }
      }
      const { scoredCount, spark, avg, best, puttsSpark, girSpark } = monthSummary(group.rounds);
      result.push({
        key: `${group.label}-${i}`,
        label: group.label,
        scoredCount,
        spark,
        puttsSpark,
        girSpark,
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

  // Chronological (oldest → newest) scoring series for the masthead's verdict
  // sentence, team-wide and independent of any player-scope control.
  // HONEST: real scored rounds only.
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
  const scoreDelta = React.useMemo(() => seriesDelta(scoreSeries), [scoreSeries]);

  // ── Player stage (player-rounds.v2.md) ─────────────────────────────────--
  // The Ribbon's points are the same chronological normalized series the
  // masthead's team-wide delta reads, one point per scored round, labelled by
  // its date (UTC-pinned). The newest scored round is named in the readout.
  const stagePoints = React.useMemo(
    () =>
      chronoScored
        .map((r) => ({ x: formatDateOnlyShort(r.round_date), y: normalizedScore(r) }))
        .filter((pt): pt is { x: string; y: number } => pt.y !== null),
    [chronoScored],
  );
  const lastScored = chronoScored.length > 0 ? chronoScored[chronoScored.length - 1]! : null;
  // Newest five vs the five before: the split `stats.trend` is classified
  // from, so the verdict's word and number come from one computation.
  const scoreShift = React.useMemo(() => recentShift(scoreSeries), [scoreSeries]);
  const monthRows = React.useMemo(
    () => (stats ? monthDeviations(rounds, stats.avg) : []),
    [rounds, stats],
  );

  // ── v3 stage (coach only) — RoundField + its readouts ──────────────────--
  const stageCap = React.useMemo(() => roundFieldCap(rounds), [rounds]);
  const stageDomain = React.useMemo(() => {
    const domain = roundsDateDomain(rounds);
    if (domain) return domain;
    const fallback = rounds[0]?.round_date.slice(0, 10) ?? '';
    return { start: fallback, end: fallback };
  }, [rounds]);
  const scopedSummary = React.useMemo(() => computeScopedSummary(playerScopedRounds), [playerScopedRounds]);
  const stageMarks = React.useMemo(() => buildRoundFieldMarks(playerScopedRounds), [playerScopedRounds]);
  const scopedChronoScores = React.useMemo(() => chronoNormalizedScores(playerScopedRounds), [playerScopedRounds]);
  const scopedAvgDelta = React.useMemo(() => seriesDelta(scopedChronoScores), [scopedChronoScores]);
  const stageBest = React.useMemo(() => bestOfRounds(playerScopedRounds), [playerScopedRounds]);
  const scopedFirstMonth = React.useMemo(() => firstMonthLabel(playerScopedRounds), [playerScopedRounds]);
  const leaders = React.useMemo(() => rankedLeaders.slice(0, 5), [rankedLeaders]);
  const bands = React.useMemo(() => scoreBands(filteredRounds), [filteredRounds]);

  const stageScopeLabel = playerFilter === 'all' ? 'every player' : playerFilter;
  const stageCaption =
    playerScopedRounds.length === 1
      ? 'One round logged. Two more and the pattern starts to show.'
      : playerScopedRounds.length === 2
        ? 'One more round and the average line draws.'
        : null;

  const stageReadouts: RoundsReadoutItem[] = React.useMemo(() => {
    const hasAvgTrend = scopedSummary.scoredCount >= 6 && scopedAvgDelta !== null;
    const bestName = stageBest ? playerName(stageBest) : null;
    const bestCourse = stageBest ? cleanCourseName(stageBest.course_name) || 'Unknown course' : null;
    const qualifierPct = scopedSummary.count > 0 ? Math.round((scopedSummary.qualifierCount / scopedSummary.count) * 100) : 0;
    return [
      {
        key: 'rounds',
        label: 'Rounds',
        value: String(scopedSummary.count),
        caption: scopedFirstMonth ? `since ${scopedFirstMonth}` : undefined,
      },
      {
        key: 'avg',
        label: 'Avg',
        value: scopedSummary.scoredCount >= 1 ? scopedSummary.avg!.toFixed(1) : null,
        delta: hasAvgTrend
          ? {
              text: `${scopedAvgDelta! < 0 ? '▲' : scopedAvgDelta! > 0 ? '▼' : '–'} ${Math.abs(scopedAvgDelta!).toFixed(1)} since the first round`,
              tone: scopedAvgDelta! < 0 ? 'good' : scopedAvgDelta! > 0 ? 'bad' : 'flat',
            }
          : null,
        caption: scopedSummary.scoredCount >= 1 ? undefined : 'No scored rounds in view.',
      },
      {
        key: 'best',
        label: 'Best',
        value: scopedSummary.scoredCount >= 1 ? String(scopedSummary.best) : null,
        caption:
          scopedSummary.scoredCount >= 1 && stageBest ? (
            // `truncate` (overflow:hidden + text-overflow:ellipsis + whitespace:nowrap)
            // only clips on a block-level box — a bare Link renders `<a>`, which is
            // inline by default, so `overflow` never applied and the name+course
            // string painted past this readout's own column into the next one.
            // `block` is what actually makes the truncation take effect.
            <Link
              href={`/golf/dashboard/rounds/${stageBest.id}`}
              className="block truncate text-text-secondary hover:text-accent-700"
            >
              {bestName ?? 'Unnamed player'}, {bestCourse}
            </Link>
          ) : scopedSummary.scoredCount >= 1 ? undefined : 'No scored rounds in view.',
      },
      {
        key: 'qualifier-share',
        label: 'Qualifier share',
        value: String(qualifierPct),
        unit: '%',
        caption: `${scopedSummary.qualifierCount} of ${scopedSummary.count}`,
      },
    ];
  }, [scopedSummary, scopedAvgDelta, stageBest, scopedFirstMonth]);

  // ── Masthead copy + honest meta ────────────────────────────────────────--
  const eyebrow = isCoach ? 'Team Rounds' : 'Your Rounds';
  const title = isCoach ? 'The library.' : 'Your rounds.';

  // Player only (v2, unchanged) — the coach masthead's verdict absorbs this.
  const meta = (() => {
    const n = rounds.length;
    const range = honestRange(rounds);
    const noun = `${n} round${n === 1 ? '' : 's'} recorded`;
    const parts = [noun, range].filter(Boolean);
    return parts.join(' · ');
  })();

  const primaryAction = !isCoach ? (
    <Button asChild variant="primary" size="md">
      <Link href="/golf/dashboard/rounds/new">New round</Link>
    </Button>
  ) : undefined;

  // ── Masthead verdict (coach) ─────────────────────────────────────────────
  // Always describes the whole roster, independent of the stage's own
  // player-scope Select — see rounds-library.v3.md "Missing-fact fallbacks".
  const firstMonth = firstMonthLabel(rounds);
  const topLeader = rankedLeaders[0] ?? null;
  const verdictParts = React.useMemo(
    () =>
      buildRoundsVerdict({
        roundsCount: rounds.length,
        firstMonth,
        scoreDelta,
        leader: topLeader ? { name: topLeader[0], avgToPar: topLeader[1].avgToPar } : null,
      }),
    [rounds.length, firstMonth, scoreDelta, topLeader],
  );

  const handleNavigateToRound = React.useCallback(
    (id: string) => router.push(`/golf/dashboard/rounds/${id}`),
    [router],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-6 md:px-6">
      {/* ── MASTHEAD ─────────────────────────────────────────────────────────
          Coach: bare eyebrow + title + a separate verdict sentence
          (LANGUAGE.md item 1 — title and verdict are two elements, never
          fused). Player: unchanged ViewHeader (v2). ─────────────────────--*/}
      {isCoach ? (
        <header className="flex flex-col gap-3">
          <p className={OVERLINE}>{eyebrow}</p>
          <h1 className="font-fw-display text-h1 text-text-primary md:text-display">{title}</h1>
          {rounds.length > 0 ? <RoundsVerdictLine parts={verdictParts} /> : null}
        </header>
      ) : (
        <ViewHeader eyebrow={eyebrow} title={title} meta={rounds.length > 0 ? meta : undefined} primaryAction={primaryAction} />
      )}

      {/* ── ROLE FORK ───────────────────────────────────────────────────────
          Coach: the stage (RoundField + readouts, rounds-library.v3.md).
          Player: the stage (player-rounds.v2.md) — unchanged. ─────────────*/}
      {isCoach ? (
        rounds.length > 0 ? (
          <Surface as="section" aria-label="Round scatter" elevation="border" padding="none" className="overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border-subtle px-5 py-4 md:px-6">
              <div className="flex min-w-0 flex-col gap-1">
                <p className={OVERLINE}>
                  THE SEASON <span aria-hidden="true">·</span> {stageScopeLabel}
                </p>
                <h2 className="font-fw-display text-h2 text-text-primary">Round scatter</h2>
                <p className="max-w-[60ch] font-fw-sans text-caption text-text-tertiary">
                  Every round in view, plotted by date. Dots rise over par in amber and drop under in green;
                  bigger dots are qualifiers and tournaments; the dashed line is the average to par.
                </p>
                {stageCaption ? <p className="font-fw-sans text-caption text-text-tertiary">{stageCaption}</p> : null}
              </div>
              {playerOptions.length > 1 ? (
                <>
                  <div className="hidden w-52 shrink-0 md:block">
                    <Select
                      size="sm"
                      value={playerFilter}
                      onValueChange={(v) => setPlayerFilter(v ?? 'all')}
                      aria-label="Filter rounds by player"
                      options={[{ label: 'All players', value: 'all' }, ...playerOptions]}
                    />
                  </div>
                  <div className="md:hidden">
                    <Menu
                      ariaLabel="Filter rounds by player"
                      align="end"
                      trigger={
                        <Button variant="secondary" size="sm">
                          {playerFilter === 'all' ? 'All players' : playerFilter}
                        </Button>
                      }
                    >
                      <Menu.Item
                        icon={playerFilter === 'all' ? <Check size={14} aria-hidden /> : undefined}
                        onSelect={() => setPlayerFilter('all')}
                      >
                        All players
                      </Menu.Item>
                      {playerOptions.map((o) => (
                        <Menu.Item
                          key={o.value}
                          icon={playerFilter === o.value ? <Check size={14} aria-hidden /> : undefined}
                          onSelect={() => setPlayerFilter(o.value)}
                        >
                          {o.label}
                        </Menu.Item>
                      ))}
                    </Menu>
                  </div>
                </>
              ) : null}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x xl:divide-border-subtle">
              <div className="order-2 min-w-0 px-5 py-4 md:px-6 md:py-5 xl:order-1">
                {playerScopedRounds.length === 0 ? (
                  <EmptyState variant="subtle" title="No rounds for this player." />
                ) : (
                  <RoundField
                    marks={stageMarks}
                    domain={stageDomain}
                    cap={stageCap}
                    averageToPar={scopedSummary.toParCount >= 3 ? scopedSummary.avgToPar : null}
                    ariaLabel={`Round scatter, ${stageScopeLabel}`}
                  />
                )}
              </div>
              <div className="order-1 border-b border-border-subtle px-5 py-4 md:px-6 md:py-5 xl:order-2 xl:border-b-0">
                <RoundsReadouts items={stageReadouts} />
              </div>
            </div>
          </Surface>
        ) : null
      ) : (
        <>
          {(stats || showUnfinished) && (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-6">
              {stats && (
                <RoundsStage
                  stats={stats}
                  points={stagePoints}
                  lastRound={lastScored}
                  shift={scoreShift}
                  className="min-w-0 md:order-1 md:col-span-7"
                />
              )}
              {/* Rendered regardless of whether any COMPLETED round exists
                  yet — a player can have zero finished rounds and one
                  in-progress round, and it must stay resumable either way. */}
              {showUnfinished && playerId && (
                <div className="order-2 min-w-0 md:order-3 md:col-span-12">
                  <FairwayUnfinishedBanner rounds={visibleInProgressRounds} playerId={playerId} />
                </div>
              )}
              {stats && (
                <div className="order-3 flex min-w-0 flex-col gap-8 empty:hidden md:order-2 md:col-span-5 md:gap-6">
                  <ScoreBandHistogram rounds={rounds} underParPct={stats.underParPct} />
                  <RoundTypeSegment rounds={rounds} />
                </div>
              )}
            </div>
          )}
          {stats && (
            <MonthDeviationBars rows={monthRows} seasonAvg={stats.avg} className="hidden md:flex" />
          )}
        </>
      )}

      {/* ── Honest empty: zero completed rounds ─────────────────────────────
          Below the stage (which stays honest on its own via the per-role
          starved/awaiting swap), this gate covers the ledger row + toolbar +
          table — there is nothing to filter or group yet. ─────────────────--*/}
      {rounds.length === 0 ? (
        <Surface padding="lg">
          <EmptyState
            title="No rounds yet"
            description={
              isCoach
                ? "Your players haven't submitted any rounds yet. Their rounds will appear here as they're recorded."
                : 'Start tracking your golf rounds to see scores, stats, and improvement over time.'
            }
            // `secondary`, not `primary`: the ViewHeader above already carries
            // its own primary "New round" action for this role (unconditional,
            // not gated on `rounds.length`), so a second filled primary button
            // a few centimetres below it read as two primaries on one screen —
            // a defect, not a design choice (design-system rule: one primary
            // per screen). Demoted rather than removed: the header's action
            // still has to be the one that survives once this empty state
            // stops rendering, and this remains the player's only forward
            // path on a truly empty screen otherwise. See this screen's
            // `## Result`.
            action={
              !isCoach ? (
                <Button asChild variant="secondary" size="md">
                  <Link href="/golf/dashboard/rounds/new">Log your first round</Link>
                </Button>
              ) : undefined
            }
          />
        </Surface>
      ) : (
        <div className="flex flex-col gap-6">
          {/* ── THE LEDGER ROW (coach only) — Leaders + Score bands, two bare
              columns divided by a hairline (LANGUAGE.md item 3). ───────────--*/}
          {isCoach && (
            <div className="grid grid-cols-1 gap-y-10 divide-y divide-border-subtle md:grid-cols-2 md:gap-x-8 md:divide-y-0 xl:grid-cols-12 xl:gap-x-0 xl:gap-y-0 xl:divide-x">
              <div className="xl:col-span-7 xl:pr-8">
                <RoundsLeadersColumn leaders={leaders} selectedPlayer={playerFilter} onSelectPlayer={setPlayerFilter} />
              </div>
              <div className="xl:col-span-5 xl:pl-8">
                <RoundsScoreBandsColumn
                  bands={bands}
                  selectedBand={bandFilter}
                  onSelectBand={(i) => setBandFilter((prev) => (prev === i ? null : i))}
                />
              </div>
            </div>
          )}

          {/* ── TOOLBAR — search · filters (round-type FilterPills; the coach
              player Select now lives in the stage header above) · viewToggle
              (grouping). ─────────────────────────────────────────────────--*/}
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

          {/* ── THE TABLE — role fork, per team-lead's ruling (see this
              screen's `## Result`): rounds-library.v3.md governs the COACH
              persona only. Another session owns every player surface and
              the player ledger must stay byte-identical to what shipped
              before this spec, so it keeps its pre-facelift markup here
              rather than adopting v3's bare-canvas table.

              COACH (owner: this spec) — bare on the canvas, no `Surface`
              (LANGUAGE.md:32, "the stage is the one Surface on the page";
              LANGUAGE.md:60, "Only the stage is a Surface"; see
              rounds-library.v3.md "The table" → "Bare on the canvas, no
              Surface"). `RoundsTable` carries its own `overflow-x-clip`
              wrapper internally (rounds-library-parts.tsx).

              PLAYER (owner: player-rounds.v2.md / the player-surfaces
              session) — UNCHANGED: one `Surface` holding a sticky seam
              header (avg/best + the Score/Putts/GIR `SeamSpark` triple)
              per group, then a divide-y run of `FairwayRoundRow` cards.
              Do not fold this into `RoundsTable`, and do not remove its
              `Surface` — that removal is v3's, and v3 doesn't reach this
              branch. ─────────────────────────────────────────────────--*/}
          {grouped.length === 0 ? (
            isCoach ? (
              // No Surface here either, consistent with the table having
              // none — same copy/behavior as before, just bare canvas.
              <EmptyState
                variant="search"
                title="No rounds in this view"
                description={isNarrowed ? 'No rounds match the current filters.' : 'No rounds to show.'}
                action={
                  isNarrowed ? (
                    <Button variant="secondary" size="sm" onClick={resetFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              // Player — unchanged: this empty state has always rendered
              // inside a Surface, and still does.
              <Surface padding="lg">
                <EmptyState
                  variant="search"
                  title="No rounds in this view"
                  description={isNarrowed ? 'No rounds match the current filters.' : 'No rounds to show.'}
                  action={
                    isNarrowed ? (
                      <Button variant="secondary" size="sm" onClick={resetFilters}>
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              </Surface>
            )
          ) : isCoach ? (
            <>
              <RoundsTable groups={visibleGroups} onNavigate={handleNavigateToRound} />

              {/* ── FOOTER — quiet, manual pagination — never an
                  IntersectionObserver auto-load, so the coach controls
                  exactly how much of a long ledger renders — paired with
                  a printed "Showing N of M" footnote. No per-row mount/
                  layout animation here on purpose: a 90-row reveal
                  animating in is its own jank on a long list. */}
              {hasMoreRows && (
                <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
                  <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                    Showing {renderedRowCount} of {totalGroupedRounds}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => setVisibleCount((c) => c + ROWS_PAGE_SIZE)}>
                    Show 30 more
                  </Button>
                </div>
              )}
            </>
          ) : (
            // Player — unchanged pre-facelift markup (restored verbatim from
            // this file's state immediately before commit 02a9266fd deleted
            // FairwayRoundRow.tsx; see this screen's `## Result`).
            <Surface padding="none" className="overflow-clip">
              {visibleGroups.map((group) => (
                <React.Fragment key={group.key}>
                  <div className="sticky top-[calc(var(--golf-mobile-header-offset)+var(--fw-hub-subnav-offset,0px))] z-10 flex items-end justify-between gap-4 border-b border-border-subtle bg-surface px-4 py-3">
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
                    <div className="flex items-end gap-4">
                      {group.spark.length >= 6 && group.spark.length <= 20 && (
                        <SeamSpark data={group.spark} goodDirection="down" flatThreshold={4} caption="Score" label={`${group.label} scores`} captionClassName="hidden md:block" />
                      )}
                      {group.puttsSpark.length >= 6 && group.puttsSpark.length <= 20 && (
                        <SeamSpark data={group.puttsSpark} goodDirection="down" flatThreshold={3} caption="Putts" label={`${group.label} putts`} className="hidden md:flex" />
                      )}
                      {group.girSpark.length >= 6 && group.girSpark.length <= 20 && (
                        <SeamSpark data={group.girSpark} goodDirection="up" flatThreshold={8} caption="GIR" label={`${group.label} greens in regulation`} className="hidden md:flex" />
                      )}
                    </div>
                  </div>

                  <div className="divide-y divide-border-subtle">
                    {group.rows.map((round) => (
                      <FairwayRoundRow
                        key={round.id}
                        round={round}
                        isBestOfPeriod={round.id === group.bestId && group.hasMultiple}
                        userRole={userRole}
                        seasonAvgToPar={playerSeasonStats.get(playerName(round) ?? '')?.avgToPar ?? null}
                      />
                    ))}
                  </div>
                </React.Fragment>
              ))}

              {/* Same footer as the coach branch above — kept as a literal
                  duplicate rather than extracted, since the two branches'
                  surrounding wrapper differs (bare vs. inside this Surface)
                  and this is the only piece they'd share. */}
              {hasMoreRows && (
                <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
                  <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                    Showing {renderedRowCount} of {totalGroupedRounds}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => setVisibleCount((c) => c + ROWS_PAGE_SIZE)}>
                    Show 30 more
                  </Button>
                </div>
              )}
            </Surface>
          )}
        </div>
      )}
    </div>
  );
}
