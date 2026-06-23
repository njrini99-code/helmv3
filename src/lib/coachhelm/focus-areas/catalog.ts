/**
 * ============================================================================
 * Focus-area METRIC CATALOG — the structured, auto-trackable metric vocabulary
 * ----------------------------------------------------------------------------
 * The single source of truth for the focus-area measurable target, shared by
 * BOTH the UI (the create/edit modal: show the player's real value, suggest a
 * target, format) and the SERVER auto-tracker (the windowed progress evaluator
 * that moves `current_value` as rounds accumulate).
 *
 * It lives in `lib` (NOT in the Fairway component tree) on purpose: the server
 * tracker runs inside a cron route + server action and must NOT pull React/icon
 * imports. `src/components/fairway/pages/coachhelm/areaTypes.ts` re-exports every
 * symbol here, so existing UI importers keep their `./areaTypes` import path.
 *
 * Pure data + pure functions — no DOM, no React, no Supabase. The windowed
 * aggregation (`aggregateFocusMetric`) takes a plain array of per-round rows so
 * the data-loading half stays in the server action.
 *
 * HONESTY: a metric that has no unambiguous cached source (mental game, fitness,
 * custom, or a stat we can't window without diverging from the canonical
 * all-time formula) is deliberately EXCLUDED from auto-tracking — the modal
 * still allows it as free-text, but we never fabricate a value for it.
 * ========================================================================== */

/**
 * Snapshot of a player's cached stats the catalog reads CURRENT values from
 * (the aggregated `golf_player_stats_cache`, surfaced by the dashboard routes).
 * Keys are the friendly names the Fairway grid already uses (avg_score, not
 * scoring_average) so callers pass their existing stats object unchanged.
 */
export interface AreaAutoFillStats {
  rounds_played: number;
  avg_score: number | null;
  avg_putts: number | null;
  fairway_pct: number | null;
  gir_pct: number | null;
  // ── Extended sources (present when the route widens the cache select) ──
  best_score?: number | null;
  driving_distance?: number | null;
  proximity_to_hole?: number | null;
  scrambling_pct?: number | null;
  up_and_down_pct?: number | null;
  sand_save_pct?: number | null;
  one_putt_pct?: number | null;
  three_putt_pct?: number | null;
  par3_avg?: number | null;
  par4_avg?: number | null;
  par5_avg?: number | null;
}

/** Which direction counts as improvement for a metric. */
export type MetricDirection = 'higher' | 'lower';

export interface MetricCatalogEntry {
  /** Stable id (persisted-safe; never shown). */
  key: string;
  /** Display label — kept equal to the legacy `suggestedMetrics` label so a
   *  stored `target_metric` string still resolves. */
  label: string;
  /** Owning category (drives the picker grouping + area_type on save).
   *  String (not the AreaTypeValue union) to keep this module icon-free. */
  areaType: string;
  unit: '%' | 'yds' | 'ft' | 'putts' | 'strokes' | '';
  /** Higher-is-better (FW%, GIR) vs lower-is-better (putts, score, 3-putt). */
  direction: MetricDirection;
  /** Read the player's current value from their cached stats (null = no data). */
  read: (s: AreaAutoFillStats | null | undefined) => number | null;
  /** Default delta toward "better" used to seed a suggested target. */
  improveStep: number;
  /** Suggested-target clamp bounds. */
  min?: number;
  max?: number;
  /** Display / rounding precision. */
  decimals: number;
}

