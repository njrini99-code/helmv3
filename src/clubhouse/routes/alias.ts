import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { isClubhouseFor } from '../gate';
import { isRebuilt } from '../shell/nav';

/**
 * The incoming request's query string, set by the proxy (updateSession in
 * src/lib/supabase/middleware.ts) because a layout is never handed
 * searchParams. Untrusted: a request the proxy let through without its
 * session work (its fail-open path) can carry a client-sent value, so
 * targets read only the keys they name and check each value (`aliasId`).
 */
export const HELM_SEARCH_HEADER = 'x-helm-search';

/** An id-shaped query value (uuid, slug), or null: never a raw value spliced into an address. */
export function aliasId(params: URLSearchParams, key: string): string | null {
  const v = params.get(key);
  return v && /^[\w-]{1,64}$/.test(v) ? v : null;
}

/**
 * A free-text query value (a question typed elsewhere), or null: trimmed, no control characters, at most `max` long. It
 * only ever goes back into an address through URLSearchParams, which encodes it; never spliced in raw.
 */
export function aliasText(params: URLSearchParams, key: string, max = 1000): string | null {
  const v = params.get(key)?.trim();
  // eslint-disable-next-line no-control-regex -- the point is to refuse control characters
  return v && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v) ? v : null;
}

/** A target address, or one built from the old address's query (only from keys it reads through `aliasId`). */
export type AliasTarget = string | ((params: URLSearchParams) => string);

async function incomingSearch(): Promise<URLSearchParams> {
  // Not wrapped in a catch: Next signals a dynamic render by throwing from headers(), and that must reach it.
  return new URLSearchParams((await headers()).get(HELM_SEARCH_HEADER) ?? '');
}

/**
 * An old address whose screen lives elsewhere in Clubhouse (Tasks, Announcements,
 * Documents and Travel are Team Hub tabs; a player's page is their Stats profile;
 * the review is /rounds/[id]). With Clubhouse on for the signed-in role, the
 * address goes to that screen, so a notification or bookmark never opens a
 * Fairway page inside Clubhouse. Otherwise nothing happens and the Fairway page
 * renders. Call it from the route's layout, before its loading skeleton. The
 * role is the dashboard layout's (getGolfDashboardRole); a function target is
 * given the old address's query, so `?task=` or `?player=` survives the move.
 */
export async function redirectToClubhouse(target: Partial<Record<'coach' | 'player', AliasTarget>>): Promise<void> {
  const role = await getGolfDashboardRole();
  if (!role || !(await isClubhouseFor(role))) return;
  const to = target[role];
  if (!to) return;
  const href = typeof to === 'function' ? to(await incomingSearch()) : to;
  if (href && isRebuilt(href.split('?')[0] ?? href, role)) redirect(href);
}
