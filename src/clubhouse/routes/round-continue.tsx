import { ContinueRound, type ContinueRoundProps } from '../screens/rounds/entry/ContinueRound';

/**
 * /golf/dashboard/rounds/continue/[id] in Clubhouse, for players: a round already started, over the continue engine.
 * The page has already loaded and checked the round (its owner, that it is still in progress, its holes, shots and
 * course yardages, the qualifier round numbers left to choose), and hands over what the engine needs, so the loader
 * exists once and both UIs read the same round. The Fairway-only round-type editor is not passed.
 */
export function ClubhouseContinueRoundRoute(props: ContinueRoundProps) {
  return <ContinueRound {...props} />;
}
