import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getValidTimezone } from '@/lib/calendar/timezone';
import { chLogServer } from '../lib/track-server';
import { classYearLabel, fullName } from './season';
import type { ChPerson } from '../screens/messages/model';

export interface ChMessagesData {
  role: 'coach' | 'player';
  viewerUserId: string;
  viewerName: string;
  teamId: string;
  teamName: string | null;
  timeZone: string;
  now: string;
  /** Everyone the viewer may message: the program's coaches and the team's players, never themselves. */
  directory: ChPerson[];
  directoryError: boolean;
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
}): Promise<ChMessagesData> {
  const supabase = await createClient();
  const [teamRes, settingsRes, membersRes] = await Promise.all([
    supabase.from('golf_teams').select('name, organization_id').eq('id', input.teamId).maybeSingle(),
    supabase.from('golf_team_settings').select('timezone').eq('team_id', input.teamId).maybeSingle(),
    supabase
      .from('golf_team_members')
      .select('player:golf_players(id, user_id, first_name, last_name, graduation_year)')
      .eq('team_id', input.teamId)
      .eq('status', 'active')
      .limit(200),
  ]);
  if (teamRes.error) chLogServer('messages', 'team', teamRes.error, 'teams');
  if (settingsRes.error) chLogServer('messages', 'teamSettings', settingsRes.error, 'messaging');
  if (membersRes.error) chLogServer('messages', 'members', membersRes.error, 'teams');

  let coachesError = false;
  let coaches: Array<{ user_id: string | null; full_name: string | null; title: string | null }> = [];
  if (teamRes.data?.organization_id) {
    const res = await supabase.from('golf_coaches').select('user_id, full_name, title').eq('organization_id', teamRes.data.organization_id).limit(50);
    if (res.error) {
      chLogServer('messages', 'coaches', res.error, 'messaging');
      coachesError = true;
    }
    coaches = res.data ?? [];
  }

  type PlayerRow = { id: string; user_id: string | null; first_name: string | null; last_name: string | null; graduation_year: number | null };
  const players = (membersRes.data ?? []).map((m) => (m as unknown as { player: PlayerRow | null }).player).filter((p): p is PlayerRow => !!p?.user_id);

  const directory: ChPerson[] = [
    ...coaches
      .filter((c) => c.user_id && c.user_id !== input.viewerUserId)
      .map((c) => ({ userId: c.user_id!, name: c.full_name?.trim() || 'Coach', role: 'coach' as const, subtitle: c.title?.trim() || 'Coach', playerId: null })),
    ...players
      .filter((p) => p.user_id !== input.viewerUserId)
      .map((p) => ({ userId: p.user_id!, name: fullName(p), role: 'player' as const, subtitle: classYearLabel(p.graduation_year) ?? 'Player', playerId: p.id })),
  ].sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'coach' ? -1 : 1));

  return {
    role: input.role,
    viewerUserId: input.viewerUserId,
    viewerName: input.viewerName,
    teamId: input.teamId,
    teamName: teamRes.data?.name ?? null,
    timeZone: getValidTimezone(settingsRes.data?.timezone ?? null),
    now: new Date().toISOString(),
    directory,
    directoryError: !!membersRes.error || coachesError || !!teamRes.error,
  };
}
