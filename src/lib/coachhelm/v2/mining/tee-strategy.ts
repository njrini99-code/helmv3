/**
 * generateTeeStrategyInsights — Group B3
 *
 * Design contract: docs/superpowers/plans/2026-04-22-insight-quality/00-design-contract.md
 *
 * Reads `golf_shots WHERE shot_type='tee'` joined to `golf_holes.par` +
 * `golf_holes.yardage` + `golf_holes.fairway_hit` (par-3s excluded) and
 * compares driver vs non-driver on par-4/5 tees.
 *
 *   Emit when:
 *     driver_attempts >= 15 AND non_driver_attempts >= 8.
 *     (a) Driver laggy   — driver.fw_pct < non_driver.fw_pct - 15pp AND
 *                          driver_distance - non_driver_distance < 35yd
 *     (b) Driver sharp   — driver.fw_pct >= non_driver.fw_pct - 5pp
 *
 * Category: course_management.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerError } from '@/lib/server-error-logger';
import { upsertInsight, attachDrills, GATED_OUT } from '../insights/upsert';
import type { InsightEvidence } from '../insights/types';
import { calcConfidence } from '../insights/types';
// W14: hook for future standing injection. No clean v3 metric_id maps
// to driver-vs-layback decision quality today — W23 TeeStrategyGenerator
// will define the right metric and write standing rows.
import { loadStandingForInsightEvidence as _loadStandingForTeeStrategy } from '../insights/standing-injection';

type Supabase = SupabaseClient<Database>;

const WINDOW_DAYS = 90;
const MIN_DRIVER_ATTEMPTS = 15;
const MIN_NON_DRIVER_ATTEMPTS = 8;
const LAYBACK_FW_GAP = 0.15; // driver has to be >= 15pp worse on fairway%
const LAYBACK_DISTANCE_GAP = 35; // ...and only ~<35yd longer
const SHARP_FW_GAP = -0.05; // driver is within 5pp of non-driver → sharp

type TeeClub = 'driver' | 'non_driver';

interface TeeShotRow {
  club: TeeClub;
  // null = no fairway result recorded for the hole; must NOT be counted as a
  // miss (canonical fairway denominator is par-4/5 holes with fairway_hit
  // recorded). Preserve null so the denominator excludes it.
  fairwayHit: boolean | null;
  shotDistance: number | null; // yards, derived from hole_yardage - distance_to_hole_after
}

interface TeeGroupStats {
  club: TeeClub;
  attempts: number; // tee shots with a RECORDED fairway result (fairway denominator)
  fwHit: number;
  fwPct: number | null; // null when no recorded fairway results (no data, not 0%)
  avgDistance: number;
  stddevDistance: number;
}

interface TeeComparison {
  driver: TeeGroupStats;
  nonDriver: TeeGroupStats;
}

/**
 * Main entry — computes tee-club stats and emits either the layback or
 * sharp-driver insight when qualifying.
 */
