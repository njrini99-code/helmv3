import { resolveFocusTargetMetric } from '@/lib/coachhelm/focus-areas/target-metric';
import { verdictMetricFor } from '@/lib/coachhelm/v3/verdicts/metrics';
import { verdictOf, type ChVerdictTone } from './coachhelm-engine-shape';
import type { ChViewer } from './coachhelm-voice';

/**
 * The prescription and verdict loop drawn on a focus area itself (CoachHelm chs-11; supercharge 04 example 11 and layout 5): its
 * target ("70% or better over 40 putts"), how far it has come ("22 of 40 putts in · 55% so far") and, at the horizon, the verdict
 * word with both numbers and the regression line, in the viewer's voice. Pure: the stored prescription columns and the post counts
 * go in, words come out; every number is one the verdict step stored or a count of what was recorded since the start.
 *
 * Drawn only with `coachhelm_verdicts_v1` on (the loader sets `loop`); off, the focus area is drawn exactly as before. A focus area
 * with no criterion (every row written before the prescription stamp, or a metric with no verdict) has no loop.
 */

/** The prescription columns of one `golf_player_focus_areas` row (04 §1.3; migration 20261020120000, applied 2026-10-21). */
export interface ChFocusLoopRow {
  id: string;
  title: string;
  from_insight_id: string | null;
  target_metric: string | null;
  baseline_value: number | null;
  baseline_n: number | null;
  criterion: unknown;
  horizon: unknown;
  verdict: unknown;
  started_at: string | null;
}

/** Made and attempted since the focus area started, up to its horizon. */
export interface ChFocusPost {
  made: number;
  n: number;
}

export interface ChFocusLoop {
  /** "Worked", "Did not move", "Too early"; the tone is decoration. */
  word: string;
  tone: ChVerdictTone;
  /** The verdict line with both numbers and the regression line; null while too early. */
  line: string | null;
  /** "70% or better over 40 putts". */
  target: string | null;
  /** "22 of 40 putts in · 55% so far"; null once the verdict is in (its line has the numbers) or when nothing is counted yet. */
  progress: string | null;
}

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The verdict settings of the area's metric: label and attempt noun for the copy. */
export function focusMetricOf(row: Pick<ChFocusLoopRow, 'target_metric'>) {
  return verdictMetricFor(resolveFocusTargetMetric(row.target_metric) ?? row.target_metric);
}

/** The horizon in attempts, when the row carries one. */
export const horizonAttempts = (horizon: unknown): number | null => {
  const a = num(rec(horizon)?.attempts);
  return a != null && a > 0 ? a : null;
};

/** "22 of 40 putts in · 55% so far", and "0 of 40 putts in" before the first. */
export function progressLine(post: ChFocusPost, horizon: number, noun: string): string {
  const n = Math.min(post.n, horizon);
  const head = `${n} of ${horizon} ${noun} in`;
  return post.n > 0 ? `${head} · ${Math.round((post.made / post.n) * 100)}% so far` : head;
}

/**
 * One focus area's loop, or null when it carries no prescription. `post` is the live count while the verdict is still to come
 * (the verdict step stores nothing before the horizon: Too early is a render-time state); null when it was not counted.
 */
export function focusLoopOf(row: ChFocusLoopRow, post: ChFocusPost | null, viewer: ChViewer, nowIso: string): ChFocusLoop | null {
  const def = focusMetricOf(row);
  const noun = def?.attemptNoun ?? 'attempts';
  const v = verdictOf(row, def?.label ?? row.title, noun, viewer, nowIso);
  if (!v) return null;
  const h = horizonAttempts(row.horizon);
  const early = v.line == null;
  return {
    word: v.word,
    tone: v.tone,
    line: v.line,
    target: v.target ? v.target.replace(/^Target: /, '').replace(/\.$/, '') : null,
    progress: early && h != null && post ? progressLine(post, h, noun) : null,
  };
}
