import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { teamPoolEnabled } from '@/lib/coachhelm/v3/team-pool/flag';
import type { ChCoachPlayerScope } from './coachhelm-player';
import { coachDiveCore } from './coachhelm-player';
import { playerDiveCore } from './coachhelm-dive';
import { READ_CALLS, type ChReadCalls } from './coachhelm-read-calls';
import { toChReadView, type ChReadView } from './coachhelm-read-view-shape';
import type { ChViewLoad } from './coachhelm-views-shape';

const calls = (): ChReadCalls => ({ ...READ_CALLS, teamPool: teamPoolEnabled() });

/** A coach's read: the same `coach_feed` set Deep dive records today (parity; R3). */
/** The coach's active team, for the Mac rail's switcher. A failed read just leaves the switcher off. */
async function teamForSwitcher(teamId: string): Promise<Array<{ id: string; name: string }> | null> {
  const sb = await createClient();
  const members = await sb.from('golf_team_members').select('player_id').eq('team_id', teamId).eq('status', 'active');
  if (members.error) return null;
  const ids = (members.data ?? []).map((m) => m.player_id).filter((x): x is string => !!x);
  if (!ids.length) return [];
  const who = await sb.from('golf_players').select('id, first_name, last_name').in('id', ids);
  if (who.error) return null;
  return (who.data ?? []).map((p) => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' ') })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadCoachRead(input: { scope: ChCoachPlayerScope; insightId: string }): Promise<ChViewLoad<ChReadView>> {
  const { load, raw } = await coachDiveCore({ scope: input.scope }, { exampleRounds: true });
  if (load.status !== 'ready') return load;
  const { head } = input.scope;
  const view = toChReadView(load.data, raw, input.insightId, 'coach', { playerId: input.scope.playerId, name: head.name, first: head.name.split(' ')[0] ?? head.name }, calls());
  return { status: 'ready', data: { ...view, team: (await teamForSwitcher(input.scope.teamId)) ?? [] } };
}

/** A player's own read: exactly the read it shows is recorded as shown (R2). The id is the session's. */
export async function loadPlayerRead(input: { playerId: string; insightId: string }): Promise<ChViewLoad<ChReadView>> {
  const { load, raw } = await playerDiveCore({ playerId: input.playerId }, { drawn: () => [input.insightId] });
  if (load.status !== 'ready') return load;
  return { status: 'ready', data: toChReadView(load.data, raw, input.insightId, 'player', { playerId: null, name: 'You', first: 'You' }, calls()) };
}
