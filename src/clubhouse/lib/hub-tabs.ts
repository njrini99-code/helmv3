import type { ChTeamHub } from '../data/hub';

/**
 * Team Hub's tabs per role, and the `?tab=` parser. Kept out of the 'use client' TeamHub module: the server route
 * calls parseHubTab, and a function exported from a client module is only a client reference on the server.
 */
export type ChHubTab = 'home' | 'ann' | 'travel' | 'docs' | 'tasks';

export const HUB_TABS: Record<ChTeamHub['role'], ReadonlyArray<readonly [ChHubTab, string]>> = {
  player: [
    ['home', 'Home'],
    ['ann', 'Announcements'],
    ['travel', 'Travel'],
    ['docs', 'Documents'],
  ],
  coach: [
    ['home', 'Home'],
    ['ann', 'Announcements'],
    ['travel', 'Travel'],
    ['docs', 'Documents'],
    ['tasks', 'Tasks'],
  ],
};

/** `?tab=` for a deep link: a known tab for the role, else Home. */
export function parseHubTab(v: string | undefined, role: ChTeamHub['role']): ChHubTab {
  return HUB_TABS[role].find(([k]) => k === v)?.[0] ?? 'home';
}
