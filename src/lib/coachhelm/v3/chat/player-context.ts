import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { CoachContextError, type CoachChatContext } from './context';

type Sb = SupabaseClient<Database>;

/** A signed-in player's chat context: their id from the session, the roster reduced to them. No other player can be named or read through it (SHARED-11). */
export async function resolvePlayerChatContext(sb: Sb): Promise<CoachChatContext & { player_id: string }> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new CoachContextError('Not signed in', 401);
  const { data: player, error: playerError } = await sb.from('golf_players').select('id, first_name, last_name').eq('user_id', auth.user.id).maybeSingle();
  if (playerError) throw new Error('Could not read the player context');
  if (!player) throw new CoachContextError('This surface is for players', 403);
  const { data: member, error: memberError } = await sb.from('golf_team_members').select('team_id').eq('player_id', player.id).eq('status', 'active').limit(1).maybeSingle();
  if (memberError) throw new Error('Could not read the player context');
  if (!member) throw new CoachContextError('No active team for this player', 404);
  const { data: team, error: teamError } = await sb.from('golf_teams').select('id, name, timezone').eq('id', member.team_id).maybeSingle();
  if (teamError) throw new Error('Could not read the player context');
  if (!team) throw new CoachContextError('Active team not found', 404);
  const name = [player.first_name, player.last_name].filter(Boolean).join(' ') || 'You';
  return { coach_id: '', user_id: auth.user.id, team_id: team.id, team_name: team.name, timezone: team.timezone, roster: [{ id: player.id, name } as CoachChatContext['roster'][number]], player_id: player.id };
}
