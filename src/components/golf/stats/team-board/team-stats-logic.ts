/**
 * ============================================================================
 * Team stats · pure logic (docs/design/fairway-facelift/screens/team-stats.v3.md)
 * ----------------------------------------------------------------------------
 * Every derivation the team-stats field sheet needs, with no JSX and no React,
 * so the arithmetic is unit-testable without a DOM.
 *
 * Nothing here reads a clock. The one clock on this page is
 * `formatTeamStatsFreshnessHeadline`, which the spec keeps unchanged and which
 * is called with timestamps the route resolves as props.
 *
 * `buildTeamBoardViewModel.ts` stays the owner of ranking and per-row
 * formatting; this file owns what the PAGE says about the roster as a whole:
 * the verdict sentence, the shared strokes-gained scale, the stage's sort, the
 * ledger's leaders and fundamentals, and the CSV export.
 * ========================================================================== */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { VerdictPart } from '@/components/fairway/pages/dashboard/coach-home-logic';
import type { LeakBucket } from '@/app/golf/actions/stats-leak-maps-types';

import { fmtSg, weightedMean, TREND_SIGNAL_MIN_ROUNDS, type RankInfo, type TeamBoardRowViewModel } from './buildTeamBoardViewModel';

/** The missing-value glyph for this page, matching ScoreField's own convention.
 *  Never a zero and never a zero-length bar: a bar of no length reads as
 *  "exactly at Tour", which is a measurement nobody took. */
export const EN_DASH = '–';

/** The stage caps at this many player rows before "Show all N" reveals the
 *  rest. A forty-player roster must not push the ledger off the page. */
export const STAGE_ROW_CAP = 12;

export const rosterHref = (id: string) => `/golf/dashboard/roster/${id}`;

/* ── The five columns ─────────────────────────────────────────────────────── */

export type SgCategoryKey = 'tee' | 'app' | 'short' | 'putt';
export type CategoryKey = SgCategoryKey | 'scoring';
/** `name` is the fallback sort when neither strokes gained nor a scoring rank
 *  exists anywhere on the roster. */
export type StageSortKey = CategoryKey | 'name';

export interface CategoryColumn {
  key: CategoryKey;
  /** The standing metric behind the column. Scoring has none: it is the
   *  roster's own scoring average, not a strokes-gained reading. */
  metric: MetricId | null;
  /** Full-word header, shown from 940px up. */
  headerWide: string;
  /** Abbreviated header, shown below 940px. Equal to `headerWide` where the
   *  word is already short enough to need no switch. */
  headerShort: string;
  /** The category's name in prose, for the verdict and the ledger. */
  prose: string;
}

/**
 * The column order the stage, the ledger and the table all share.
 *
 * `prose` is the sentence form. Two of the shipped data labels are title-cased
 * for a column heading ("Off the Tee", "Around the Green"); lowercasing every
 * word after the first is what makes them read as prose in the verdict without
 * inventing a second name for the same category.
 *
 * "Around the green" also corrects the header, which alone on this page called
 * the category "Short game" while its own data label said "Around the Green".
 */
export const CATEGORY_COLUMNS: ReadonlyArray<CategoryColumn> = [
  { key: 'tee', metric: 'sg_ott', headerWide: 'Tee', headerShort: 'Tee', prose: 'Off the tee' },
  { key: 'app', metric: 'sg_approach', headerWide: 'Approach', headerShort: 'App', prose: 'Approach' },
  { key: 'short', metric: 'sg_around_green', headerWide: 'Around the green', headerShort: 'Grn', prose: 'Around the green' },
  { key: 'putt', metric: 'sg_putting', headerWide: 'Putting', headerShort: 'Putt', prose: 'Putting' },
  { key: 'scoring', metric: null, headerWide: 'Scoring', headerShort: 'Scor', prose: 'Scoring' },
];

/** The four columns that carry a strokes-gained metric. Scoring is not one of
 *  them: it has no Tour baseline to be signed against. */
export const SG_COLUMNS: ReadonlyArray<CategoryColumn & { key: SgCategoryKey; metric: MetricId }> = CATEGORY_COLUMNS.filter(
  (c): c is CategoryColumn & { key: SgCategoryKey; metric: MetricId } => c.metric !== null && c.key !== 'scoring',
);

/* ── Team strokes gained per category ─────────────────────────────────────── */

export interface CategoryReading {
  key: SgCategoryKey;
  prose: string;
  /** Rounds-weighted mean of every player's own strokes gained in this
   *  category. Null when no player on the roster carries a reading — never a
   *  zero, which would claim the team sits exactly on the Tour baseline. */
  value: number | null;
}

export interface SgWeightEntry {
  id: string;
  roundsPlayed: number;
}

