/**
 * Arccos → GolfHelm data mapper.
 *
 * Maps Arccos API round/hole/shot shapes into the insert types expected
 * by golf_rounds, golf_holes, and golf_shots.
 *
 * Club model: Arccos reports specific club names (e.g. "Driver",
 * "7 Iron", "Putter"). We bucket them into the 3-bucket model used
 * throughout GolfHelm: `driver` / `non_driver` / `putter`.
 *
 * Dedup: Because golf_rounds does not yet have a dedicated
 * `external_id` column (migration pending), we store the Arccos
 * round identifier in the `notes` field as `arccos:<arccos_round_id>`
 * and query against it for dedup.
 */

import type { ArccosRound, ArccosHole, ArccosShot } from './arccos-client';
import type { Database } from '@/lib/types/database';

type GolfRoundInsert = Database['public']['Tables']['golf_rounds']['Insert'];
type GolfHoleInsert = Database['public']['Tables']['golf_holes']['Insert'];
type GolfShotInsert = Database['public']['Tables']['golf_shots']['Insert'];

// ---------------------------------------------------------------------------
// Club mapping
// ---------------------------------------------------------------------------

const DRIVER_NAMES = new Set(['driver', '1w', '1-wood', '1 wood']);
const PUTTER_NAMES = new Set(['putter', 'pt']);

/**
 * Map an Arccos club string to the GolfHelm 3-bucket model.
 */
export function mapClubToType(club: string): 'driver' | 'non_driver' | 'putter' {
  const normalized = club.toLowerCase().trim();
  if (DRIVER_NAMES.has(normalized)) return 'driver';
  if (PUTTER_NAMES.has(normalized)) return 'putter';
  return 'non_driver';
}

// ---------------------------------------------------------------------------
// Lie mapping
// ---------------------------------------------------------------------------

type LieBefore = 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other';

const LIE_MAP: Record<string, LieBefore> = {
  tee: 'tee',
  tee_box: 'tee',
  fairway: 'fairway',
  rough: 'rough',
  sand: 'sand',
  bunker: 'sand',
  green: 'green',
};

function mapLie(lie: string): LieBefore {
  return LIE_MAP[lie.toLowerCase().trim()] ?? 'other';
}

// ---------------------------------------------------------------------------
// Shot type derivation
// ---------------------------------------------------------------------------

type ShotType = 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty';

function deriveShotType(shot: ArccosShot, hole: ArccosHole): ShotType {
  if (shot.is_penalty) return 'penalty';
  const clubType = mapClubToType(shot.club);
  if (clubType === 'putter') return 'putting';
  if (shot.shot_number === 1 && hole.par >= 4) return 'tee';
  if (shot.distance_to_pin_before <= 50) return 'around_green';
  return 'approach';
}

// ---------------------------------------------------------------------------
// Result mapping
// ---------------------------------------------------------------------------

type ShotResult = 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other' | 'penalty';

function mapResult(result: string, isPenalty: boolean): ShotResult {
  if (isPenalty) return 'penalty';
  const r = result.toLowerCase().trim();
  if (r === 'fairway') return 'fairway';
  if (r === 'rough') return 'rough';
  if (r === 'sand' || r === 'bunker') return 'sand';
  if (r === 'green') return 'green';
  if (r === 'hole' || r === 'holed') return 'hole';
  return 'other';
}

// ---------------------------------------------------------------------------
// External ID helper
// ---------------------------------------------------------------------------

/** Build the dedup marker stored in golf_rounds.notes. */
export function arccosExternalId(arccosRoundId: string): string {
  return `arccos:${arccosRoundId}`;
}

// ---------------------------------------------------------------------------
// Round mapper
// ---------------------------------------------------------------------------

export interface MappedRound {
  round: GolfRoundInsert;
  holes: GolfHoleInsert[];
  shots: GolfShotInsert[];
}

/**
 * Map an Arccos round + its holes + shots into the GolfHelm insert
 * shapes. The returned `round` uses a placeholder `id` (empty string)
 * — the caller must generate a real UUID before insert and propagate
 * it to holes and shots via `round_id`.
 */
export function mapArccosRound(
  arccosRound: ArccosRound,
  playerId: string,
): MappedRound {
  const totalFairways = arccosRound.holes.filter((h) => h.par >= 4).length;
  const totalFairwaysHit = arccosRound.holes.filter(
    (h) => h.par >= 4 && h.fairway_hit === true,
  ).length;
  const totalGirPossible = arccosRound.holes.length;
  const totalGir = arccosRound.holes.filter((h) => h.gir).length;
  const totalPutts = arccosRound.holes.reduce((s, h) => s + h.putts, 0);
  const totalPenalties = arccosRound.holes.reduce(
    (s, h) => s + h.shots.filter((sh) => sh.is_penalty).length,
    0,
  );

  const round: GolfRoundInsert = {
    player_id: playerId,
    round_date: arccosRound.round_date,
    course_name: arccosRound.course_name,
    course_city: arccosRound.course_city ?? null,
    course_state: arccosRound.course_state ?? null,
    tees_played: arccosRound.tees_played ?? null,
    total_score: arccosRound.total_score,
    total_putts: totalPutts,
    total_fairways: totalFairways,
    total_fairways_hit: totalFairwaysHit,
    total_gir: totalGir,
    total_gir_possible: totalGirPossible,
    total_penalties: totalPenalties,
    holes_played: arccosRound.holes.length,
    weather_conditions: arccosRound.weather_conditions ?? null,
    round_type: 'practice',
    status: 'completed',
    notes: arccosExternalId(arccosRound.id),
  };

  const holes: GolfHoleInsert[] = [];
  const shots: GolfShotInsert[] = [];

  for (const arccosHole of arccosRound.holes) {
    const hole: GolfHoleInsert = {
      round_id: '', // placeholder — caller sets real UUID
      hole_number: arccosHole.hole_number,
      par: arccosHole.par,
      yardage: arccosHole.yardage,
      score: arccosHole.score,
      putts: arccosHole.putts,
      fairway_hit: arccosHole.fairway_hit,
      gir: arccosHole.gir,
    };
    holes.push(hole);

    for (const arccosShot of arccosHole.shots) {
      const shot: GolfShotInsert = {
        round_id: '', // placeholder — caller sets real UUID
        hole_number: arccosHole.hole_number,
        shot_number: arccosShot.shot_number,
        club_type: mapClubToType(arccosShot.club),
        shot_type: deriveShotType(arccosShot, arccosHole),
        lie_before: mapLie(arccosShot.lie),
        result: mapResult(arccosShot.result, arccosShot.is_penalty),
        shot_distance: arccosShot.distance_yards,
        distance_to_hole_before: arccosShot.distance_to_pin_before,
        distance_to_hole_after: arccosShot.distance_to_pin_after,
        is_penalty: arccosShot.is_penalty,
        penalty_type: arccosShot.penalty_type ?? null,
      };
      shots.push(shot);
    }
  }

  return { round, holes, shots };
}
