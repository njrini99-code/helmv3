'use server';

import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
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

interface TeamRecord {
  id: string;
  name: string | null;
  calendar_feed_token: string | null;
  calendar_feed_enabled: boolean | null;
  created_at: string | null;
}

interface CoachRecord {
  id: string;
  full_name: string | null;
  team_id: string | null;
  calendar_feed_token: string | null;
  calendar_feed_enabled: boolean | null;
  created_at: string | null;
}

interface PlayerRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  team_id: string | null;
  calendar_feed_token: string | null;
  calendar_feed_enabled: boolean | null;
  created_at: string | null;
}

interface UserContext {
  role: UserRole;
  team: TeamRecord | null;
  coach: CoachRecord | null;
  player: PlayerRecord | null;
}

function formatPersonalName(role: UserRole, coach: CoachRecord | null, player: PlayerRecord | null) {
  if (role === 'coach' && coach?.full_name) {
    return `${coach.full_name} Calendar`;
  }
  if (role === 'player') {
    const name = [player?.first_name, player?.last_name].filter(Boolean).join(' ');
    return name ? `${name} Calendar` : 'Personal Calendar';
  }
  return 'Personal Calendar';
}

function formatTeamName(team: TeamRecord | null) {
  return team?.name ? `${team.name} Team Calendar` : 'Team Calendar';
}

function buildFeedUrl(type: FeedType, token: string, role: UserRole) {
  const baseUrl = getAppUrl();
  const path = type === 'team'
    ? `/api/calendar/team/${token}`
    : `/api/calendar/${role === 'coach' ? 'coach' : 'player'}/${token}`;
  return new URL(path, baseUrl).toString();
}

function buildFeedRecord(params: {
  type: FeedType;
  token: string;
  role: UserRole;
  id: string;
  name: string;
  createdAt: string | null;
}): CalendarFeedRecord {
  return {
    id: params.id,
    name: params.name,
    type: params.type,
    url: buildFeedUrl(params.type, params.token, params.role),
    created_at: params.createdAt || new Date().toISOString(),
    last_synced_at: null,
  };
}

async function getUserContext(): Promise<ActionResult<UserContext>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, full_name, team_id, calendar_feed_token, calendar_feed_enabled, created_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coach) {
    const team = coach.team_id
      ? await supabase
          .from('golf_teams')
          .select('id, name, calendar_feed_token, calendar_feed_enabled, created_at')
          .eq('id', coach.team_id)
          .single()
      : null;

    return {
      success: true,
      data: {
        role: 'coach',
        team: team?.data ?? null,
        coach,
        player: null,
      },
    };
  }

  const { data: player } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name, team_id, calendar_feed_token, calendar_feed_enabled, created_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!player) {
    return { success: false, error: 'Profile not found' };
  }

  const team = player.team_id
    ? await supabase
        .from('golf_teams')
        .select('id, name, calendar_feed_token, calendar_feed_enabled, created_at')
        .eq('id', player.team_id)
        .single()
    : null;

  return {
    success: true,
    data: {
      role: 'player',
      team: team?.data ?? null,
      coach: null,
      player,
    },
  };
}

export async function getCalendarFeeds(): Promise<ActionResult<CalendarFeedRecord[]>> {
  const contextResult = await getUserContext();
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error || 'Failed to load calendar feeds' };
  }

  const { role, team, coach, player } = contextResult.data;
  const feeds: CalendarFeedRecord[] = [];

  if (team?.calendar_feed_enabled !== false && team?.calendar_feed_token) {
    feeds.push(buildFeedRecord({
      type: 'team',
      token: team.calendar_feed_token,
      role,
      id: `team:${team.id}`,
      name: formatTeamName(team),
      createdAt: team.created_at,
    }));
  }

  const personalToken = role === 'coach' ? coach?.calendar_feed_token : player?.calendar_feed_token;
  const personalEnabled = role === 'coach' ? coach?.calendar_feed_enabled : player?.calendar_feed_enabled;

  if (personalEnabled !== false && personalToken) {
    feeds.push(buildFeedRecord({
      type: 'personal',
      token: personalToken,
      role,
      id: role === 'coach' && coach ? `coach:${coach.id}` : `player:${player?.id || 'unknown'}`,
      name: formatPersonalName(role, coach, player),
      createdAt: role === 'coach' ? coach?.created_at ?? null : player?.created_at ?? null,
    }));
  }

  return { success: true, data: feeds };
}

