import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { roundTypeFromDb } from '@/lib/golf/round-type-utils';
import ContinueRoundClient from './continue-round-client';
import type { HoleStats, ShotRecord } from '@/components/golf/ShotTrackingComprehensive';
import type { Tables } from '@/lib/types/database';
import type { ApproachMissDirection, PuttMissTag } from '@/lib/types/golf';

type GolfShot = Tables<'golf_shots'>;
// The golf_holes table schema - penalty_strokes is now part of the schema
type GolfHoleRow = Tables<'golf_holes'>;

const PUTT_MISS_TAGS = new Set<PuttMissTag>(['low', 'high', 'short']);
const APPROACH_MISS_DIRECTIONS = new Set<ApproachMissDirection>([
  'short',
  'long',
  'left',
  'right',
  'short_left',
  'short_right',
  'long_left',
  'long_right',
]);

function parsePuttMissTags(shot: GolfShot): PuttMissTag[] | undefined {
  const shotType = shot.shot_type ?? '';
  if (shotType !== 'putting' && shotType !== 'putt') return undefined;
  if (!shot.miss_direction) return undefined;
  const tags = shot.miss_direction
    .toLowerCase()
    .split('_')
    .filter(tag => PUTT_MISS_TAGS.has(tag as PuttMissTag)) as PuttMissTag[];
  return tags.length > 0 ? tags : undefined;
}

function parseApproachMissDirection(shot: GolfShot): ApproachMissDirection | undefined {
  const shotType = shot.shot_type ?? '';
  if (shotType !== 'approach' && shotType !== 'around_green') return undefined;
  if (!shot.miss_direction) return undefined;
  const normalized = shot.miss_direction.toLowerCase().replace('-', '_') as ApproachMissDirection;
  return APPROACH_MISS_DIRECTIONS.has(normalized) ? normalized : undefined;
}

function parseApproachMissLieType(shot: GolfShot): ShotRecord['approachMissLieType'] | undefined {
  const source = shot.lie_after ?? shot.result;
  if (!source) return undefined;
  switch (source) {
    case 'fairway':
      return 'fairway';
    case 'rough':
      return 'rough';
    case 'sand':
      return 'bunker';
    case 'hazard':
    case 'recovery':
    case 'penalty':
      return 'hazard';
    case 'other':
      return 'hazard';
    default:
      return undefined;
  }
}

function derivePuttDistanceFeet(shot: GolfShot): number | undefined {
  const shotType = shot.shot_type ?? '';
  if (shotType !== 'putting' && shotType !== 'putt') return undefined;
  if (shot.putt_distance_feet != null) return shot.putt_distance_feet;
  if (shot.distance_to_hole_before == null) return undefined;
  return shot.distance_unit_before === 'yards'
    ? shot.distance_to_hole_before * 3
    : shot.distance_to_hole_before;
}

function mapShotToRecord(shot: GolfShot): ShotRecord {
  const shotType = (shot.shot_type ?? 'approach') as ShotRecord['shotType'];
  const distanceUnitBefore = (shot.distance_unit_before ??
    (shotType === 'putting' ? 'feet' : 'yards')) as ShotRecord['distanceUnitBefore'];
  const distanceUnitAfter = (shot.distance_unit_after ??
    (shot.result === 'green' || shot.result === 'hole' ? 'feet' : 'yards')) as ShotRecord['distanceUnitAfter'];

  return {
    id: shot.id,
    shotNumber: shot.shot_number,
    shotType,
    clubType: shot.club_type as ShotRecord['clubType'],
    lieBefore: shot.lie_before as ShotRecord['lieBefore'],
    distanceToHoleBefore: shot.distance_to_hole_before ?? 0,
    distanceUnitBefore,
    result: shot.result as ShotRecord['result'],
    distanceToHoleAfter: shot.distance_to_hole_after ?? 0,
    distanceUnitAfter,
    shotDistance: shot.shot_distance ?? 0,
    missDirection: shot.miss_direction ?? undefined,
    puttBreak: shot.putt_break as ShotRecord['puttBreak'],
    puttSlope: shot.putt_slope as ShotRecord['puttSlope'],
    isPenalty: shot.is_penalty ?? false,
    penaltyType: shot.penalty_type as ShotRecord['penaltyType'],
    puttMissTags: parsePuttMissTags(shot),
    puttDistanceFeet: derivePuttDistanceFeet(shot),
    approachMissDirection: parseApproachMissDirection(shot),
    approachMissLieType: parseApproachMissLieType(shot),
  };
}

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
  // Note: golf_holes only stores basic data (par, score, putts, fairway_hit, gir, penalty_strokes, sand_save, up_and_down)
  // Detailed shot data comes from golf_shots table
  const completedHoleStats: HoleStats[] = ((holes || []) as GolfHoleRow[])
    .filter((hole) => hole.score !== null)
    .map((hole) => {
      // Use shots grouped by hole number (we fetch separately due to missing FK)
      const holeShots = shotsByHole.get(hole.hole_number) || [];
      const shots = [...holeShots].sort((a, b) => a.shot_number - b.shot_number);

      return {
        holeNumber: hole.hole_number,
        par: hole.par,
        yardage: 0, // Not stored in golf_holes - would need course data
        score: hole.score!,
        putts: hole.putts || 0,
        fairwayHit: hole.fairway_hit,
        greenInRegulation: hole.gir || false,
        drivingDistance: null, // Computed from shots if needed
        usedDriver: null,
        driveMissDirection: null,
        approachDistance: null,
        approachLie: null,
        approachProximity: null,
        approachMissDirection: null,
        scrambleAttempt: hole.up_and_down !== null,
        scrambleMade: hole.up_and_down || false,
        sandSaveAttempt: hole.sand_save !== null,
        sandSaveMade: hole.sand_save || false,
        penaltyStrokes: hole.penalty_strokes ?? 0,
        firstPuttDistance: null,
        firstPuttLeave: null,
        firstPuttBreak: null,
        firstPuttSlope: null,
        firstPuttMissDirection: null,
        holedOutDistance: null,
        holedOutType: null,
        shots: shots.map(mapShotToRecord),
      };
    });

  const holeConfigMap = new Map<number, { par: number; score: number | null }>();
  for (const hole of (holes || []) as GolfHoleRow[]) {
    holeConfigMap.set(hole.hole_number, {
      par: hole.par,
      score: hole.score,
    });
  }

  // Create hole configuration for remaining holes
  // Determine total holes from existing hole data or round metadata
  // If we have holes 10+ in the data, it's an 18-hole round, otherwise check front/back nine scores
  const maxHoleNumber = (holes || []).reduce((max: number, h: GolfHoleRow) => Math.max(max, h.hole_number), 0);
  const hasBackNineHoles = maxHoleNumber > 9;
  const isLikely18HoleRound = hasBackNineHoles || (round.back_nine !== null);
  const totalHoles = isLikely18HoleRound ? 18 : 9;
  const allHoles = Array.from({ length: totalHoles }, (_, i) => {
    const existingHole = holeConfigMap.get(i + 1);
    return {
      number: i + 1,
      par: existingHole?.par || 4, // Default par if not found
      yardage: 400, // Default yardage - course data not stored in golf_holes
      score: existingHole?.score ?? null,
    };
  });

  // Setup data from round
  const setupData = {
    courseName: round.course_name || 'Unknown Course',
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
  const initialShots: ShotRecord[] = sortedStartHoleShots.map(mapShotToRecord);

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