export const METRIC_CATALOG: MetricCatalogEntry[] = [
  // ── Driving ──────────────────────────────────────────────────────────────
  { key: 'driving_distance', label: 'Driving Distance', areaType: 'driving', unit: 'yds', direction: 'higher', read: (s) => s?.driving_distance ?? null, improveStep: 8, min: 0, decimals: 0 },
  { key: 'fairways_hit_pct', label: 'Fairways Hit %', areaType: 'driving', unit: '%', direction: 'higher', read: (s) => s?.fairway_pct ?? null, improveStep: 5, min: 0, max: 100, decimals: 0 },
  // ── Iron play / approach ───────────────────────────────────────────────────
  { key: 'gir_pct', label: 'GIR %', areaType: 'iron_play', unit: '%', direction: 'higher', read: (s) => s?.gir_pct ?? null, improveStep: 5, min: 0, max: 100, decimals: 0 },
  { key: 'proximity', label: 'Proximity to Hole', areaType: 'iron_play', unit: 'ft', direction: 'lower', read: (s) => s?.proximity_to_hole ?? null, improveStep: 2, min: 0, decimals: 1 },
  // ── Short game ─────────────────────────────────────────────────────────────
  { key: 'scrambling_pct', label: 'Scrambling %', areaType: 'short_game', unit: '%', direction: 'higher', read: (s) => s?.scrambling_pct ?? null, improveStep: 5, min: 0, max: 100, decimals: 0 },
  { key: 'up_and_down_pct', label: 'Up & Down %', areaType: 'short_game', unit: '%', direction: 'higher', read: (s) => s?.up_and_down_pct ?? null, improveStep: 5, min: 0, max: 100, decimals: 0 },
  { key: 'sand_save_pct', label: 'Sand Save %', areaType: 'short_game', unit: '%', direction: 'higher', read: (s) => s?.sand_save_pct ?? null, improveStep: 5, min: 0, max: 100, decimals: 0 },
  // ── Putting ────────────────────────────────────────────────────────────────
  { key: 'putts_per_round', label: 'Putts Per Round', areaType: 'putting', unit: 'putts', direction: 'lower', read: (s) => s?.avg_putts ?? null, improveStep: 1, min: 0, decimals: 1 },
  { key: 'one_putt_pct', label: '1-Putt %', areaType: 'putting', unit: '%', direction: 'higher', read: (s) => s?.one_putt_pct ?? null, improveStep: 3, min: 0, max: 100, decimals: 0 },
  { key: 'three_putt_pct', label: '3-Putt %', areaType: 'putting', unit: '%', direction: 'lower', read: (s) => s?.three_putt_pct ?? null, improveStep: 2, min: 0, max: 100, decimals: 0 },
  // ── Course management / scoring ────────────────────────────────────────────
  { key: 'scoring_average', label: 'Scoring Average', areaType: 'course_management', unit: 'strokes', direction: 'lower', read: (s) => s?.avg_score ?? null, improveStep: 1, min: 0, decimals: 1 },
  { key: 'par3_avg', label: 'Par 3 Avg', areaType: 'course_management', unit: 'strokes', direction: 'lower', read: (s) => s?.par3_avg ?? null, improveStep: 0.1, min: 0, decimals: 2 },
  { key: 'par4_avg', label: 'Par 4 Avg', areaType: 'course_management', unit: 'strokes', direction: 'lower', read: (s) => s?.par4_avg ?? null, improveStep: 0.1, min: 0, decimals: 2 },
  { key: 'par5_avg', label: 'Par 5 Avg', areaType: 'course_management', unit: 'strokes', direction: 'lower', read: (s) => s?.par5_avg ?? null, improveStep: 0.1, min: 0, decimals: 2 },
];

/** Catalog entries for one category, in display order. */
export function metricsForArea(areaType: string | null | undefined): MetricCatalogEntry[] {
  return METRIC_CATALOG.filter((m) => m.areaType === areaType);
}

/**
 * Resolve a catalog entry from a stored/passed metric — matches the stable
 * `key` first, then the display `label` (case-insensitive), so a focus area
 * persisted with `target_metric='Fairways Hit %'` still resolves. Returns null
 * for custom/unknown metrics (which never auto-track).
 */
export function findMetric(metric: string | null | undefined): MetricCatalogEntry | null {
  const m = (metric ?? '').trim().toLowerCase();
  if (!m) return null;
  return (
    METRIC_CATALOG.find((e) => e.key.toLowerCase() === m) ??
    METRIC_CATALOG.find((e) => e.label.toLowerCase() === m) ??
    null
  );
}

/** Round a number to a catalog entry's display precision. */
function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * The player's CURRENT value for a metric, read from their cached stats.
 * Returns null (never fabricated) when the player has no rounds, the metric is
 * unknown/custom, or the stat is not tracked yet.
 */
export function readMetricValue(
  metric: string | MetricCatalogEntry | null | undefined,
  stats: AreaAutoFillStats | null | undefined,
): number | null {
  if (!stats || !(stats.rounds_played > 0)) return null;
  const e = typeof metric === 'string' || metric == null ? findMetric(metric ?? null) : metric;
  if (!e) return null;
  const v = e.read(stats);
  return v == null ? null : roundTo(v, e.decimals);
}

/**
 * A sensible default TARGET for a metric given the player's current value —
 * direction-aware (improve up for FW%/GIR, down for putts/score), clamped to
 * the metric's bounds and rounded to its precision. Returns null when there's
 * no current value or the metric is unknown. The coach/player can always edit.
 */
export function suggestTarget(
  metric: string | MetricCatalogEntry | null | undefined,
  current: number | null | undefined,
): number | null {
  if (current == null) return null;
  const e = typeof metric === 'string' || metric == null ? findMetric(metric ?? null) : metric;
  if (!e) return null;
  let t = e.direction === 'higher' ? current + e.improveStep : current - e.improveStep;
  if (e.max != null) t = Math.min(t, e.max);
  if (e.min != null) t = Math.max(t, e.min);
  return roundTo(t, e.decimals);
}

