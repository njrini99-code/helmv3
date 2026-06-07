/**
 * Course-management insight generators — Group C2 + C3.
 *
 *   - generateWorstHolesInsights(playerId) — aggregates holes by
 *     (course_id, hole_number) over the last 365 days and emits ONE
 *     course-scoped insight per course that highlights the worst-3 holes
 *     the player has played >= 4 times with avg_score_to_par >= 0.8.
 *
 *   - generateWarmupHoleInsight(playerId) — compares the player's hole 1
 *     average score-to-par vs their average on holes 2-18 over 90 days.
 *     Emits when hole 1 is >0.4 strokes worse than the rest-of-round baseline
 *     AND the player has played hole 1 at least 6 times.
 *
 * Source of truth:
 *   docs/superpowers/plans/2026-04-22-insight-quality/00-design-contract.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { upsertInsight, attachDrills, GATED_OUT } from '../insights/upsert';
import type { InsightEvidence } from '../insights/types';
import {
  loadStandingForInsightEvidence,
  mergeStandingIntoEvidence,
} from '../insights/standing-injection';

type Supabase = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORST_HOLES_WINDOW_DAYS = 365;
const WORST_HOLES_MIN_ROUNDS = 4;
const WORST_HOLES_MIN_AVG_OVER_PAR = 0.8;
const WORST_HOLES_TOP_N = 3;

const WARMUP_WINDOW_DAYS = 90;
const WARMUP_MIN_HOLE_1_PLAYS = 6;
const WARMUP_MIN_GAP_STROKES = 0.4;

// ---------------------------------------------------------------------------
// Shared data types
// ---------------------------------------------------------------------------

interface HoleRow {
  par: number;
  score: number;
  hole_number: number;
  course_id: string | null;
  course_name: string | null;
}

interface RawHoleRow {
  par: number | null;
  score: number | null;
  hole_number: number | null;
  golf_rounds: {
    player_id: string | null;
    round_date: string | null;
    course_id: string | null;
    course_name: string | null;
  } | null;
}

interface CourseYardageRow {
  course_id: string;
  hole_number: number;
  par: number | null;
  yardage: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchScoredHoles(
  supabase: Supabase,
  playerId: string,
  windowStartIso: string,
): Promise<HoleRow[]> {
  const { data, error } = await supabase
    .from('golf_holes')
    .select(
      `
      par,
      score,
      hole_number,
      golf_rounds!inner (
        player_id,
        round_date,
        course_id,
        course_name
      )
    `,
    )
    .eq('golf_rounds.player_id', playerId)
    .gte('golf_rounds.round_date', windowStartIso)
    .not('score', 'is', null)
    .not('par', 'is', null)
    .limit(50000); // lift PostgREST 1000-row default cap

  if (error) {
    throw new Error(`course-management.fetchScoredHoles failed: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as RawHoleRow[];
  return rows
    .filter((r) => r.par != null && r.score != null && r.hole_number != null && r.golf_rounds)
    .map((r) => ({
      par: r.par as number,
      score: r.score as number,
      hole_number: r.hole_number as number,
      course_id: r.golf_rounds?.course_id ?? null,
      course_name: r.golf_rounds?.course_name ?? null,
    }));
}

async function fetchCourseHoleYardages(
  supabase: Supabase,
  courseIds: string[],
): Promise<Map<string, { par: number | null; yardage: number | null }>> {
  const out = new Map<string, { par: number | null; yardage: number | null }>();
  if (courseIds.length === 0) return out;
  const { data, error } = await supabase
    .from('golf_course_holes')
    .select('course_id, hole_number, par, yardage')
    .in('course_id', courseIds);
  if (error) return out;
  for (const row of (data ?? []) as CourseYardageRow[]) {
    out.set(`${row.course_id}:${row.hole_number}`, {
      par: row.par,
      yardage: row.yardage,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// C2 — generateWorstHolesInsights
// ---------------------------------------------------------------------------

export interface CourseHoleAggregate {
  course_id: string;
  course_name: string | null;
  hole_number: number;
  par: number;
  roundsPlayed: number;
  avgScoreToPar: number;
  stddev: number;
  yardage: number | null;
}

export function aggregateCourseHoles(rows: HoleRow[]): CourseHoleAggregate[] {
  const grouped = new Map<
    string,
    {
      course_id: string;
      course_name: string | null;
      hole_number: number;
      par: number;
      overs: number[];
    }
  >();
  for (const r of rows) {
    if (!r.course_id) continue;
    const key = `${r.course_id}:${r.hole_number}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.overs.push(r.score - r.par);
      // Keep course_name if first row missed it.
      if (!existing.course_name && r.course_name) existing.course_name = r.course_name;
    } else {
      grouped.set(key, {
        course_id: r.course_id,
        course_name: r.course_name ?? null,
        hole_number: r.hole_number,
        par: r.par,
        overs: [r.score - r.par],
      });
    }
  }
  const out: CourseHoleAggregate[] = [];
  for (const g of grouped.values()) {
    const n = g.overs.length;
    const mean = g.overs.reduce((a, b) => a + b, 0) / n;
    const stddev = n > 1
      ? Math.sqrt(g.overs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
      : 0;
    out.push({
      course_id: g.course_id,
      course_name: g.course_name,
      hole_number: g.hole_number,
      par: g.par,
      roundsPlayed: n,
      avgScoreToPar: mean,
      stddev,
      yardage: null,
    });
  }
  return out;
}

function detectPattern(
  top: CourseHoleAggregate[],
): string | null {
  if (top.length < 2) return null;
  const pars = new Set(top.map((t) => t.par));
  if (pars.size === 1) {
    const par = top[0]!.par;
    // Yardage pattern if we have yardages on all
    const yards = top.map((t) => t.yardage).filter((y): y is number => typeof y === 'number');
    if (yards.length === top.length) {
      const minY = Math.min(...yards);
      if (par === 4 && minY >= 425) return `all par 4s ≥425yd`;
      if (par === 4 && minY >= 400) return `all par 4s ≥400yd`;
      if (par === 5 && minY >= 540) return `all par 5s ≥540yd`;
      if (par === 3 && minY >= 190) return `all par 3s ≥190yd`;
    }
    return `all par ${par}s`;
  }
  return null;
}

function composeWorstHolesContent(
  courseLabel: string,
  top: CourseHoleAggregate[],
  pattern: string | null,
  strokesImpact: number,
): string {
  const list = top
    .map((t) => {
      const avgDisp = (t.avgScoreToPar >= 0 ? '+' : '') + t.avgScoreToPar.toFixed(2);
      const yardBit = typeof t.yardage === 'number' ? `, ${t.yardage}yd` : '';
      return `hole ${t.hole_number} (par ${t.par}${yardBit}, ${avgDisp} avg over ${t.roundsPlayed} rounds)`;
    })
    .join('; ');
  const patternLine = pattern
    ? ` Pattern: ${pattern} — the common thread is ${pattern.includes('par 4') ? 'tee-shot demand and long-iron approach' : pattern.includes('par 5') ? 'three-shot execution on a long hole' : 'long forced-carry par-3 tee shots'}.`
    : '';
  return (
    `On ${courseLabel}, three holes are costing you the most: ${list}. ` +
    `Projected impact: ~${strokesImpact.toFixed(2)} strokes per round played here.${patternLine} ` +
    `Pre-round, rebuild a specific plan for these holes — the recurring bogey source is identifiable rather than random.`
  );
}

export async function generateWorstHolesInsights(playerId: string): Promise<void> {
  let supabase: Supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    await logServerError('course-management.worst_holes.client_init', {
      action: 'generateWorstHolesInsights',
      featureArea: 'coachhelm/v2/mining/course-management',
      source: 'background_job',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return;
  }

  const windowStart = isoDateDaysAgo(WORST_HOLES_WINDOW_DAYS);
  const windowEnd = todayIsoDate();

  let rows: HoleRow[];
  try {
    rows = await fetchScoredHoles(supabase, playerId, windowStart);
  } catch (err) {
    await logServerError('course-management.worst_holes.fetch_failed', {
      action: 'generateWorstHolesInsights',
      featureArea: 'coachhelm/v2/mining/course-management',
      source: 'background_job',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return;
  }
  if (rows.length === 0) return;

  const allAggs = aggregateCourseHoles(rows);
  if (allAggs.length === 0) return;

  // Hydrate yardages for pattern detection and content.
  const courseIds = Array.from(new Set(allAggs.map((a) => a.course_id)));
  const yardMap = await fetchCourseHoleYardages(supabase, courseIds);
  for (const a of allAggs) {
    const key = `${a.course_id}:${a.hole_number}`;
    const hit = yardMap.get(key);
    if (hit) a.yardage = hit.yardage;
  }

  // Group by course, pick worst-3 that clear the thresholds, emit one
  // insight per course.
  const byCourse = new Map<string, CourseHoleAggregate[]>();
  for (const a of allAggs) {
    const arr = byCourse.get(a.course_id) ?? [];
    arr.push(a);
    byCourse.set(a.course_id, arr);
  }

  for (const [courseId, aggs] of byCourse.entries()) {
    const eligible = aggs
      .filter(
        (a) =>
          a.roundsPlayed >= WORST_HOLES_MIN_ROUNDS &&
          a.avgScoreToPar >= WORST_HOLES_MIN_AVG_OVER_PAR,
      )
      .sort((a, b) => b.avgScoreToPar - a.avgScoreToPar)
      .slice(0, WORST_HOLES_TOP_N);

    if (eligible.length === 0) continue;
    const primary = eligible[0]!;

    const totalRoundsOnCourse = Math.max(
      ...aggs.map((a) => a.roundsPlayed),
    );

    // Strokes impact per round on this course = sum of (avg over par) across
    // the worst-3 eligible holes.
    const strokesImpact = Number(
      eligible.reduce((acc, a) => acc + a.avgScoreToPar, 0).toFixed(2),
    );

    const pattern = detectPattern(eligible);

    const samples = eligible.reduce((acc, a) => acc + a.roundsPlayed, 0);
    const meanStd =
      eligible.reduce((acc, a) => acc + a.stddev, 0) / eligible.length;
    const varianceFactor = Math.max(0, Math.min(1, 1 - meanStd / 1.5));

    const courseLabel = primary.course_name || 'this course';
    const yourDisp = primary.avgScoreToPar.toFixed(2);

    const evidence: InsightEvidence = {
      metric: 'course_worst_holes',
      metric_label: `Worst ${eligible.length} holes on ${courseLabel}`,
      unit: 'strokes',
      your_value: Number(primary.avgScoreToPar.toFixed(3)),
      your_value_display: `+${yourDisp} (hole ${primary.hole_number})`,
      comparison_value: 0,
      comparison_label: 'par',
      comparison_source: 'absolute_target',
      sample_n: samples,
      window_days: WORST_HOLES_WINDOW_DAYS,
      window_start: windowStart,
      window_end: windowEnd,
      strokes_impact: strokesImpact,
      strokes_impact_method: 'historical_correlation',
      confidence: 0,
      confidence_factors: {
        sample_adequacy: Math.min(samples / 12, 1),
        recency: 1.0,
        variance: varianceFactor,
      },
      detail: {
        course_id: courseId,
        course_name: primary.course_name,
        total_rounds_on_course: totalRoundsOnCourse,
        pattern,
        worst_holes: eligible.map((a) => ({
          hole_number: a.hole_number,
          par: a.par,
          yardage: a.yardage,
          rounds_played: a.roundsPlayed,
          avg_score_to_par: Number(a.avgScoreToPar.toFixed(3)),
        })),
      },
    };

    const title =
      `Worst holes on ${courseLabel}: #${eligible
        .map((e) => e.hole_number)
        .join(', #')}`;
    const content = composeWorstHolesContent(courseLabel, eligible, pattern, strokesImpact);
    const drillTags = ['course_management', 'tee_strategy', 'risk_reward'];

    try {
      const insightId = await upsertInsight(supabase, {
        player_id: playerId,
        category: 'course_management',
        signature: `${playerId}:course_worst_holes:${courseId}`,
        title,
        content,
        evidence,
        drill_tags: drillTags,
      });
      // Philosophy gate may have suppressed the write — GATED_OUT is not
      // a real row id, so don't pass it to attachDrills.
      if (insightId !== GATED_OUT) {
        await attachDrills(supabase, insightId, 'course_management', drillTags);
      }
    } catch (err) {
      await logServerError('course-management.worst_holes.upsert_failed', {
        action: 'generateWorstHolesInsights',
        featureArea: 'coachhelm/v2/mining/course-management',
        source: 'background_job',
        playerId,
        metadata: {
          course_id: courseId,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// C3 — generateWarmupHoleInsight
// ---------------------------------------------------------------------------

export interface WarmupAggregate {
  hole1Count: number;
  hole1AvgScoreToPar: number;
  hole1Stddev: number;
  restCount: number;
  restAvgScoreToPar: number;
  restStddev: number;
}

export function aggregateWarmup(rows: HoleRow[]): WarmupAggregate {
  const h1: number[] = [];
  const rest: number[] = [];
  for (const r of rows) {
    const over = r.score - r.par;
    if (r.hole_number === 1) h1.push(over);
    else if (r.hole_number >= 2 && r.hole_number <= 18) rest.push(over);
  }
  function stats(xs: number[]): { mean: number; stddev: number } {
    if (xs.length === 0) return { mean: 0, stddev: 0 };
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const stddev = xs.length > 1
      ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1))
      : 0;
    return { mean, stddev };
  }
  const s1 = stats(h1);
  const s2 = stats(rest);
  return {
    hole1Count: h1.length,
    hole1AvgScoreToPar: s1.mean,
    hole1Stddev: s1.stddev,
    restCount: rest.length,
    restAvgScoreToPar: s2.mean,
    restStddev: s2.stddev,
  };
}

function composeWarmupContent(agg: WarmupAggregate, strokesImpact: number): string {
  const h1 = (agg.hole1AvgScoreToPar >= 0 ? '+' : '') + agg.hole1AvgScoreToPar.toFixed(2);
  const rest = (agg.restAvgScoreToPar >= 0 ? '+' : '') + agg.restAvgScoreToPar.toFixed(2);
  const gap = (agg.hole1AvgScoreToPar - agg.restAvgScoreToPar).toFixed(2);
  return (
    `Over the last ${WARMUP_WINDOW_DAYS} days, your hole 1 averaged ${h1} to par across ${agg.hole1Count} rounds, ` +
    `while your holes 2-18 average ${rest}. That's ${gap} strokes of warm-up tax on the opening hole. ` +
    `Projected impact: ~${strokesImpact.toFixed(2)} strokes per round. ` +
    `This is a routine/arousal problem, not swing mechanics: build a pre-first-tee protocol with breath work plus two commitment swings.`
  );
}

export async function generateWarmupHoleInsight(playerId: string): Promise<void> {
  let supabase: Supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    await logServerError('course-management.warmup.client_init', {
      action: 'generateWarmupHoleInsight',
      featureArea: 'coachhelm/v2/mining/course-management',
      source: 'background_job',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return;
  }

  const windowStart = isoDateDaysAgo(WARMUP_WINDOW_DAYS);
  const windowEnd = todayIsoDate();

  let rows: HoleRow[];
  try {
    rows = await fetchScoredHoles(supabase, playerId, windowStart);
  } catch (err) {
    await logServerError('course-management.warmup.fetch_failed', {
      action: 'generateWarmupHoleInsight',
      featureArea: 'coachhelm/v2/mining/course-management',
      source: 'background_job',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return;
  }
  if (rows.length === 0) return;

  const agg = aggregateWarmup(rows);
  if (agg.hole1Count < WARMUP_MIN_HOLE_1_PLAYS) return;
  if (agg.restCount < 30) return; // need a stable rest-of-round baseline

  const gap = agg.hole1AvgScoreToPar - agg.restAvgScoreToPar;
  if (gap <= WARMUP_MIN_GAP_STROKES) return;

  // Strokes impact per round = the hole-1 excess stroke (it's one hole per round).
  const strokesImpact = Number(gap.toFixed(2));

  // Variance factor: the hole-1 stddev relative to a tolerated spread. If
  // hole-1 is both high-mean and high-variance, don't inflate confidence.
  const expectedStd = 1.0;
  const varianceFactor = Math.max(
    0,
    Math.min(1, 1 - agg.hole1Stddev / expectedStd),
  );

  const yourDisp = (agg.hole1AvgScoreToPar >= 0 ? '+' : '') + agg.hole1AvgScoreToPar.toFixed(2);
  const restDisp = (agg.restAvgScoreToPar >= 0 ? '+' : '') + agg.restAvgScoreToPar.toFixed(2);

  const evidence: InsightEvidence = {
    metric: 'course_warmup_hole_1',
    metric_label: 'Average score-to-par on hole 1 vs holes 2-18',
    unit: 'strokes',
    your_value: Number(agg.hole1AvgScoreToPar.toFixed(3)),
    your_value_display: `${yourDisp} on hole 1`,
    comparison_value: Number(agg.restAvgScoreToPar.toFixed(3)),
    comparison_label: `your holes 2-18 baseline (${restDisp})`,
    comparison_source: 'your_baseline',
    sample_n: agg.hole1Count,
    window_days: WARMUP_WINDOW_DAYS,
    window_start: windowStart,
    window_end: windowEnd,
    strokes_impact: strokesImpact,
    strokes_impact_method: 'historical_correlation',
    confidence: 0,
    confidence_factors: {
      sample_adequacy: Math.min(agg.hole1Count / 15, 1),
      recency: 1.0,
      variance: varianceFactor,
    },
    detail: {
      hole_1_count: agg.hole1Count,
      hole_1_avg: Number(agg.hole1AvgScoreToPar.toFixed(3)),
      hole_1_stddev: Number(agg.hole1Stddev.toFixed(3)),
      rest_count: agg.restCount,
      rest_avg: Number(agg.restAvgScoreToPar.toFixed(3)),
      rest_stddev: Number(agg.restStddev.toFixed(3)),
      gap_strokes: Number(gap.toFixed(3)),
    },
  };

  const title = `Warm-up tax: +${gap.toFixed(2)} strokes on hole 1 vs holes 2-18`;
  const content = composeWarmupContent(agg, strokesImpact);
  const drillTags = ['course_management', 'pre_shot_routine', 'breath_work'];

  // W14: inject evidence.standing for opening_hole_delta. Standing rows
  // for this metric are written by W24 WarmupHoleGenerator — until then
  // the helper returns null and this is a no-op.
  const warmupStanding = await loadStandingForInsightEvidence(playerId, 'opening_hole_delta');
  mergeStandingIntoEvidence(evidence, warmupStanding);

  try {
    const insightId = await upsertInsight(supabase, {
      player_id: playerId,
      category: 'course_management',
      signature: `${playerId}:course_warmup:hole_1`,
      title,
      content,
      evidence,
      drill_tags: drillTags,
    });
    if (insightId !== GATED_OUT) {
      await attachDrills(supabase, insightId, 'course_management', drillTags);
    }
  } catch (err) {
    await logServerError('course-management.warmup.upsert_failed', {
      action: 'generateWarmupHoleInsight',
      featureArea: 'coachhelm/v2/mining/course-management',
      source: 'background_job',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}

// ---------------------------------------------------------------------------
// Test exports
// ---------------------------------------------------------------------------

export const __internal = {
  WORST_HOLES_WINDOW_DAYS,
  WORST_HOLES_MIN_ROUNDS,
  WORST_HOLES_MIN_AVG_OVER_PAR,
  WORST_HOLES_TOP_N,
  WARMUP_WINDOW_DAYS,
  WARMUP_MIN_HOLE_1_PLAYS,
  WARMUP_MIN_GAP_STROKES,
  aggregateCourseHoles,
  aggregateWarmup,
  detectPattern,
};
