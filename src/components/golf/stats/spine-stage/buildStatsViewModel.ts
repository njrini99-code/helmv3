/**
 * ============================================================================
 * buildStatsViewModel — pure adapter for the Player Stats Spine & Stage
 * ----------------------------------------------------------------------------
 * Pure, unit-tested functions that turn the SAME raw payloads
 * `FairwayStatsCockpit` already fetches (`GolfStats`, `TrendAnalysisResponse`,
 * `PlayerStandingRow[]`, `StatisticalStrengthWeakness[]`) into the shapes the
 * `Spine`/`Bento` modules expect. No Supabase, no React — just data in, data
 * out, so every branch here is fixture-testable without mounting anything.
 *
 * `biggestLeakArea` decides which stage-home bento cell gets the 2×2 "biggest
 * leak" treatment (spec §5.1): it ranks the four non-total SG categories and
 * maps the worst one onto a stage `?area=` key. `buildLedger`/`buildPriorities`
 * are the ONLY places the spine's 30d-vs-prev deltas and ranked priorities are
 * assembled — per the plan's dedupe rule, nothing else on this surface
 * repeats them.
 * ========================================================================== */

import type { PriorityItem, SpineLedgerRow, StandingTrackProps } from '@/components/fairway/modules';
import { clampPct } from '@/components/fairway/modules';
import { standingSubjectLabel } from '@/components/golf/coachhelm/v3/StandingBar';

/** The seven `?area=` stage views (`home` renders the bento). */
export type StatsArea =
  | 'putting'
  | 'driving'
  | 'approach'
  | 'short-game'
  | 'scoring'
  | 'standing'
  | 'rounds';

/** The four non-total SG categories, mapped onto their stage area key. */
const SG_CATEGORY_TO_AREA: Record<string, StatsArea> = {
  sg_ott: 'driving',
  sg_approach: 'approach',
  sg_around_green: 'short-game',
  sg_putting: 'putting',
};

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Pick the stage area for the biggest leak — the lowest (most negative,
 * i.e. furthest behind the Tour baseline) of the four non-total SG
 * categories. Falls back to `'putting'` when no SG row carries a finite
 * value (cold-start / SG not yet computed) — putting is both the most
 * common early leak and the cheapest area to start a player on.
 */
export function biggestLeakArea(
  sgRows: ReadonlyArray<{ metricId: string; value: number | null | undefined }>,
): StatsArea {
  let worst: { area: StatsArea; value: number } | null = null;
  for (const row of sgRows) {
    const area = SG_CATEGORY_TO_AREA[row.metricId];
    if (!area) continue;
    const value = finite(row.value);
    if (value === null) continue;
    if (worst === null || value < worst.value) worst = { area, value };
  }
  return worst?.area ?? 'putting';
}

/** Honest em-dash formatters — mirror the monolith's null-guarded style. */
function fmtInt(n: number | null): string {
  return n === null ? '—' : String(Math.round(n));
}
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}
function fmtNum(n: number | null, digits = 1): string {
  return n === null ? '—' : n.toFixed(digits);
}

/** The subset of a `periodComparison` side (`last30Days`/`previous30Days`)
 *  `buildLedger` needs to compute deltas — a structural pick so callers can
 *  pass the full `TrendAnalysisResponse['periodComparison']['last30Days']`
 *  object straight through (its extra `roundCount`/`scoringAvg` fields are
 *  simply ignored). */
export interface LedgerPeriodMetrics {
  fairwayPct: number | null;
  girPct: number | null;
  puttsPerRound: number | null;
}

export interface LedgerInput {
  roundsPlayed: number | null | undefined;
  fairwayPct: number | null | undefined;
  girPct: number | null | undefined;
  puttsPerRound: number | null | undefined;
  /**
   * Optional last-30-days vs previous-30-days comparison (from
   * `TrendAnalysisResponse.periodComparison`) — when BOTH sides are given,
   * the Fairways/Greens/Putts rows each get a direction-aware ▲/▼ delta.
   * Omitting either (or both) leaves those rows flat-valued, exactly like
   * before this field existed — every existing fixture/caller still passes.
   */
  last30?: LedgerPeriodMetrics | null;
  previous30?: LedgerPeriodMetrics | null;
}

/** Signed delta display, e.g. "+4%" / "0%". */
function fmtPctDelta(delta: number): string {
  const rounded = Math.round(Math.abs(delta));
  if (rounded === 0) return '0%';
  return `${delta > 0 ? '+' : '−'}${rounded}%`;
}

