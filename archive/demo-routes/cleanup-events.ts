'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function deleteAllGolfEvents() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Verify user is a golf player
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (!player || !player.team_id) {
    throw new Error('Must be a golf player with a team');
  }

  console.log('Deleting all events for team:', player.team_id);

  // Delete all events for this team
  const { error } = await supabase
    .from('golf_events')
    .delete()
    .eq('team_id', player.team_id);

  if (error) {
    console.error('Error deleting events:', error);
    throw error;
  }

  console.log('✅ All events deleted');

  revalidatePath('/golf/dashboard/calendar');
  return { success: true };
}
