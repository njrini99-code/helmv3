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
export const PLAYER_HELM_VIEWS = Object.keys(PLAYER_HELM_HREF) as PlayerHelmView[];

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

// ── A coach's views of one player (P013, spec A) ─────────────────────────────

/** The three views a coach opens on one player (`?view=…&player=<golf_players.id>`), in the strip's order: the Deep dive lands first. */
export type CoachPlayerView = Exclude<PlayerHelmView, 'board'>;
export const COACH_PLAYER_VIEWS: readonly CoachPlayerView[] = ['deep-dive', 'standing', 'profile'];

/**
 * Who a coach's view is about, as the client draws it: plain data made on the server from the coach's scope
 * (`data/coachhelm-player.ts`), never the scope itself. `line` is the header's one line ("Junior · Last round Oct 5, 16 days ago").
 */
export interface ChCoachPlayerHead {
  playerId: string;
  /** The full name, or "Player" when none is on file. */
  name: string;
  first: string;
  line: string;
}

/**
 * Whose voice a view is written in. The player's own views (the default) are unchanged; a coach's say the player's first name where
 * the player's say "you", and carry the player the coach is reading, for the header and every link between the views.
 */
export type ChViewVoice = { role: 'player' } | ({ role: 'coach' } & ChCoachPlayerHead);

export const PLAYER_VOICE: ChViewVoice = { role: 'player' };

/** The viewer the engine's words are put in (`speak`). */
export const viewerOf = (voice: ChViewVoice): { role: 'player' } | { role: 'coach'; first: string } => (voice.role === 'coach' ? { role: 'coach', first: voice.first } : { role: 'player' });

/** The coach's board, open on this player (Roster's View insights address). */
export const coachBoardFor = (playerId: string) => `${PLAYER_HELM_HREF.board}?player=${encodeURIComponent(playerId)}`;

/** A coach's view of one player: `/golf/dashboard/coachhelm?view=deep-dive&player=<id>` (the Board's links, Roster's View insights). */
export const coachPlayerHref = (view: CoachPlayerView, playerId: string) => `${PLAYER_HELM_HREF.board}?view=${view}&player=${encodeURIComponent(playerId)}`;

/** A view's address for this voice: the player's own (`PLAYER_HELM_HREF`), or a coach's of one player (`?view=…&player=`). */
export function helmViewHref(view: PlayerHelmView, voice: ChViewVoice = PLAYER_VOICE): string {
  if (voice.role !== 'coach') return PLAYER_HELM_HREF[view];
  if (view === 'board') return coachBoardFor(voice.playerId);
  return coachPlayerHref(view, voice.playerId);
}

/** The Deep dive open on one read, for this voice. */
export const diveReadHref = (insightId: string, voice: ChViewVoice = PLAYER_VOICE) => `${helmViewHref('deep-dive', voice)}&insight=${encodeURIComponent(insightId)}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The coach header's line: the class and the newest round ("Junior · Last round Oct 5, 16 days ago"; "Junior · No rounds posted
 * yet"), the class left out when it is not known. `lastRound` is a round's play date (a calendar day), `now` the server's clock.
 */
export function coachHeadLine(classYear: string | null, lastRound: string | null, now: Date = new Date()): string {
  const day = lastRound && /^\d{4}-\d{2}-\d{2}/.test(lastRound) ? lastRound.slice(0, 10) : null;
  let round = 'No rounds posted yet';
  if (day) {
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const ago = Math.round((today - Date.UTC(y, m - 1, d)) / 86_400_000);
    const date = `${MONTHS[m - 1]} ${d}${y !== now.getUTCFullYear() ? `, ${y}` : ''}`;
    round = ago <= 0 ? 'Last round today' : ago === 1 ? 'Last round yesterday' : `Last round ${date}, ${ago} days ago`;
  }
  return [classYear, round].filter(Boolean).join(' · ');
}