/** Signed delta display, e.g. "+0.4" / "0.0". */
function fmtNumDelta(delta: number, digits = 1): string {
  const magnitude = Math.abs(delta).toFixed(digits);
  if (Number(magnitude) === 0) return magnitude;
  return `${delta > 0 ? '+' : '−'}${magnitude}`;
}

/**
 * One ledger row's `delta` — direction-aware (a lower-is-better metric
 * falling still renders `good: true`, matching the same "raw direction vs
 * good/bad" split `Ribbon`'s `goodDirection` uses). Returns `undefined` when
 * either side of the comparison is missing, so a starved ledger row just
 * renders flat rather than fabricating a 0-vs-0 delta.
 */
function ledgerDelta(
  last: number | null | undefined,
  previous: number | null | undefined,
  higherIsBetter: boolean,
  formatMagnitude: (delta: number) => string,
): NonNullable<SpineLedgerRow['delta']> | undefined {
  const l = finite(last);
  const p = finite(previous);
  if (l === null || p === null) return undefined;
  const diff = l - p;
  if (diff === 0) return { text: formatMagnitude(0), direction: 'flat', good: false };
  const direction = diff > 0 ? 'up' : 'down';
  const good = higherIsBetter ? diff > 0 : diff < 0;
  return { text: formatMagnitude(diff), direction, good };
}

/**
 * The spine's `SpineLedger` rows — Rounds / Fairways / Greens / Putts per
 * round. The ONLY place these headline numbers render on the surface (the
 * `standing` drill shows the full per-metric matrix instead, never this
 * summary quartet again). Fairways/Greens/Putts each carry an optional
 * `delta` computed from `last30`/`previous30` — direction-aware, so fewer
 * putts renders as a GOOD delta even though the raw number fell.
 */
export function buildLedger(input: LedgerInput): SpineLedgerRow[] {
  return [
    { label: 'Rounds', value: fmtInt(finite(input.roundsPlayed)) },
    {
      label: 'Fairways',
      value: fmtPct(finite(input.fairwayPct)),
      delta: ledgerDelta(input.last30?.fairwayPct, input.previous30?.fairwayPct, true, fmtPctDelta),
    },
    {
      label: 'Greens',
      value: fmtPct(finite(input.girPct)),
      delta: ledgerDelta(input.last30?.girPct, input.previous30?.girPct, true, fmtPctDelta),
    },
    {
      label: 'Putts / rd',
      value: fmtNum(finite(input.puttsPerRound), 1),
      delta: ledgerDelta(input.last30?.puttsPerRound, input.previous30?.puttsPerRound, false, (d) => fmtNumDelta(d, 1)),
    },
  ];
}

export interface PriorityInput {
  label: string;
  strokeImpact: number | null | undefined;
}

/**
 * The spine's ranked `PriorityList` — the top-N weaknesses by absolute
 * stroke impact, numbered 01/02/03 (order IS rank, per spec §3.1).
 */
export function buildPriorities(
  weaknesses: ReadonlyArray<PriorityInput>,
  max = 3,
): PriorityItem[] {
  const scored = weaknesses
    .map((w) => ({ label: w.label, impact: finite(w.strokeImpact) }))
    .filter((w): w is { label: string; impact: number } => w.impact !== null && w.impact !== 0)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, max);

  return scored.map((w, i) => ({
    rank: i + 1,
    title: w.label,
    value: `${w.impact > 0 ? '+' : '−'}${Math.abs(w.impact).toFixed(2)}`,
  }));
}

/** Signed strokes-gained display, e.g. "+0.42" / "−0.31" / "E". */
export function formatSgSigned(value: number | null | undefined): string {
  const n = finite(value);
  if (n === null) return '—';
  if (n === 0) return 'E';
  const fixed = Math.abs(n).toFixed(2);
  return n > 0 ? `+${fixed}` : `−${fixed}`;
}

/**
 * Map a strokes-gained value onto the `StandingTrack`'s 0–100 rail. SG is
 * already zero-sum around the Tour baseline, so 0 always sits at the rail's
 * center (50) — a real, not arbitrary, anchor. `halfRange` is the SG value
 * that reaches either end of the rail (default ±2, matching the sg_total
 * render-config scale).
 */
export function sgToTrackPct(value: number | null | undefined, halfRange = 2): number {
  const n = finite(value);
  if (n === null) return 50;
  return clampPct(50 + (n / halfRange) * 50);
}

/**
 * The spine's `StandingTrack` — you vs Team vs Tour on one rail, anchored by
 * SG: Total. Returns `undefined` when there's no SG: Total value yet (honest
 * cold-start — the spine simply omits the track rather than drawing one at
 * a fabricated center).
 */
