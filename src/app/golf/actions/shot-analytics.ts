'use server';

/**
 * Shot Analytics Server Actions
 *
 * Aggregates shot-level data into actionable analytics for visualization.
 * Provides percentage-based miss patterns, shot type breakdowns, and trend analysis.
 */

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// ============================================================================
// INPUT VALIDATION
// ============================================================================

const shotAnalyticsSchema = z.object({
  playerId: z.string().uuid('Invalid player ID format'),
  periodDays: z.number().int().min(1).max(365).default(30),
});

// ============================================================================
// AUTH HELPERS
// ============================================================================

/**
 * Verifies that the current user has access to a player's shot analytics.
 */
async function verifyPlayerAccess(
  playerId: string
): Promise<{ authorized: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { authorized: false, error: 'Not authenticated' };
  }

  // Check if user is the player
  const { data: playerRecord } = await supabase
    .from('golf_players')
    .select('id')
    .eq('id', playerId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (playerRecord) {
    return { authorized: true };
  }

  // Check if user is a coach with access to this player via organization -> team -> membership
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coach?.organization_id) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .limit(1)
      .maybeSingle();

    if (team) {
      const { data: teamMember } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('team_id', team.id)
        .eq('player_id', playerId)
        .eq('status', 'active')
        .maybeSingle();

      if (teamMember) {
        return { authorized: true };
      }
    }
  }

  return { authorized: false, error: 'Not authorized to access this player' };
}

// ============================================================================
// TYPES
// ============================================================================

export interface MissPatternData {
  direction: string;
  percentage: number;
  count: number;
}

export interface ShotTypeStats {
  shotType: string;
  label: string;
  totalShots: number;
  successRate: number;
  missPatterns: MissPatternData[];
}

export interface DistanceRangeAnalytics {
  range: string;
  rangeLabel: string;
  totalShots: number;
  avgProximity: number;
  greenHitRate: number;
  primaryMiss: string;
  missBreakdown: MissPatternData[];
}

export interface PuttingAnalytics {
  totalPutts: number;
  onePuttRate: number;
  twoPuttRate: number;
  threePuttRate: number;
  avgPuttsPerRound: number;
  inside5ft: { attempts: number; made: number; pct: number };
  fiveTo10ft: { attempts: number; made: number; pct: number };
  outside10ft: { attempts: number; made: number; pct: number };
  missTendencies: {
    low: number;
    high: number;
    short: number;
  };
}

export interface TeeStats {
  totalDrives: number;
  fairwayPct: number;
  leftMissPct: number;
  rightMissPct: number;
  avgDrivingDistance: number | null;
}

export interface ApproachStats {
  totalApproaches: number;
  girPct: number;
  missBreakdown: {
    short: number;
    long: number;
    left: number;
    right: number;
    short_left: number;
    short_right: number;
    long_left: number;
    long_right: number;
  };
  avgProximity: number | null;
}

