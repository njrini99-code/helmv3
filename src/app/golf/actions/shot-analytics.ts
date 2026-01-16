'use server';

/**
 * Shot Analytics Server Actions
 *
 * Aggregates shot-level data into actionable analytics for visualization.
 * Provides percentage-based miss patterns, shot type breakdowns, and trend analysis.
 */

import { createClient } from '@/lib/supabase/server';

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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10; // One decimal place
}

function determineTrend(current: number, previous: number, higherIsBetter: boolean): TrendData['direction'] {
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
    const supabase = await createClient();

    // Get current user for authorization
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get player info
    const { data: player } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .eq('id', playerId)
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
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('id, round_date, total_putts, fairways_hit, fairways_total, greens_in_regulation, greens_total, driving_distance_avg, total_score')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .gte('round_date', periodStart.toISOString().split('T')[0])
      .order('round_date', { ascending: false });

    // Get rounds from previous period for trends
    const { data: previousRounds } = await supabase
      .from('golf_rounds')
      .select('id, total_putts, fairways_hit, fairways_total, greens_in_regulation, greens_total')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .gte('round_date', previousPeriodStart.toISOString().split('T')[0])
      .lt('round_date', periodStart.toISOString().split('T')[0]);

    if (!rounds || rounds.length === 0) {
      return { success: false, error: 'No rounds found in the selected period' };
    }

    const roundIds = rounds.map(r => r.id);

    // Get holes data
    const { data: holes } = await supabase
      .from('golf_holes')
      .select(`
        id, round_id, hole_number, par, score, putts,
        fairway_hit, green_in_regulation,
        driving_distance, drive_miss_direction,
        approach_distance, approach_miss_direction, approach_proximity,
        scramble_attempt, scramble_made,
        sand_save_attempt, sand_save_made,
        first_putt_distance, first_putt_miss_direction
      `)
      .in('round_id', roundIds);

    // Get shot-level data
    const { data: shots } = await supabase
      .from('golf_shots')
      .select(`
        id, round_id, hole_number, shot_number, shot_type, club_type,
        lie_before, distance_to_hole_before, distance_to_hole_after,
        miss_direction, result
      `)
      .in('round_id', roundIds);

    // Get putt details if available
    let puttDetails: Array<{
      shot_id: string;
      miss_tags: string[];
      distance_feet: number | null;
      made: boolean;
    }> = [];

    if (shots && shots.length > 0) {
      const puttShotIds = shots.filter(s => s.shot_type === 'putting').map(s => s.id);
      if (puttShotIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: details } = await (supabase as any)
          .from('putt_details')
          .select('shot_id, miss_tags, distance_feet, made')
          .in('shot_id', puttShotIds);
        puttDetails = details || [];
      }
    }

    // ========================================================================
    // CALCULATE TEE STATS
    // ========================================================================

    const par4And5Holes = holes?.filter(h => h.par >= 4) || [];
    const totalDrives = par4And5Holes.length;
    const fairwaysHit = par4And5Holes.filter(h => h.fairway_hit === true).length;
    const leftMisses = par4And5Holes.filter(h => h.drive_miss_direction?.toLowerCase().includes('left')).length;
    const rightMisses = par4And5Holes.filter(h => h.drive_miss_direction?.toLowerCase().includes('right')).length;

    const drivingDistances = par4And5Holes
      .filter(h => h.driving_distance && h.driving_distance > 0)
      .map(h => h.driving_distance!);

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

    const approachHoles = holes?.filter(h => h.approach_distance != null) || [];
    const approachShots = shots?.filter(s => s.shot_type === 'approach') || [];
    const totalApproaches = Math.max(approachHoles.length, approachShots.length);
    const girHoles = holes?.filter(h => h.green_in_regulation === true).length || 0;

    // Count miss directions
    const approachMissCounts = {
      short: 0, long: 0, left: 0, right: 0,
      short_left: 0, short_right: 0, long_left: 0, long_right: 0,
    };

    const allApproachMisses = [
      ...(holes?.filter(h => h.approach_miss_direction).map(h => h.approach_miss_direction!) || []),
      ...(approachShots.filter(s => s.miss_direction).map(s => s.miss_direction!) || []),
    ];

    allApproachMisses.forEach(dir => {
      const normalized = dir.toLowerCase().replace('-', '_');
      if (normalized in approachMissCounts) {
        approachMissCounts[normalized as keyof typeof approachMissCounts]++;
      }
    });

    const totalApproachMisses = allApproachMisses.length || 1;

    const approachProximities = holes
      ?.filter(h => h.approach_proximity != null && h.approach_proximity > 0)
      .map(h => h.approach_proximity!) || [];

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

    const scrambleAttempts = holes?.filter(h => h.scramble_attempt === true).length || 0;
    const scramblesMade = holes?.filter(h => h.scramble_made === true).length || 0;
    const sandSaveAttempts = holes?.filter(h => h.sand_save_attempt === true).length || 0;
    const sandSavesMade = holes?.filter(h => h.sand_save_made === true).length || 0;

    const aroundGreenShots = shots?.filter(s => s.shot_type === 'around_green' || s.shot_type === 'chip' || s.shot_type === 'pitch') || [];
    const aroundGreenMisses: Record<string, number> = {};

    aroundGreenShots.forEach(s => {
      if (s.miss_direction) {
        const dir = s.miss_direction.toLowerCase();
        aroundGreenMisses[dir] = (aroundGreenMisses[dir] || 0) + 1;
      }
    });

    const totalAroundGreenMisses = Object.values(aroundGreenMisses).reduce((a, b) => a + b, 0) || 1;

    const aroundGreenStats: AroundGreenStats = {
      totalShots: aroundGreenShots.length + scrambleAttempts,
      upAndDownPct: calculatePercentage(scramblesMade, scrambleAttempts),
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

    const allHolesWithPutts = holes?.filter(h => h.putts != null) || [];
    const totalPutts = allHolesWithPutts.reduce((sum, h) => sum + (h.putts || 0), 0);
    const onePutts = allHolesWithPutts.filter(h => h.putts === 1).length;
    const twoPutts = allHolesWithPutts.filter(h => h.putts === 2).length;
    const threePlusPutts = allHolesWithPutts.filter(h => (h.putts || 0) >= 3).length;
    const holesWithPutts = allHolesWithPutts.length || 1;

    // Putt miss tendencies from putt_details
    const puttMissTendencies = { low: 0, high: 0, short: 0 };
    puttDetails.forEach(p => {
      if (p.miss_tags && !p.made) {
        p.miss_tags.forEach(tag => {
          if (tag in puttMissTendencies) {
            puttMissTendencies[tag as keyof typeof puttMissTendencies]++;
          }
        });
      }
    });

    const totalMissedPutts = puttDetails.filter(p => !p.made).length || 1;

    // Distance-based putting stats
    const puttsByDistance = {
      inside5ft: { attempts: 0, made: 0 },
      fiveTo10ft: { attempts: 0, made: 0 },
      outside10ft: { attempts: 0, made: 0 },
    };

    puttDetails.forEach(p => {
      const dist = p.distance_feet;
      if (dist != null) {
        if (dist <= 5) {
          puttsByDistance.inside5ft.attempts++;
          if (p.made) puttsByDistance.inside5ft.made++;
        } else if (dist <= 10) {
          puttsByDistance.fiveTo10ft.attempts++;
          if (p.made) puttsByDistance.fiveTo10ft.made++;
        } else {
          puttsByDistance.outside10ft.attempts++;
          if (p.made) puttsByDistance.outside10ft.made++;
        }
      }
    });

    // Also calculate from first_putt_distance in holes if putt_details is sparse
    if (puttsByDistance.inside5ft.attempts === 0 && puttsByDistance.fiveTo10ft.attempts === 0) {
      allHolesWithPutts.forEach(h => {
        const dist = h.first_putt_distance;
        if (dist != null) {
          if (dist <= 5) {
            puttsByDistance.inside5ft.attempts++;
            if (h.putts === 1) puttsByDistance.inside5ft.made++;
          } else if (dist <= 10) {
            puttsByDistance.fiveTo10ft.attempts++;
            if (h.putts === 1) puttsByDistance.fiveTo10ft.made++;
          } else {
            puttsByDistance.outside10ft.attempts++;
            if (h.putts === 1) puttsByDistance.outside10ft.made++;
          }
        }
      });
    }

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
      const rangeShots = shots?.filter(s => {
        const dist = s.distance_to_hole_before;
        return dist != null && dist >= range.min && dist < range.max && s.shot_type !== 'putting' && s.shot_type !== 'drive';
      }) || [];

      const greenHits = rangeShots.filter(s => s.result === 'green' || s.result === 'hole').length;
      const proximities = rangeShots
        .filter(s => s.distance_to_hole_after != null)
        .map(s => s.distance_to_hole_after!);

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

    if (previousRounds && previousRounds.length > 0) {
      // Fairway percentage trend
      const prevFairwaysHit = previousRounds.reduce((sum, r) => sum + (r.fairways_hit || 0), 0);
      const prevFairwaysTotal = previousRounds.reduce((sum, r) => sum + (r.fairways_total || 0), 0);
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
      const prevGirHit = previousRounds.reduce((sum, r) => sum + (r.greens_in_regulation || 0), 0);
      const prevGirTotal = previousRounds.reduce((sum, r) => sum + (r.greens_total || 0), 0);
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

    if (approachMissArray.length > 0 && approachMissArray[0][1] > 40) {
      const [missDir, pct] = approachMissArray[0];
      insights.push(`Your approach shots miss ${missDir.replace('_', '-')} ${pct}% of the time. Consider adjusting your aim.`);
      primaryWeakness = `Approach shots trending ${missDir.replace('_', '-')}`;
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
      .eq('team_id', teamId);

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