export function buildStandingTrack(
  sgTotal: number | null | undefined,
  teamAvg: number | null | undefined,
  standingViewerContext: 'self' | 'coach' = 'self',
  playerName?: string | null,
): StandingTrackProps | undefined {
  const you = finite(sgTotal);
  if (you === null) return undefined;
  const team = finite(teamAvg);
  return {
    pct: sgToTrackPct(you),
    subjectLabel: standingSubjectLabel(standingViewerContext, playerName),
    benchmarks: [
      ...(team !== null ? [{ label: 'Team', pct: sgToTrackPct(team) }] : []),
      { label: 'Tour', pct: sgToTrackPct(0), emphasis: true },
    ],
  };
}

/**
 * The spine's one-sentence verdict — signed SG headline plus the biggest
 * leak by name, when known. Mirrors the monolith's `SgVerdict` synthesis,
 * trimmed to the single sentence the spine has room for.
 */
export function buildVerdict(
  sgTotal: number | null | undefined,
  leakLabel: string | null,
): string {
  const n = finite(sgTotal);
  if (n === null) return 'Strokes-gained standing fills in after 5+ rounds with shot detail.';
  const head =
    n >= 0
      ? `Gaining ${formatSgSigned(n)} strokes per round on the field`
      : `${formatSgSigned(n)} strokes per round vs the field`;
  return leakLabel ? `${head}. Leaking most in ${leakLabel.toLowerCase()}.` : `${head}.`;
}

// ============================================================================
// Pattern categorization — golf_patterns_v2 → per-drill "What CoachHelm sees"
// ----------------------------------------------------------------------------
// `getPlayerPatterns` (src/app/golf/actions/insights.ts) returns MinedPattern
// rows with a `patternType` enum (conditional/compound/anomaly/...) that says
// HOW the pattern was mined, not WHAT stat category it's about — there is no
// structured category column on golf_patterns_v2. `categorizePattern` recovers
// that category from the free text + structured metric names every pattern
// DOES carry (outcome.metric, conditions[].field/label, description,
// recommendation), so each stat drill (Putting/Driving/Approach/Short Game/
// Scoring) can show only the CoachHelm reads that are actually about it,
// instead of StandingDrill's current top-3-overall list.
// ============================================================================

/** The five stat-drill categories this surface has a dedicated page for, plus
 *  `general` for a pattern that genuinely doesn't name one of them (course
 *  management, mental/pressure, freshman-vs-upperclassman comparisons, a bare
 *  shot-dispersion `miss_direction` row with no descriptive text, etc.) —
 *  `general` is a real, honest bucket, never a parsing failure. */
export type StatCategory = 'driving' | 'approach' | 'short_game' | 'putting' | 'scoring' | 'general';

/** The narrow shape `categorizePattern`/`buildCategoryInsights` need from a
 *  mined pattern — a structural subset of `MinedPattern`
 *  (`src/lib/coachhelm/v2/types.ts`) so this module never imports the v2
 *  engine's types (keeps `buildStatsViewModel.ts` a leaf: data in, data out,
 *  no coupling to the mining/action layers). Every field is optional/nullable
 *  because real rows are frequently missing description/recommendation
 *  (shot-level `contextual` patterns persist no human-readable text at all —
 *  see shot-pattern-miner.ts's `savePatterns`). */
export interface CategorizablePattern {
  description?: string | null;
  recommendation?: string | null;
  outcome?: { metric?: string | null } | null;
  conditions?: ReadonlyArray<{ field?: string | null; label?: string | null }> | null;
}

/**
 * Ranked, mutually-disambiguating keyword tests — order matters. A metric
 * name or description can legitimately carry more than one category's
 * vocabulary at once (e.g. an approach-miss pattern whose resulting lie is a
 * greenside "bunker" — a short-game word — inside a field literally named
 * `approach_miss_lie_150_175_bunker`). The FIRST matching category in this
 * list wins, so the more decisive, rarely-ambiguous terms (approach, putting,
 * driving) are checked ahead of the more generic short-game vocabulary that
 * tends to show up as incidental detail inside other categories' text.
 *
 * Every test runs against the NORMALIZED haystack (see `categorizationHaystack`
 * below), where `_`/`-` have been replaced with spaces — `\b` word-boundary
 * assertions rely on that: `_` is itself a `\w` character in JS regex, so
 * `\bapproach\b` would otherwise never match inside a raw metric name like
 * `strokes_gained_approach` (there is no boundary between "d" and "_", nor
 * between "_" and "a" — both sides are `\w`).
 */
