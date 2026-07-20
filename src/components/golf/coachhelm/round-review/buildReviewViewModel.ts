/**
 * ============================================================================
 * buildReviewViewModel — pure adapter for the Round Review filmstrip (Task 10)
 * ----------------------------------------------------------------------------
 * Turns the SAME `RoundReviewContent` DTO the legacy `RoundReviewDisplay` /
 * `RoundIntelligence` components already consume into the shapes the
 * `Filmstrip` / `GradeDots` / `RailBars` / `RampMatrix` / `TickerStrip`
 * modules expect. No Supabase, no React — pure data in, data out, so every
 * branch is fixture-testable without mounting anything.
 *
 * Per spec §3.4/§5.5:
 *   - the filmstrip's per-hole `note` is synthesized from penalties / 3-putts
 *     / miss data on `HoleBreakdown` (`synthesizeHoleNote`) — the same fields
 *     `generateReviewContent` already computes, never re-derived from raw
 *     shots;
 *   - the grade is `gradeDotsForDelta(scoreToPar)` (5-dot scale), NOT the
 *     legacy A–F `overallGrade` letter;
 *   - the scoring-mix line reads `scoringDistribution`;
 *   - the strokes-lost `RailBars` read `strokesToGain` — the SINGLE home for
 *     that data (the old `RoundIntelligence` "where today's strokes went"
 *     board is retired from this page, though the component itself stays
 *     mounted elsewhere).
 * ========================================================================== */

import {
  clampPct,
  gradeDotsForDelta,
  gradeLabel,
  rampBandForValue,
  type RailBarRow,
  type RampCell,
  type TickerItem,
  type FilmstripHole,
} from '@/components/fairway/modules';
import type {
  HoleBreakdown,
  RoundReviewContent,
  StrokesToGainItem,
  HalfStats,
} from '@/app/golf/actions/round-review-system';

/* ─────────────────────────────────────────────────────────────────────────
 * Hero: score, grade, mix line, filmstrip holes, narrative
 * ──────────────────────────────────────────────────────────────────────── */

/** Strips NaN artifacts the V2 composer occasionally leaves in generated
 *  text (ported verbatim from the retired `V2ReviewSummary`'s sanitizer —
 *  applied to every V2-sourced string before it reaches the narrative or
 *  the practice-priority line). */
