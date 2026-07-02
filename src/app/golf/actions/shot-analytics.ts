'use server';

/**
 * Shot Analytics Server Actions
 *
 * Aggregates shot-level data into actionable analytics for visualization.
 * Provides percentage-based miss patterns, shot type breakdowns, and trend analysis.
 */

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { logServerError } from '@/lib/server-error-logger';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { withAdminObserved } from '@/lib/admin/observed-action';

// ============================================================================
// INPUT VALIDATION
// ============================================================================

const shotAnalyticsSchema = z.object({
  playerId: z.string().uuid('Invalid player ID format'),
  periodDays: z.number().int().min(1).max(365).default(30),
});

// ============================================================================
// TYPES
// ============================================================================

export interface MissPatternData {
  direction: string;
  percentage: number | null; // null = no data (empty denominator)
  count: number;
}

export interface ShotTypeStats {
  shotType: string;
  label: string;
  totalShots: number;
  successRate: number | null;
  missPatterns: MissPatternData[];
}

export interface DistanceRangeAnalytics {
  range: string;
  rangeLabel: string;
  totalShots: number;
  avgProximity: number;
  greenHitRate: number | null;
  primaryMiss: string;
  missBreakdown: MissPatternData[];
}

export interface PuttingAnalytics {
  totalPutts: number;
  onePuttRate: number | null;
  twoPuttRate: number | null;
  threePuttRate: number | null;
  avgPuttsPerRound: number;
  inside5ft: { attempts: number; made: number; pct: number | null };
  fiveTo10ft: { attempts: number; made: number; pct: number | null };
  outside10ft: { attempts: number; made: number; pct: number | null };
  missTendencies: {
    low: number | null;
    high: number | null;
    short: number | null;
  };
}

export interface TeeStats {
  totalDrives: number;
  fairwayPct: number | null;
  leftMissPct: number | null;
  rightMissPct: number | null;
  avgDrivingDistance: number | null;
}

export interface ApproachStats {
  totalApproaches: number;
  girPct: number | null;
  missBreakdown: {
    short: number | null;
    long: number | null;
    left: number | null;
    right: number | null;
    short_left: number | null;
    short_right: number | null;
    long_left: number | null;
    long_right: number | null;
  };
  avgProximity: number | null;
}

export interface AroundGreenStats {
  totalShots: number;
  upAndDownPct: number | null;
  sandSavePct: number | null;
  missBreakdown: MissPatternData[];
}

export interface TrendData {
  metric: string;
  currentValue: number;
  previousValue: number;
  changePercent: number;
  direction: 'up' | 'down' | 'flat';
  isImprovement: boolean;
}

export interface PlayerShotAnalytics {
  playerId: string;
  playerName: string;
  analyzedAt: string;
  periodDays: number;
  roundsAnalyzed: number;

  // Core stats
  teeStats: TeeStats;
  approachStats: ApproachStats;
  aroundGreenStats: AroundGreenStats;
  puttingStats: PuttingAnalytics;

  // Distance range breakdown
  distanceRanges: DistanceRangeAnalytics[];

  // Trends vs previous period
  trends: TrendData[];

  // AI insights
  insights: string[];
  primaryWeakness: string;
  primaryStrength: string;
}

// Types for database query results
interface RoundRow {
  id: string;
  round_date: string;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  total_score: number | null;
  holes_played: number | null;
}

interface HoleRow {
  id: string;
  round_id: string;
  hole_number: number;
  par: number;
  score: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  gir: boolean | null;
  up_and_down: boolean | null;
  sand_save: boolean | null;
}

