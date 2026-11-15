/**
 * CoachHelm chat knowledge: where things are in the team's data, for the cached prompt.
 *
 * The text is generated (`data-map.generated.ts`; see `data-map.source.ts` for how and from what). A coach's map lists
 * what exists, which read answers which question, the exact tables and columns of `query_team_data`, and what is not
 * recorded. A player's map is reduced to what a player may read about themself and names no table.
 */
import { COACH_DATA_MAP, PLAYER_DATA_MAP } from './data-map.generated';

/** The data map for a surface. The same bytes on every call, for every team and every day. */
export function dataMapBlock(surface: 'ask' | 'quick_chat' | 'practice_helper' | 'player'): string {
  return surface === 'player' ? PLAYER_DATA_MAP : COACH_DATA_MAP;
}
