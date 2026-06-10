'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getAppUrl } from '@/lib/utils/env';

type FeedType = 'team' | 'personal';
type UserRole = 'coach' | 'player';

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface CalendarFeedRecord {
  id: string;
  name: string;
  type: FeedType;
  url: string;
  created_at: string;
  last_synced_at?: string | null;
}

interface UserContext {
  role: UserRole;
  userId: string;
  teamId: string | null;
  coachId: string | null;
  playerId: string | null;
  displayName: string;
}

function buildFeedUrl(token: string): string {
  const baseUrl = getAppUrl();
  return new URL(`/api/calendar/feeds/${token}`, baseUrl).toString();
}

async function getUserContext(): Promise<ActionResult<UserContext>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Check if user is a coach
  // Note: golf_coaches doesn't have team_id - need to look up via organization
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, full_name, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coach) {
    // Get team_id from golf_teams via organization_id
    let teamId: string | null = null;
    if (coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      teamId = team?.id ?? null;
    }

    return {
      success: true,
      data: {
        role: 'coach',
        userId: user.id,
        teamId,
        coachId: coach.id,
        playerId: null,
        displayName: coach.full_name || 'Coach',
      },
    };
  }

  // Check if user is a player
  // Note: golf_players doesn't have team_id - need to look up via golf_team_members
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (player) {
    // Get team_id from golf_team_members
    const { data: teamMember } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .maybeSingle();

    const name = [player.first_name, player.last_name].filter(Boolean).join(' ');
    return {
      success: true,
      data: {
        role: 'player',
        userId: user.id,
        teamId: teamMember?.team_id ?? null,
        coachId: null,
        playerId: player.id,
        displayName: name || 'Player',
      },
    };
  }

  return { success: false, error: 'Profile not found' };
}

export async function getCalendarFeeds(): Promise<ActionResult<CalendarFeedRecord[]>> {
  const contextResult = await getUserContext();
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error || 'Failed to load calendar feeds' };
  }

  const { userId } = contextResult.data;
  const supabase = await createClient();

  // Query golf_calendar_feeds table for user's feeds
  const { data: feeds, error } = await supabase
    .from('golf_calendar_feeds')
    .select('id, name, feed_type, feed_token, team_id, player_id, is_active, last_synced_at, created_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: 'Failed to fetch calendar feeds' };
  }

  const result: CalendarFeedRecord[] = (feeds || [])
    .filter(feed => feed.feed_token) // Filter out feeds without tokens
    .map(feed => ({
      id: feed.id,
      name: feed.name || (feed.team_id ? 'Team Calendar' : 'Personal Calendar'),
      type: feed.team_id ? 'team' : 'personal',
      url: buildFeedUrl(feed.feed_token!), // Safe due to filter above
      created_at: feed.created_at ?? new Date().toISOString(),
      last_synced_at: feed.last_synced_at,
    }));

  return { success: true, data: result };
}

export async function createCalendarFeed(
  type: FeedType,
  name?: string
): Promise<ActionResult<CalendarFeedRecord>> {
  const contextResult = await getUserContext();
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error || 'Failed to create feed' };
  }

  const { role, userId, teamId, playerId, displayName } = contextResult.data;
  const supabase = await createClient();

  if (type === 'team') {
    if (role !== 'coach') {
      return { success: false, error: 'Only coaches can create team feeds' };
    }
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }
  }

  // Create new feed in golf_calendar_feeds table
  const feedName = name || (type === 'team' ? 'Team Calendar' : `${displayName} Calendar`);

  const { data: newFeed, error } = await supabase
    .from('golf_calendar_feeds')
    .insert({
      user_id: userId,
      name: feedName,
      feed_type: 'all_events',
      team_id: type === 'team' ? teamId : null,
      player_id: type === 'personal' ? playerId : null,
      is_active: true,
    })
    .select('id, name, feed_type, feed_token, team_id, created_at, last_synced_at')
    .single();

  if (error || !newFeed || !newFeed.feed_token) {
    return { success: false, error: 'Failed to create calendar feed' };
  }

  revalidatePath('/golf/dashboard/calendar');
  revalidatePath('/golf/dashboard/settings');

  return {
    success: true,
    data: {
      id: newFeed.id,
      name: newFeed.name || feedName,
      type,
      url: buildFeedUrl(newFeed.feed_token),
      created_at: newFeed.created_at ?? new Date().toISOString(),
      last_synced_at: newFeed.last_synced_at,
    },
  };
}

export async function regenerateCalendarFeed(type: FeedType): Promise<ActionResult<CalendarFeedRecord>> {
  const contextResult = await getUserContext();
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error || 'Failed to regenerate feed' };
  }

  const { role, userId } = contextResult.data;
  const supabase = await createClient();

  if (type === 'team' && role !== 'coach') {
    return { success: false, error: 'Only coaches can manage team feeds' };
  }

  // Find existing feed
  let query = supabase
    .from('golf_calendar_feeds')
    .select('id, name')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (type === 'team') {
    query = query.not('team_id', 'is', null);
  } else {
    query = query.is('team_id', null);
  }

  const { data: existingFeed, error: findError } = await query.maybeSingle();

  if (findError || !existingFeed) {
    return { success: false, error: 'Feed not found' };
  }

  // Delete existing feed and create a new one with a new token
  const { error: deleteError } = await supabase
    .from('golf_calendar_feeds')
    .delete()
    .eq('id', existingFeed.id);

  if (deleteError) {
    return { success: false, error: 'Failed to regenerate feed' };
  }

  // Create new feed with new token
  return createCalendarFeed(type, existingFeed.name ?? undefined);
}

