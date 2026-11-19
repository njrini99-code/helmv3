import 'server-only';
/**
 * CoachHelm reads: the two switches the old engine reads (insights rebuild, stage 2).
 *
 * - `readsReplaceCards(teamId)`: for a team on reads (`coachhelm_reads_v1` and `COACHHELM_READS_TEAM_IDS`), today's ~21
 *   Tier-1 checks stop writing cards: the engine's philosophy gate holds every insight type back for that team. Rows
 *   already written stay. Every other team runs exactly as before.
 * - `v2WriterStopped()`: the hidden v2 writer (rows stamped `engine_version='v2'`, which no screen shows) stops, for
 *   every team. Its own flag, `coachhelm_v2_writer_stop_v1`, off everywhere: off is today's behaviour. Turning it on
 *   is the owner's call.
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { readsEnabled } from './flag';

export const V2_WRITER_STOP_FLAG = 'coachhelm_v2_writer_stop_v1';

export function readsReplaceCards(teamId: string | null | undefined, deps?: Parameters<typeof readsEnabled>[1]): boolean {
  try {
    return readsEnabled(teamId, deps);
  } catch {
    return false;
  }
}

export function v2WriterStopped(flagOn: () => boolean = () => isFlagEnabled(V2_WRITER_STOP_FLAG)): boolean {
  try {
    return flagOn();
  } catch {
    return false;
  }
}
