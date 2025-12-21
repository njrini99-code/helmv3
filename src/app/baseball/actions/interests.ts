'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function addToInterests(collegeId: string, schoolName: string, division?: string | null, conference?: string | null) {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Get player record
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    throw new Error('Player not found');
  }

  // Check if already in interests
  const { data: existing } = await supabase
    .from('recruiting_interests')
    .select('id')
    .eq('player_id', player.id)
    .eq('organization_id', collegeId)
    .maybeSingle();

  if (existing) {
    return { success: true, alreadyExists: true };
  }

  // Add to interests
  const { error } = await supabase
    .from('recruiting_interests')
    .insert({
      player_id: player.id,
      organization_id: collegeId,
      school_name: schoolName,
      division: division || null,
      conference: conference || null,
      status: 'interested',
      interest_level: 'researching',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Error adding to interests:', error);
    throw new Error('Failed to add to interests');
  }

  revalidatePath('/baseball/dashboard/colleges');
  revalidatePath('/baseball/dashboard/journey');

  return { success: true };
}

export async function removeFromInterests(collegeId: string) {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Get player record
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    throw new Error('Player not found');
  }

  // Remove from interests
  const { error } = await supabase
    .from('recruiting_interests')
    .delete()
    .eq('player_id', player.id)
    .eq('organization_id', collegeId);

  if (error) {
    console.error('Error removing from interests:', error);
    throw new Error('Failed to remove from interests');
  }

  revalidatePath('/baseball/dashboard/colleges');
  revalidatePath('/baseball/dashboard/journey');

  return { success: true };
}

export async function getPlayerInterests() {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { interests: [] };
  }

  // Get player record
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!player) {
    return { interests: [] };
  }

  // Get interests
  const { data: interests } = await supabase
    .from('recruiting_interests')
    .select('*')
    .eq('player_id', player.id);

  return { interests: interests || [] };
}
