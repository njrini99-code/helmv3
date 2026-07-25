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

import type { PriorityItem, SignalTone, StandingTrackProps, TickerItem } from '@/components/fairway/modules';
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

/* ───────────────────────────────────────────────────────────────────────────
 * Standing preview rows — the bento's "Standing" mini rail (`RailBars`).
 * Picks the strongest `max - 1` metrics plus the single weakest one, so the
 * leak the headline sentence names ("leaking most in …") is always visible
 * in the visual too, not just implied by text — never a fabricated/synthetic
 * row, only real `team_pct` snapshots that exist.
 * ────────────────────────────────────────────────────────────────────────── */
export interface StandingPreviewRow {
  id: string;
  pct: number;
}

export function buildStandingPreviewRows(
  standingByMetric: Readonly<Record<string, StandingPctEntry | undefined>>,
  max = 3,
): StandingPreviewRow[] {
  const entries = Object.entries(standingByMetric)
    .map(([id, row]) => ({ id, pct: finite(row?.team_pct) }))
    .filter((e): e is { id: string; pct: number } => e.pct !== null)
    .sort((a, b) => b.pct - a.pct);

  if (entries.length <= max || max <= 0) return entries.slice(0, Math.max(0, max));

  const strongest = entries.slice(0, max - 1);
  const weakest = entries[entries.length - 1]!;
  return strongest.some((e) => e.id === weakest.id) ? strongest : [...strongest, weakest];
}

/* ───────────────────────────────────────────────────────────────────────────
 * Game-profile mini radar — pure SVG geometry for the bento's "Game profile"
 * cell. Per the nested-button contract (see `PlayerHomeBento`'s header
 * comment), this is the ONLY chart shape allowed inside an `onOpen` bento
 * cell: a plain polygon + spokes, no `ChartFrame`/`GenomeRadar` (which owns
 * its own interactive `ViewToggle` button). No React — trig only, data in,
 * geometry out.
 * ────────────────────────────────────────────────────────────────────────── */
export interface RadarSpoke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Spoke lines from center to the rail edge, one per axis, evenly spaced
 *  starting at 12 o'clock and going clockwise — the SAME angular convention
 *  `genomeRadarPolygonPoints` uses, so spokes and polygon vertices always
 *  line up regardless of axis count. */
export function genomeRadarSpokes(axisCount: number, size = 64): RadarSpoke[] {
  if (axisCount <= 0) return [];
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  return Array.from({ length: axisCount }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / axisCount;
    return {
      x1: round2(cx),
      y1: round2(cy),
      x2: round2(cx + r * Math.cos(angle)),
      y2: round2(cy + r * Math.sin(angle)),
    };
  });
}

/** SVG `points` attribute for the value polygon — each axis's `value`
 *  (0..maxValue) maps to a radius along its spoke. A dimension with no
 *  signal (0) collapses honestly to the center rather than a fabricated
 *  minimum radius. */
export function genomeRadarPolygonPoints(
  axes: ReadonlyArray<{ value: number }>,
  size = 64,
  maxValue = 100,
): string {
  const n = axes.length;
  if (n === 0 || maxValue <= 0) return '';
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  return axes
    .map((axis, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const value = Math.max(0, Math.min(maxValue, finite(axis.value) ?? 0));
      const radius = (value / maxValue) * r;
      return `${round2(cx + radius * Math.cos(angle))},${round2(cy + radius * Math.sin(angle))}`;
    })
    .join(' ');
}

/** The single strongest / weakest genome axis by value — mirrors
 *  `pickBestWorstStandingIds`'s best/worst framing so the "Game profile"
 *  cell's sentence can read as concretely as "Standing"'s does. */
