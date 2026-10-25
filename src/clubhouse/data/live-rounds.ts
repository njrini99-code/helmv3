import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { dayInZone, fetchLiveSnapshot } from '../live/live-queries';
import { laneMatchesScope, type LiveScope } from '../live/scope';
import { EMPTY_SNAPSHOT, type LiveLane, type LiveSnapshot } from '../live/model';
import { loadTeamZone } from './season';

export type { LiveScope } from '../live/scope';

/**
 * Live rounds (P-6): the first paint of Home's Live now card, the live view, the player's own card and the teammates
 * card. One server read through the viewer's own session, so RLS decides who sees what: a coach sees the rounds their
 * players share (and every qualifier and tournament round), a player sees their own and, when they are not on the course
 * themselves, the practice rounds teammates shared with the team. The client hook polls the same reads afterwards
 * (`live/live-queries.ts`). Until held migration 20261025050000 is applied the table is absent and this reads the v0 poll
 * (qualifier and tournament rounds only); nothing here writes, and shot tracking is untouched.
 */

export interface LiveLoadInput {
  teamId: string;
  viewer: { role: 'coach' | 'player'; playerId: string | null };
  scope?: LiveScope;
  now?: Date;
}

export async function loadLiveRounds(input: LiveLoadInput): Promise<LiveSnapshot> {
  const supabase = await createClient();
  const now = input.now ?? new Date();
  try {
    const zone = await loadTeamZone(supabase, input.teamId, 'live');
    const snap = await fetchLiveSnapshot(supabase, { teamId: input.teamId, role: input.viewer.role, playerId: input.viewer.playerId, now, zone });
    if (snap.error) chLogServer('live', 'lanes', new Error('a live rounds read failed'));
    const scope = input.scope;
    return scope ? { ...snap, lanes: snap.lanes.filter((l) => laneMatchesScope(l, scope)) } : snap;
  } catch (error) {
    chLogServer('live', 'snapshot', error);
    return { ...EMPTY_SNAPSHOT(input.teamId), fetchedAt: now.toISOString(), error: true };
  }
}

/** The calendar event behind `?event=`: its day (in the team's zone) and course, which narrow the lanes. */
export async function loadEventScope(input: { teamId: string; eventId: string }): Promise<LiveScope | null> {
  const supabase = await createClient();
  const [zone, ev] = await Promise.all([
    loadTeamZone(supabase, input.teamId, 'live'),
    supabase.from('golf_events').select('start_time, course_id').eq('id', input.eventId).eq('team_id', input.teamId).maybeSingle(),
  ]);
  if (ev.error) chLogServer('live', 'event', ev.error);
  const row = ev.data as { start_time: string; course_id: string | null } | null;
  if (!row) return null;
  return { eventId: input.eventId, date: dayInZone(new Date(row.start_time), zone), courseId: row.course_id };
}

/** The viewer's own lane (any round type), for the own card and the Dock. Null when they have no round in progress. */
export async function loadOwnLiveRound(input: { teamId: string; playerId: string; now?: Date }): Promise<LiveLane | null> {
  const snap = await loadLiveRounds({ teamId: input.teamId, viewer: { role: 'player', playerId: input.playerId }, now: input.now });
  return snap.lanes.find((l) => l.playerId === input.playerId && (l.phase === 'on_course' || l.phase === 'finished')) ?? null;
}
