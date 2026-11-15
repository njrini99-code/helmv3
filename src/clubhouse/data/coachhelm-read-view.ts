import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { teamPoolEnabled } from '@/lib/coachhelm/v3/team-pool/flag';
import { chLogServer } from '../lib/track-server';
import type { ChCoachPlayerScope } from './coachhelm-player';
import { coachDiveCore } from './coachhelm-player';
import { playerDiveCore } from './coachhelm-dive';
import { READ_CALLS, type ChReadCalls } from './coachhelm-read-calls';
import { loadReadExtras } from './coachhelm-read-extras';
import { toChReadView, type ChReadView } from './coachhelm-read-view-shape';
import type { ChViewLoad } from './coachhelm-views-shape';

const calls = (): ChReadCalls => ({ ...READ_CALLS, teamPool: teamPoolEnabled() });

/**
 * A coach's read: the same `coach_feed` set Deep dive records today (parity; R3), then the read's own rounds beside it (the trend, how
 * many rounds are newer, the score on each counted hole). The scope was checked before this ran.
 */
export async function loadCoachRead(input: { scope: ChCoachPlayerScope; insightId: string }): Promise<ChViewLoad<ChReadView>> {
  const { load, raw } = await coachDiveCore({ scope: input.scope }, { exampleRounds: true, behind: input.insightId });
  if (load.status !== 'ready') return load;
  const extras = await loadReadExtras({ playerId: input.scope.playerId, raw: raw.get(input.insightId) });
  const { head } = input.scope;
  return { status: 'ready', data: toChReadView(load.data, raw, input.insightId, 'coach', { playerId: input.scope.playerId, name: head.name, first: head.name.split(' ')[0] ?? head.name }, calls(), extras) };
}

/**
 * The coach a player's "Message Coach Reyes" opens a thread with: Home's own rule (`player-home.ts coachFor`), the coach who made the
 * player's team, else the organisation's first coach with an account. Null when any read fails: the link then opens Messages.
 */
export async function loadReadCoach(playerId: string): Promise<ChReadView['coach'] | null> {
  try {
    const supabase = await createClient();
    const member = await supabase.from('golf_team_members').select('team_id, golf_teams(created_by, organization_id)').eq('player_id', playerId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
    const team = (member.data as { golf_teams: { created_by: string | null; organization_id: string | null } | null } | null)?.golf_teams;
    if (member.error || !team?.organization_id) return null;
    const res = await supabase.from('golf_coaches').select('id, user_id, full_name').eq('organization_id', team.organization_id).not('user_id', 'is', null).limit(50);
    if (res.error) return null;
    const coaches = (res.data ?? []).filter((c): c is { id: string; user_id: string; full_name: string | null } => !!c.user_id);
    const coach = coaches.find((c) => c.id === team.created_by) ?? coaches[0];
    if (!coach) return null;
    const last = coach.full_name?.trim().split(/\s+/).pop();
    return { userId: coach.user_id, name: last ? `Coach ${last}` : null };
  } catch (err) {
    chLogServer('coachhelm.read', 'coach', err);
    return null;
  }
}

/** A player's own read: exactly the read it shows is recorded as shown (R2). The id is the session's. */
export async function loadPlayerRead(input: { playerId: string; insightId: string }): Promise<ChViewLoad<ChReadView>> {
  const [{ load, raw }, coach] = await Promise.all([playerDiveCore({ playerId: input.playerId }, { drawn: () => [input.insightId], behind: input.insightId }), loadReadCoach(input.playerId)]);
  if (load.status !== 'ready') return load;
  const extras = await loadReadExtras({ playerId: input.playerId, raw: raw.get(input.insightId) });
  const view = toChReadView(load.data, raw, input.insightId, 'player', { playerId: null, name: 'You', first: 'You' }, calls(), extras);
  return { status: 'ready', data: coach ? { ...view, coach } : view };
}
