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
import { getCoachTeams, getCoachTeamSwitchContext } from '@/lib/golf/resolve-team';
import type { CoachTeamOption } from '@/lib/golf/resolve-team';
// 'use server' modules may only export async functions — the cookie constants
// live in a plain sibling module.
import { ACTIVE_TEAM_COOKIE, ACTIVE_TEAM_COOKIE_MAX_AGE } from './team-switcher.constants';
import { withAdminObserved } from '@/lib/admin/observed-action';

/**
 * Switch the signed-in coach's active team.
 *
 * GATING (program-head capability): switching is permitted only when the
 * coach (a) is staffed on MORE than one team via golf_team_coach_staff AND
 * (b) holds role 'head_coach' on at least one of those staff rows. A
 * multi-team assistant — and any single-team coach — is refused; their
 * default-team behaviour is unchanged.
 *
 * The action writes `golf_active_team` only when the gate passes AND the
 * requested `teamId` is one of the coach's staffed teams. On success it
 * revalidates the dashboard root so every coach page re-renders with the new
 * team. The client calls `router.refresh()` after this returns to pick up
 * the new RSC payload.
 *
 * @returns `{ success: true }` on valid switch; `{ success: false, reason }` otherwise.
 */
async function setActiveTeamImpl(
  teamId: string,
): Promise<{ success: true } | { success: false; reason: string }> {
  const session = await getGolfSessionProfile();
  if (!session?.coach) return { success: false, reason: 'unauthenticated' };

  const { coach } = session;
  const supabase = await createClient();

  const ctx = await getCoachTeamSwitchContext(supabase, coach.id, coach.organization_id);

  // Head-coach gate: only multi-team head coaches may switch.
  if (!ctx.canSwitch) return { success: false, reason: 'switching-not-permitted' };

  // Target must be one of the coach's own staffed teams (stricter than the
  // read-path org fallback — a head coach can only switch among teams they staff).
  if (!ctx.teams.some((t) => t.id === teamId)) {
    return { success: false, reason: 'unauthorized' };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TEAM_COOKIE, teamId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ACTIVE_TEAM_COOKIE_MAX_AGE,
  });

  // Bust every coach page that SSR-renders team data.
  revalidatePath('/golf/dashboard', 'layout');

  return { success: true };
}

const observedSetActiveTeam = withAdminObserved(
  'setActiveTeam',
  { sport: 'golf', feature: 'team_info' },
  setActiveTeamImpl,
);

export async function setActiveTeam(
  teamId: string,
): Promise<{ success: true } | { success: false; reason: string }> {
  return observedSetActiveTeam(teamId);
}

/**
 * Return all teams available to the signed-in coach.
 * Safe to call from Server Components as a data-fetch (no mutation).
 *
 * Returns an empty array when:
 *   - The caller is not an authenticated coach, or
 *   - The coach has no team assignments.
 */
async function listCoachTeamsImpl(): Promise<CoachTeamOption[]> {
  const session = await getGolfSessionProfile();
  if (!session?.coach) return [];

  const { coach } = session;
  const supabase = await createClient();

  return getCoachTeams(supabase, coach.id, coach.organization_id);
}

const observedListCoachTeams = withAdminObserved(
  'listCoachTeams',
  { sport: 'golf', feature: 'team_info' },
  listCoachTeamsImpl,
);

export async function listCoachTeams(): Promise<CoachTeamOption[]> {
  return observedListCoachTeams();
}

/**
 * Read the currently active team cookie value without validating it.
 * Validation happens inside `resolveCoachActiveTeamId`.
 */
async function getActiveTeamCookieImpl(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_TEAM_COOKIE)?.value ?? null;
}

const observedGetActiveTeamCookie = withAdminObserved(
  'getActiveTeamCookie',
  { sport: 'golf', feature: 'team_info' },
  getActiveTeamCookieImpl,
);

export async function getActiveTeamCookie(): Promise<string | null> {
  return observedGetActiveTeamCookie();
}

/**
 * Clear the active-team selection. Call from the sign-out flow so the
 * `golf_active_team` cookie (90-day max-age, httpOnly) does NOT carry over to
 * the next account on a shared / kiosk browser or the shared demo login.
 *
 * The read path (validateCoachTeamAccess) is already staff-strict, so a carried
 * cookie cannot grant cross-coach access — this is hygiene, ensuring a fresh
 * login starts on the coach's own default team rather than a stale selection.
 */
async function clearActiveTeamImpl(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_TEAM_COOKIE);
}

const observedClearActiveTeam = withAdminObserved(
  'clearActiveTeam',
  { sport: 'golf', feature: 'team_info' },
  clearActiveTeamImpl,
);

export async function clearActiveTeam(): Promise<void> {
  return observedClearActiveTeam();
}
