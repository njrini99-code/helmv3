import type { ChLeg } from '../../data/stats-team';

/** Client-safe copy of the leg order (data/stats-team is server-only). */
export const LEGS_LIST: readonly ChLeg[] = ['Off the tee', 'Approach', 'Around green', 'Putting'];

/** The Game detail section (`#gm-<id>` on a player's Stats) that explains each leg. */
export const LEG_SECTION: Readonly<Record<ChLeg, 'tee' | 'approach' | 'short' | 'putting'>> = {
  'Off the tee': 'tee',
  Approach: 'approach',
  'Around green': 'short',
  Putting: 'putting',
};
