import 'server-only';
import { getRecruits } from '@/app/golf/actions/recruiting';
import { chLogServer } from '../lib/track-server';
import { toProspect, type ChRecruiting } from './recruiting-shape';

/**
 * The Recruiting page's one read (Clubhouse, coach only). It is the current page's own action, `getRecruits`, which
 * resolves the coach's active team from the session and filters the read on it, with RLS behind that, so this loader
 * adds no team logic of its own and a player's session has no path to the rows. A read that fails is flagged, never
 * thrown and never turned into an empty list; a coach with no resolvable team gets its own answer.
 */
export type ChRecruitingLoad = { kind: 'ready'; data: ChRecruiting } | { kind: 'noTeam' };

export async function loadRecruiting(now: Date = new Date()): Promise<ChRecruitingLoad> {
  let result: Awaited<ReturnType<typeof getRecruits>>;
  try {
    result = await getRecruits();
  } catch (e) {
    chLogServer('recruiting', 'prospects', e, 'recruiting');
    return { kind: 'ready', data: { prospects: [], error: true, now: now.toISOString() } };
  }
  if (!result.success && result.errorCode === 'no_team') return { kind: 'noTeam' };
  if (!result.success) chLogServer('recruiting', 'prospects', result.error ?? 'unknown', 'recruiting');
  return {
    kind: 'ready',
    data: { prospects: result.success ? (result.data ?? []).map(toProspect) : [], error: !result.success, now: now.toISOString() },
  };
}
