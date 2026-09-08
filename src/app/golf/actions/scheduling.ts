'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserBusyPeriodsWithStatus } from '@/lib/calendar/availability';
import { getValidTimezone } from '@/lib/calendar/timezone';
import { wallClockInZone } from '@/lib/golf/timezone';
import type { ScheduleParticipant, ScheduleWindowRequest, ScheduleWindowResult } from '@/lib/calendar/scheduling-contracts';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';

/** RLS-backed snapshot. Only managed-team coaches may compare other players. */
export async function getScheduleWindow(request: ScheduleWindowRequest): Promise<ScheduleWindowResult> {
  try {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(request.teamId) || !/^\d{4}-\d{2}-\d{2}$/.test(request.date)
      || !Array.isArray(request.participantIds) || request.participantIds.length > 100
      || request.participantIds.some((id) => !uuid.test(id))
      || (request.excludeEventId && !uuid.test(request.excludeEventId))) {
      return { success: false, error: 'Choose a valid date and team members.' };
    }
    const [year, month, day] = request.date.split('-').map(Number);
    const date = new Date(year!, month! - 1, day!);
    if (date.getFullYear() !== year || date.getMonth() !== month! - 1 || date.getDate() !== day) {
      return { success: false, error: 'Choose a valid calendar date.' };
    }
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Sign in to view schedules.' };
    const [coachAccess, playerAccess] = await Promise.all([
      supabase.rpc('is_golf_team_coach', { team_uuid: request.teamId }),
      supabase.rpc('is_golf_team_player', { team_uuid: request.teamId }),
    ]);
    if (coachAccess.error || playerAccess.error || (!coachAccess.data && !playerAccess.data)) {
      return { success: false, error: 'You do not have access to this team schedule.' };
    }
    // The edited event is confirmed to belong to this team BEFORE the identity
    // reads below. Order matters beyond readability: check-schema-invariants.sh
    // flags a golf_coaches query with a `.eq('team_id')` within six lines of it,
    // and golf_coaches has no team_id column. This golf_events filter is a
    // legitimate team_id use, so it stays out of that proximity window.
    if (request.excludeEventId) {
      const event = await supabase.from('golf_events').select('id').eq('id', request.excludeEventId).eq('team_id', request.teamId).maybeSingle();
      if (event.error || !event.data) return { success: false, error: 'The event is no longer available.' };
    }
    const [team, coach, player] = await Promise.all([
      supabase.from('golf_teams').select('timezone').eq('id', request.teamId).single(),
      supabase.from('golf_coaches').select('id, user_id, full_name, avatar_url').eq('user_id', user.id).maybeSingle(),
      supabase.from('golf_players').select('id, user_id, first_name, last_name, avatar_url').eq('user_id', user.id).maybeSingle(),
    ]);
    if (team.error || coach.error || player.error) return { success: false, error: 'Schedules could not be verified. Please retry.' };
    const requestedIds = [...new Set(request.participantIds)];
    const self = coachAccess.data && coach.data
      ? { id: coach.data.id, userId: user.id, kind: 'coach' as const, name: coach.data.full_name || 'You', avatarUrl: coach.data.avatar_url }
      : player.data
        ? { id: player.data.id, userId: user.id, kind: 'player' as const, name: `${player.data.first_name ?? ''} ${player.data.last_name ?? ''}`.trim() || 'You', avatarUrl: player.data.avatar_url }
        : null;
    if (!self) return { success: false, error: 'Your calendar profile could not be verified.' };
    const others = requestedIds.filter((id) => id !== self.id);
    if (!coachAccess.data && others.length) return { success: false, error: 'Only your own schedule is available.' };
    const members = others.length ? await fetchAllRows<{ player_id: string }>((from, to) => supabase
      .from('golf_team_members').select('player_id').eq('team_id', request.teamId).eq('status', 'active')
      .in('player_id', others).order('player_id').range(from, to)) : [];
    if (others.some((id) => !members.some((member) => member.player_id === id))) {
      return { success: false, error: 'One or more people are no longer on this team.' };
    }
    const profiles = others.length ? await supabase.from('golf_players')
      .select('id, user_id, first_name, last_name, avatar_url').in('id', others) : { data: [], error: null };
    if (profiles.error || profiles.data?.length !== others.length) {
      return { success: false, error: 'One or more player profiles could not be verified.' };
    }
    const people = [self, ...(profiles.data ?? []).map((p) => ({
      id: p.id, userId: p.user_id, kind: 'player' as const,
      name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Team member', avatarUrl: p.avatar_url,
    }))];
    const timeZone = getValidTimezone(team.data.timezone);
    const nextDate = new Date(date); nextDate.setDate(nextDate.getDate() + 1);
    const start = wallClockInZone(date, '00:00', timeZone);
    const end = wallClockInZone(nextDate, '00:00', timeZone);
    const participants: ScheduleParticipant[] = [];
    // Bound per-person query fan-out; snapshots are cached by the calling hook.
    for (let offset = 0; offset < people.length; offset += 4) {
      participants.push(...await Promise.all(people.slice(offset, offset + 4).map(async (person): Promise<ScheduleParticipant> => {
        const base = { id: person.id, kind: person.kind, name: person.name, avatarUrl: person.avatarUrl, isViewer: person.id === self.id, required: true };
        if (!person.userId) return { ...base, verification: 'failed', intervals: [] };
        try {
          const result = await getUserBusyPeriodsWithStatus(person.userId, start, end, supabase);
          return { ...base, verification: result.partial ? 'partial' : 'complete', intervals: result.periods
            .filter((period) => period.eventId !== request.excludeEventId || !request.excludeEventId)
            .filter((period) => Number.isFinite(+period.start) && Number.isFinite(+period.end) && period.end > period.start)
            .map((period, index) => ({ id: `${person.id}:${period.eventId ?? 'busy'}:${index}`, start: period.start.toISOString(), end: period.end.toISOString(), type: period.type, title: period.title || 'Busy', ...(period.eventId ? { eventId: period.eventId } : {}) })) };
        } catch { return { ...base, verification: 'failed', intervals: [] }; }
      })));
    }
    return { success: true, data: { teamId: request.teamId, timeZone, window: { start: start.toISOString(), end: end.toISOString() }, checkedAt: new Date().toISOString(), participants } };
  } catch {
    return { success: false, error: 'Schedules could not be loaded. Your selection has been kept.' };
  }
}