export async function createCalendarFeed(
  type: FeedType,
  _name?: string
): Promise<ActionResult<CalendarFeedRecord>> {
  void _name;
  const contextResult = await getUserContext();
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error || 'Failed to create feed' };
  }

  const { role, team, coach, player } = contextResult.data;
  const supabase = await createClient();

  if (type === 'team') {
    if (role !== 'coach') {
      return { success: false, error: 'Only coaches can manage team feeds' };
    }
    if (!team) {
      return { success: false, error: 'Team not found for this account' };
    }

    const token = team.calendar_feed_token || randomUUID();
    const { data: updatedTeam, error } = await supabase
      .from('golf_teams')
      .update({
        calendar_feed_enabled: true,
        calendar_feed_token: token,
      })
      .eq('id', team.id)
      .select('id, name, calendar_feed_token, calendar_feed_enabled, created_at')
      .single();

    if (error || !updatedTeam?.calendar_feed_token) {
      return { success: false, error: 'Failed to enable team feed' };
    }

    return {
      success: true,
      data: buildFeedRecord({
        type: 'team',
        token: updatedTeam.calendar_feed_token,
        role,
        id: `team:${updatedTeam.id}`,
        name: formatTeamName(updatedTeam),
        createdAt: updatedTeam.created_at,
      }),
    };
  }

  if (role === 'coach' && coach) {
    const token = coach.calendar_feed_token || randomUUID();
    const { data: updatedCoach, error } = await supabase
      .from('golf_coaches')
      .update({
        calendar_feed_enabled: true,
        calendar_feed_token: token,
      })
      .eq('id', coach.id)
      .select('id, full_name, calendar_feed_token, calendar_feed_enabled, created_at')
      .single();

    if (error || !updatedCoach?.calendar_feed_token) {
      return { success: false, error: 'Failed to enable personal feed' };
    }

    return {
      success: true,
      data: buildFeedRecord({
        type: 'personal',
        token: updatedCoach.calendar_feed_token,
        role,
        id: `coach:${updatedCoach.id}`,
        name: formatPersonalName(role, updatedCoach, null),
        createdAt: updatedCoach.created_at,
      }),
    };
  }

  if (role === 'player' && player) {
    const token = player.calendar_feed_token || randomUUID();
    const { data: updatedPlayer, error } = await supabase
      .from('golf_players')
      .update({
        calendar_feed_enabled: true,
        calendar_feed_token: token,
      })
      .eq('id', player.id)
      .select('id, first_name, last_name, calendar_feed_token, calendar_feed_enabled, created_at')
      .single();

    if (error || !updatedPlayer?.calendar_feed_token) {
      return { success: false, error: 'Failed to enable personal feed' };
    }

    return {
      success: true,
      data: buildFeedRecord({
        type: 'personal',
        token: updatedPlayer.calendar_feed_token,
        role,
        id: `player:${updatedPlayer.id}`,
        name: formatPersonalName(role, null, updatedPlayer),
        createdAt: updatedPlayer.created_at,
      }),
    };
  }

  return { success: false, error: 'Personal feed not available' };
}

