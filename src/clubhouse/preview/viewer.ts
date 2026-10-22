/**
 * Who the dev preview signs in as for a screen (/clubhouse-preview/[screen]). A screen that shows a player's own view
 * must be framed by a player, or the player's page draws inside the coach's shell (the stats page at ?state=self did).
 * Everything not named here is the coach.
 */
export type PreviewViewer = 'coach' | 'theo' | 'jonah';

const THEO = new Set(['home-player', 'hub-player', 'roster-player']);
const JONAH = new Set(['rounds', 'classes', 'track', 'setup', 'calendar-player', 'messages-player', 'qualifiers-player', 'qualifier-player', 'my-qualifiers']);

export function previewViewer(screen: string, state: string | undefined): PreviewViewer {
  if (THEO.has(screen)) return 'theo';
  if (JONAH.has(screen)) return 'jonah';
  if (screen === 'round' && !state?.startsWith('coach')) return 'jonah';
  if (screen === 'settings' && (state === 'player' || state === 'noteam')) return 'jonah';
  // The player's own stats page: the coach sees a player through the coach shell, the player sees themself.
  if (screen === 'player' && state === 'self') return 'jonah';
  return 'coach';
}
