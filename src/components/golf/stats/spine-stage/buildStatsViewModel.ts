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

import type { PriorityItem, StandingTrackProps } from '@/components/fairway/modules';
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

export interface LedgerInput {
  roundsPlayed: number | null | undefined;
  fairwayPct: number | null | undefined;
  girPct: number | null | undefined;
  puttsPerRound: number | null | undefined;
}

/**
 * The spine's `SpineLedger` rows — Rounds / Fairways / Greens / Putts per
 * round. The ONLY place these headline numbers render on the surface (the
 * `standing` drill shows the full per-metric matrix instead, never this
 * summary quartet again).
 */
export function buildLedger(input: LedgerInput): Array<{ label: string; value: string }> {
  return [
    { label: 'Rounds', value: fmtInt(finite(input.roundsPlayed)) },
    { label: 'Fairways', value: fmtPct(finite(input.fairwayPct)) },
    { label: 'Greens', value: fmtPct(finite(input.girPct)) },
    { label: 'Putts / rd', value: fmtNum(finite(input.puttsPerRound), 1) },
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
