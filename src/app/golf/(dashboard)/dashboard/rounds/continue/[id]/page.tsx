import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { roundTypeFromDb } from '@/lib/golf/round-type-utils';
import ContinueRoundClient from './continue-round-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import type { HoleStats, ShotRecord } from '@/lib/types/golf';
import { calculateHoleStats } from '@/lib/utils/shot-helpers';
import type { Tables } from '@/lib/types/database';
import type { ApproachMissDirection, PuttMissTag } from '@/lib/types/golf';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Continue Round | GolfHelm',
  description: 'Resume tracking your in-progress golf round shot by shot.',
};

type GolfShot = Tables<'golf_shots'>;
// The golf_holes table schema - penalty_strokes is now part of the schema
type GolfHoleRow = Tables<'golf_holes'>;

const PUTT_MISS_TAGS = new Set<PuttMissTag>(['low', 'high', 'short', 'long']);
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
    case 'penalty':
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

function mapShotToRecord(
  shot: GolfShot,
  puttDetail?: { miss_tags: string[] | null },
  approachDetail?: { miss_direction: string | null; lie_type: string | null; distance_from_green_yards: number | null },
): ShotRecord {
  const shotType = (shot.shot_type ?? 'approach') as ShotRecord['shotType'];
  const distanceUnitBefore = (shot.distance_unit_before ??
    (shotType === 'putting' ? 'feet' : 'yards')) as ShotRecord['distanceUnitBefore'];
  const distanceUnitAfter = (shot.distance_unit_after ??
    (shot.result === 'green' || shot.result === 'hole' ? 'feet' : 'yards')) as ShotRecord['distanceUnitAfter'];

  // Bug 5 fix: Prefer putt miss tags from putt_details table over parsing miss_direction
  let puttMissTags: PuttMissTag[] | undefined;
  if (puttDetail?.miss_tags && puttDetail.miss_tags.length > 0) {
    puttMissTags = puttDetail.miss_tags.filter(
      tag => PUTT_MISS_TAGS.has(tag as PuttMissTag)
    ) as PuttMissTag[];
    if (puttMissTags.length === 0) puttMissTags = undefined;
  } else {
    puttMissTags = parsePuttMissTags(shot);
  }

  // Bug 6 fix: Prefer approach miss details from approach_miss_details table
  let approachMissDir = parseApproachMissDirection(shot);
  let approachMissLie = parseApproachMissLieType(shot);
  let distanceFromGreenYards: number | undefined;

  if (approachDetail) {
    if (approachDetail.miss_direction) {
      const normalized = approachDetail.miss_direction.toLowerCase().replace('-', '_') as ApproachMissDirection;
      if (APPROACH_MISS_DIRECTIONS.has(normalized)) {
        approachMissDir = normalized;
      }
    }
    if (approachDetail.lie_type) {
      const lieMap: Record<string, ShotRecord['approachMissLieType']> = {
        fairway: 'fairway', rough: 'rough', sand: 'bunker', bunker: 'bunker', hazard: 'hazard',
      };
      approachMissLie = lieMap[approachDetail.lie_type] ?? approachMissLie;
    }
    if (approachDetail.distance_from_green_yards != null) {
      distanceFromGreenYards = approachDetail.distance_from_green_yards;
    }
  }

  return {
    id: shot.id,
    shotNumber: shot.shot_number,
    shotType,
    clubType: (shot.club_type || 'non_driver') as ShotRecord['clubType'],
    lieBefore: (shot.lie_before || 'other') as ShotRecord['lieBefore'],
    distanceToHoleBefore: shot.distance_to_hole_before ?? 0,
    distanceUnitBefore,
    result: (shot.result || 'other') as ShotRecord['result'],
    distanceToHoleAfter: shot.distance_to_hole_after ?? 0,
    distanceUnitAfter,
    shotDistance: shot.shot_distance ?? 0,
    missDirection: shot.miss_direction ?? undefined,
    puttBreak: (shot.putt_break ?? undefined) as ShotRecord['puttBreak'],
    puttSlope: (shot.putt_slope ?? undefined) as ShotRecord['puttSlope'],
    isPenalty: shot.is_penalty ?? false,
    penaltyType: (shot.penalty_type ?? undefined) as ShotRecord['penaltyType'],
    puttMissTags,
    puttDistanceFeet: derivePuttDistanceFeet(shot),
    approachMissDirection: approachMissDir,
    approachMissLieType: approachMissLie,
    distanceFromGreenYards,
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
    .maybeSingle();

  if (!player) redirect('/golf/login');

  // Load in-progress round
  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .select('*')
    .eq('id', id)
    .eq('player_id', player.id)
    .eq('status', 'in_progress')
    .maybeSingle();

  if (roundError || !round) {
    notFound();
  }

  // Load holes, shots, and course hole yardages in parallel
  // Note: We fetch shots separately instead of using relation query due to missing FK in types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [
    { data: holes },
    { data: allShots },
    { data: courseHoles }
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
      .order('shot_number', { ascending: true }),
    round.course_id
      ? supabase
          .from('golf_course_holes')
          .select('hole_number, yardage')
          .eq('course_id', round.course_id)
          .order('hole_number', { ascending: true })
      : Promise.resolve({ data: null }),
  ]);

  // Build yardage lookup from course config
  const courseYardageMap = new Map<number, number>();
  for (const ch of (courseHoles || [])) {
    if (ch.yardage != null) courseYardageMap.set(ch.hole_number, ch.yardage);
  }

  // Fetch putt_details and approach_miss_details for all shots in this round
  const shotIds = ((allShots || []) as GolfShot[]).map(s => s.id);
  const puttDetailsByShot = new Map<string, { miss_tags: string[] | null }>();
  const approachDetailsByShot = new Map<string, { miss_direction: string | null; lie_type: string | null; distance_from_green_yards: number | null }>();

  if (shotIds.length > 0) {
    const [puttRes, approachRes] = await Promise.all([
      sb.from('putt_details')
        .select('shot_id, miss_tags')
        .in('shot_id', shotIds),
      sb.from('approach_miss_details')
        .select('shot_id, miss_direction, lie_type, distance_from_green_yards')
        .in('shot_id', shotIds),
    ]);

    for (const pd of (puttRes?.data || [])) {
      puttDetailsByShot.set(pd.shot_id, { miss_tags: pd.miss_tags });
    }
    for (const ad of (approachRes?.data || [])) {
      approachDetailsByShot.set(ad.shot_id, {
        miss_direction: ad.miss_direction,
        lie_type: ad.lie_type,
        distance_from_green_yards: ad.distance_from_green_yards,
      });
    }
  }

  // Errors are handled gracefully - holes/shots will be empty if fetch fails

  // Group shots by hole number for easy lookup
  const shotsByHole = new Map<number, GolfShot[]>();
  for (const shot of (allShots || []) as GolfShot[]) {
    const holeShots = shotsByHole.get(shot.hole_number) || [];
    holeShots.push(shot);
    shotsByHole.set(shot.hole_number, holeShots);
  }

  // Transform database holes to HoleStats format, indexed by hole position (0-based)
  // Each entry is placed at index (hole_number - 1) so the client component
  // can look up stats by currentHoleIndex without misalignment.
  const completedHoleStats: HoleStats[] = [];
  for (const hole of ((holes || []) as GolfHoleRow[])) {
    if (hole.score === null) continue;

    const holeShots = shotsByHole.get(hole.hole_number) || [];
    const shots = [...holeShots].sort((a, b) => a.shot_number - b.shot_number);

    const mappedShots = shots.map(s => mapShotToRecord(s, puttDetailsByShot.get(s.id), approachDetailsByShot.get(s.id)));
    const holeConfig = {
      number: hole.hole_number,
      par: hole.par,
      yardage: courseYardageMap.get(hole.hole_number) ?? 0,
    };

    // Re-derive full detailed stats from the shot data
    const derivedStats = calculateHoleStats(mappedShots, holeConfig);

    // Preserve DB-authoritative fields (score, putts, fairway_hit, GIR,
    // scramble, sand save) which may differ from shot-count derivation
    // (e.g., admin corrections, penalty_strokes stored separately)
    completedHoleStats[hole.hole_number - 1] = {
      ...derivedStats,
      score: hole.score!,
      putts: hole.putts || 0,
      fairwayHit: hole.fairway_hit,
      greenInRegulation: hole.gir || false,
      scrambleAttempt: hole.up_and_down !== null,
      scrambleMade: hole.up_and_down || false,
      sandSaveAttempt: hole.sand_save !== null,
      sandSaveMade: hole.sand_save || false,
      penaltyStrokes: hole.penalty_strokes ?? 0,
    };
  }

  const holeConfigMap = new Map<number, { par: number; score: number | null }>();
  for (const hole of (holes || []) as GolfHoleRow[]) {
    holeConfigMap.set(hole.hole_number, {
      par: hole.par,
      score: hole.score,
    });
  }

  // Create hole configuration for remaining holes
  // Use holes_played from the round record (set at creation), with heuristic fallback
  const maxHoleNumber = (holes || []).reduce((max: number, h: GolfHoleRow) => Math.max(max, h.hole_number), 0);
  const hasBackNineHoles = maxHoleNumber > 9;
  const isLikely18HoleRound = hasBackNineHoles || (round.back_nine !== null);
  const totalHoles = round.holes_played ?? (isLikely18HoleRound ? 18 : 9);
  // Try to load hole configs from draft_data JSONB column first, then fall back to notes (legacy)
  let draftHoleConfigs: Array<{ number: number; par: number; yardage: number }> | null = null;
  const draftData = (round as Record<string, unknown>).draft_data as Record<string, unknown> | null;
  if (draftData?.holes && Array.isArray(draftData.holes)) {
    draftHoleConfigs = draftData.holes as Array<{ number: number; par: number; yardage: number }>;
  } else if (round.notes) {
    try {
      const parsedNotes = JSON.parse(round.notes);
      if (parsedNotes?.holes && Array.isArray(parsedNotes.holes)) {
        draftHoleConfigs = parsedNotes.holes;
      }
    } catch {
      // notes field may not contain valid JSON
    }
  }

  const allHoles = Array.from({ length: totalHoles }, (_, i) => {
    const existingHole = holeConfigMap.get(i + 1);
    const draftHole = draftHoleConfigs?.find(h => h.number === i + 1);
    return {
      number: i + 1,
      par: existingHole?.par ?? draftHole?.par ?? 4,
      yardage: draftHole?.yardage ?? courseYardageMap.get(i + 1) ?? 0,
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
    qualifierId: round.qualifier_id || undefined,
    qualifierRoundNumber: round.qualifier_round_number || undefined,
  };

  // Determine the starting hole index
  // current_hole is the hole the player was on when they exited (1-indexed)
  // We need to convert to 0-indexed for the component
  // If current_hole is not set, use the next hole after completed holes, or hole 1
  // Note: completedHoleStats may be sparse (indexed by hole_number - 1),
  // so .length returns max_index + 1, not the actual count. Find the true max.
  let maxCompletedHoleIndex = -1;
  for (let i = 0; i < completedHoleStats.length; i++) {
    if (completedHoleStats[i]) maxCompletedHoleIndex = i;
  }
  const startHoleIndex = round.current_hole
    ? Math.min(Math.max(0, round.current_hole - 1), totalHoles - 1)
    : maxCompletedHoleIndex >= 0
      ? Math.min(maxCompletedHoleIndex + 1, totalHoles - 1)
      : 0;

  // Get shots for the starting hole to restore progress
  const startHoleNumber = startHoleIndex + 1;
  const startHoleShots = shotsByHole.get(startHoleNumber) || [];
  const sortedStartHoleShots = [...startHoleShots].sort((a, b) => a.shot_number - b.shot_number);

  // Calculate the current shot number (next shot to record)
  // If there are shots, the next shot is shots.length + 1
  // Otherwise, start at shot 1
  const startShotNumber = sortedStartHoleShots.length > 0 ? sortedStartHoleShots.length + 1 : 1;

  // Transform shots to ShotRecord format for the component
  const initialShots: ShotRecord[] = sortedStartHoleShots.map(s => mapShotToRecord(s, puttDetailsByShot.get(s.id), approachDetailsByShot.get(s.id)));

  // Build in-progress shots for ALL non-completed holes (not just the starting hole)
  // This prevents data loss when shots exist on multiple skipped/unfinished holes
  const allInProgressShots: Record<number, ShotRecord[]> = {};
  for (let i = 0; i < totalHoles; i++) {
    const holeNumber = i + 1;
    const holeShots = shotsByHole.get(holeNumber) || [];
    if (holeShots.length === 0) continue;
    // Skip completed holes (they're already in completedHoleStats)
    if (completedHoleStats[i]) continue;
    const sorted = [...holeShots].sort((a, b) => a.shot_number - b.shot_number);
    allInProgressShots[i] = sorted.map(s => mapShotToRecord(s, puttDetailsByShot.get(s.id), approachDetailsByShot.get(s.id)));
  }

  return (
    <AnimatedPage>
      <AnimatedItem>
        <ContinueRoundClient
          roundId={id}
          setupData={setupData}
          holes={allHoles}
          completedHoleStats={completedHoleStats}
          startHoleIndex={startHoleIndex}
          initialShots={initialShots}
          initialShotNumber={startShotNumber}
          initialInProgressShotsByHole={allInProgressShots}
          serverDataTimestamp={round.updated_at ?? undefined}
        />
      </AnimatedItem>
    </AnimatedPage>
  );
}
