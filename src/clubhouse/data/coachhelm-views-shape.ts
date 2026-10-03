/**
 * The player's CoachHelm views beside the board (Clubhouse P013): Game profile, Standing and Deep dive. What every one of them
 * shares, kept apart from the server loaders (data/coachhelm-profile.ts, -standing.ts, -dive.ts) so the client screens, the
 * preview and the tests all use the code the page does.
 *
 * A view is the signed-in player's own: its loader takes the session's player id and nothing from the address.
 */

/** What a view's loader answers. `off`: CoachHelm is turned off for this player. `failed`: a read the view cannot do without did not load, never "nothing here". */
export type ChViewLoad<T> = { status: 'ready'; data: T } | { status: 'off'; reason: string | null } | { status: 'failed' };

/** The views of the player's CoachHelm that are in-page: the board and the three drills `?view=` names. */
export type PlayerHelmView = 'board' | 'profile' | 'standing' | 'deep-dive';

export const PLAYER_HELM_HREF: Record<PlayerHelmView, string> = {
  board: '/golf/dashboard/coachhelm',
  profile: '/golf/dashboard/coachhelm?view=profile',
  standing: '/golf/dashboard/coachhelm?view=standing',
  'deep-dive': '/golf/dashboard/coachhelm?view=deep-dive',
};

/**
 * `?view=development` is where every stored dev-plan notification points (in-app rows, pushes and emails sent before CH13-7).
 * In Clubhouse a player's development lives on Stats' Development tab, so those links land there (swap audit §14 D4) and the
 * sub-navigation ends with a link to it.
 */
export const PLAYER_HELM_DEVELOPMENT_HREF = '/golf/dashboard/stats?tab=dev';

export const PLAYER_HELM_TAB_LABEL: Record<PlayerHelmView, string> = {
  board: 'Board',
  profile: 'Game profile',
  standing: 'Standing',
  'deep-dive': 'Deep dive',
};

/** The drill a `?view=` value names, or null for the board (and for anything else, which is the board). */
export function playerHelmDrill(view: string | undefined): Exclude<PlayerHelmView, 'board'> | null {
  return view === 'profile' || view === 'standing' || view === 'deep-dive' ? view : null;
}
