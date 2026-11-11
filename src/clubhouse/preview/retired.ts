/**
 * Preview screens the owner retired (11 Nov 2026). An old `/clubhouse-preview/<screen>` address opens the page that
 * replaced it, never a 404 and never the old design: a screenshot, a script or a bookmark that still names a retired
 * screen lands on what a coach or player really gets. `keep` names the query keys that mean the same on the new screen;
 * every other key is dropped. The list of what is current is in `src/clubhouse/AGENTS.md`.
 */
export const RETIRED_PREVIEW_SCREENS: Readonly<Record<string, { to: string; keep?: readonly string[] }>> = {
  // Players have ONE Qualifiers page, their own listed first.
  'my-qualifiers': { to: 'qualifiers-player', keep: ['state'] },
  // The coach's CoachHelm Team page is the drawn golf hole; the older signal-list board is gone.
  coachhelm: { to: 'coachhelm-team' },
};

/** Where a retired preview screen went, with the query keys it keeps; null for a screen that is still drawn. */
export function retiredPreviewHref(screen: string, query: Readonly<Record<string, string | string[] | undefined>>): string | null {
  const moved = RETIRED_PREVIEW_SCREENS[screen];
  if (!moved) return null;
  const kept = new URLSearchParams();
  for (const key of moved.keep ?? []) {
    const value = query[key];
    if (typeof value === 'string') kept.set(key, value);
  }
  const search = kept.toString();
  return `/clubhouse-preview/${moved.to}${search ? `?${search}` : ''}`;
}
