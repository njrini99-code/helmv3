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
