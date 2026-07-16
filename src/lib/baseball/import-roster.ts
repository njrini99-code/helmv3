// =============================================================================
// src/lib/baseball/import-roster.ts
//
// Shared roster fetch for the box-score import wizard's player matcher.
// Extracted so the FULL Import Center page (/dashboard/import) and the
// capability-aware /dashboard/stats/upload entry point (rendered inline for
// staff who hold can_manage_stats but not can_manage_imports) load the SAME
// tier-3 disambiguation signals (jersey_number, grad_year, primary_position)
// instead of two independently-drifting copies of this query.
// =============================================================================

import 'server-only';

import type { createClient } from '@/lib/supabase/server';
import type { MatchablePlayer } from '@/lib/baseball/import-matching';

/**
 * Loads the team's roster in the shape the import wizard's player matcher
 * expects: id/name plus jersey_number (per-team, on the membership) and
 * grad_year + primary_position (on the player row), so the matcher can break
 * same-name ties and the manual-match dropdown can show jersey/class/position.
 */
export async function getRosterForImportMatching(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<MatchablePlayer[]> {
  const { data: members } = await supabase
    .from('baseball_team_members')
    .select(
      `player_id,
       jersey_number,
       baseball_players!inner ( id, first_name, last_name, grad_year, primary_position )`
    )
    .eq('team_id', teamId);

  return (members ?? []).map((m) => {
    const p = m.baseball_players as unknown as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      grad_year: number | null;
      primary_position: string | null;
    };
    const member = m as unknown as { jersey_number: number | null };
    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      jersey_number: member.jersey_number,
      grad_year: p.grad_year,
      primary_position: p.primary_position,
    };
  });
}