/**
 * One reading per SG category, in column order, unfiltered.
 *
 * Unfiltered is the point: the stage renders five columns whether or not every
 * one has data, because the shared column grid IS the architecture of the
 * page. A category with no reading dashes its cell; it does not vanish and
 * shift the columns under the player register.
 *
 * The zero line is the Tour baseline by construction, not by assumption: every
 * `sg_*` row seeded into `golf_pga_standards` carries `pga_tour_value = 0`, so
 * a rounds-weighted mean of `player_value` across the roster is already
 * "strokes gained versus Tour" with no baseline to subtract.
 */
export function teamSgByCategory(
  players: ReadonlyArray<SgWeightEntry>,
  standingByPlayer: ReadonlyMap<string, Map<MetricId, PlayerStanding>>,
): CategoryReading[] {
  return SG_COLUMNS.map((col) => ({
    key: col.key,
    prose: col.prose,
    value: weightedMean(
      players.map((p) => ({
        value: standingByPlayer.get(p.id)?.get(col.metric)?.player_value ?? null,
        weight: p.roundsPlayed,
      })),
    ),
  }));
}

export function hasAnySg(readings: ReadonlyArray<CategoryReading>): boolean {
  return readings.some((r) => r.value !== null);
}

/**
 * The ONE scale every strokes-gained bar on this page is drawn against — the
 * stage's team register and the ledger's leak list alike. A second scale would
 * let a −0.1 leak render the same size as a −3.2 leak in the column beside it.
 * The floor of 1 keeps an all-null roster from dividing by zero.
 */
export function sgDomain(readings: ReadonlyArray<CategoryReading>): number {
  const magnitudes = readings.map((r) => (r.value === null ? 0 : Math.abs(r.value)));
  return Math.max(1, ...magnitudes);
}

/** The categories with a reading, worst first. Ties keep column order. */
export function leakOrder(readings: ReadonlyArray<CategoryReading>): CategoryReading[] {
  return readings.filter((r) => r.value !== null).sort((a, b) => (a.value as number) - (b.value as number));
}

/** The single weakest category, whether or not it is negative. Null when none
 *  has a reading. */
export function weakestCategory(readings: ReadonlyArray<CategoryReading>): CategoryReading | null {
  return leakOrder(readings)[0] ?? null;
}

/** The single strongest category. Null when none has a reading. */
export function strongestCategory(readings: ReadonlyArray<CategoryReading>): CategoryReading | null {
  const ranked = leakOrder(readings);
  return ranked[ranked.length - 1] ?? null;
}

/* ── Sorting the player register ──────────────────────────────────────────── */

function rankOf(row: TeamBoardRowViewModel, key: CategoryKey): RankInfo | null {
  return row.ranks[key];
}

/**
 * The column the stage opens on: the team's weakest category, whether or not
 * it is technically a leak. On a roster where every category is positive this
 * still opens on the column with the least room to spare, which is the honest
 * reading of "what do we work on" even when nothing is over par.
 *
 * Falls back to the scoring column when no strokes gained exists anywhere, and
 * to name when no player carries a scoring rank either.
 */
export function defaultSortKey(readings: ReadonlyArray<CategoryReading>, rows: ReadonlyArray<TeamBoardRowViewModel>): StageSortKey {
  const weakest = weakestCategory(readings);
  if (weakest) return weakest.key;
  if (rows.some((r) => r.ranks.scoring !== null)) return 'scoring';
  return 'name';
}

/**
 * Sort by a column's rank ascending, ties broken by name. A player with no
 * rank in the sorted column sinks below every ranked player rather than
 * sorting as rank zero.
 */