const CATEGORY_TESTS: ReadonlyArray<{ category: Exclude<StatCategory, 'general'>; test: RegExp }> = [
  { category: 'approach', test: /\bsg approach\b|\bapproach(es|ing)?\b|\bgir\b|\bgreens? in regulation\b|\bproximity\b|\biron play\b/i },
  { category: 'putting', test: /\bsg putting\b|\bputt(s|ing)?\b|\bthree putt\b|\blag putt\b|\bgreen speed\b/i },
  { category: 'driving', test: /\bsg ott\b|\boff the tee\b|\btee shot\b|\btee strategy\b|\bdriv(e|es|ing|er)\b|\bfairway(s)?\b/i },
  { category: 'short_game', test: /\bsg around green\b|\bscrambl\w*\b|\baround( the)? green\b|\batg\b|\bchip(ping)?\b|\bpitch(ing)? shot\b|\bsand save\b|\bbunker\b|\bflop shot\b/i },
  { category: 'scoring', test: /\bscor(e|es|ing)\w*\b|\bpar\b|\bpenalt(y|ies)\b|\bbirdie(s)?\b|\bbogey(s)?\b|\bblow up\b|\bworst hole\b|\bwarm up hole\b|\bpressure performance\b|\bcourse management\b/i },
];

/** Join every text-bearing field of a pattern into one lowercase, space-
 *  normalized haystack for keyword matching. Field VALUES (e.g. a condition's
 *  `lie: 'bunker'`) are deliberately excluded — they describe the shot's
 *  situation, not the skill category being measured, and including them
 *  reintroduced exactly the approach-vs-short-game ambiguity `CATEGORY_TESTS`'
 *  ordering is designed to resolve via the field NAME instead. */
function categorizationHaystack(pattern: CategorizablePattern): string {
  const parts = [
    pattern.outcome?.metric,
    pattern.description,
    pattern.recommendation,
    ...(pattern.conditions ?? []).flatMap((c) => [c?.field, c?.label]),
  ];
  const joined = parts
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(' ')
    .toLowerCase();
  // `_`/`-` → space so `\b` boundaries in CATEGORY_TESTS work against
  // snake_case metric/field names, not just prose description text.
  return joined.replace(/[_-]+/g, ' ');
}

/**
 * Map a mined pattern onto one of the five stat-drill categories (or
 * `general` when nothing in it names one). Pure keyword/metric-name matching
 * — no ML, no fuzzy scoring — because every real caller (StandingDrill today,
 * every other drill via `buildCategoryInsights` below) needs a stable,
 * explainable category a coach could sanity-check by eye.
 */
export function categorizePattern(pattern: CategorizablePattern): StatCategory {
  const haystack = categorizationHaystack(pattern);
  if (!haystack) return 'general';
  for (const { category, test } of CATEGORY_TESTS) {
    if (test.test(haystack)) return category;
  }
  return 'general';
}

/** `prettyPatternType` — mirrors `StandingDrill.tsx`'s helper of the same
 *  name verbatim (kept as a small local duplicate rather than an import, so
 *  this module stays a pure leaf with zero React/component dependencies). */
function prettyPatternType(t: string | null | undefined): string {
  if (!t) return 'Pattern';
  if (t === 'contextual') return 'Shot pattern';
  if (t === 'conditional') return 'Conditional';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** One row of the `CategoryInsightStrip`'s "what CoachHelm sees" list. */
export interface CategoryInsight {
  /** The pattern's cause, honest-fallback to a pretty pattern-type label when
   *  no `description` was mined (mirrors CauseEffectCard's fallback). */
  title: string;
  /** Signed strokes/round — negative = leak, positive = strength. */
  strokeImpact: number;
  /** The mined fix, when one exists. */
  recommendation: string | null;
}

/** The subset `buildCategoryInsights` needs from a mined pattern, on top of
 *  what categorization needs — `id` for a stable list key, `strokeImpact` +
 *  `patternType` for the insight's own content. */
export interface CategorizablePatternWithImpact extends CategorizablePattern {
  id: string;
  strokeImpact: number | null | undefined;
  patternType?: string | null;
}

const ALL_CATEGORIES: readonly StatCategory[] = ['driving', 'approach', 'short_game', 'putting', 'scoring', 'general'];

/**
 * Bucket every pattern by `categorizePattern`, ranked within each bucket by
 * |strokeImpact| (biggest cost/gain first — same ranking rule
 * `buildPriorities` uses for the spine), capped at `max` per category (default
 * 2 — a compact strip has room for a headline read and, at most, a second).
 * Zero-impact / non-finite-impact patterns are dropped (they're not
 * "read"-worthy) — same honesty rule `buildPriorities` already applies.
 */
export function buildCategoryInsights(
  patterns: ReadonlyArray<CategorizablePatternWithImpact>,
  max = 2,
): Record<StatCategory, CategoryInsight[]> {
  const buckets = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, [] as CategoryInsight[]])) as Record<
    StatCategory,
    CategoryInsight[]
  >;

  const scored = patterns
    .map((p) => ({ pattern: p, impact: finite(p.strokeImpact) }))
    .filter((p): p is { pattern: CategorizablePatternWithImpact; impact: number } => p.impact !== null && p.impact !== 0)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  for (const { pattern, impact } of scored) {
    const category = categorizePattern(pattern);
    const bucket = buckets[category];
    if (bucket.length >= max) continue;
    bucket.push({
      title: pattern.description?.trim() || prettyPatternType(pattern.patternType),
      strokeImpact: impact,
      recommendation: pattern.recommendation?.trim() || null,
    });
  }

  return buckets;
}

