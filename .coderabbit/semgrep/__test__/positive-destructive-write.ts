// Positive fixture for `helmv3-destructive-write-pattern`.
// This file MUST fire that rule. It performs DELETE-then-INSERT on the
// same table in a save/submit path — on transient failure between the
// two statements, the user's row is permanently lost. The project
// memory note "GolfHelm — no destructive writes" forbids this pattern.
//
// Mirrored under .coderabbit/semgrep/__test__/. See
// docs/operations/2026-05-28-coderabbit-fails-investigation.md.

'use server';

import { createClient } from '@/lib/supabase/server';

export async function saveFocusAreas(playerId: string, areas: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // BAD: DELETE-then-INSERT in the same logical save path.
  // A failure between these two statements wipes the player's focus
  // areas with nothing to restore.
  await supabase.from('golf_player_focus_areas').delete().eq('player_id', playerId);
  await supabase.from('golf_player_focus_areas').insert(
    areas.map((focus) => ({ player_id: playerId, focus })),
  );

  return { success: true };
}