export function pickStrongestWeakestAxis(
  axes: ReadonlyArray<{ label: string; value: number }>,
): { strongest: string | null; weakest: string | null } {
  let strongest: { label: string; value: number } | null = null;
  let weakest: { label: string; value: number } | null = null;
  for (const axis of axes) {
    const value = finite(axis.value);
    if (value === null) continue;
    if (strongest === null || value > strongest.value) strongest = { label: axis.label, value };
    if (weakest === null || value < weakest.value) weakest = { label: axis.label, value };
  }
  return { strongest: strongest?.label ?? null, weakest: weakest?.label ?? null };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Theme previews — the bento's "Themes" (magnitude bars) and "Insight
 * library" (leak/strength cause counts) mini-visuals. Both read the SAME
 * `themes` scaffold the composition root already threads through, which
 * ALWAYS carries all 7 canonical categories (honest degradation — a
 * starved category is a thin stub, never an absent one), so these previews
 * never need a synthetic placeholder row.
 * ────────────────────────────────────────────────────────────────────────── */
const THEME_LABEL_ABBR: Record<string, string> = {
  Putting: 'Putt',
  Approach: 'App',
  'Off the Tee': 'Tee',
  'Around the Green': 'ATG',
  Scoring: 'Score',
  'Course Management': 'Mgmt',
  Pressure: 'Press',
};

function abbreviateThemeLabel(label: string): string {
  return THEME_LABEL_ABBR[label] ?? label.slice(0, 6);
}

export interface ThemeMagnitudeInput {
  displayLabel: string;
  themeStrokesPerRound: number;
}

/** Per-theme `|strokes/round|` normalized to the largest magnitude present,
 *  so the biggest leak or strength always reaches full bar height — a
 *  relative read of "which patterns matter most right now", sorted
 *  strongest-signal-first. */
export function buildThemeMagnitudeBars(themes: ReadonlyArray<ThemeMagnitudeInput>, max = 7): TickerItem[] {
  const magnitudes = themes.map((t) => ({
    label: abbreviateThemeLabel(t.displayLabel),
    mag: Math.abs(finite(t.themeStrokesPerRound) ?? 0),
  }));
  const maxMag = Math.max(0, ...magnitudes.map((m) => m.mag));
  return magnitudes
    .slice()
    .sort((a, b) => b.mag - a.mag)
    .slice(0, max)
    .map((m) => ({
      label: m.label,
      heightPct: maxMag > 0 ? clampPct((m.mag / maxMag) * 100) : 0,
      emphasis: maxMag > 0 && m.mag === maxMag,
    }));
}

export interface ThemeCauseCounts {
  leakCount: number;
  strengthCount: number;
}

export interface ThemeCauseCountsInput {
  state: 'leak' | 'strength' | 'thin';
  causes: ReadonlyArray<unknown>;
}

/** Counts identified causes (the individual insights a theme is built from)
 *  by whether their parent theme currently reads as a leak or a strength —
 *  the "Insight library" cell's count-chip pair. */
export function summarizeThemeCauseCounts(themes: ReadonlyArray<ThemeCauseCountsInput>): ThemeCauseCounts {
  let leakCount = 0;
  let strengthCount = 0;
  for (const theme of themes) {
    if (theme.state === 'leak') leakCount += theme.causes.length;
    else if (theme.state === 'strength') strengthCount += theme.causes.length;
  }
  return { leakCount, strengthCount };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Trend signal chip — maps the composition root's humanized `trendSummary`
 * string (built from `MultiWindowAnalysis['signal']`:
 * 'strong_improving' | 'strong_declining' | 'short_term_dip' |
 * 'short_term_spike' | 'trajectory_change' | 'mixed' | 'stable', see
 * src/lib/coachhelm/v2/trends/multi-window.ts) to a compact `SignalChip`
 * tone + label for the bento's "Trend" cell. Matched case-insensitively
 * against the space-normalized text so it survives the composition root's
 * exact capitalization choice without importing its formatter.
 * ────────────────────────────────────────────────────────────────────────── */
export interface TrendSignalChip {
  tone: SignalTone;
  label: string;
  /**
   * Player-facing prose for the cell body.
   *
   * The bento used to print the humanized enum itself underneath the chip, so
   * the card read "Declining" over the body text "Strong declining" — the raw
   * signal name showing through as if it were a sentence (audit P-27).
   */
  sentence: string;
}

const TREND_SIGNAL_CHIPS: Record<string, TrendSignalChip> = {
  'strong improving': {
    tone: 'hot',
    label: 'Improving',
    sentence: 'Your scoring has moved in the right direction across recent windows.',
  },
  'short term spike': {
    tone: 'hot',
    label: 'Spiking',
    sentence: 'A sharp recent gain — too new to call a trend, worth protecting.',
  },
  'strong declining': {
    tone: 'watch',
    label: 'Declining',
    sentence: 'Your scoring has slipped across recent windows. Worth a look.',
  },
  'short term dip': {
    tone: 'watch',
    label: 'Dipping',
    sentence: 'A short-term dip against an otherwise steady baseline.',
  },
  'trajectory change': {
    tone: 'watch',
    label: 'Shifting',
    sentence: 'Your trajectory changed direction recently.',
  },
  mixed: {
    tone: 'quiet',
    label: 'Mixed signals',
    sentence: 'Windows disagree — some parts of your game are moving, others are flat.',
  },
  stable: {
    tone: 'quiet',
    label: 'Stable',
    sentence: 'Holding steady across recent windows.',
  },
};

export function classifyTrendSignal(trendSummary: string | null | undefined): TrendSignalChip | null {
  if (!trendSummary) return null;
  return TREND_SIGNAL_CHIPS[trendSummary.trim().toLowerCase()] ?? null;
}
