import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { isCoachHelmFlagEnabled, withPlayerCoachHelmTeams } from '@/lib/coachhelm/canary';
import { logServerError } from '@/lib/server-error-logger';
import { DATA_PROMPTS_FLAG } from './recovery';

/**
 * Whether the Slice 8b prompts (course nudge, recovery tap) are on for this
 * player's shot entry. `coachhelm_data_prompts_v2` is read through the
 * HELM_COACHHELM_TEAMS canary in the player's team scope, as the Slice 8a
 * asks are (`dataGapAsksForShotEntry`): with the canary unset this is the
 * global flag and nothing is read; with it set, the flag is on only for a
 * player on a listed team. Any failure reads as off (shot entry unchanged).
 */
export async function dataPromptsV2ForShotEntry(playerId: string): Promise<boolean> {
  try {
    return await withPlayerCoachHelmTeams(playerId, createClient, async () => isCoachHelmFlagEnabled(DATA_PROMPTS_FLAG));
  } catch (error) {
    void logServerError(
      `[data prompts v2] flag read threw; shot entry shows no prompt: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'coachhelm.dataPromptsV2', featureArea: 'coachhelm' },
      'warning',
    );
    return false;
  }
}
