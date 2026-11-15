'use server';

import { getGolfSessionProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { resolveClubhouseTeam } from '../routes/team';
import { loadPaletteEvents, loadPalettePeople, type ChShellPerson } from './shell';
import type { ChPaletteEvent } from '../shell/command/commands';
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

/**
 * The palette's tournaments and qualifiers for the signed-in coach's team (coach audit 13 Nov 2026, §2: "tar" did not find
 * the Tar Heel Shootout). Names, ids and first days, read when the palette first opens, like the players. Null for anyone
 * who is not a coach, and on any failure (search then finds sections, players and actions as before).
 */
export async function getPaletteEvents(): Promise<ChPaletteEvent[] | null> {
  try {
    const session = await getGolfSessionProfile();
    if (!session) return null;
    const team = await resolveClubhouseTeam(session);
    if (team?.role !== 'coach') return null;
    return await loadPaletteEvents(await createClient(), team.teamId);
  } catch (err) {
    chLogServer('shell', 'paletteEvents', err, 'tournaments');
    return null;
  }
}
