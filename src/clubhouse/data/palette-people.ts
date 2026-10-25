'use server';

import { getGolfSessionProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { resolveClubhouseTeam } from '../routes/team';
import { loadPalettePeople, type ChShellPerson } from './shell';
import { chLogServer } from '../lib/track-server';

/**
 * The command palette's People for the signed-in coach (owner, decision 16: names and ids only, coaches only, in
 * memory, after a security review). Called by the palette when it first opens, so the names never ride a page's HTML
 * (which the service worker caches to disk) and a phone, which has no palette, never receives them. The role and the
 * team are resolved here from the session, never taken from the browser. Null for anyone who is not a coach, and on
 * any failure (the palette then waits for Roster's own list).
 */
export async function getPalettePeople(): Promise<ChShellPerson[] | null> {
  try {
    const session = await getGolfSessionProfile();
    if (!session) return null;
    const team = await resolveClubhouseTeam(session);
    if (team?.role !== 'coach') return null;
    return await loadPalettePeople(await createClient(), team.teamId);
  } catch (err) {
    chLogServer('shell', 'palettePeople', err, 'teams');
    return null;
  }
}
