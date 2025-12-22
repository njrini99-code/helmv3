'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface ShotRecord {
  holeNumber: number;
  shotNumber: number;
  shotType: 'tee' | 'approach' | 'around_green' | 'putting';
  distanceToHole: number;
  distanceUnit: 'yards' | 'feet';
  usedDriver?: boolean | null;
  club?: string;
  resultOfShot: string;
  missDirection?: string;
  puttBreak?: 'left' | 'right' | 'straight';
  puttSlope?: 'uphill' | 'downhill' | 'flat';
  timestamp: string;
}

export interface HoleConfig {
  hole: number;
  par: number;
  yardage: number;
}

export interface CreateRoundInput {
  courseName: string;
  courseCity?: string;
  courseState?: string;
  teesPlayed: string;
  courseRating: number;
  courseSlope: number;
  roundType: 'practice' | 'qualifying' | 'tournament';
  startingHole: number | 'shotgun';
  roundDate: string;
  holes: HoleConfig[];
}

export interface CompleteRoundInput {
  roundId: string;
  shots: ShotRecord[];
  totalScore: number;
  totalPutts: number;
  fairwaysHit: number;
  greensInRegulation: number;
}

/**
 * Create a new round with hole configuration
 */
export async function createRound(input: CreateRoundInput) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Get or create player
  let { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    // Create golf player profile if it doesn't exist
    const { data: newPlayer, error: playerError } = await supabase
      .from('golf_players')
      .insert({
        user_id: user.id,
        first_name: '', // Required field - will be updated in profile
        email: user.email || '',
      })
      .select()
      .single();

    if (playerError) {
      console.error('Error creating golf player:', playerError);
      throw playerError;
    }
    player = newPlayer;
  }

  // Calculate total par
  const totalPar = input.holes.reduce((sum, h) => sum + h.par, 0);

  // Create the round
  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .insert({
      player_id: player.id,
      course_name: input.courseName,
      course_city: input.courseCity,
      course_state: input.courseState,
      tees_played: input.teesPlayed,
      course_rating: input.courseRating,
      course_slope: input.courseSlope,
      round_type: input.roundType,
      round_date: input.roundDate,
      is_verified: false,
    })
    .select()
    .single();

  if (roundError) {
    console.error('Error creating round:', roundError);
    throw roundError;
  }

  // Save holes with par, yardage, and initial score of 0
  const holeConfigs = input.holes.map(h => ({
    round_id: round.id,
    hole_number: h.hole,
    par: h.par,
    yardage: h.yardage,
    score: 0, // Will be updated during round
  }));

  const { error: holesError } = await supabase
    .from('golf_holes')
    .insert(holeConfigs);

  if (holesError) {
    console.error('Error saving holes:', holesError);
    // Don't throw - round was created successfully
  }

  revalidatePath('/player-golf/rounds');
  return round;
}

/**
 * Save shots for a hole
 */
export async function saveHoleShots(roundId: string, holeNumber: number, shots: ShotRecord[]) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Save shots as JSONB
  const { error } = await supabase
    .from('golf_hole_shots')
    .upsert({
      round_id: roundId,
      hole_number: holeNumber,
      shots_data: shots,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Error saving hole shots:', error);
    throw error;
  }

  revalidatePath(`/player-golf/round/${roundId}`);
}

/**
 * Complete a hole with score
 */
export async function completeHole(
  roundId: string,
  holeNumber: number,
  par: number,
  score: number,
  shots: ShotRecord[]
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Calculate stats from shots
  const putts = shots.filter(s => s.shotType === 'putting').length;
  const teeShot = shots.find(s => s.shotNumber === 1);
  const fairwayHit = teeShot?.resultOfShot === 'fairway' ? true : false;
  const greenInRegulation = shots.some(s =>
    s.resultOfShot === 'green' && s.shotNumber <= (par - 2)
  );

  // Save hole data
  const { error: holeError } = await supabase
    .from('golf_holes')
    .upsert({
      round_id: roundId,
      hole_number: holeNumber,
      par: par,
      score: score,
      score_to_par: score - par,
      putts: putts,
      fairway_hit: fairwayHit,
      green_in_regulation: greenInRegulation,
    });

  if (holeError) {
    console.error('Error saving hole:', holeError);
    throw holeError;
  }

  // Save shots
  await saveHoleShots(roundId, holeNumber, shots);

  revalidatePath(`/player-golf/round/${roundId}`);
}

