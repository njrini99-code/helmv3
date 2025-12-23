import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import GolfStatsDisplay from '@/components/golf/stats/GolfStatsDisplay';
import { calculateStats, type GolfStats } from '@/lib/utils/golf-stats-calculator';
import type { HoleStats } from '@/components/golf/ShotTrackingComprehensive';

export default async function GolfStatsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Get player info
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    redirect('/golf/login');
  }

  const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim();

  // Fetch all rounds with hole data
  const { data: rounds } = await supabase
    .from('golf_rounds')
    .select(`
      id,
      round_date,
      course_name,
      round_type,
      total_score,
      total_to_par
    `)
    .eq('player_id', player.id)
    .not('total_score', 'is', null)
    .order('round_date', { ascending: true });

  // Fetch all holes for these rounds
  const roundIds = rounds?.map(r => r.id) || [];
  
  let holesData: any[] = [];
  if (roundIds.length > 0) {
    const { data } = await supabase
      .from('golf_holes')
      .select('*')
      .in('round_id', roundIds)
      .order('hole_number', { ascending: true });
    holesData = data || [];
  }

  // Fetch all shots for these rounds
  let shotsData: any[] = [];
  if (roundIds.length > 0) {
    const { data } = await supabase
      .from('golf_shots')
      .select('*')
      .in('round_id', roundIds)
      .order('shot_number', { ascending: true });
    shotsData = data || [];
  }

  // Transform data for stats calculation
  const roundsForCalc = (rounds || []).map(round => {
    const roundHoles = holesData.filter(h => h.round_id === round.id);
    const roundShots = shotsData.filter(s => s.round_id === round.id);

    const holes: HoleStats[] = roundHoles.map(hole => {
      const holeShots = roundShots
        .filter(s => s.hole_number === hole.hole_number)
        .map(s => ({
          shotNumber: s.shot_number,
          shotType: s.shot_type,
          clubType: s.club_type,
          lieBefore: s.lie_before || 'tee',
          distanceToHoleBefore: s.distance_to_hole_before,
          distanceUnitBefore: s.distance_unit_before || 'yards',
          result: s.result,
          distanceToHoleAfter: s.distance_to_hole_after,
          distanceUnitAfter: s.distance_unit_after || 'yards',
          shotDistance: s.shot_distance || 0,
          missDirection: s.miss_direction,
          puttBreak: s.putt_break,
          puttSlope: s.putt_slope,
          isPenalty: s.is_penalty || false,
          penaltyType: s.penalty_type,
        }));

      return {
        holeNumber: hole.hole_number,
        par: hole.par,
        yardage: hole.yardage || 0,
        score: hole.score || 0,
        putts: hole.putts || 0,
        fairwayHit: hole.fairway_hit,
        greenInRegulation: hole.green_in_regulation || false,
        drivingDistance: hole.driving_distance,
        usedDriver: hole.used_driver,
        driveMissDirection: hole.drive_miss_direction,
        approachDistance: hole.approach_distance,
        approachLie: hole.approach_lie,
        approachProximity: hole.approach_proximity,
        approachMissDirection: hole.approach_miss_direction,
        scrambleAttempt: hole.scramble_attempt || false,
        scrambleMade: hole.scramble_made || false,
        sandSaveAttempt: hole.sand_save_attempt || false,
        sandSaveMade: hole.sand_save_made || false,
        penaltyStrokes: hole.penalty_strokes || 0,
        firstPuttDistance: hole.first_putt_distance,
        firstPuttLeave: hole.first_putt_leave,
        firstPuttBreak: hole.first_putt_break,
        firstPuttSlope: hole.first_putt_slope,
        firstPuttMissDirection: hole.first_putt_miss_direction,
        holedOutDistance: hole.holed_out_distance,
        holedOutType: hole.holed_out_type,
        shots: holeShots,
      };
    });

    return {
      id: round.id,
      roundDate: round.round_date,
      courseName: round.course_name,
      roundType: (round.round_type || 'practice') as 'practice' | 'qualifying' | 'tournament',
      totalScore: round.total_score || 0,
      totalToPar: round.total_to_par || 0,
      holes,
    };
  });

  // Calculate stats
  const stats = calculateStats(roundsForCalc);

  return <GolfStatsDisplay stats={stats} playerName={playerName} />;
}
