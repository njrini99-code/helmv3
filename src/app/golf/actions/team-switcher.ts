'use server';

/**
 * Team-switcher server actions.
 *
 * Persists the coach's active team selection in a secure, httpOnly cookie
 * (`golf_active_team`) so Server Components see it on the next render.
 *
 * SECURITY contract:
 *   - Auth check first: caller must be an authenticated coach.
 *   - The requested teamId is validated via `validateCoachTeamAccess` before
 *     the cookie is written. An invalid / forged teamId is silently ignored
 *     and the current selection is unchanged.
 *   - All paths revalidate `/golf/dashboard` so stale cached pages are purged.
 */

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { validateCoachTeamAccess, getCoachTeams } from '@/lib/golf/resolve-team';
import type { CoachTeamOption } from '@/lib/golf/resolve-team';

/** Cookie name — keep in sync with the layout reader. */
export const ACTIVE_TEAM_COOKIE = 'golf_active_team';

/** Max-age in seconds — 90 days. */
const COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

/**
 * Switch the signed-in coach's active team.
 *
 * The action writes `golf_active_team` only when the coach is authorised
 * for `teamId`. On success it revalidates the dashboard root so every
 * coach page re-renders with the new team. The client calls `router.refresh()`
 * after this returns to pick up the new RSC payload.
 *
 * @returns `{ success: true }` on valid switch; `{ success: false, reason }` otherwise.
 */
export async function setActiveTeam(
  teamId: string,
): Promise<{ success: true } | { success: false; reason: string }> {
  const session = await getGolfSessionProfile();
  if (!session?.coach) return { success: false, reason: 'unauthenticated' };

  const { coach } = session;
  const supabase = await createClient();

  const allowed = await validateCoachTeamAccess(
    supabase,
    coach.id,
    teamId,
    coach.organization_id,
  );

  if (!allowed) return { success: false, reason: 'unauthorized' };

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TEAM_COOKIE, teamId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });

  // Bust every coach page that SSR-renders team data.
  revalidatePath('/golf/dashboard', 'layout');

  return { success: true };
}

/**
 * Return all teams available to the signed-in coach.
 * Safe to call from Server Components as a data-fetch (no mutation).
 *
 * Returns an empty array when:
 *   - The caller is not an authenticated coach, or
 *   - The coach has no team assignments.
 */
export async function listCoachTeams(): Promise<CoachTeamOption[]> {
  const session = await getGolfSessionProfile();
  if (!session?.coach) return [];

  const { coach } = session;
  const supabase = await createClient();

  return getCoachTeams(supabase, coach.id, coach.organization_id);
}

/**
 * Read the currently active team cookie value without validating it.
 * Validation happens inside `resolveCoachActiveTeamId`.
 */
export async function getActiveTeamCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_TEAM_COOKIE)?.value ?? null;
}