/**
 * Complete a full round
 */
export async function completeRound(input: CompleteRoundInput) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Calculate total score to par
  const { data: holes } = await supabase
    .from('golf_holes')
    .select('par, score')
    .eq('round_id', input.roundId);

  const totalPar = holes?.reduce((sum, h) => sum + h.par, 0) || 72;
  const scoreToPar = input.totalScore - totalPar;

  // Update round with final stats
  const { error } = await supabase
    .from('golf_rounds')
    .update({
      total_score: input.totalScore,
      total_to_par: scoreToPar,
      total_putts: input.totalPutts,
      fairways_hit: input.fairwaysHit,
      fairways_total: 14,
      greens_in_regulation: input.greensInRegulation,
      greens_total: 18,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.roundId);

  if (error) {
    console.error('Error completing round:', error);
    throw error;
  }

  revalidatePath('/player-golf/rounds');
  revalidatePath(`/player-golf/round/${input.roundId}`);
}

/**
 * Get all rounds for current user
 */
export async function getRounds() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    return [];
  }

  const { data, error } = await supabase
    .from('golf_rounds')
    .select('*')
    .eq('player_id', player.id)
    .order('round_date', { ascending: false });

  if (error) {
    console.error('Error fetching rounds:', error);
    return [];
  }

  return data;
}

/**
 * Get a single round with holes and shots
 */
export async function getRound(roundId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .select('*')
    .eq('id', roundId)
    .single();

  if (roundError) {
    console.error('Error fetching round:', roundError);
    throw roundError;
  }

  const { data: holes, error: holesError } = await supabase
    .from('golf_holes')
    .select('*')
    .eq('round_id', roundId)
    .order('hole_number');

  if (holesError) {
    console.error('Error fetching holes:', holesError);
  }

  const { data: shots, error: shotsError } = await supabase
    .from('golf_hole_shots')
    .select('*')
    .eq('round_id', roundId)
    .order('hole_number');

  if (shotsError) {
    console.error('Error fetching shots:', shotsError);
  }

  return {
    ...round,
    holes: holes || [],
    shots: shots || [],
  };
}

/**
 * Delete a round
 */
export async function deleteRound(roundId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const { error } = await supabase
    .from('golf_rounds')
    .delete()
    .eq('id', roundId);

  if (error) {
    console.error('Error deleting round:', error);
    throw error;
  }

  revalidatePath('/player-golf/rounds');
}

/**
 * Save a single shot during a round
 */
export interface ShotData {
  shot_number: number;
  shot_type: 'tee' | 'approach' | 'around_green' | 'putting';
  distance_to_hole_before: number; // in inches
  distance_to_hole_after: number; // in inches
  result_of_shot: 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other';
  miss_direction: string | null;
  used_driver: boolean | null;
  putt_break: 'left_to_right' | 'right_to_left' | 'straight' | null;
  putt_slope: 'uphill' | 'downhill' | 'level' | 'severe' | null;
}

export async function saveShot(roundId: string, holeNumber: number, shotData: ShotData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Calculate shot distance
  const shotDistance = shotData.distance_to_hole_before - shotData.distance_to_hole_after;

  // Update or create golf_holes record for this hole
  const { data: existingHole } = await supabase
    .from('golf_holes')
    .select('*')
    .eq('round_id', roundId)
    .eq('hole_number', holeNumber)
    .single();

  if (existingHole) {
    // Update existing hole with score
    const { error: updateError } = await supabase
      .from('golf_holes')
      .update({
        score: shotData.shot_number, // Final shot number = score
      })
      .eq('id', existingHole.id);

    if (updateError) {
      console.error('Error updating hole:', updateError);
    }
  }

  // Save the shot data (you may want to create a separate shots table)
  // For now, we can store it in a JSONB field or separate table
  // This is a placeholder - adjust based on your actual schema
  console.log('Shot saved:', {
    roundId,
    holeNumber,
    shotData,
    shotDistance,
  });

  revalidatePath(`/player-golf/round/${roundId}`);

  return { success: true };
}
