import 'server-only';
import { teamPoolEnabled } from '@/lib/coachhelm/v3/team-pool/flag';
import type { ChCoachPlayerScope } from './coachhelm-player';
import { coachDiveCore } from './coachhelm-player';
import { playerDiveCore } from './coachhelm-dive';
import { READ_CALLS, type ChReadCalls } from './coachhelm-read-calls';
import { toChReadView, type ChReadView } from './coachhelm-read-view-shape';
import type { ChViewLoad } from './coachhelm-views-shape';

const calls = (): ChReadCalls => ({ ...READ_CALLS, teamPool: teamPoolEnabled() });

/** A coach's read: the same `coach_feed` set Deep dive records today (parity; R3). */
export async function loadCoachRead(input: { scope: ChCoachPlayerScope; insightId: string }): Promise<ChViewLoad<ChReadView>> {
  const { load, raw } = await coachDiveCore({ scope: input.scope }, { exampleRounds: true });
  if (load.status !== 'ready') return load;
  const { head } = input.scope;
  return { status: 'ready', data: toChReadView(load.data, raw, input.insightId, 'coach', { playerId: input.scope.playerId, name: head.name, first: head.name.split(' ')[0] ?? head.name }, calls()) };
}

/** A player's own read: exactly the read it shows is recorded as shown (R2). The id is the session's. */
export async function loadPlayerRead(input: { playerId: string; insightId: string }): Promise<ChViewLoad<ChReadView>> {
  const { load, raw } = await playerDiveCore({ playerId: input.playerId }, { drawn: () => [input.insightId] });
  if (load.status !== 'ready') return load;
  return { status: 'ready', data: toChReadView(load.data, raw, input.insightId, 'player', { playerId: null, name: 'You', first: 'You' }, calls()) };
}
