import 'server-only';
import { isFlagEnabled } from '@/lib/flags/is-enabled';

/**
 * The one switch between Fairway and Clubhouse, for coaches and players.
 * Players get the shared screens (Stats, Calendar, Messages) with their own
 * permissions; their other screens show "not rebuilt yet" until designed.
 */
export function isClubhouseFor(role: 'coach' | 'player' | null | undefined): boolean {
  return (role === 'coach' || role === 'player') && isFlagEnabled('golf_clubhouse_ui');
}

/**
 * The switch between the current entrance pages (sign in and the welcome) and
 * Clubhouse's. Those pages are drawn for a visitor with no role, so the
 * per-role check above cannot apply; this flag is its own (off in production
 * until the owner says so). It chooses the page that is drawn, never what
 * signing in does: both call the same server actions and follow the same redirects.
 */
export function isClubhouseFrontDoor(): boolean {
  return isFlagEnabled('golf_clubhouse_front_door');
}
