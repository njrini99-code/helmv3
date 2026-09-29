import 'server-only';
import { isFlagEnabled } from '@/lib/flags/is-enabled';

/**
 * The one switch between Fairway and Clubhouse. Coaches only: the player app
 * has no Clubhouse design yet (docs/clubhouse/PROGRESS.md).
 */
export function isClubhouseFor(role: 'coach' | 'player' | null | undefined): boolean {
  return role === 'coach' && isFlagEnabled('golf_clubhouse_ui');
}
