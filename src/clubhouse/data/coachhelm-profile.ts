import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { loadGenome } from '@/lib/coachhelm/v3/genome/loader';
import { chLogServer } from '../lib/track-server';
import { toChGame, type ChGameLoad } from './coachhelm-profile-shape';

export type * from './coachhelm-profile-shape';

/**
 * Standing's "How you play" for the signed-in player (CH-13915), read beside Standing's own rows after the route has checked
 * CoachHelm is on for them (routes/coachhelm.tsx, `loadPlayerHelmGate`). The one read is `loadGenome` through the session's client,
 * so the row is the one RLS lets this player read; `playerId` is the session's, never an address's. It reads no insight: the reads
 * are the ladder's and the Deep dive's, and a read the delivery action returns counts as shown.
 *
 * `loadGenome` answers null both for "no row yet" and for a row with nothing computed (the same state to a player), and throws on a
 * failed read: the throw is the section's failed state (CH-13260), never a first run that invites the player to wait for something
 * that already exists. The rest of Standing does not depend on it.
 */
export async function loadPlayerGame(input: { playerId: string }): Promise<ChGameLoad> {
  try {
    const supabase = await createClient();
    return { status: 'ready', data: toChGame(await loadGenome(supabase, input.playerId)) };
  } catch (err) {
    chLogServer('coachhelm', 'profile.genome', err, 'coachhelm');
    return { status: 'failed' };
  }
}