// ============================================================================
// Per-category trend threading — getTrendAnalysis's 4 round-level series
// ----------------------------------------------------------------------------
// getTrendAnalysis (stats-data.ts) is the ONLY server-side trend-series source
// on this whole surface: trends.score/gir/fairway/putts, each a chronological
// (oldest→newest) TrendDataPoint[]. Scoring/Approach(GIR)/Driving(fairway)/
// Putting(putts-per-round proxy) each have a real series; short game and
// strokes-gained have NONE anywhere in the codebase (stats-data.ts's own
// comment: "Scrambling data not available at round level") — `short_game` is
// hard-coded `null` below rather than fabricated from an unrelated series.
// ============================================================================

/** Structural subset of a `TrendDataPoint` — only the `value` field
 *  `buildCategoryTrends` needs, so this module doesn't import
 *  `stats-data-types.ts` (keeps it decoupled from the action layer, same
 *  spirit as `LedgerInput`/`LedgerPeriodMetrics` above). */
export interface CategoryTrendPoint {
  value: number;
}

export interface CategoryTrendsInput {
  score?: ReadonlyArray<CategoryTrendPoint> | null;
  gir?: ReadonlyArray<CategoryTrendPoint> | null;
  fairway?: ReadonlyArray<CategoryTrendPoint> | null;
  putts?: ReadonlyArray<CategoryTrendPoint> | null;
}

/** One category's threaded trend: the finite-filtered series (oldest→newest,
 *  ready for a Sparkline/Ribbon-mini as-is) plus the SAME direction-aware
 *  delta shape `SpineLedgerRow.delta` uses (first→last, `good` accounts for
 *  lower-is-better metrics like Score/Putts). */
export interface CategoryTrend {
  series: number[];
  delta?: NonNullable<SpineLedgerRow['delta']>;
  label: string;
}

function toFiniteSeries(points: ReadonlyArray<CategoryTrendPoint> | null | undefined): number[] {
  if (!points) return [];
  return points.map((p) => p.value).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function buildCategoryTrend(
  points: ReadonlyArray<CategoryTrendPoint> | null | undefined,
  label: string,
  higherIsBetter: boolean,
  formatMagnitude: (delta: number) => string,
): CategoryTrend | null {
  const series = toFiniteSeries(points);
  if (series.length === 0) return null;
  const delta =
    series.length >= 2
      ? ledgerDelta(series[series.length - 1], series[0], higherIsBetter, formatMagnitude)
      : undefined;
  return { series, label, delta };
}

/** Per-category `?area=` trends: `null` where genuinely absent (short game),
 *  never fabricated from an unrelated series. */
export interface CategoryTrends {
  driving: CategoryTrend | null;
  approach: CategoryTrend | null;
  putting: CategoryTrend | null;
  scoring: CategoryTrend | null;
  /** No source exists anywhere in the codebase for a round-level scrambling/
   *  short-game series (see module doc above) — always `null`, never guessed. */
  short_game: null;
}

/**
 * Thread `getTrendAnalysis`'s 4 series onto the 5 stat-drill categories each
 * drill can pull an inline trend + delta chip from (via `CategoryInsightStrip`).
 */
export function buildCategoryTrends(input: CategoryTrendsInput | null | undefined): CategoryTrends {
  return {
    driving: buildCategoryTrend(input?.fairway, 'Fairways hit', true, fmtPctDelta),
    approach: buildCategoryTrend(input?.gir, 'Greens in regulation', true, fmtPctDelta),
    putting: buildCategoryTrend(input?.putts, 'Putts per round', false, (d) => fmtNumDelta(d, 1)),
    scoring: buildCategoryTrend(input?.score, 'Score to par', false, (d) => fmtNumDelta(d, 1)),
    short_game: null,
  };
}
