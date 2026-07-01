// GREPTILE CANARY — DO NOT MERGE.
// This file exists only to verify the new .greptile/ config end-to-end:
// (1) does Greptile catch the seeded rule violations, (2) does it CITE the new
// business/sport context docs, (3) does it post a non-blocking enhancement
// suggestion. It will be closed, not merged.
'use server'

import { createClient } from '@/lib/supabase/server'

// Seeded violation A — server-action-auth: no supabase.auth.getUser() before a DB call.
// Seeded violation B — pipeline-stage-enum: 'contacted' is NOT in baseball_pipeline_stage
//   (valid: watchlist, high_priority, offer_extended, committed, uninterested).
// Seeded violation C — no-destructive-writes: DELETE-then-INSERT in a save path.
export async function canaryMoveProspect(playerId: string, watchlistId: string) {
  const supabase = await createClient()

  await supabase
    .from('baseball_watchlists')
    .update({ pipeline_stage: 'contacted' })
    .eq('id', watchlistId)

  await supabase.from('baseball_prospect_notes').delete().eq('player_id', playerId)
  await supabase.from('baseball_prospect_notes').insert({ player_id: playerId, note: 'moved' })

  // Enhancement bait: the coach can change the stage, but nothing notifies anyone
  // and no interest/engagement is recorded — the recruiting workflow is left half-done.
  return { ok: true }
}