/** Format a metric value for display with its unit (e.g. `52%`, `285 yds`). */
export function formatMetricValue(
  metric: string | MetricCatalogEntry | null | undefined,
  value: number | null | undefined,
): string {
  if (value == null) return '—';
  const e = typeof metric === 'string' || metric == null ? findMetric(metric ?? null) : metric;
  const decimals = e?.decimals ?? 1;
  const unit = e?.unit ?? '';
  const num = roundTo(value, decimals).toFixed(decimals).replace(/\.0+$/, '');
  if (unit === '%') return `${num}%`;
  if (unit === 'yds') return `${num} yds`;
  if (unit === 'ft') return `${num} ft`;
  if (unit === 'putts') return `${num} putts`;
  if (unit === 'strokes') return num;
  return num;
}

/* ---------------------------------------------------------------------------
 * WINDOWED AUTO-TRACKING (server)
 * ----------------------------------------------------------------------------
 * Move a focus area's `current_value` over its OWN window — the rounds played
 * since it started — NOT the diluted all-time career average (a player crushing
 * their target for ten rounds would barely move a hundred-round average). This
 * mirrors the goal-window approach in
 *   src/lib/coachhelm/v3/goals/window-metric.ts
 * and aggregates the SAME per-round columns of `golf_round_stats_cache` written
 * by the gender-aware recalculate RPC, so the windowed value is on the SAME
 * scale as the baseline captured at creation.
 *
 * COVERAGE (deliberately conservative): only metrics whose per-round formula is
 * unambiguous AND matches the all-time cache are windowable. Proximity, up&down,
 * 1/3-putt %, and per-par averages have no clean per-round source here, so they
 * are NOT auto-tracked — `aggregateFocusMetric` returns null and the evaluator
 * leaves `current_value` untouched (honest "as last set", never fabricated).
 * ------------------------------------------------------------------------- */

/** One completed round's per-round stat columns (from golf_round_stats_cache). */
export interface FocusWindowRound {
  round_date: string;
  total_score: number | null;
  total_putts: number | null;
  fairways_hit: number | null;
  fairways_total: number | null;
  greens_hit: number | null;
  greens_total: number | null;
  driving_distance_avg: number | null;
  scrambles_converted: number | null;
  scramble_attempts: number | null;
  sand_saves: number | null;
  sand_attempts: number | null;
}

/** Catalog keys we can window from golf_round_stats_cache without divergence. */
export const WINDOWABLE_FOCUS_METRIC_KEYS = [
  'driving_distance',
  'fairways_hit_pct',
  'gir_pct',
  'scrambling_pct',
  'sand_save_pct',
  'putts_per_round',
  'scoring_average',
] as const;

/**
 * Whether a metric (key OR stored label) can be auto-tracked over its window.
 * Resolves through {@link findMetric} so a legacy `target_metric` label still
 * maps to its catalog key.
 */
export function isWindowableFocusMetric(metric: string | null | undefined): boolean {
  const e = findMetric(metric);
  return !!e && (WINDOWABLE_FOCUS_METRIC_KEYS as readonly string[]).includes(e.key);
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

/**
 * Aggregate a focus-area metric over the given window rounds, matching the
 * all-time cache's formula (averages for per-round figures, pooled
 * numerator/denominator for rate stats). Returns null when the metric isn't
 * windowable or the rounds carry no usable data for it (caller then leaves
 * `current_value` as-is rather than write a fabricated number).
 */
export function aggregateFocusMetric(
  metric: string | null | undefined,
  rounds: FocusWindowRound[],
): number | null {
  if (rounds.length === 0) return null;
  const e = findMetric(metric);
  if (!e) return null;

  switch (e.key) {
    case 'driving_distance':
      return avg(
        rounds
          .map((r) => r.driving_distance_avg)
          .filter((v): v is number => v != null && Number.isFinite(v)),
      );
    case 'scoring_average':
      return avg(
        rounds
          .map((r) => r.total_score)
          .filter((v): v is number => v != null && Number.isFinite(v)),
      );
    case 'putts_per_round':
      return avg(
        rounds
          .map((r) => r.total_putts)
          .filter((v): v is number => v != null && Number.isFinite(v)),
      );
    case 'fairways_hit_pct':
      return pooledPct(rounds, (r) => r.fairways_hit, (r) => r.fairways_total);
    case 'gir_pct':
      return pooledPct(rounds, (r) => r.greens_hit, (r) => r.greens_total);
    case 'scrambling_pct':
      return pooledPct(rounds, (r) => r.scrambles_converted, (r) => r.scramble_attempts);
    case 'sand_save_pct':
      return pooledPct(rounds, (r) => r.sand_saves, (r) => r.sand_attempts);
    default:
      return null;
  }
}

function pooledPct(
  rounds: FocusWindowRound[],
  num: (r: FocusWindowRound) => number | null,
  den: (r: FocusWindowRound) => number | null,
): number | null {
  let n = 0;
  let d = 0;
  for (const r of rounds) {
    n += num(r) ?? 0;
    d += den(r) ?? 0;
  }
  return d > 0 ? (n / d) * 100 : null;
}
