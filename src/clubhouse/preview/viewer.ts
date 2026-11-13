/**
 * Who the dev preview signs in as for a screen (/clubhouse-preview/[screen]). A screen that shows a player's own view
 * must be framed by a player, or the player's page draws inside the coach's shell (the stats page at ?state=self did).
 * Everything not named here is the coach.
 */
export type PreviewViewer = 'coach' | 'theo' | 'jonah';

const THEO = new Set(['home-player', 'hub-player', 'roster-player']);
const JONAH = new Set(['rounds', 'classes', 'track', 'setup', 'calendar-player', 'messages-player', 'qualifiers-player', 'qualifier-player', 'tournament-player', 'coachhelm-practice-player']);

/**
 * The query a screen draws a player's view from, beside `state`: `viewer`/`view` (the player file, Read, Ask v2) and
 * `copy` (the plan page's words for a player).
 */
export interface PreviewViewerParams {
  viewer?: string;
  copy?: string;
}

export function previewViewer(screen: string, state: string | undefined, params: PreviewViewerParams = {}): PreviewViewer {
  if (THEO.has(screen)) return 'theo';
  if (JONAH.has(screen)) return 'jonah';
  // G1 (preview grade, 12 Nov): these draw the player's own view from their query, and drew it in the coach's shell.
  if (screen === 'coachhelm-practice-home' && state?.startsWith('player')) return 'jonah';
  if (screen === 'coachhelm-practice-plan' && params.copy === 'player') return 'jonah';
  if ((screen === 'coachhelm-player-file' || screen === 'coachhelm-read' || screen === 'coachhelm-ask-v2') && params.viewer === 'player') return 'jonah';
  if (screen === 'round' && !state?.startsWith('coach')) return 'jonah';
  if (screen === 'settings' && (state === 'player' || state === 'noteam')) return 'jonah';
  // The player's own stats page: the coach sees a player through the coach shell, the player sees themself.
  if (screen === 'player' && (state === 'self' || state === 'denied-self')) return 'jonah';
  return 'coach';
}
