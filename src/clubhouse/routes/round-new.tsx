import 'server-only';
import { dataGapAsksForShotEntry } from '@/lib/coachhelm/data-gap/load-asks';
import { dataPromptsV2ForShotEntry } from '@/lib/golf/data-prompts/flag';
import { NewRound } from '../screens/rounds/entry/NewRound';

/**
 * /golf/dashboard/rounds/new in Clubhouse, for players: setup and then the round, over the new-round engine. The course
 * library, the qualifiers and today's date are read by the screen, in the browser, as the legacy screen does. The route
 * reads only CoachHelm's one-tap data prompts, the same two reads the Fairway page makes: the putt-miss asks (undefined with
 * `coachhelm_data_gap_prompt_v1` off, so nothing is read) and whether `coachhelm_data_prompts_v2` is on for this player.
 * Neither throws: round entry opens whatever they do. Coaches don't log rounds: they keep the legacy page's own message, and
 * Clubhouse's shell draws its not-rebuilt page for them.
 */
export async function ClubhouseNewRoundRoute({ playerId }: { playerId: string }) {
  const [dataGapAsks, dataPromptsV2] = await Promise.all([dataGapAsksForShotEntry(playerId), dataPromptsV2ForShotEntry(playerId)]);
  return <NewRound playerId={playerId} dataGapAsks={dataGapAsks} dataPromptsV2={dataPromptsV2} />;
}
