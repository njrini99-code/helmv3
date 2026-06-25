import type { SupabaseClient } from '@supabase/supabase-js';

/** Roster id → display name for signal scope chips and labels. */
export async function loadTeamPlayerNames(
  supabase: SupabaseClient,
  teamId: string,
): Promise<Record<string, string>> {
  const { data: members } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  const playerIds = (members ?? []).map((m) => m.player_id).filter(Boolean);
  if (playerIds.length === 0) return {};

  const { data: players } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name')
    .in('id', playerIds);

  const map: Record<string, string> = {};
  for (const p of players ?? []) {
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
    if (name) map[p.id] = name;
  }
  return map;
}
