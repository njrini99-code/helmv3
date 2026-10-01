import type { createClient } from '@/lib/supabase/server';
import { tourFor } from '@/lib/golf/benchmarks/tour';
import type { TourKey } from '@/lib/golf/benchmarks/tour';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * A player's team gender, from their active team membership. Drives which Tour
 * the player is compared with (LPGA for women's teams, PGA otherwise). Fails
 * safe to null (PGA) when the player has no active membership.
 */
export async function resolvePlayerTeamGender(
  supabase: ServerClient,
  playerId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('golf_team_members')
    .select('golf_teams(gender)')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .maybeSingle();
  const team = (data as { golf_teams: { gender?: string | null } | null } | null)?.golf_teams;
  return team?.gender ?? null;
}

/** The Tour a player's stats are compared with: 'lpga' for a women's team, else 'pga'. */
export async function resolvePlayerTour(supabase: ServerClient, playerId: string): Promise<TourKey> {
  return tourFor(await resolvePlayerTeamGender(supabase, playerId));
}
