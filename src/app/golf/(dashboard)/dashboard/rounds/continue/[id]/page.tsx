import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { roundTypeFromDb } from '@/lib/golf/round-type-utils';
import ContinueRoundClient from './continue-round-client';
import type { HoleStats, ShotRecord } from '@/components/golf/ShotTrackingComprehensive';
import type { Tables } from '@/lib/types/database';

type GolfShot = Tables<'golf_shots'>;
// Extended hole type with optional penalty_strokes column
type GolfHoleRow = Tables<'golf_holes'> & { penalty_strokes?: number | null };

export default async function ContinueRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    .eq('id', id)
    .eq('player_id', player.id)
    .eq('status', 'in_progress')
    .single();

  if (roundError || !round) {
    notFound();
  }

  // Load holes and shots in parallel (performance optimization)
  // Note: We fetch shots separately instead of using relation query due to missing FK in types
  const [
    { data: holes },
    { data: allShots }
  ] = await Promise.all([
    supabase
      .from('golf_holes')
      .select('*')
      .eq('round_id', id)
      .order('hole_number', { ascending: true }),
    supabase
      .from('golf_shots')
      .select('*')
      .eq('round_id', id)
      .order('hole_number', { ascending: true })
      .order('shot_number', { ascending: true })
  ]);

  // Errors are handled gracefully - holes/shots will be empty if fetch fails

  // Group shots by hole number for easy lookup
  const shotsByHole = new Map<number, GolfShot[]>();
  for (const shot of (allShots || []) as GolfShot[]) {
    const holeShots = shotsByHole.get(shot.hole_number) || [];
    holeShots.push(shot);
    shotsByHole.set(shot.hole_number, holeShots);
  }

  // Transform database holes to HoleStats format (completed holes only)
  const completedHoleStats: HoleStats[] = ((holes || []) as GolfHoleRow[])
    .filter((hole) => hole.score !== null)
    .map((hole) => {
      // Use shots grouped by hole number (we fetch separately due to missing FK)
      const holeShots = shotsByHole.get(hole.hole_number) || [];
      const shots = [...holeShots].sort((a, b) => a.shot_number - b.shot_number);

      return {
        holeNumber: hole.hole_number,
        par: hole.par,
        yardage: hole.yardage || 0,
        score: hole.score!,
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
        penaltyStrokes: hole.penalty_strokes ?? 0,
        firstPuttDistance: hole.first_putt_distance,
        firstPuttLeave: hole.first_putt_leave,
        firstPuttBreak: hole.first_putt_break,
        firstPuttSlope: hole.first_putt_slope,
        firstPuttMissDirection: hole.first_putt_miss_direction,
        holedOutDistance: hole.holed_out_distance,
        holedOutType: hole.holed_out_type,
        shots: shots.map((shot) => ({
          shotNumber: shot.shot_number,
          shotType: shot.shot_type as ShotRecord['shotType'],
          clubType: shot.club_type as ShotRecord['clubType'],
          lieBefore: shot.lie_before as ShotRecord['lieBefore'],
          distanceToHoleBefore: shot.distance_to_hole_before ?? 0,
          distanceUnitBefore: shot.distance_unit_before as ShotRecord['distanceUnitBefore'],
          result: shot.result as ShotRecord['result'],
          distanceToHoleAfter: shot.distance_to_hole_after ?? 0,
          distanceUnitAfter: shot.distance_unit_after as ShotRecord['distanceUnitAfter'],
          shotDistance: shot.shot_distance ?? 0,
          missDirection: shot.miss_direction ?? undefined,
          puttBreak: shot.putt_break as ShotRecord['puttBreak'],
          puttSlope: shot.putt_slope as ShotRecord['puttSlope'],
          isPenalty: shot.is_penalty ?? false,
          penaltyType: shot.penalty_type as ShotRecord['penaltyType'],
        })),
      };
    });

  const holeConfigMap = new Map<number, { par: number; yardage: number | null; score: number | null }>();
  for (const hole of (holes || []) as GolfHoleRow[]) {
    holeConfigMap.set(hole.hole_number, {
      par: hole.par,
      yardage: hole.yardage,
      score: hole.score,
    });
  }

  // Create hole configuration for remaining holes
  // Use holes_to_play from round, default to 18 if not set
  const holesToPlay = round.holes_to_play || 18;
  const allHoles = Array.from({ length: holesToPlay }, (_, i) => {
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
    roundType: roundTypeFromDb(round.round_type || 'practice'),
    roundDate: round.round_date,
  };

  // Determine the starting hole index
  // current_hole is the hole the player was on when they exited (1-indexed)
  // We need to convert to 0-indexed for the component
  // If current_hole is not set, use the next hole after completed holes, or hole 1
  const startHoleIndex = round.current_hole 
    ? Math.max(0, round.current_hole - 1) // Convert to 0-indexed, ensure non-negative
    : completedHoleStats.length > 0 
      ? completedHoleStats.length // Next hole after last completed
      : 0; // Start at hole 1 (index 0)

  // Get shots for the starting hole to restore progress
  const startHoleNumber = startHoleIndex + 1;
  const startHoleShots = shotsByHole.get(startHoleNumber) || [];
  const sortedStartHoleShots = [...startHoleShots].sort((a, b) => a.shot_number - b.shot_number);
  
  // Calculate the current shot number (next shot to record)
  // If there are shots, the next shot is shots.length + 1
  // Otherwise, start at shot 1
  const startShotNumber = sortedStartHoleShots.length > 0 ? sortedStartHoleShots.length + 1 : 1;

  // Transform shots to ShotRecord format for the component
  const initialShots: ShotRecord[] = sortedStartHoleShots.map((shot) => ({
    shotNumber: shot.shot_number,
    shotType: shot.shot_type as ShotRecord['shotType'],
    clubType: shot.club_type as ShotRecord['clubType'],
    lieBefore: shot.lie_before as ShotRecord['lieBefore'],
    distanceToHoleBefore: shot.distance_to_hole_before ?? 0,
    distanceUnitBefore: shot.distance_unit_before as ShotRecord['distanceUnitBefore'],
    result: shot.result as ShotRecord['result'],
    distanceToHoleAfter: shot.distance_to_hole_after ?? 0,
    distanceUnitAfter: shot.distance_unit_after as ShotRecord['distanceUnitAfter'],
    shotDistance: shot.shot_distance ?? 0,
    missDirection: shot.miss_direction ?? undefined,
    puttBreak: shot.putt_break as ShotRecord['puttBreak'],
    puttSlope: shot.putt_slope as ShotRecord['puttSlope'],
    isPenalty: shot.is_penalty ?? false,
    penaltyType: shot.penalty_type as ShotRecord['penaltyType'],
  }));

  return (
    <ContinueRoundClient
      roundId={id}
      setupData={setupData}
      holes={allHoles}
      completedHoleStats={completedHoleStats}
      startHoleIndex={startHoleIndex}
      initialShots={initialShots}
      initialShotNumber={startShotNumber}
    />
  );
}
