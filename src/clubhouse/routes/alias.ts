import 'server-only';
import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { isClubhouseFor } from '../gate';
import { isRebuilt } from '../shell/nav';

/**
 * An old address whose screen lives elsewhere in Clubhouse (Tasks, Announcements,
 * Documents and Travel are Team Hub tabs; a player's page is their Stats profile;
 * the review is /rounds/[id]). With Clubhouse on for the signed-in role, the
 * address goes to that screen, so a notification or bookmark never opens a
 * Fairway page inside Clubhouse. Otherwise nothing happens and the Fairway page
 * renders. Call it from the route's layout, before its loading skeleton.
 */
export async function redirectToClubhouse(target: Partial<Record<'coach' | 'player', string>>): Promise<void> {
  const session = await getGolfSessionProfile();
  const role = session?.coach ? 'coach' : session?.player ? 'player' : null;
  if (!role || !isClubhouseFor(role)) return;
  const href = target[role];
  if (href && isRebuilt(href.split('?')[0] ?? href, role)) redirect(href);
}
