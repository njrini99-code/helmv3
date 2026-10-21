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

/** The Game detail sections an address can name (`#gm-<id>`), in page order. */
export const GAME_SECTION_IDS = ['scoring', 'tee', 'approach', 'short', 'putting'] as const;
export type GameSectionId = (typeof GAME_SECTION_IDS)[number];

/** The section a `#gm-<id>` hash names, or null for any other hash (a section that does not exist is not one). */
export function gameSectionFromHash(hash: string): GameSectionId | null {
  const id = /^#gm-([a-z]+)$/.exec(hash)?.[1];
  return GAME_SECTION_IDS.find((s) => s === id) ?? null;
}
