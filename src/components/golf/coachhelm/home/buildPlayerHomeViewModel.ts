/**
 * ============================================================================
 * buildPlayerHomeViewModel — pure adapter for the Player CoachHelm Spine &
 * Stage home (spec §5.3)
 * ----------------------------------------------------------------------------
 * Pure, unit-tested functions that turn the SAME raw payloads
 * `FairwayPlayerCoachHelm` already receives (`PlayerCoachHelmDashboardData`,
 * `PlayerShotAnalytics`, `Record<string, PlayerStanding>`) into the shapes the
 * `Spine`/`Bento` modules expect. No Supabase, no React — data in, data out,
 * so every branch is fixture-testable without mounting anything (mirrors
 * `src/components/golf/stats/spine-stage/buildStatsViewModel.ts`).
 * ========================================================================== */

import type { PriorityItem, StandingTrackProps } from '@/components/fairway/modules';
import { clampPct } from '@/components/fairway/modules';

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** area strings arrive snake_case/varied-case from the DB — normalize for display.
 *  Deliberately duplicated (not imported) from FocusAreasGrid's `formatAreaName`
 *  so this adapter stays React/framer-motion-import-free and independently
 *  testable, per the Task 1 "pure, no React" contract. */
export function formatAreaName(area: string): string {
  if (!area) return '';
  if (/[A-Z]/.test(area) && /\s/.test(area)) return area;
  return area
    .replace(/_+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/* ───────────────────────────────────────────────────────────────────────────
 * Ledger — rounds analyzed / fairways / GIR / putts per round. Sourced from
 * the SAME shot-analytics snapshot the monolith's tertiary micro-readouts
 * used (RoundsReadout/FairwaysReadout/GirReadout/PuttsReadout).
 * ────────────────────────────────────────────────────────────────────────── */
export interface PlayerLedgerInput {
  roundsAnalyzed: number | null | undefined;
  fairwayPct: number | null | undefined;
  girPct: number | null | undefined;
  puttsPerRound: number | null | undefined;
}

function fmtInt(n: number | null): string {
  return n === null ? '—' : String(Math.round(n));
}
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}
function fmtNum(n: number | null, digits = 1): string {
  return n === null ? '—' : n.toFixed(digits);
}

export function buildPlayerLedger(input: PlayerLedgerInput): Array<{ label: string; value: string }> {
  return [
    { label: 'Rounds', value: fmtInt(finite(input.roundsAnalyzed)) },
    { label: 'Fairways', value: fmtPct(finite(input.fairwayPct)) },
    { label: 'Greens', value: fmtPct(finite(input.girPct)) },
    { label: 'Putts / rd', value: fmtNum(finite(input.puttsPerRound), 1) },
  ];
}

/* ───────────────────────────────────────────────────────────────────────────
 * Priorities — the spine's top-3 active focus areas, ranked by |strokesGained|
 * (the same ordering magnitude `PlayerCoachHelmDashboardData.focusAreas`
 * already carries — P2-18's back-compat contract).
 * ────────────────────────────────────────────────────────────────────────── */
export interface FocusAreaPriorityInput {
  area: string;
  strokesGained: number | null | undefined;
  value?: number | null;
  unit?: string | null;
}

export function buildFocusAreaPriorities(
  areas: ReadonlyArray<FocusAreaPriorityInput>,
  max = 3,
): PriorityItem[] {
  const scored = areas
    .map((a) => ({ area: a.area, impact: finite(a.strokesGained), value: finite(a.value), unit: a.unit ?? null }))
    .filter((a): a is { area: string; impact: number; value: number | null; unit: string | null } => a.impact !== null && a.impact !== 0)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, max);

  return scored.map((a, i) => {
    const display = a.value !== null ? a.value.toFixed(a.unit === 'strokes/round' ? 2 : 1) : Math.abs(a.impact).toFixed(2);
    return {
      rank: i + 1,
      title: formatAreaName(a.area),
      value: a.unit === 'strokes/round' || a.unit == null ? `${a.impact > 0 ? '+' : '−'}${display}` : display,
    };
  });
}

/* ───────────────────────────────────────────────────────────────────────────
 * StandingTrack — you vs team vs Tour, anchored on SG: Total (same rail idiom
 * as the Stats spine — 0 always sits at center since SG is zero-sum).
 * ────────────────────────────────────────────────────────────────────────── */
export function sgToTrackPct(value: number | null | undefined, halfRange = 2): number {
  const n = finite(value);
  if (n === null) return 50;
  return clampPct(50 + (n / halfRange) * 50);
}

export function buildPlayerStandingTrack(
  sgTotal: number | null | undefined,
  teamAvg: number | null | undefined,
): StandingTrackProps | undefined {
  const you = finite(sgTotal);
  if (you === null) return undefined;
  const team = finite(teamAvg);
  return {
    pct: sgToTrackPct(you),
    subjectLabel: 'You',
    benchmarks: [
      ...(team !== null ? [{ label: 'Team', pct: sgToTrackPct(team) }] : []),
      { label: 'Tour', pct: sgToTrackPct(0), emphasis: true },
    ],
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Hero — the predicted-score readout + its verdict sentence.
 * ────────────────────────────────────────────────────────────────────────── */
export function formatPredictionHero(
  predictedValue: number | null | undefined,
  metric?: string | null,
): { value: string; unit?: string } {
  const n = finite(predictedValue);
  if (n === null) return { value: '—' };
  return { value: n.toFixed(1), unit: metric ? metric.replace(/_/g, ' ') : 'predicted score' };
}

/** Normalize a confidence value that may arrive as 0..1 or 0..100. */
function confidencePct(confidence: number | null): number | null {
  if (confidence === null) return null;
  return Math.round(confidence <= 1 ? confidence * 100 : confidence);
}

export function buildPredictionVerdict(
  predictedValue: number | null | undefined,
  confidence: number | null | undefined,
  topFocusLabel: string | null,
): string {
  const n = finite(predictedValue);
  if (n === null) {
    return topFocusLabel
      ? `Your next-round prediction fills in with more tracked rounds. Top focus: ${topFocusLabel.toLowerCase()}.`
      : 'Your next-round prediction fills in once CoachHelm has enough tracked rounds.';
  }
  const conf = confidencePct(finite(confidence));
  const confText = conf !== null ? ` at ${conf}% confidence` : '';
  const focusText = topFocusLabel ? ` Top focus: ${topFocusLabel.toLowerCase()}.` : '';
  return `Predicted to shoot ${n.toFixed(1)}${confText}.${focusText}`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Standing best/worst — the bento's "Standing" cell. Picks the highest and
 * lowest `team_pct` among every metric with a snapshot (team_pct is already a
 * direction-normalized 0-100 percentile, higher always better — same
 * assumption the monolith's "Top N% on the team" chip relies on).
 * ────────────────────────────────────────────────────────────────────────── */
export interface StandingPctEntry {
  team_pct: number | null;
}

export function pickBestWorstStandingIds(
  standingByMetric: Readonly<Record<string, StandingPctEntry | undefined>>,
): { bestId: string | null; worstId: string | null } {
  let best: { id: string; pct: number } | null = null;
  let worst: { id: string; pct: number } | null = null;
  for (const [id, row] of Object.entries(standingByMetric)) {
    const pct = finite(row?.team_pct);
    if (pct === null) continue;
    if (best === null || pct > best.pct) best = { id, pct };
    if (worst === null || pct < worst.pct) worst = { id, pct };
  }
  return { bestId: best?.id ?? null, worstId: worst?.id ?? null };
}
