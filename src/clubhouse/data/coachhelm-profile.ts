import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { loadGenome } from '@/lib/coachhelm/v3/genome/loader';
import { chLogServer } from '../lib/track-server';
import { toChProfile, type ChProfile } from './coachhelm-profile-shape';
import type { ChViewLoad } from './coachhelm-views-shape';

export type * from './coachhelm-profile-shape';

/**
 * The player's Game profile (`?view=profile`), read after the route has checked CoachHelm is on for them
 * (routes/coachhelm.tsx, `loadPlayerHelmGate`). The one read is `loadGenome` through the session's client, so the row is the one
 * RLS lets this player read; `playerId` is the session's, never an address's.
 *
 * `loadGenome` answers null both for "no row yet" and for a row with nothing computed (the same state to a player), and throws on a
 * failed read: the throw is the failed state, never a first run that invites the player to wait for something that already exists.
 */
export async function loadPlayerProfile(input: { playerId: string }): Promise<ChViewLoad<ChProfile>> {
  try {
    const supabase = await createClient();
    const genome = await loadGenome(supabase, input.playerId);
    return { status: 'ready', data: toChProfile(genome) };
  } catch (err) {
    chLogServer('coachhelm', 'profile.genome', err, 'coachhelm');
    return { status: 'failed' };
  }
}