export async function generateTeeStrategyInsights(
  playerId: string,
): Promise<void> {
  const supabase = createAdminClient();
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd);
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);

  try {
    const rows = await fetchTeeShots(supabase, playerId, windowStart);
    if (rows.length === 0) return;

    const driver = summarizeGroup(rows, 'driver');
    const nonDriver = summarizeGroup(rows, 'non_driver');

    if (
      driver.attempts < MIN_DRIVER_ATTEMPTS ||
      nonDriver.attempts < MIN_NON_DRIVER_ATTEMPTS
    ) {
      return;
    }

    const windowStartIso = windowStart.toISOString().slice(0, 10);
    const windowEndIso = windowEnd.toISOString().slice(0, 10);

    await emitComparison(
      supabase,
      playerId,
      { driver, nonDriver },
      windowStartIso,
      windowEndIso,
    );
  } catch (error) {
    await logServerError(
      'generateTeeStrategyInsights failed',
      {
        action: 'generateTeeStrategyInsights',
        featureArea: 'coachhelm/v2/mining/tee-strategy',
        source: 'background_job',
        playerId,
      },
      'error',
    ).catch(() => {
      /* never throw from the logger itself */
    });
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/* -------------------------------------------------------------------------- */
/*  Data access                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Shape of the joined row. We start from golf_shots since we need the
 * shot_type='tee' filter and club_type column, then join up to rounds for
 * the date + player filter and to holes for par/fairway_hit/yardage.
 */
interface JoinedRow {
  club_type: string | null;
  distance_to_hole_before: number | null;
  distance_to_hole_after: number | null;
  shot_distance: number | null;
  golf_rounds: {
    player_id: string | null;
    round_date: string | null;
  } | null;
  golf_holes: {
    par: number | null;
    yardage: number | null;
    fairway_hit: boolean | null;
  } | null;
}

async function fetchTeeShots(
  supabase: Supabase,
  playerId: string,
  windowStart: Date,
): Promise<TeeShotRow[]> {
  const windowStartIso = windowStart.toISOString().slice(0, 10);

  const { data, error } = await fetchAllRowsResult((from, to) => supabase
    .from('golf_shots')
    .select(
      `
      club_type,
      distance_to_hole_before,
      distance_to_hole_after,
      shot_distance,
      golf_rounds!inner (
        player_id,
        round_date
      ),
      golf_holes!inner (
        par,
        yardage,
        fairway_hit
      )
    `,
    )
    .eq('shot_type', 'tee')
    .eq('golf_rounds.player_id', playerId)
    .gte('golf_rounds.round_date', windowStartIso)
    .order('id', { ascending: true })
    .range(from, to)); // paginate past PostgREST 1000-row cap

  if (error) {
    throw new Error(`tee-strategy.fetchTeeShots failed: ${error.message}`);
  }
  if (!data) return [];

  const typed = data as unknown as JoinedRow[];

  const rows: TeeShotRow[] = [];
  for (const r of typed) {
    const hole = r.golf_holes;
    const round = r.golf_rounds;
    if (!hole || !round) continue;
    if (hole.par === 3) continue;
    if (r.club_type !== 'driver' && r.club_type !== 'non_driver') continue;

    rows.push({
      club: r.club_type,
      fairwayHit: hole.fairway_hit ?? null,
      shotDistance: deriveShotDistance(r),
    });
  }
  return rows;
}

/**
 * Prefer the recorded shot_distance. Fall back to hole yardage minus
 * distance-to-hole-after when shot_distance is null but yardage is present.
 */
function deriveShotDistance(row: JoinedRow): number | null {
  if (typeof row.shot_distance === 'number') return row.shot_distance;
  const yardage = row.golf_holes?.yardage ?? null;
  const after = row.distance_to_hole_after ?? null;
  if (typeof yardage === 'number' && typeof after === 'number') {
    return yardage - after;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Aggregation                                                               */
/* -------------------------------------------------------------------------- */

function summarizeGroup(rows: TeeShotRow[], club: TeeClub): TeeGroupStats {
  const group = rows.filter((r) => r.club === club);
  // Fairway denominator = tee shots with a RECORDED fairway result. Shots with
  // a null fairway_hit are excluded (not counted as misses).
  const recorded = group.filter((r) => r.fairwayHit !== null);
  const attempts = recorded.length;
  const fwHit = recorded.filter((r) => r.fairwayHit === true).length;
  // Distance is independent of fairway recording — use every tee shot.
  const distances = group
    .map((r) => r.shotDistance)
    .filter((d): d is number => typeof d === 'number' && Number.isFinite(d));

  const avgDistance =
    distances.length > 0
      ? distances.reduce((a, b) => a + b, 0) / distances.length
      : 0;
  const variance =
    distances.length > 0
      ? distances.reduce((acc, d) => acc + (d - avgDistance) ** 2, 0) /
        distances.length
      : 0;

  return {
    club,
    attempts,
    fwHit,
    fwPct: attempts > 0 ? fwHit / attempts : null,
    avgDistance,
    stddevDistance: Math.sqrt(variance),
  };
}

/* -------------------------------------------------------------------------- */
/*  Emission                                                                  */
/* -------------------------------------------------------------------------- */

async function emitComparison(
  supabase: Supabase,
  playerId: string,
  comparison: TeeComparison,
  windowStart: string,
  windowEnd: string,
): Promise<void> {
  const { driver, nonDriver } = comparison;
  // Both groups must have recorded fairway results to compare accuracy.
  if (driver.fwPct === null || nonDriver.fwPct === null) return;
  const fwGap = driver.fwPct - nonDriver.fwPct; // negative when driver worse
  const distGap = driver.avgDistance - nonDriver.avgDistance; // positive when driver longer

  const laggyDriver = fwGap <= -LAYBACK_FW_GAP && distGap < LAYBACK_DISTANCE_GAP;
  const sharpDriver = fwGap >= SHARP_FW_GAP;

  if (!laggyDriver && !sharpDriver) return;

  const mode: 'layback' | 'sharp' = laggyDriver ? 'layback' : 'sharp';

  const yourValue = driver.fwPct;
  const comparisonValue = nonDriver.fwPct;
  const strokesImpact =
    mode === 'layback'
      ? Number((Math.abs(fwGap) * 2).toFixed(2))
      : Number((Math.max(0, fwGap) * 1.5).toFixed(2));

  const evidence: InsightEvidence = {
    metric: 'tee_strategy_driver_vs_layback',
    metric_label: 'Driver fairway % vs non-driver fairway %',
    unit: 'percent',
    your_value: Number(yourValue.toFixed(3)),
    your_value_display: `${Math.round(yourValue * 100)}%`,
    comparison_value: Number(comparisonValue.toFixed(3)),
    comparison_label: 'Your non-driver tee fairway %',
    comparison_source: 'your_baseline',
    sample_n: driver.attempts + nonDriver.attempts,
    window_days: WINDOW_DAYS,
    window_start: windowStart,
    window_end: windowEnd,
    strokes_impact: strokesImpact,
    strokes_impact_method: 'historical_correlation',
    confidence: 0,
    confidence_factors: {
      sample_adequacy: Math.min(
        (driver.attempts + nonDriver.attempts) / 40,
        1,
      ),
      recency: 1,
      // Treat dispersion as a confidence dial: smaller stddev → more variance
      // trust. Cap driver dispersion at 50yd for the ratio.
      variance: clamp01(1 - driver.stddevDistance / 50),
    },
    detail: {
      mode,
      driver: {
        attempts: driver.attempts,
        fw_hit: driver.fwHit,
        fw_pct: Number(driver.fwPct.toFixed(3)),
        avg_distance_yd: Number(driver.avgDistance.toFixed(1)),
        stddev_distance_yd: Number(driver.stddevDistance.toFixed(1)),
      },
      non_driver: {
        attempts: nonDriver.attempts,
        fw_hit: nonDriver.fwHit,
        fw_pct: Number(nonDriver.fwPct.toFixed(3)),
        avg_distance_yd: Number(nonDriver.avgDistance.toFixed(1)),
        stddev_distance_yd: Number(nonDriver.stddevDistance.toFixed(1)),
      },
      fw_gap_pct: Number(fwGap.toFixed(3)),
      distance_gap_yd: Number(distGap.toFixed(1)),
    },
  };
  evidence.confidence = calcConfidence(evidence);

  const title =
    mode === 'layback'
      ? 'Layback club is finding more fairways than your driver'
      : 'Driver is your most accurate tee club';

  const content =
    mode === 'layback'
      ? (`Over the last ${WINDOW_DAYS} days you hit ${Math.round(
          driver.fwPct * 100,
        )}% of fairways on ${driver.attempts} driver attempts vs ` +
        `${Math.round(nonDriver.fwPct * 100)}% on ${nonDriver.attempts} non-driver ` +
        `tees — a ${Math.abs(Math.round(fwGap * 100))}-point accuracy gap for only ` +
        `${Math.round(distGap)} extra yards. On tight holes where par is already ` +
        `comfortable, the layback profile scores better.`)
      : (`Over the last ${WINDOW_DAYS} days you hit ${Math.round(
          driver.fwPct * 100,
        )}% of fairways on ${driver.attempts} driver attempts, within ` +
        `${Math.abs(Math.round(fwGap * 100))} points of your non-driver clubs ` +
        `(${Math.round(nonDriver.fwPct * 100)}% on ${nonDriver.attempts} tees) ` +
        `while averaging ${Math.round(distGap)} more yards. Keep the driver in ` +
        `hand — you don't give up accuracy for the distance you gain.`);

  const drillTags = ['course_management', 'tee_strategy', 'risk_reward'];

  const insightId = await upsertInsight(supabase, {
    player_id: playerId,
    category: 'course_management',
    signature: `${playerId}:tee_strategy:driver_vs_layback`,
    title,
    content,
    evidence,
    drill_tags: drillTags,
  });
  // Skip drill attach when the philosophy gate suppressed the write —
  // passing GATED_OUT to attachDrills sends '__gated_out__' to a uuid
  // column and the insert blows up.
  if (insightId === GATED_OUT) return;
  await attachDrills(supabase, insightId, 'course_management', drillTags);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