export function sanitizeNaN(text: string): string {
  return text
    .replace(/This occurs in NaN% of rounds with NaN% reliability\.?\s*/gi, '')
    .replace(/\bNaN%/g, '')
    .replace(/\bNaN\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** `+13` / `E` / `-2` — the mono to-par string next to the raw score. */
export function formatToPar(scoreToPar: number): string {
  if (scoreToPar === 0) return 'E';
  return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
}

export interface ReviewGrade {
  score: 0 | 1 | 2 | 3 | 4 | 5;
  label: string;
}

/** Wires `gradeDotsForDelta` (the shared logic helper) to a label. */
export function buildGrade(scoreToPar: number): ReviewGrade {
  const score = gradeDotsForDelta(scoreToPar);
  return { score, label: gradeLabel(score) };
}

/** "1 birdie · 9 pars · 5 bogeys · 3 doubles+" — skips zero-count buckets
 *  except pars, which always renders (mirrors the approved mockup). */
export function buildMixLine(dist: RoundReviewContent['scoringDistribution']): string {
  const parts: string[] = [];
  if (dist.eagles.length > 0) {
    parts.push(`${dist.eagles.length} eagle${dist.eagles.length > 1 ? 's' : ''}`);
  }
  if (dist.birdies.length > 0) {
    parts.push(`${dist.birdies.length} birdie${dist.birdies.length > 1 ? 's' : ''}`);
  }
  parts.push(`${dist.pars.length} par${dist.pars.length !== 1 ? 's' : ''}`);
  if (dist.bogeys.length > 0) {
    parts.push(`${dist.bogeys.length} bogey${dist.bogeys.length > 1 ? 's' : ''}`);
  }
  if (dist.doublePlus.length > 0) {
    parts.push(`${dist.doublePlus.length} double${dist.doublePlus.length > 1 ? 's' : ''}+`);
  }
  return parts.join(' · ');
}

/** First word of a miss-direction token ("left_short" -> "left"). Falls back
 *  to the raw token when it doesn't carry a recognized direction. */
function directionWord(dir: string | null): string {
  if (!dir) return '';
  const lower = dir.toLowerCase();
  if (lower.includes('left')) return 'left';
  if (lower.includes('right')) return 'right';
  if (lower.includes('short')) return 'short';
  if (lower.includes('long')) return 'long';
  return lower;
}

/** Deterministic 1-line note for a damage hole, priority order: penalties >
 *  three-putt > driving miss > approach miss > missed up-and-down. Clean
 *  holes (nothing to report) return `undefined` — the caller's detail line
 *  falls back to "clean hole" copy, matching the approved mockup. */
export function synthesizeHoleNote(h: HoleBreakdown): string | undefined {
  if (h.penalties > 0) {
    return `${h.penalties} penalty stroke${h.penalties > 1 ? 's' : ''}.`;
  }
  if (h.threePutt) {
    const dist = h.firstPuttFeet != null ? `${Math.round(h.firstPuttFeet)} ft` : 'range';
    return `3-putt from ${dist}.`;
  }
  if (h.fairwayHit === false && h.driveMiss) {
    const dir = directionWord(h.driveMiss);
    return dir ? `Missed fairway ${dir}.` : 'Missed the fairway.';
  }
  if (!h.gir && h.approachMiss) {
    const dir = directionWord(h.approachMiss);
    return dir ? `Missed green ${dir}.` : 'Missed the green.';
  }
  if (!h.gir && h.scrambleAttempt && !h.scrambleSuccess) {
    return 'Missed green, no up-and-down.';
  }
  return undefined;
}

/** `HoleBreakdown[]` -> `FilmstripHole[]`, one column per hole, note-synthesized. */
export function buildFilmstripHoles(holes: HoleBreakdown[]): FilmstripHole[] {
  return holes.map((h) => ({
    n: h.hole,
    par: h.par,
    score: h.score,
    note: synthesizeHoleNote(h),
  }));
}

/** Narrative fallback, three tiers in priority order:
 *   1. `v2Body` — a FRESH V2 composed-review generation from THIS page load
 *      (only populated when the round had no stored review yet, so
 *      `useRoundReviewV2`'s auto-generate effect fired).
 *   2. `persistedComposedBody` — the SAME CoachHelm-authored body read back
 *      from the already-stored review row (`review.deepInsights[0].body`,
 *      written by `mergeCoachHelmReviewContent` in round-review-system.ts).
 *      Without this tier, every revisit — and the page's Refresh button,
 *      neither of which re-runs the hook's own generate() — fell all the way
 *      through to the V1 summary even though the composed narrative was
 *      sitting in the DB. Mirrors `pickPracticePriority`'s v2-then-v1-overlay
 *      tiering below.
 *   3. `v1Summary` — the rule-based summary, the surface's honest floor. The
 *      surface is never narrative-empty. */
export function buildNarrative(
  v1Summary: string,
  v2Body: string | null | undefined,
  persistedComposedBody?: string | null,
): string {
  const fresh = v2Body?.trim();
  if (fresh && fresh.length > 0) return fresh;
  const persisted = persistedComposedBody?.trim();
  if (persisted && persisted.length > 0) return sanitizeNaN(persisted);
  return v1Summary;
}

/** "Sat, Jun 6" — compact course/date line format (mockup §04 film-left
 *  `.course`). Manual parsing avoids the `new Date("2026-03-15")` UTC
 *  timezone shift (would read as the prior day in US timezones). */
export function formatReviewDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = dateStr.split('T')[0]?.split('-');
  if (!parts || parts.length !== 3) return dateStr;
  const y = parseInt(parts[0]!, 10);
  const m = parseInt(parts[1]!, 10) - 1;
  const d = parseInt(parts[2]!, 10);
  const date = new Date(y, m, d);
  return `${days[date.getDay()]}, ${months[m]} ${d}`;
}

/** "Poplar Grove · Sat, Jun 6" — omits the course segment when unknown,
 *  the date segment when missing, and the separator when only one exists. */
export function buildCourseDateLine(courseName: string, dateStr: string | null | undefined): string {
  const date = formatReviewDate(dateStr);
  return [courseName, date].filter((s) => s.length > 0).join(' · ');
}

/** "#7 · Par 4 · 7 (+3)" header + note body — the filmstrip's scrub detail
 *  line (mockup §04 `.fdetail`). A clean hole (no synthesized note) reads
 *  "Clean hole." rather than an empty body. */
export function formatHoleDetail(h: FilmstripHole): { header: string; body: string } {
  const delta = h.score - h.par;
  const tag = delta === 0 ? 'E' : delta > 0 ? `+${delta}` : `${delta}`;
  return {
    header: `#${h.n} · Par ${h.par} · ${h.score} (${tag})`,
    body: h.note ?? 'Clean hole.',
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Strokes-lost RailBars — the SINGLE home for `strokesToGain`
 * ──────────────────────────────────────────────────────────────────────── */

/** Top 4 positive-opportunity `strokesToGain` items, ranked biggest-first,
 *  scaled to the leader's magnitude (`pct`). Only the leader renders full
 *  strength — the rest render `dim`, matching `RailBars`' secondary-row
 *  convention. */
export function buildStrokesLostRows(items: StrokesToGainItem[]): RailBarRow[] {
  const opps = [...items]
    .filter((i) => i.potentialStrokes > 0)
    .sort((a, b) => b.potentialStrokes - a.potentialStrokes)
    .slice(0, 4);
  const max = opps.reduce((m, o) => Math.max(m, o.potentialStrokes), 0) || 1;
  return opps.map((o, i) => ({
    label: o.category,
    pct: clampPct((o.potentialStrokes / max) * 100),
    value: `~${o.potentialStrokes.toFixed(1)}`,
    dim: i > 0,
  }));
}

/* ─────────────────────────────────────────────────────────────────────────
 * "Full breakdown" DrillPanel content
 * ──────────────────────────────────────────────────────────────────────── */

export interface FrontBackRow {
  label: string;
  score: number;
  putts: number;
  gir: string;
  fairways: string;
}

export function buildFrontBackRows(split: RoundReviewContent['frontBackSplit']): FrontBackRow[] {
  const row = (label: string, s: HalfStats): FrontBackRow => ({
    label,
    score: s.score,
    putts: s.putts,
    gir: `${s.gir}/${s.girTotal}`,
    fairways: s.fairwayTotal > 0 ? `${s.fairways}/${s.fairwayTotal}` : '—',
  });
  return [row('Front 9', split.front), row('Back 9', split.back)];
}

export interface PuttingRamp {
  cols: string[];
  cells: RampCell[];
}

/** One-row `RampMatrix` band: putt-make% per distance bucket, banded at
 *  25/50/75% (0 attempts -> band 0, "no data", never a fabricated 0%). */
export function buildPuttingRamp(putting: RoundReviewContent['puttingBreakdown']): PuttingRamp {
  const cols = putting.ranges.map((r) => r.label);
  const cells: RampCell[] = putting.ranges.map((r) => ({
    value: r.attempts > 0 ? `${r.pct}%` : '—',
    n: r.attempts > 0 ? `${r.made}/${r.attempts}` : undefined,
    band: r.attempts > 0 ? rampBandForValue(r.pct, [25, 50, 75]) : 0,
  }));
  return { cols, cells };
}

/** Rolling score-to-par momentum, scaled to the round's worst swing so the
 *  ticker always shows visible relative movement. */
export function buildMomentumTicker(
  momentum: RoundReviewContent['momentumData'],
): TickerItem[] {
  if (momentum.length === 0) return [];
  const maxAbs = momentum.reduce((m, p) => Math.max(m, Math.abs(p.rollingScoreToPar)), 0) || 1;
  const worstHole = momentum.reduce(
    (worst, p) => (p.rollingScoreToPar > worst.rollingScoreToPar ? p : worst),
    momentum[0]!,
  ).hole;
  return momentum.map((p) => ({
    label: String(p.hole),
    heightPct: clampPct((Math.abs(p.rollingScoreToPar) / maxAbs) * 100),
    emphasis: p.hole === worstHole,
  }));
}

/** Driving + penalty summary lines — honest-empty per fact (a null average
 *  or zero count simply omits that line rather than fabricating one). */
export function buildDrivingPenaltyLines(
  driving: RoundReviewContent['drivingAnalysis'],
  penalty: RoundReviewContent['penaltyAnalysis'],
): string[] {
  const lines: string[] = [];
  if (driving.avgDistance != null) {
    const fw = driving.fairwayPct != null ? ` · ${driving.fairwayPct}% fairways` : '';
    lines.push(`Avg drive ${driving.avgDistance}y${fw}.`);
  }
  if (driving.longestDrive) {
    lines.push(`Longest drive ${driving.longestDrive.distance}y on #${driving.longestDrive.hole}.`);
  }
  if (driving.missPattern.total > 0) {
    const { left, right, total } = driving.missPattern;
    const dominant = left > right ? 'left' : right > left ? 'right' : null;
    lines.push(
      dominant
        ? `Missed ${total} fairway${total > 1 ? 's' : ''}, mostly ${dominant}.`
        : `Missed ${total} fairway${total > 1 ? 's' : ''}.`,
    );
  }
  if (penalty.total > 0) {
    const holeList = penalty.holes.map((h) => `#${h.hole}`).join(', ');
    lines.push(`${penalty.total} penalty stroke${penalty.total > 1 ? 's' : ''} on ${holeList}.`);
  }
  return lines;
}

/** Scramble + sand-save rows for the short-game section — omitted entirely
 *  when there were zero attempts of that type (never a fabricated 0/0 row). */
export function buildShortGameRows(sg: RoundReviewContent['shortGameAnalysis']): RailBarRow[] {
  const rows: RailBarRow[] = [];
  if (sg.scrambleAttempts > 0) {
    rows.push({
      label: 'Scramble',
      pct: clampPct(sg.scramblePct ?? 0),
      value: `${sg.scrambleSuccesses}/${sg.scrambleAttempts}`,
    });
  }
  if (sg.sandAttempts > 0) {
    rows.push({
      label: 'Sand save',
      pct: clampPct(sg.sandSavePct ?? 0),
      value: `${sg.sandSuccesses}/${sg.sandAttempts}`,
    });
  }
  return rows;
}

/** Best-effort practice-priority line: the V2 engine's read wins when
 *  present, else the V1 rule-based `coachHelm` overlay, else `null`
 *  (the "what to do next" block honestly omits the row). */
export function pickPracticePriority(
  v2PracticePriority: string | null | undefined,
  v1CoachHelm: RoundReviewContent['coachHelm'],
): string | null {
  const v2 = v2PracticePriority?.trim();
  if (v2 && v2.length > 0) return v2;
  const v1 = v1CoachHelm?.practicePriority?.trim();
  return v1 && v1.length > 0 ? v1 : null;
}
