import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import ContinueRoundClient from './continue-round-client';
import type { HoleStats } from '@/components/golf/ShotTrackingComprehensive';

export default async function ContinueRoundPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Get player
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) redirect('/golf/login');

  // Load in-progress round
  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .select('*')
    .eq('id', params.id)
    .eq('player_id', player.id)
    .eq('status', 'in_progress')
    .single();

  if (roundError || !round) {
    notFound();
  }

  // Load holes and shots
  const { data: holes, error: holesError } = await supabase
    .from('golf_holes')
    .select(`
      *,
      shots:golf_shots(*)
    `)
    .eq('round_id', params.id)
    .order('hole_number', { ascending: true });

  if (holesError) {
    console.error('[Golf] Error loading holes:', holesError);
  }

  const { data: legacyShots, error: legacyShotsError } = await supabase
    .from('golf_shots')
    .select('*')
    .eq('round_id', params.id)
    .is('hole_id', null)
    .order('hole_number', { ascending: true })
    .order('shot_number', { ascending: true });

  if (legacyShotsError) {
    console.error('[Golf] Error loading legacy shots:', legacyShotsError);
  }

  const legacyShotsByHole = new Map<number, any[]>();
  for (const shot of legacyShots || []) {
    const holeShots = legacyShotsByHole.get(shot.hole_number) || [];
    holeShots.push(shot);
    legacyShotsByHole.set(shot.hole_number, holeShots);
  }

  // Transform database holes to HoleStats format (completed holes only)
  const completedHoleStats: HoleStats[] = (holes || [])
    .filter((hole: any) => hole.score !== null)
    .map(hole => {
      const holeShots = (hole.shots && hole.shots.length > 0)
        ? hole.shots
        : (legacyShotsByHole.get(hole.hole_number) || []);
      const shots = holeShots.sort((a: any, b: any) => a.shot_number - b.shot_number);

      return {
        holeNumber: hole.hole_number,
        par: hole.par,
        yardage: hole.yardage || 0,
        score: hole.score,
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
        penaltyStrokes: hole.penalty_strokes ?? hole.penalties ?? 0,
        firstPuttDistance: hole.first_putt_distance,
        firstPuttLeave: hole.first_putt_leave,
        firstPuttBreak: hole.first_putt_break,
        firstPuttSlope: hole.first_putt_slope,
        firstPuttMissDirection: hole.first_putt_miss_direction,
        holedOutDistance: hole.holed_out_distance,
        holedOutType: hole.holed_out_type,
        shots: shots.map((shot: any) => ({
          shotNumber: shot.shot_number,
          shotType: shot.shot_type,
          clubType: shot.club_type,
          lieBefore: shot.lie_before,
          distanceToHoleBefore: shot.distance_to_hole_before,
          distanceUnitBefore: shot.distance_unit_before,
          result: shot.result,
          distanceToHoleAfter: shot.distance_to_hole_after,
          distanceUnitAfter: shot.distance_unit_after,
          shotDistance: shot.shot_distance,
          missDirection: shot.miss_direction,
          puttBreak: shot.putt_break,
          puttSlope: shot.putt_slope,
          isPenalty: shot.is_penalty,
          penaltyType: shot.penalty_type,
        })),
      };
    });

  const holeConfigMap = new Map<number, { par: number; yardage: number | null; score: number | null }>();
  for (const hole of holes || []) {
    holeConfigMap.set(hole.hole_number, {
      par: hole.par,
      yardage: hole.yardage,
      score: hole.score,
    });
  }

  // Create hole configuration for remaining holes
  const allHoles = Array.from({ length: round.holes_to_play || 18 }, (_, i) => {
    const existingHole = holeConfigMap.get(i + 1);
    return {
      number: i + 1,
      par: existingHole?.par || 4, // Default par if not found
      yardage: existingHole?.yardage || 400,
      score: existingHole?.score ?? null,
    };
  });

  // Setup data from round
  const setupData = {
    courseName: round.course_name,
    courseCity: round.course_city || '',
    courseState: round.course_state || '',
    courseRating: round.course_rating?.toString() || '',
    courseSlope: round.course_slope?.toString() || '',
    teesPlayed: round.tees_played || '',
    roundType: round.round_type as 'practice' | 'tournament' | 'qualifier',
    roundDate: round.round_date,
  };

  return (
    <ContinueRoundClient
      roundId={params.id}
      setupData={setupData}
      holes={allHoles}
      completedHoleStats={completedHoleStats}
      startHoleIndex={(round.current_hole || 1) - 1}
    />
  );
}