interface ShotRow {
  id: string;
  round_id: string;
  hole_number: number;
  shot_number: number;
  shot_type: string | null;
  club_type: string | null;
  lie_before: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  shot_distance: number | null;
  miss_direction: string | null;
  result: string | null;
  putt_distance_feet: number | null;
  putt_made: boolean | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Canonical percentage: null on an empty denominator ("no data", rendered as
// "—"), else 1dp. Mirrors stat-formulas.pct(). A distribution part that is
// genuinely 0 of a populated total still reads 0 (correct); only total<=0 is null.
function calculatePercentage(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 1000) / 10; // One decimal place
}

function toYards(distance: number | null, unit: string | null): number | null {
  if (distance == null) return null;
  return unit === 'feet' ? distance / 3 : distance;
}

function toFeet(distance: number | null, unit: string | null): number | null {
  if (distance == null) return null;
  return unit === 'yards' ? distance * 3 : distance;
}

 
function determineTrend(current: number, previous: number, _higherIsBetter: boolean): TrendData['direction'] {
  const diff = current - previous;
  const threshold = 0.5; // 0.5% threshold for "flat"

  if (Math.abs(diff) < threshold) return 'flat';
  return diff > 0 ? 'up' : 'down';
}

function isImprovement(direction: TrendData['direction'], higherIsBetter: boolean): boolean {
  if (direction === 'flat') return false;
  return higherIsBetter ? direction === 'up' : direction === 'down';
}

// ============================================================================
// MAIN ANALYTICS ACTION
// ============================================================================

async function getPlayerShotAnalyticsImpl(
  playerId: string,
  periodDays: number = 30
): Promise<{ success: true; data: PlayerShotAnalytics } | { success: false; error: string }> {
  try {
    // Validate input
    const validated = shotAnalyticsSchema.safeParse({ playerId, periodDays });
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0]?.message || 'Invalid input' };
    }

    const supabase = await createClient();

    // Verify user has access to this player (multi-team-safe shared helper).
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }
    const access = await verifyPlayerAccess(validated.data.playerId, user.id, supabase);
    if (!access.allowed) {
      return { success: false, error: 'Not authorized to access this player' };
    }

    // Get player info
    const { data: player } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .eq('id', validated.data.playerId)
      .single();

    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim();

    // Calculate date ranges
    const now = new Date();
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const previousPeriodStart = new Date(periodStart.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Get rounds from current period
    const { data: roundsData } = await supabase
      .from('golf_rounds')
      .select('id, round_date, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, total_score, holes_played')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .gte('round_date', periodStart.toISOString().split('T')[0])
      .order('round_date', { ascending: false });

    const rounds = (roundsData || []) as RoundRow[];

    // Get rounds from previous period for trends
    const { data: previousRoundsData } = await supabase
      .from('golf_rounds')
      .select('id, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, holes_played')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .gte('round_date', previousPeriodStart.toISOString().split('T')[0])
      .lt('round_date', periodStart.toISOString().split('T')[0]);

    const previousRounds = (previousRoundsData || []) as RoundRow[];

    if (rounds.length === 0) {
      return { success: false, error: 'No rounds found in the selected period' };
    }

    const roundIds = rounds.map(r => r.id);

    // Get holes data
    const { data: holesData } = await fetchAllRowsResult((from, to) => supabase
      .from('golf_holes')
      .select(`
        id, round_id, hole_number, par, score, putts,
        fairway_hit, gir, up_and_down, sand_save
      `)
      .in('round_id', roundIds)
      .order('id', { ascending: true })
      .range(from, to)); // paginate past PostgREST 1000-row cap

    const holes = (holesData || []) as HoleRow[];

    // Get shot-level data
    const { data: shotsData } = await fetchAllRowsResult((from, to) => supabase
      .from('golf_shots')
      .select(`
        id, round_id, hole_number, shot_number, shot_type, club_type,
        lie_before, distance_to_hole_before, distance_unit_before,
        distance_to_hole_after, distance_unit_after, shot_distance,
        miss_direction, result, putt_distance_feet, putt_made
      `)
      .in('round_id', roundIds)
      .order('id', { ascending: true })
      .range(from, to)); // paginate past PostgREST 1000-row cap

    const shots = (shotsData || []) as ShotRow[];

    // ========================================================================
    // CALCULATE TEE STATS
    // ========================================================================

    const par4And5Holes = holes.filter(h => h.par >= 4);
    const totalDrives = par4And5Holes.length;
    const fairwaysHit = par4And5Holes.filter(h => h.fairway_hit === true).length;
    // Fairway% denominator = par-4/5 holes with a RECORDED fairway result (canonical;
    // counting every par-4/5 incl. unrecorded holes deflates accuracy — STAGE 3).
    const fairwaysTotal = par4And5Holes.filter(h => h.fairway_hit != null).length;

    // Build a lookup of par 4+ holes to exclude par 3 tee shots from drive stats
    const par4PlusHoleKeys = new Set(
      par4And5Holes.map(h => `${h.round_id}:${h.hole_number}`)
    );

    // Get miss directions from shots (drive shots on par 4+ holes only)
    const driveShots = shots.filter(s =>
      (s.shot_type === 'drive' || s.shot_type === 'tee' || s.shot_number === 1) &&
      par4PlusHoleKeys.has(`${s.round_id}:${s.hole_number}`)
    );
    const leftMisses = driveShots.filter(s => s.miss_direction?.toLowerCase().includes('left')).length;
    const rightMisses = driveShots.filter(s => s.miss_direction?.toLowerCase().includes('right')).length;
    // Miss-direction % denominator = tagged directional misses (left+right), NOT the
    // missed-fairway count. Mirrors golf-stats-calculator-shots.ts so the two L/R bars
    // sum to ~100% of tagged misses and match the player Stats tab. Untagged misses must
    // not dilute it. calculatePercentage returns 0 when total===0 (no-tag players safe).
    const directionalMisses = leftMisses + rightMisses;

    // Get driving distances from shots (par 4+ only)
    const drivingDistances = driveShots
      .map((shot) => {
        if (shot.shot_distance != null) return shot.shot_distance;
        const before = toYards(shot.distance_to_hole_before, shot.distance_unit_before);
        const after = toYards(shot.distance_to_hole_after, shot.distance_unit_after);
        if (before == null || after == null) return null;
        return Math.max(0, before - after);
      })
      .filter((distance): distance is number => distance != null && distance > 0);

    const teeStats: TeeStats = {
      totalDrives,
      fairwayPct: calculatePercentage(fairwaysHit, fairwaysTotal),
      leftMissPct: calculatePercentage(leftMisses, directionalMisses),
      rightMissPct: calculatePercentage(rightMisses, directionalMisses),
      avgDrivingDistance: drivingDistances.length > 0
        ? Math.round(drivingDistances.reduce((a, b) => a + b, 0) / drivingDistances.length)
        : null,
    };

    // ========================================================================
    // CALCULATE APPROACH STATS
    // ========================================================================

    const approachShots = shots.filter(s => s.shot_type === 'approach' || s.shot_type === 'iron');
    // Only count holes where GIR was actually evaluated (not null) — incomplete rounds won't inflate the denominator
    const girEvaluatedHoles = holes.filter(h => h.gir !== null).length;
    const girHoles = holes.filter(h => h.gir === true).length;

    // Count miss directions
    const approachMissCounts = {
      short: 0, long: 0, left: 0, right: 0,
      short_left: 0, short_right: 0, long_left: 0, long_right: 0,
    };

    // Approach miss-direction denominator/granularity must MATCH the player Stats-tab
    // calculator (golf-stats-calculator-shots.ts :904, :947, :1730): one miss per
    // missed-green hole, taken from the GIR-attempt approach shot — NOT every approach/iron
    // shot. Counting per-shot inflated the denominator (multiple shots/hole) and diverged
    // from the Stats tab. Build a per-hole pass that selects the GIR-attempt shot
    // (shot_number === max(par-2,1), reassigned to an earlier green-finder for par-5 eagle
    // attempts) and only counts its miss_direction when that shot did NOT find the green.
    const isGreenFinish = (result: string | null): boolean =>
      result === 'green' || result === 'hole' || result === 'gir';

    // Index shots by hole so we can resolve the GIR-attempt shot per hole.
    const shotsByHole = new Map<string, ShotRow[]>();
    for (const s of shots) {
      const key = `${s.round_id}:${s.hole_number}`;
      const list = shotsByHole.get(key);
      if (list) list.push(s);
      else shotsByHole.set(key, [s]);
    }

    let totalApproachMissesCount = 0;
    for (const hole of holes) {
      // Only missed greens contribute an approach miss (mirror !greenInRegulation gate).
      if (hole.gir === true) continue;

      const holeShots = shotsByHole.get(`${hole.round_id}:${hole.hole_number}`);
      if (!holeShots || holeShots.length === 0) continue;

      const girAttemptShotNumber = Math.max(hole.par - 2, 1);
      const shotToGreen = holeShots.find(s => isGreenFinish(s.result));
      let approachShot = holeShots.find(s => s.shot_number === girAttemptShotNumber);
      // Hit green earlier (e.g. par-5 eagle attempt): use that shot instead.
      if (shotToGreen && shotToGreen.shot_number < girAttemptShotNumber) {
        approachShot = shotToGreen;
      }
      // Fall back to the green-finding shot if no shot exists at the GIR-attempt position.
      if (!approachShot && shotToGreen) {
        approachShot = shotToGreen;
      }
      if (!approachShot) continue;

      // Only a missed-green GIR attempt with a tagged direction counts.
      if (isGreenFinish(approachShot.result) || !approachShot.miss_direction) continue;

      const normalized = approachShot.miss_direction.toLowerCase().replace('-', '_');
      if (normalized in approachMissCounts) {
        approachMissCounts[normalized as keyof typeof approachMissCounts]++;
        totalApproachMissesCount++;
      }
    }

    const totalApproachMisses = totalApproachMissesCount || 1;

    // ON-GREEN ONLY: proximity is a green-surface distance (feet). A missed approach
    // finishes off-green (stored in yards) and toFeet would ×3 it — the unit-blend that
    // inflated this stat ~2×. Only approaches that found the green contribute; girPct
    // above is the reach signal for the misses.
    const approachProximities = approachShots
      .filter(s => s.result === 'green' || s.result === 'hole' || s.result === 'gir')
      .map(s => toFeet(s.distance_to_hole_after, s.distance_unit_after))
      .filter((distance): distance is number => distance != null && distance > 0);

    const totalApproaches = Math.max(girEvaluatedHoles, approachShots.length);

    const approachStats: ApproachStats = {
      totalApproaches,
      girPct: calculatePercentage(girHoles, girEvaluatedHoles),
      missBreakdown: {
        short: calculatePercentage(approachMissCounts.short, totalApproachMisses),
        long: calculatePercentage(approachMissCounts.long, totalApproachMisses),
        left: calculatePercentage(approachMissCounts.left, totalApproachMisses),
        right: calculatePercentage(approachMissCounts.right, totalApproachMisses),
        short_left: calculatePercentage(approachMissCounts.short_left, totalApproachMisses),
        short_right: calculatePercentage(approachMissCounts.short_right, totalApproachMisses),
        long_left: calculatePercentage(approachMissCounts.long_left, totalApproachMisses),
        long_right: calculatePercentage(approachMissCounts.long_right, totalApproachMisses),
      },
      avgProximity: approachProximities.length > 0
        ? Math.round(approachProximities.reduce((a, b) => a + b, 0) / approachProximities.length)
        : null,
    };

    // ========================================================================
    // CALCULATE AROUND GREEN STATS
    // ========================================================================

    const upAndDownAttempts = holes.filter(h => h.up_and_down !== null).length;
    const upAndDownsMade = holes.filter(h => h.up_and_down === true).length;
    // CANON greenside up-and-down: a sand save can only occur on a MISSED green. Gate the
    // Sand-save denominator = every greenside-bunker visit (sand_save IS NOT NULL),
    // matching the DB cache (refresh_player_stats_cache) and the shot-level ground
    // truth. Do NOT gate on gir === false: verified 2026-06-06 that the cache's
    // ungated count (team 248) exactly equals the shot-level greenside-bunker-visit
    // count (248). A greenside-bunker visit is a sand-save opportunity even when the
    // hole is (correctly) GIR — e.g. a par-5 where the regulation 3rd shot is played
    // from a greenside bunker onto the green is both a bunker visit AND a legit GIR;
    // the old gir gate silently dropped those real bunker visits. (sand_save is the
    // user-entered up-and-down result; it's never set without a real bunker shot.)
    const sandSaveAttempts = holes.filter(h => h.sand_save !== null).length;
    const sandSavesMade = holes.filter(h => h.sand_save === true).length;

    const aroundGreenShots = shots.filter(s => s.shot_type === 'around_green' || s.shot_type === 'chip' || s.shot_type === 'pitch');
    const aroundGreenMisses: Record<string, number> = {};

    aroundGreenShots.forEach(s => {
      if (s.miss_direction) {
        const dir = s.miss_direction.toLowerCase();
        aroundGreenMisses[dir] = (aroundGreenMisses[dir] || 0) + 1;
      }
    });

    const totalAroundGreenMisses = Object.values(aroundGreenMisses).reduce((a, b) => a + b, 0) || 1;

    const aroundGreenStats: AroundGreenStats = {
      // Single coherent shot-level count for the "X shots" label — do NOT add the
      // up-and-down hole count, which overlaps with these shots and is dimensionally
      // mismatched (a hole count vs a shot count). Matches ShotTypeBreakdown.tsx wording.
      totalShots: aroundGreenShots.length,
      upAndDownPct: calculatePercentage(upAndDownsMade, upAndDownAttempts),
      sandSavePct: calculatePercentage(sandSavesMade, sandSaveAttempts),
      missBreakdown: Object.entries(aroundGreenMisses)
        .map(([direction, count]) => ({
          direction,
          percentage: calculatePercentage(count, totalAroundGreenMisses),
          count,
        }))
        .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0)),
    };

    // ========================================================================
    // CALCULATE PUTTING STATS
    // ========================================================================

    const allHolesWithPutts = holes.filter(h => h.putts != null);
    const totalPutts = allHolesWithPutts.reduce((sum, h) => sum + (h.putts || 0), 0);
    const onePutts = allHolesWithPutts.filter(h => h.putts === 1).length;
    const twoPutts = allHolesWithPutts.filter(h => h.putts === 2).length;
    const threePlusPutts = allHolesWithPutts.filter(h => (h.putts || 0) >= 3).length;
    const holesWithPutts = allHolesWithPutts.length || 1;

    // Putts/round — HOLE-WEIGHTED: (sum putts ÷ sum holes played) × 18, matching
    // the canonical cache (update_player_stats_complete), the personal stats page,
    // and dashboard-data.ts. A mean of per-round normalized values over-weights
    // short rounds; the hole-weighted form treats every hole equally.
    const normalizedPuttsPerRound = (rs: RoundRow[]): number => {
      let putts = 0;
      let holes = 0;
      for (const r of rs) {
        if (r.total_putts != null) {
          putts += r.total_putts;
          holes += r.holes_played ?? 18;
        }
      }
      return holes > 0 ? (putts / holes) * 18 : 0;
    };
    const avgPuttsPerRound = normalizedPuttsPerRound(rounds);

    // Distance-based putting stats from golf_shots
    const puttsByDistance = {
      inside5ft: { attempts: 0, made: 0 },
      fiveTo10ft: { attempts: 0, made: 0 },
      outside10ft: { attempts: 0, made: 0 },
    };

    const puttShots = shots.filter(s => s.shot_type === 'putt' || s.shot_type === 'putting');

    puttShots.forEach(p => {
      const dist = p.putt_distance_feet ?? toFeet(p.distance_to_hole_before, p.distance_unit_before);
      const made = p.putt_made ?? p.result === 'hole';
      if (dist != null) {
        if (dist <= 5) {
          puttsByDistance.inside5ft.attempts++;
          if (made) puttsByDistance.inside5ft.made++;
        } else if (dist <= 10) {
          puttsByDistance.fiveTo10ft.attempts++;
          if (made) puttsByDistance.fiveTo10ft.made++;
        } else {
          puttsByDistance.outside10ft.attempts++;
          if (made) puttsByDistance.outside10ft.made++;
        }
      }
    });

    // Putt miss tendencies from shots
    const puttMissTendencies = { low: 0, high: 0, short: 0 };
    const missedPuttShots = puttShots.filter(p => (p.putt_made ?? p.result === 'hole') === false);

    missedPuttShots.forEach(p => {
      if (p.miss_direction) {
        const dir = p.miss_direction.toLowerCase();
        if (dir.includes('low')) puttMissTendencies.low++;
        if (dir.includes('high')) puttMissTendencies.high++;
        if (dir.includes('short')) puttMissTendencies.short++;
      }
    });

    const totalMissedPutts = missedPuttShots.length || 1;

    const puttingStats: PuttingAnalytics = {
      totalPutts,
      onePuttRate: calculatePercentage(onePutts, holesWithPutts),
      twoPuttRate: calculatePercentage(twoPutts, holesWithPutts),
      threePuttRate: calculatePercentage(threePlusPutts, holesWithPutts),
      avgPuttsPerRound: Math.round(avgPuttsPerRound * 10) / 10,
      inside5ft: {
        attempts: puttsByDistance.inside5ft.attempts,
        made: puttsByDistance.inside5ft.made,
        pct: calculatePercentage(puttsByDistance.inside5ft.made, puttsByDistance.inside5ft.attempts),
      },
      fiveTo10ft: {
        attempts: puttsByDistance.fiveTo10ft.attempts,
        made: puttsByDistance.fiveTo10ft.made,
        pct: calculatePercentage(puttsByDistance.fiveTo10ft.made, puttsByDistance.fiveTo10ft.attempts),
      },
      outside10ft: {
        attempts: puttsByDistance.outside10ft.attempts,
        made: puttsByDistance.outside10ft.made,
        pct: calculatePercentage(puttsByDistance.outside10ft.made, puttsByDistance.outside10ft.attempts),
      },
      missTendencies: {
        low: calculatePercentage(puttMissTendencies.low, totalMissedPutts),
        high: calculatePercentage(puttMissTendencies.high, totalMissedPutts),
        short: calculatePercentage(puttMissTendencies.short, totalMissedPutts),
      },
    };

    // ========================================================================
    // CALCULATE DISTANCE RANGE ANALYTICS
    // ========================================================================

    const distanceRanges = [
      { min: 0, max: 50, label: 'Wedge (0-50y)' },
      { min: 50, max: 100, label: 'Short (50-100y)' },
      { min: 100, max: 130, label: 'Mid-Short (100-130y)' },
      { min: 130, max: 160, label: 'Mid (130-160y)' },
      { min: 160, max: 190, label: 'Mid-Long (160-190y)' },
      { min: 190, max: 250, label: 'Long (190+y)' },
    ];

    const distanceRangeAnalytics: DistanceRangeAnalytics[] = distanceRanges.map(range => {
      const rangeShots = shots.filter(s => {
        const dist = toYards(s.distance_to_hole_before, s.distance_unit_before);
        return dist != null && dist >= range.min && dist < range.max && s.shot_type !== 'putting' && s.shot_type !== 'putt' && s.shot_type !== 'drive' && s.shot_type !== 'tee';
      });

      const greenHits = rangeShots.filter(s => s.result === 'green' || s.result === 'hole' || s.result === 'gir').length;
      // Proximity is an ON-GREEN distance (stored in FEET). A missed shot finishes off-green
      // (stored in YARDS); blending the two via toFeet (×3 only when yards) mixed units and
      // inflated this up to ~15×. Restrict to on-green finishes before averaging — mirrors
      // the approachStats fix above so everything is feet, never feet+yards.
      const proximities = rangeShots
        .filter(s => s.result === 'green' || s.result === 'hole' || s.result === 'gir')
        .map(s => toFeet(s.distance_to_hole_after, s.distance_unit_after))
        .filter((distance): distance is number => distance != null && distance > 0);

      const missBreakdown: Record<string, number> = {};
      rangeShots.forEach(s => {
        if (s.miss_direction) {
          const dir = s.miss_direction.toLowerCase();
          missBreakdown[dir] = (missBreakdown[dir] || 0) + 1;
        }
      });

      const totalMisses = Object.values(missBreakdown).reduce((a, b) => a + b, 0) || 1;
      const sortedMisses = Object.entries(missBreakdown)
        .map(([direction, count]) => ({
          direction,
          percentage: calculatePercentage(count, totalMisses),
          count,
        }))
        .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0));

      return {
        range: `${range.min}-${range.max}`,
        rangeLabel: range.label,
        totalShots: rangeShots.length,
        avgProximity: proximities.length > 0
          ? Math.round(proximities.reduce((a, b) => a + b, 0) / proximities.length)
          : 0,
        greenHitRate: calculatePercentage(greenHits, rangeShots.length),
        primaryMiss: sortedMisses[0]?.direction || 'none',
        missBreakdown: sortedMisses,
      };
    }).filter(r => r.totalShots >= 3); // Only include ranges with enough data

    // ========================================================================
    // CALCULATE TRENDS
    // ========================================================================

    const trends: TrendData[] = [];

    if (previousRounds.length > 0) {
      // Fairway percentage trend
      const prevFairwaysHit = previousRounds.reduce((sum, r) => sum + (r.total_fairways_hit || 0), 0);
      const prevFairwaysTotal = previousRounds.reduce((sum, r) => sum + (r.total_fairways || 0), 0);
      const prevFairwayPct = calculatePercentage(prevFairwaysHit, prevFairwaysTotal);

      if (prevFairwayPct !== null && teeStats.fairwayPct !== null) {
        const fwyDirection = determineTrend(teeStats.fairwayPct, prevFairwayPct, true);
        trends.push({
          metric: 'Fairway %',
          currentValue: teeStats.fairwayPct,
          previousValue: prevFairwayPct,
          changePercent: Math.round((teeStats.fairwayPct - prevFairwayPct) * 10) / 10,
          direction: fwyDirection,
          isImprovement: isImprovement(fwyDirection, true),
        });
      }

      // GIR trend
      const prevGirHit = previousRounds.reduce((sum, r) => sum + (r.total_gir || 0), 0);
      const prevGirTotal = previousRounds.reduce((sum, r) => sum + (r.total_gir_possible || 0), 0);
      const prevGirPct = calculatePercentage(prevGirHit, prevGirTotal);

      if (prevGirPct !== null && approachStats.girPct !== null) {
        const girDirection = determineTrend(approachStats.girPct, prevGirPct, true);
        trends.push({
          metric: 'GIR %',
          currentValue: approachStats.girPct,
          previousValue: prevGirPct,
          changePercent: Math.round((approachStats.girPct - prevGirPct) * 10) / 10,
          direction: girDirection,
          isImprovement: isImprovement(girDirection, true),
        });
      }

      // Putts per round trend — same 18-hole normalization as the current period so the
      // trend isn't distorted by 9-hole rounds in either window.
      const prevPuttsPerRound = normalizedPuttsPerRound(previousRounds);

      if (prevPuttsPerRound > 0) {
        const puttsDirection = determineTrend(puttingStats.avgPuttsPerRound, prevPuttsPerRound, false);
        trends.push({
          metric: 'Putts/Round',
          currentValue: puttingStats.avgPuttsPerRound,
          previousValue: Math.round(prevPuttsPerRound * 10) / 10,
          changePercent: Math.round((puttingStats.avgPuttsPerRound - prevPuttsPerRound) * 10) / 10,
          direction: puttsDirection,
          isImprovement: isImprovement(puttsDirection, false),
        });
      }
    }

    // ========================================================================
    // GENERATE INSIGHTS
    // ========================================================================

    const insights: string[] = [];
    let primaryStrength = 'No significant strengths detected';

    // Candidate weaknesses — we pick the highest severity, not the first match,
    // so short-game and sand-save issues aren't hidden behind an untriggered
    // approach-miss check. Severity: 3 = critical, 2 = concerning, 1 = mild.
    type WeaknessCandidate = { label: string; severity: number };
    const weaknessCandidates: WeaknessCandidate[] = [];

    // Analyze miss patterns for insights
    const approachMissArray = Object.entries(approachStats.missBreakdown)
      .filter((e): e is [string, number] => e[1] !== null && e[1] > 0)
      .sort((a, b) => b[1] - a[1]);

    if (approachMissArray.length > 0) {
      const firstEntry = approachMissArray[0];
      if (firstEntry && firstEntry[1] > 40) {
        const [missDir, pct] = firstEntry;
        insights.push(`Your approach shots miss ${missDir.replace('_', '-')} ${pct}% of the time. Consider adjusting your aim.`);
        weaknessCandidates.push({
          label: `Approach shots trending ${missDir.replace('_', '-')}`,
          severity: pct > 55 ? 3 : 2,
        });
      }
    }

    // Putting insights (null = no putt data → not a weakness)
    if (puttingStats.threePuttRate !== null && puttingStats.threePuttRate > 10) {
      insights.push(`Three-putt rate of ${puttingStats.threePuttRate}% is higher than target. Focus on lag putting.`);
      weaknessCandidates.push({
        label: 'Three-putt rate needs improvement',
        severity: puttingStats.threePuttRate > 15 ? 3 : 2,
      });
    }

    // Driving insights (null = no recorded fairway data → not a weakness)
    if (teeStats.fairwayPct !== null && teeStats.fairwayPct < 50) {
      const missType = (teeStats.leftMissPct ?? 0) > (teeStats.rightMissPct ?? 0) ? 'left' : 'right';
      insights.push(`Fairway percentage of ${teeStats.fairwayPct}% with ${missType} tendency. Work on consistency off the tee.`);
      weaknessCandidates.push({
        label: `Driving accuracy (${teeStats.fairwayPct}% fairways)`,
        severity: teeStats.fairwayPct < 40 ? 3 : 2,
      });
    }

    // GIR — approach consistency (null = no green data → not a weakness)
    if (approachStats.girPct !== null && approachStats.girPct < 40) {
      weaknessCandidates.push({
        label: `Greens in regulation (${approachStats.girPct}%)`,
        severity: 3,
      });
    }

    // Up and down insights
    if (aroundGreenStats.upAndDownPct !== null && aroundGreenStats.upAndDownPct < 40 && aroundGreenStats.totalShots > 5) {
      insights.push(`Up-and-down rate of ${aroundGreenStats.upAndDownPct}% suggests short game needs work.`);
      weaknessCandidates.push({
        label: `Short-game up-and-down (${aroundGreenStats.upAndDownPct}%)`,
        severity: aroundGreenStats.upAndDownPct < 20 ? 3 : 2,
      });
    }

    // Sand save — dedicated check, was previously invisible to primaryWeakness
    if (aroundGreenStats.sandSavePct !== null && aroundGreenStats.sandSavePct < 30 && aroundGreenStats.totalShots > 3) {
      insights.push(`Sand save rate of ${aroundGreenStats.sandSavePct}% — bunker play needs attention.`);
      weaknessCandidates.push({
        label: `Sand saves (${aroundGreenStats.sandSavePct}%)`,
        severity: aroundGreenStats.sandSavePct < 15 ? 3 : 2,
      });
    }

    // Pick the most severe candidate (ties: first-in wins — stats-ordered above
    // so approach comes before putting/short-game naturally).
    const primaryWeakness = weaknessCandidates.length > 0
      ? weaknessCandidates.reduce((a, b) => (b.severity > a.severity ? b : a)).label
      : 'No significant weaknesses detected';

    // Identify strength (null = no data → not a strength)
    if (puttingStats.inside5ft.pct !== null && puttingStats.inside5ft.pct >= 90) {
      primaryStrength = 'Excellent short putt conversion';
    } else if (approachStats.girPct !== null && approachStats.girPct >= 65) {
      primaryStrength = 'Strong approach play';
    } else if (teeStats.fairwayPct !== null && teeStats.fairwayPct >= 70) {
      primaryStrength = 'Consistent driving';
    } else if (aroundGreenStats.upAndDownPct !== null && aroundGreenStats.upAndDownPct >= 60) {
      primaryStrength = 'Solid scrambling';
    }

    // Add generic insight if none generated
    if (insights.length === 0) {
      insights.push('Continue tracking your rounds for more detailed insights.');
    }

    // ========================================================================
    // RETURN ANALYTICS
    // ========================================================================

    return {
      success: true,
      data: {
        playerId,
        playerName,
        analyzedAt: new Date().toISOString(),
        periodDays,
        roundsAnalyzed: rounds.length,
        teeStats,
        approachStats,
        aroundGreenStats,
        puttingStats,
        distanceRanges: distanceRangeAnalytics,
        trends,
        insights,
        primaryWeakness,
        primaryStrength,
      },
    };

  } catch (error) {
    await logServerError(`getPlayerShotAnalytics failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getPlayerShotAnalytics',
      featureArea: 'shot_analytics',
      playerId,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze shot data',
    };
  }
}

const observedGetPlayerShotAnalytics = withAdminObserved(
  'getPlayerShotAnalytics',
  { sport: 'golf', feature: 'stats_analytics' },
  getPlayerShotAnalyticsImpl,
);

export async function getPlayerShotAnalytics(
  playerId: string,
  periodDays: number = 30
): Promise<{ success: true; data: PlayerShotAnalytics } | { success: false; error: string }> {
  return observedGetPlayerShotAnalytics(playerId, periodDays);
}

