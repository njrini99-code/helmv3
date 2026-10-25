import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { readGolfPlayerProfiles } from '@/lib/golf/player-profiles';
import { getValidTimezone } from '@/lib/calendar/timezone';
import { chLogServer } from '../lib/track-server';
import { classYearLabel, fullName } from './season';
import type { ChAnnouncement, ChPerson } from '../screens/messages/model';

export interface ChMessagesData {
  role: 'coach' | 'player';
  viewerUserId: string;
  viewerName: string;
  /** golf_players.id when the viewer is a player (announcement acknowledgements and tasks). */
  viewerPlayerId: string | null;
  teamId: string;
  teamName: string | null;
  timeZone: string;
  now: string;
  /** Everyone the viewer may message: the program's coaches and the team's players, never themselves. */
  directory: ChPerson[];
  directoryError: boolean;
  /** The program's coaches by golf_coaches.id, the viewer among them: who signs an announcement (P007-A1). */
  signers?: Record<string, { name: string; title: string }>;
  /**
   * Read with the page so the inbox doesn't wait on them after it lands (Next runs server actions one at a time, and
   * these two queued ahead of the conversation list: Simulator audit 2026-10-14). Absent: the client reads them itself;
   * `announcements: null` means the server read failed and the client tries again.
   */
  canHide?: boolean;
  announcements?: ChAnnouncement[] | null;
}

/**
 * The people half of Messages. Conversations and messages stay on the live
 * realtime hooks (useGolfConversations / useGolfMessages); this loads who can
 * be messaged, the same audience createGolfConversation validates against.
 */
export async function loadMessagesDirectory(input: {
  role: 'coach' | 'player';
  teamId: string;
  viewerUserId: string;
  viewerName: string;
  viewerPlayerId: string | null;
}): Promise<ChMessagesData> {
  const supabase = await createClient();
  const [teamRes, settingsRes, membersRes] = await Promise.all([
    supabase.from('golf_teams').select('name, organization_id').eq('id', input.teamId).maybeSingle(),
    supabase.from('golf_team_settings').select('timezone').eq('team_id', input.teamId).maybeSingle(),
    // Players' display columns through golf_player_profiles: a player may no longer read a teammate's golf_players row
    // (security review S4).
    (async () => {
      const [members, profiles] = await Promise.all([
        supabase.from('golf_team_members').select('player_id').eq('team_id', input.teamId).eq('status', 'active').limit(200),
        readGolfPlayerProfiles(supabase, { teamIds: [input.teamId] }),
      ]);
      if (members.error) return { data: null, error: members.error };
      if (profiles.error) return { data: null, error: profiles.error };
      const active = new Set((members.data ?? []).map((m) => m.player_id));
      return { data: profiles.data.filter((p) => active.has(p.id)), error: null };
    })(),
  ]);
  if (teamRes.error) chLogServer('messages', 'team', teamRes.error, 'teams');
  if (settingsRes.error) chLogServer('messages', 'teamSettings', settingsRes.error, 'messaging');
  if (membersRes.error) chLogServer('messages', 'members', membersRes.error, 'teams');

  let coachesError = false;
  let coaches: Array<{ id: string; user_id: string | null; full_name: string | null; title: string | null }> = [];
  if (teamRes.data?.organization_id) {
    const res = await supabase.from('golf_coaches').select('id, user_id, full_name, title').eq('organization_id', teamRes.data.organization_id).limit(50);
    if (res.error) {
      chLogServer('messages', 'coaches', res.error, 'messaging');
      coachesError = true;
    }
    coaches = res.data ?? [];
  }

  const timeZone = getValidTimezone(settingsRes.data?.timezone ?? null);
  const players = (membersRes.data ?? []).filter((p) => !!p.user_id);

  const directory: ChPerson[] = [
    ...coaches
      .filter((c) => c.user_id && c.user_id !== input.viewerUserId)
      .map((c) => ({ userId: c.user_id!, name: c.full_name?.trim() || 'Coach', role: 'coach' as const, subtitle: c.title?.trim() || 'Coach', playerId: null })),
    ...players
      .filter((p) => p.user_id !== input.viewerUserId)
      .map((p) => ({ userId: p.user_id!, name: fullName(p), role: 'player' as const, subtitle: classYearLabel(p.graduation_year, undefined, timeZone) ?? 'Player', playerId: p.id })),
  ].sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'coach' ? -1 : 1));

  return {
    role: input.role,
    viewerUserId: input.viewerUserId,
    viewerName: input.viewerName,
    viewerPlayerId: input.viewerPlayerId,
    teamId: input.teamId,
    teamName: teamRes.data?.name ?? null,
    timeZone,
    now: new Date().toISOString(),
    directory,
    directoryError: !!membersRes.error || coachesError || !!teamRes.error,
    signers: Object.fromEntries(coaches.map((c) => [c.id, { name: c.full_name?.trim() || 'Coach', title: c.title?.trim() || 'Coach' }])),
  };
}