export function sortPlayerRows(rows: ReadonlyArray<TeamBoardRowViewModel>, key: StageSortKey): TeamBoardRowViewModel[] {
  const sorted = rows.slice();
  if (key === 'name') {
    return sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted.sort((a, b) => {
    const ra = rankOf(a, key);
    const rb = rankOf(b, key);
    if (ra && rb && ra.rank !== rb.rank) return ra.rank - rb.rank;
    if (ra && !rb) return -1;
    if (!ra && rb) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * The player furthest back in one column — the name the verdict hands the
 * coach after it names the leak. Null when nobody in that column carries a
 * rank, which is why the verdict omits the clause entirely rather than writing
 * "no one".
 */
export function furthestBack(rows: ReadonlyArray<TeamBoardRowViewModel>, key: CategoryKey): { id: string; name: string } | null {
  let worst: { id: string; name: string; rank: number } | null = null;
  for (const row of rows) {
    const r = rankOf(row, key);
    if (!r) continue;
    if (!worst || r.rank > worst.rank || (r.rank === worst.rank && row.name.localeCompare(worst.name) < 0)) {
      worst = { id: row.id, name: row.name, rank: r.rank };
    }
  }
  return worst ? { id: worst.id, name: worst.name } : null;
}

/** The rank-1 holder in each of the five columns. A column nobody is ranked in
 *  is omitted from the list rather than printed with a dash. */
export function leadersByCategory(rows: ReadonlyArray<TeamBoardRowViewModel>): Array<{ key: CategoryKey; prose: string; id: string; name: string }> {
  const out: Array<{ key: CategoryKey; prose: string; id: string; name: string }> = [];
  for (const col of CATEGORY_COLUMNS) {
    const leader = rows.find((row) => rankOf(row, col.key)?.rank === 1);
    if (leader) out.push({ key: col.key, prose: col.prose, id: leader.id, name: leader.name });
  }
  return out;
}

/* ── Trajectory ───────────────────────────────────────────────────────────── */

/**
 * Whether ANY player has cleared the trend gate. Zero players clearing it would
 * otherwise render as an authoritative "0 climbing, 0 sliding" — a fabricated
 * zero, not a reading. The gate is the same per-player one behind the roster
 * board's own trajectory verdicts: a non-null `scoringTrend` delta, i.e.
 * TREND_SIGNAL_MIN_ROUNDS rounds with five recent against three or more prior.
 */
export function hasTrajectorySignal(trajectory: { improving: number; steady: number; declining: number }): boolean {
  return trajectory.improving + trajectory.steady + trajectory.declining > 0;
}

/* ── The verdict ──────────────────────────────────────────────────────────── */

export const SG_COLD_START = 'Strokes gained appears once players log rounds with shot-level tracking.';
/** The stage's fuller version of the same sentence: the verdict carries the
 *  first clause, the instrument carries what to do about it. */
export const SG_COLD_START_FULL =
  'Strokes gained appears once players log rounds with shot-level tracking. Add players to your roster and have them enter rounds shot by shot.';

export interface TeamStatsVerdictInput {
  readings: ReadonlyArray<CategoryReading>;
  rows: ReadonlyArray<TeamBoardRowViewModel>;
  trajectory: { improving: number; steady: number; declining: number };
  /** "PGA Tour" / "LPGA Tour", resolved by the caller. */
  tourLabel: string;
  /**
   * The rounds fetch genuinely failed. A failure must never be presented as a
   * cold start, so the "appears once players log rounds" sentence is suppressed
   * and the masthead's own error notice carries the explanation instead.
   */
  roundsError: boolean;
}

/**
 * The masthead sentence: the leak, who owns it, where the roster is heading.
 * Every clause is built from a field the route already resolves, and a clause
 * with nothing true to say is omitted rather than softened.
 */
export function buildTeamStatsVerdict(input: TeamStatsVerdictInput): VerdictPart[] {
  const { readings, rows, trajectory, tourLabel, roundsError } = input;
  const parts: VerdictPart[] = [];
  const push = (text: string, href?: string) => {
    if (parts.length > 0) parts.push({ text: ' ' });
    parts.push(href ? { text, href } : { text });
  };

  const weakest = weakestCategory(readings);
  let leakKey: SgCategoryKey | null = null;

  if (weakest && weakest.value !== null && weakest.value < 0) {
    leakKey = weakest.key;
    push(`${weakest.prose} is the leak, ${fmtSg(weakest.value)} strokes a round against ${tourLabel}.`);
  } else if (weakest) {
    const best = strongestCategory(readings);
    if (best && best.value !== null) {
      push(`${best.prose} leads the way, ${fmtSg(best.value)} strokes clear of ${tourLabel}.`);
    }
  } else if (!roundsError) {
    push(SG_COLD_START);
  }

  if (leakKey) {
    const owner = furthestBack(rows, leakKey);
    if (owner) {
      parts.push({ text: ' ' });
      parts.push({ text: owner.name, href: rosterHref(owner.id) });
      parts.push({ text: ' is furthest back in it.' });
    }
  }

  if (hasTrajectorySignal(trajectory)) {
    push(`${trajectory.improving} climbing, ${trajectory.declining} sliding.`);
  } else {
    push(`Trend signals begin after ${TREND_SIGNAL_MIN_ROUNDS} completed rounds.`);
  }

  return parts;
}

/* ── Fundamentals (ledger column 3) ───────────────────────────────────────── */

export function fmtPct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? EN_DASH : `${value.toFixed(1)}%`;
}

export function fmtOneDecimal(value: number | null): string {
  return value === null || !Number.isFinite(value) ? EN_DASH : value.toFixed(1);
}

export interface FundamentalRow {
  key: string;
  label: string;
  value: string;
  /** No reading behind this row. Disclosed, never summed as a zero. */
  missing: boolean;
}

export interface FundamentalsInput {
  fairwayPct: number | null;
  girPct: number | null;
  scramblingPct: number | null;
  puttsPerRound: number | null;
  birdiesPerRound: number | null;
}

export function fundamentalRows(f: FundamentalsInput): FundamentalRow[] {
  return [
    { key: 'fairways', label: 'Fairways', value: fmtPct(f.fairwayPct), missing: f.fairwayPct === null },
    { key: 'gir', label: 'GIR', value: fmtPct(f.girPct), missing: f.girPct === null },
    { key: 'scrambling', label: 'Scrambling', value: fmtPct(f.scramblingPct), missing: f.scramblingPct === null },
    { key: 'putts', label: 'Putts / 18', value: fmtOneDecimal(f.puttsPerRound), missing: f.puttsPerRound === null },
    { key: 'birdies', label: 'Birdies / 18', value: fmtOneDecimal(f.birdiesPerRound), missing: f.birdiesPerRound === null },
  ];
}

/** Whether hole outcomes have been recorded at all. Gated on the three
 *  percentages, the same three the shipped cold-start line names. */
export function hasFundamentals(f: FundamentalsInput): boolean {
  return f.fairwayPct !== null || f.girPct !== null || f.scramblingPct !== null;
}

/* ── Tour baseline label ──────────────────────────────────────────────────── */

export function isWomensRoster(standingByPlayer: ReadonlyMap<string, Map<MetricId, PlayerStanding>>): boolean {
  for (const map of standingByPlayer.values()) {
    for (const row of map.values()) {
      if (row.is_womens) return true;
    }
  }
  return false;
}

export function tourLabel(isWomens: boolean): string {
  return isWomens ? 'LPGA Tour' : 'PGA Tour';
}

/* ── Leak maps (the coda) ─────────────────────────────────────────────────── */

export interface LeakMapBucketView {
  label: string;
  teamValue: number | null;
  pgaValue: number | null;
  sampleN: number;
}

export function toLeakMapBuckets(buckets: LeakBucket[] | undefined): LeakMapBucketView[] {
  return (buckets ?? []).map((b) => ({
    label: b.label,
    teamValue: b.team_value,
    pgaValue: b.pga_value,
    sampleN: b.sample_n,
  }));
}

/** Worst wrong-side gap in a leak family, so the chart's takeaway names a band
 *  the team is actually behind on rather than the largest number on the axis. */
export function worstLeakTakeaway(buckets: LeakBucket[], direction: 'higher_better' | 'lower_better', unit: 'percent' | 'feet'): string | undefined {
  let worst: { label: string; mag: number } | null = null;
  for (const b of buckets) {
    if (b.team_value === null || b.pga_value === null || b.sample_n === 0) continue;
    const raw = b.team_value - b.pga_value;
    const oriented = direction === 'higher_better' ? raw : -raw;
    if (oriented >= 0) continue;
    const mag = Math.abs(Math.round(raw));
    if (!worst || mag > worst.mag) worst = { label: b.label, mag };
  }
  if (!worst) return undefined;
  const suffix = unit === 'percent' ? 'pp below Tour' : ' ft farther than Tour';
  return `${worst.label} is ${worst.mag}${suffix}.`;
}

/* ── The load-failure notice ──────────────────────────────────────────────── */

/**
 * Combine the three independent fetch-failure flags into one honest sentence.
 * Three flags, one sentence: a coach needs to know which readings below are
 * suspect, and a failed read must never render as an empty state.
 */
export function statsLoadErrorMessage(roundsError: boolean, intelligenceError: boolean, leakError: boolean): string {
  const failed: string[] = [];
  if (roundsError) failed.push('Round scoring and per-player stats');
  if (intelligenceError) failed.push('team intelligence (composite ratings)');
  if (leakError) failed.push('strokes-gained leak maps');
  if (failed.length === 0) return '';
  if (failed.length === 1) return `${failed[0]} failed to load. Reload to try again.`;
  const [head, ...rest] = failed;
  const tail = rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(', ')}, and ${rest[rest.length - 1]}`;
  return `${head} and ${tail} failed to load. The figures below may be incomplete, so reload to try again.`;
}

/* ── CSV export ───────────────────────────────────────────────────────────── */

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildBoardCsv(rows: ReadonlyArray<TeamBoardRowViewModel>): string {
  const header = ['Player', 'Rounds', 'Scoring Avg', 'Tee Rank', 'App Rank', 'Short Rank', 'Putt Rank', 'Scoring Rank', 'Composite', 'Signal'];
  const fmtRank = (r: RankInfo | null) => (r ? `${r.rank}/${r.of}` : '');
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.name,
        String(r.roundsPlayed),
        r.scoringAverage,
        fmtRank(r.ranks.tee),
        fmtRank(r.ranks.app),
        fmtRank(r.ranks.short),
        fmtRank(r.ranks.putt),
        fmtRank(r.ranks.scoring),
        r.composite === null ? '' : String(Math.round(r.composite)),
        r.signal.label,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

export function teamSlug(teamName: string): string {
  return (
    teamName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'team'
  );
}
