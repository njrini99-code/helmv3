import 'server-only';
import { dataGapAsksForShotEntry } from '@/lib/coachhelm/data-gap/load-asks';
import { dataPromptsV2ForShotEntry } from '@/lib/golf/data-prompts/flag';
import { NewRound } from '../screens/rounds/entry/NewRound';
import { loadSetupQualifiers } from '../data/setup-qualifiers';

/**
 * /golf/dashboard/rounds/new in Clubhouse, for players: setup and then the round, over the new-round engine. The course
 * library and today's date are read by the screen, in the browser, as the legacy screen does. The route reads, all at
 * once: the player's open qualifiers with each one's next round (PMAC-03: read in the browser they ran one server action
 * after another behind a 3 s skeleton; here the form is the first paint), and CoachHelm's one-tap data prompts, the same
 * two reads the Fairway page makes: the putt-miss asks (undefined with `coachhelm_data_gap_prompt_v1` off, so nothing is
 * read) and whether `coachhelm_data_prompts_v2` is on for this player. None throws: round entry opens whatever they do (a
 * qualifier list that failed is null, CH-11211). Coaches don't log rounds: they keep the legacy page's own message, and
 * Clubhouse's shell draws its not-rebuilt page for them.
 */
export async function ClubhouseNewRoundRoute({ playerId }: { playerId: string }) {
  const [dataGapAsks, dataPromptsV2, qualifiers] = await Promise.all([dataGapAsksForShotEntry(playerId), dataPromptsV2ForShotEntry(playerId), loadSetupQualifiers()]);
  return <NewRound playerId={playerId} qualifiers={qualifiers} dataGapAsks={dataGapAsks} dataPromptsV2={dataPromptsV2} />;
}