export interface AroundGreenStats {
  totalShots: number;
  upAndDownPct: number;
  sandSavePct: number;
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

function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

export async function getPlayerShotAnalytics(
  playerId: string,
  periodDays: number = 30
): Promise<{ success: true; data: PlayerShotAnalytics } | { success: false; error: string }> {
  try {
    // Validate input
    const validated = shotAnalyticsSchema.safeParse({ playerId, periodDays });
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0]?.message || 'Invalid input' };
    }

    // Verify user has access to this player
    const access = await verifyPlayerAccess(validated.data.playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const supabase = await createClient();

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
      .select('id, round_date, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, total_score')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .gte('round_date', periodStart.toISOString().split('T')[0])
      .order('round_date', { ascending: false });

    const rounds = (roundsData || []) as RoundRow[];

    // Get rounds from previous period for trends
    const { data: previousRoundsData } = await supabase
      .from('golf_rounds')
      .select('id, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible')
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
    const { data: holesData } = await supabase
      .from('golf_holes')
      .select(`
        id, round_id, hole_number, par, score, putts,
        fairway_hit, gir, up_and_down, sand_save
      `)
      .in('round_id', roundIds);

    const holes = (holesData || []) as HoleRow[];

    // Get shot-level data
    const { data: shotsData } = await supabase
      .from('golf_shots')
      .select(`
        id, round_id, hole_number, shot_number, shot_type, club_type,
        lie_before, distance_to_hole_before, distance_unit_before,
        distance_to_hole_after, distance_unit_after, shot_distance,
        miss_direction, result, putt_distance_feet, putt_made
      `)
      .in('round_id', roundIds);

    const shots = (shotsData || []) as ShotRow[];

    // ========================================================================
    // CALCULATE TEE STATS
    // ========================================================================

    const par4And5Holes = holes.filter(h => h.par >= 4);
    const totalDrives = par4And5Holes.length;
    const fairwaysHit = par4And5Holes.filter(h => h.fairway_hit === true).length;

    // Get miss directions from shots (drive shots)
    const driveShots = shots.filter(s => s.shot_type === 'drive' || s.shot_type === 'tee' || s.shot_number === 1);
    const leftMisses = driveShots.filter(s => s.miss_direction?.toLowerCase().includes('left')).length;
    const rightMisses = driveShots.filter(s => s.miss_direction?.toLowerCase().includes('right')).length;

    // Get driving distances from shots
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
      fairwayPct: calculatePercentage(fairwaysHit, totalDrives),
      leftMissPct: calculatePercentage(leftMisses, totalDrives - fairwaysHit),
      rightMissPct: calculatePercentage(rightMisses, totalDrives - fairwaysHit),
      avgDrivingDistance: drivingDistances.length > 0
        ? Math.round(drivingDistances.reduce((a, b) => a + b, 0) / drivingDistances.length)
        : null,
    };

    // ========================================================================
    // CALCULATE APPROACH STATS
    // ========================================================================

    const approachShots = shots.filter(s => s.shot_type === 'approach' || s.shot_type === 'iron');
    const totalApproaches = Math.max(holes.length, approachShots.length);
    const girHoles = holes.filter(h => h.gir === true).length;

    // Count miss directions
    const approachMissCounts = {
      short: 0, long: 0, left: 0, right: 0,
      short_left: 0, short_right: 0, long_left: 0, long_right: 0,
    };

    const allApproachMisses = approachShots
      .filter(s => s.miss_direction)
      .map(s => s.miss_direction!);

    allApproachMisses.forEach(dir => {
      const normalized = dir.toLowerCase().replace('-', '_');
      if (normalized in approachMissCounts) {
        approachMissCounts[normalized as keyof typeof approachMissCounts]++;
      }
    });

    const totalApproachMisses = allApproachMisses.length || 1;

    const approachProximities = approachShots
      .map(s => toFeet(s.distance_to_hole_after, s.distance_unit_after))
      .filter((distance): distance is number => distance != null && distance > 0);

    const approachStats: ApproachStats = {
      totalApproaches,
      girPct: calculatePercentage(girHoles, totalApproaches),
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
      totalShots: aroundGreenShots.length + upAndDownAttempts,
      upAndDownPct: calculatePercentage(upAndDownsMade, upAndDownAttempts),
      sandSavePct: calculatePercentage(sandSavesMade, sandSaveAttempts),
      missBreakdown: Object.entries(aroundGreenMisses)
        .map(([direction, count]) => ({
          direction,
          percentage: calculatePercentage(count, totalAroundGreenMisses),
          count,
        }))
        .sort((a, b) => b.percentage - a.percentage),
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
      avgPuttsPerRound: rounds.length > 0
        ? Math.round((totalPutts / rounds.length) * 10) / 10
        : 0,
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
      const proximities = rangeShots
        .map(s => toFeet(s.distance_to_hole_after, s.distance_unit_after))
        .filter((distance): distance is number => distance != null);

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
        .sort((a, b) => b.percentage - a.percentage);

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

      if (prevFairwaysTotal > 0) {
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

      if (prevGirTotal > 0) {
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

      // Putts per round trend
      const prevTotalPutts = previousRounds.reduce((sum, r) => sum + (r.total_putts || 0), 0);
      const prevPuttsPerRound = previousRounds.length > 0 ? prevTotalPutts / previousRounds.length : 0;

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
    let primaryWeakness = 'No significant weaknesses detected';
    let primaryStrength = 'No significant strengths detected';

    // Analyze miss patterns for insights
    const approachMissArray = Object.entries(approachStats.missBreakdown)
      .filter(([, pct]) => pct > 0)
      .sort((a, b) => b[1] - a[1]);

    if (approachMissArray.length > 0) {
      const firstEntry = approachMissArray[0];
      if (firstEntry && firstEntry[1] > 40) {
        const [missDir, pct] = firstEntry;
        insights.push(`Your approach shots miss ${missDir.replace('_', '-')} ${pct}% of the time. Consider adjusting your aim.`);
        primaryWeakness = `Approach shots trending ${missDir.replace('_', '-')}`;
      }
    }

    // Putting insights
    if (puttingStats.threePuttRate > 10) {
      insights.push(`Three-putt rate of ${puttingStats.threePuttRate}% is higher than target. Focus on lag putting.`);
      if (primaryWeakness === 'No significant weaknesses detected') {
        primaryWeakness = 'Three-putt rate needs improvement';
      }
    }

    // Driving insights
    if (teeStats.fairwayPct < 50) {
      const missType = teeStats.leftMissPct > teeStats.rightMissPct ? 'left' : 'right';
      insights.push(`Fairway percentage of ${teeStats.fairwayPct}% with ${missType} tendency. Work on consistency off the tee.`);
    }

    // Identify strength
    if (puttingStats.inside5ft.pct >= 90) {
      primaryStrength = 'Excellent short putt conversion';
    } else if (approachStats.girPct >= 65) {
      primaryStrength = 'Strong approach play';
    } else if (teeStats.fairwayPct >= 70) {
      primaryStrength = 'Consistent driving';
    } else if (aroundGreenStats.upAndDownPct >= 60) {
      primaryStrength = 'Solid scrambling';
    }

    // Up and down insights
    if (aroundGreenStats.upAndDownPct < 40 && aroundGreenStats.totalShots > 5) {
      insights.push(`Up-and-down rate of ${aroundGreenStats.upAndDownPct}% suggests short game needs work.`);
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
    console.error('[Shot Analytics Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze shot data',
    };
  }
}

// ============================================================================
// TEAM ANALYTICS
// ============================================================================

export async function getTeamShotAnalytics(
  teamId: string,
  periodDays: number = 30
): Promise<{ success: true; data: PlayerShotAnalytics[] } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    // Get current user for authorization
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get team members
    const { data: members } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    if (!members || members.length === 0) {
      return { success: false, error: 'No players found on team' };
    }

    // Get analytics for each player
    const results: PlayerShotAnalytics[] = [];

    for (const member of members) {
      const result = await getPlayerShotAnalytics(member.player_id, periodDays);
      if (result.success) {
        results.push(result.data);
      }
    }

    return { success: true, data: results };

  } catch (error) {
    console.error('[Team Shot Analytics Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze team shot data',
    };
  }
}
