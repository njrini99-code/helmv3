'use server';

import { createClient } from '@/lib/supabase/server';

export async function trackProfileView(playerId: string) {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false };
  }

  // Check if user is a coach
  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    // Not a coach, no need to track
    return { success: false };
  }

  // Check if we've already logged a profile view for this player recently (within 24 hours)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentView } = await supabase
    .from('player_engagement_events')
    .select('id')
    .eq('player_id', playerId)
    .eq('coach_id', coach.id)
    .eq('engagement_type', 'profile_view')
    .gte('engagement_date', twentyFourHoursAgo)
    .maybeSingle();

  if (recentView) {
    // Already viewed recently, don't duplicate
    return { success: true, duplicate: true };
  }

  // Log the profile view
  const { error } = await supabase
    .from('player_engagement_events')
    .insert({
      player_id: playerId,
      coach_id: coach.id,
      engagement_type: 'profile_view',
      engagement_date: new Date().toISOString(),
      is_anonymous: false,
      metadata: { source: 'player_detail' },
    });

  if (error) {
    return { success: false };
  }

  return { success: true };
}

export async function trackContactClick(playerId: string, contactType: 'email' | 'phone') {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false };
  }

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { success: false };
  }

  const { error } = await supabase
    .from('player_engagement_events')
    .insert({
      player_id: playerId,
      coach_id: coach.id,
      engagement_type: 'contact_click',
      engagement_date: new Date().toISOString(),
      is_anonymous: false,
      metadata: { contact_type: contactType },
    });

  if (error) {
    return { success: false };
  }

  return { success: true };
}
