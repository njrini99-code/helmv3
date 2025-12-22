'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { CreateRoundInput, ShotData } from './rounds';

/**
 * DEV MODE ONLY - Create a round without authentication
 * This bypasses all auth checks for testing purposes
 */
export async function createRoundDevMode(input: CreateRoundInput) {
  const supabase = await createClient();

  // Skip auth - look for ANY existing player to use for dev testing
  let { data: players } = await supabase
    .from('golf_players')
    .select('id')
    .limit(1);

  let player;

  if (!players || players.length === 0) {
    // No players exist - we need to create one manually
    // Try to create without user_id dependency
    console.log('⚠️ No golf players found. Attempting to create dev player...');

    // This will likely fail due to RLS, but we'll try
    const { data: newPlayer, error: playerError } = await supabase
      .from('golf_players')
      .insert({
        first_name: 'Dev',
        last_name: 'Tester',
      })
      .select()
      .single();

    if (playerError) {
      console.error('❌ Could not create dev player (RLS blocking):', playerError);
      throw new Error(
        'No golf players exist in database. Please create one manually via Supabase dashboard or sign in with a test account first.'
      );
    }
    player = newPlayer;
  } else {
    // Use first available player
    player = players[0];
    // Ensure player exists
    if (!player) {
      throw new Error('No player available for dev mode round creation');
    }
    console.log('✅ Using existing player:', player.id);
  }

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
    throw new Error('Failed to create round: ' + roundError.message);
  }

  // Save holes
  const holeConfigs = input.holes.map(h => ({
    round_id: round.id,
    hole_number: h.hole,
    par: h.par,
    yardage: h.yardage,
    score: 0,
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
 * DEV MODE ONLY - Save shot without authentication
 */
export async function saveShotDevMode(roundId: string, holeNumber: number, shotData: ShotData) {
  const supabase = await createClient();

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
        score: shotData.shot_number,
      })
      .eq('id', existingHole.id);

    if (updateError) {
      console.error('Error updating hole:', updateError);
    }
  }

  console.log('Shot saved (DEV MODE):', {
    roundId,
    holeNumber,
    shotData,
    shotDistance,
  });

  revalidatePath(`/player-golf/round/${roundId}`);

  return { success: true };
}

/**
 * DEV MODE ONLY - Complete hole without authentication
 */
export async function completeHoleDevMode(
  roundId: string,
  holeNumber: number,
  par: number,
  score: number
) {
  const supabase = await createClient();

  const { error: holeError } = await supabase
    .from('golf_holes')
    .update({
      score: score,
      score_to_par: score - par,
    })
    .eq('round_id', roundId)
    .eq('hole_number', holeNumber);

  if (holeError) {
    console.error('Error saving hole:', holeError);
    throw holeError;
  }

  revalidatePath(`/player-golf/round/${roundId}`);
}