export async function deleteCalendarFeed(type: FeedType): Promise<ActionResult<void>> {
  const contextResult = await getUserContext();
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error || 'Failed to delete feed' };
  }

  const { role, userId } = contextResult.data;
  const supabase = await createClient();

  if (type === 'team' && role !== 'coach') {
    return { success: false, error: 'Only coaches can manage team feeds' };
  }

  // Find and deactivate the feed
  let query = supabase
    .from('golf_calendar_feeds')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true);

  if (type === 'team') {
    query = query.not('team_id', 'is', null);
  } else {
    query = query.is('team_id', null);
  }

  const { error } = await query;

  if (error) {
    return { success: false, error: 'Failed to disable calendar feed' };
  }

  revalidatePath('/golf/dashboard/calendar');
  revalidatePath('/golf/dashboard/settings');

  return { success: true, data: undefined };
}

/**
 * Get or create a calendar feed token for the current user.
 * This is the simplified version for the CalendarSyncButton component.
 * Returns an existing active feed or creates a new one.
 */
export async function getOrCreateCalendarFeedToken(): Promise<ActionResult<{ url: string; token: string }>> {
  const contextResult = await getUserContext();
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error || 'Not authenticated' };
  }

  const { userId, teamId, displayName } = contextResult.data;
  const supabase = await createClient();

  // First, check if user already has an active feed. Latest-first + limit(1)
  // keeps this deterministic (and non-erroring) when the user holds multiple
  // active feeds, and matches the feed regenerateCalendarFeedToken targets.
  const { data: existingFeed, error: fetchError } = await supabase
    .from('golf_calendar_feeds')
    .select('id, feed_token')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: 'Failed to check for existing feed' };
  }

  // If feed exists and has a token, return it
  if (existingFeed?.feed_token) {
    return {
      success: true,
      data: {
        url: buildFeedUrl(existingFeed.feed_token),
        token: existingFeed.feed_token,
      },
    };
  }

  // Create a new feed for the user
  const feedName = `${displayName} Calendar`;
  const { data: newFeed, error: createError } = await supabase
    .from('golf_calendar_feeds')
    .insert({
      user_id: userId,
      name: feedName,
      feed_type: 'all_events',
      team_id: teamId, // Include team if available
      is_active: true,
    })
    .select('id, feed_token')
    .single();

  if (createError || !newFeed?.feed_token) {
    return { success: false, error: 'Failed to create calendar feed' };
  }

  return {
    success: true,
    data: {
      url: buildFeedUrl(newFeed.feed_token),
      token: newFeed.feed_token,
    },
  };
}

/**
 * Regenerate the calendar feed token for the current user.
 * Invalidates the old URL and creates a new one.
 *
 * Scoping: only the feed being rotated (the one getOrCreateCalendarFeedToken
 * surfaces — the user's most recent active feed) is deactivated. A user's
 * OTHER feeds (e.g. a coach's separate team feed) must keep working; the old
 * behavior of deactivating every active feed for the user broke them all.
 */
export async function regenerateCalendarFeedToken(): Promise<ActionResult<{ url: string; token: string }>> {
  const contextResult = await getUserContext();
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error || 'Not authenticated' };
  }

  const { userId, teamId, displayName } = contextResult.data;
  const supabase = await createClient();

  // Find the single targeted feed (same selection getOrCreateCalendarFeedToken
  // uses: the user's latest active feed).
  const { data: existingFeed, error: findError } = await supabase
    .from('golf_calendar_feeds')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    return { success: false, error: 'Failed to look up existing feed' };
  }

  // Deactivate ONLY the targeted feed (if one exists).
  if (existingFeed) {
    const { error: deactivateError } = await supabase
      .from('golf_calendar_feeds')
      .update({ is_active: false })
      .eq('id', existingFeed.id);

    if (deactivateError) {
      return { success: false, error: 'Failed to invalidate old feed' };
    }
  }

  // Create a new feed with a new token
  const feedName = `${displayName} Calendar`;
  const { data: newFeed, error: createError } = await supabase
    .from('golf_calendar_feeds')
    .insert({
      user_id: userId,
      name: feedName,
      feed_type: 'all_events',
      team_id: teamId,
      is_active: true,
    })
    .select('id, feed_token')
    .single();

  if (createError || !newFeed?.feed_token) {
    return { success: false, error: 'Failed to create new calendar feed' };
  }

  revalidatePath('/golf/dashboard/calendar');
  revalidatePath('/golf/dashboard/settings');

  return {
    success: true,
    data: {
      url: buildFeedUrl(newFeed.feed_token),
      token: newFeed.feed_token,
    },
  };
}
