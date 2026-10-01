import type { ChLeg } from '../../data/stats-team';

/** Client-safe copy of the leg order (data/stats-team is server-only). */
export const LEGS_LIST: readonly ChLeg[] = ['Off the tee', 'Approach', 'Around green', 'Putting'];