export async function regenerateCalendarFeed(type: FeedType): Promise<ActionResult<CalendarFeedRecord>> {
  const contextResult = await getUserContext();
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error || 'Failed to regenerate feed' };
  }

  const { role, team, coach, player } = contextResult.data;
  const supabase = await createClient();
  const newToken = randomUUID();

  if (type === 'team') {
    if (role !== 'coach') {
      return { success: false, error: 'Only coaches can manage team feeds' };
    }
    if (!team) {
      return { success: false, error: 'Team not found for this account' };
    }

    const { data: updatedTeam, error } = await supabase
      .from('golf_teams')
      .update({
        calendar_feed_token: newToken,
        calendar_feed_enabled: true,
      })
      .eq('id', team.id)
      .select('id, name, calendar_feed_token, calendar_feed_enabled, created_at')
      .single();

    if (error || !updatedTeam?.calendar_feed_token) {
      return { success: false, error: 'Failed to regenerate team feed' };
    }

    return {
      success: true,
      data: buildFeedRecord({
        type: 'team',
        token: updatedTeam.calendar_feed_token,
        role,
        id: `team:${updatedTeam.id}`,
        name: formatTeamName(updatedTeam),
        createdAt: updatedTeam.created_at,
      }),
    };
  }

  if (role === 'coach' && coach) {
    const { data: updatedCoach, error } = await supabase
      .from('golf_coaches')
      .update({
        calendar_feed_token: newToken,
        calendar_feed_enabled: true,
      })
      .eq('id', coach.id)
      .select('id, full_name, calendar_feed_token, calendar_feed_enabled, created_at')
      .single();

    if (error || !updatedCoach?.calendar_feed_token) {
      return { success: false, error: 'Failed to regenerate personal feed' };
    }

    return {
      success: true,
      data: buildFeedRecord({
        type: 'personal',
        token: updatedCoach.calendar_feed_token,
        role,
        id: `coach:${updatedCoach.id}`,
        name: formatPersonalName(role, updatedCoach, null),
        createdAt: updatedCoach.created_at,
      }),
    };
  }

  if (role === 'player' && player) {
    const { data: updatedPlayer, error } = await supabase
      .from('golf_players')
      .update({
        calendar_feed_token: newToken,
        calendar_feed_enabled: true,
      })
      .eq('id', player.id)
      .select('id, first_name, last_name, calendar_feed_token, calendar_feed_enabled, created_at')
      .single();

    if (error || !updatedPlayer?.calendar_feed_token) {
      return { success: false, error: 'Failed to regenerate personal feed' };
    }

    return {
      success: true,
      data: buildFeedRecord({
        type: 'personal',
        token: updatedPlayer.calendar_feed_token,
        role,
        id: `player:${updatedPlayer.id}`,
        name: formatPersonalName(role, null, updatedPlayer),
        createdAt: updatedPlayer.created_at,
      }),
    };
  }

  return { success: false, error: 'Personal feed not available' };
}

export async function deleteCalendarFeed(type: FeedType): Promise<ActionResult<void>> {
  const contextResult = await getUserContext();
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error || 'Failed to disable feed' };
  }

  const { role, team, coach, player } = contextResult.data;
  const supabase = await createClient();

  if (type === 'team') {
    if (role !== 'coach') {
      return { success: false, error: 'Only coaches can manage team feeds' };
    }
    if (!team) {
      return { success: false, error: 'Team not found for this account' };
    }

    const { error } = await supabase
      .from('golf_teams')
      .update({
        calendar_feed_enabled: false,
        calendar_feed_token: null,
      })
      .eq('id', team.id);

    if (error) {
      return { success: false, error: 'Failed to disable team feed' };
    }

    return { success: true, data: undefined };
  }

  if (role === 'coach' && coach) {
    const { error } = await supabase
      .from('golf_coaches')
      .update({
        calendar_feed_enabled: false,
        calendar_feed_token: null,
      })
      .eq('id', coach.id);

    if (error) {
      return { success: false, error: 'Failed to disable personal feed' };
    }

    return { success: true, data: undefined };
  }

  if (role === 'player' && player) {
    const { error } = await supabase
      .from('golf_players')
      .update({
        calendar_feed_enabled: false,
        calendar_feed_token: null,
      })
      .eq('id', player.id);

    if (error) {
      return { success: false, error: 'Failed to disable personal feed' };
    }

    return { success: true, data: undefined };
  }

  return { success: false, error: 'Personal feed not available' };
}
