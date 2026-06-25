'use server';

// =============================================================================
// active-context.ts
//
// V11 "Team Context And Role Switcher" (docs/.../v11_auth_team_join_staff_roles.md
// §"Team Context And Role Switcher"). A single BaseballHelm user can belong to
// multiple teams as a player and/or as staff, so routing needs an *active team*.
//
// Strategy (per the V11 doc):
//   - A cookie (`active_baseball_team`) stores the current team id for fast,
//     stateless routing.
//   - The cookie is NEVER trusted on its own. Every read re-validates, on the
//     SERVER, that the current auth user is actually a player-member or staff
//     of that team. A stale/forged cookie falls back to the user's first team.
//
// Membership is resolved from database rows (not user metadata):
//   - Player teams:  baseball_team_members.player_id -> baseball_players where
//                    baseball_players.user_id = auth.uid()
//   - Staff teams:   baseball_team_coach_staff.coach_id -> baseball_coaches
//                    where baseball_coaches.user_id = auth.uid()
//
// This file is `'use server'`, so it exports ONLY async server actions. The
// cookie name, types, and result shapes live in ./active-context-shared.
// This module is additive and baseball-scoped; it shares nothing with GolfHelm.
// =============================================================================

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { logServerException } from '@/lib/server-error-logger';
import {
  ACTIVE_BASEBALL_TEAM_COOKIE,
  ACTIVE_BASEBALL_TEAM_COOKIE_MAX_AGE,
  type ActiveBaseballContext,
  type ActiveBaseballRole,
  type SetActiveBaseballTeamResult,
} from './active-context-shared';

/** Minimal membership shape used internally for validation + fallback. */
interface BaseballMembership {
  teamId: string;
  role: ActiveBaseballRole;
  playerId: string | null;
  coachId: string | null;
}

/**
 * Load every team the current auth user belongs to, as a player and/or staff.
 * Player memberships are listed first so the "first team" fallback prefers a
 * player landing for player-primary users; ordering within each set is by
 * created_at to keep the fallback stable across requests.
 */
async function loadMemberships(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<BaseballMembership[]> {
  // Resolve the user's baseball player + coach profile ids (either may be null).
  const [playerProfile, coachProfile] = await Promise.all([
    supabase
      .from('baseball_players')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const playerId = playerProfile.data?.id ?? null;
  const coachId = coachProfile.data?.id ?? null;

  const [playerMemberships, staffMemberships] = await Promise.all([
    playerId
      ? supabase
          .from('baseball_team_members')
          .select('team_id, created_at')
          .eq('player_id', playerId)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null } as const),
    coachId
      ? supabase
          .from('baseball_team_coach_staff')
          .select('team_id, created_at')
          .eq('coach_id', coachId)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const memberships: BaseballMembership[] = [];

  for (const row of playerMemberships.data ?? []) {
    memberships.push({
      teamId: row.team_id,
      role: 'player',
      playerId,
      coachId: null,
    });
  }

  for (const row of staffMemberships.data ?? []) {
    memberships.push({
      teamId: row.team_id,
      role: 'coach',
      playerId: null,
      coachId,
    });
  }

  return memberships;
}

/**
 * Resolve the active baseball team context for the current request.
 *
 * Reads the `active_baseball_team` cookie and validates server-side that the
 * user is a member/staff of that team. If the cookie is missing, stale, or
 * forged, falls back to the user's first team and flags `fellBackFromStale`
 * (so a caller can route to a team switcher). Returns `null` only when the
 * user is unauthenticated or has no baseball memberships.
 */
export async function getActiveBaseballContext(): Promise<ActiveBaseballContext | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const memberships = await loadMemberships(supabase, user.id);
    if (memberships.length === 0) return null;

    const cookieStore = await cookies();
    const cookieTeamId = cookieStore.get(ACTIVE_BASEBALL_TEAM_COOKIE)?.value ?? null;

    // Validate the cookie against real membership rows (never trust the cookie).
    const matched = cookieTeamId
      ? memberships.find((m) => m.teamId === cookieTeamId)
      : undefined;

    const resolved = matched ?? memberships[0];
    if (!resolved) return null;
    const fellBackFromStale = Boolean(cookieTeamId) && !matched;

    return {
      userId: user.id,
      activeTeamId: resolved.teamId,
      activeRole: resolved.role,
      activePlayerId: resolved.playerId,
      activeCoachId: resolved.coachId,
      fellBackFromStale,
    };
  } catch (error) {
    await logServerException(error, {
      action: 'getActiveBaseballContext',
      featureArea: 'baseball-auth',
      source: 'server_action',
      handled: true,
    });
    return null;
  }
}

/**
 * Server action: set the active baseball team for the current user.
 *
 * Validates server-side that the authenticated user is a player-member or staff
 * of `teamId` BEFORE writing the cookie. Membership is read from database rows,
 * never from client input or user metadata. A non-member request is rejected
 * without mutating the cookie.
 */
export async function setActiveBaseballTeam(
  teamId: string
): Promise<SetActiveBaseballTeamResult> {
  try {
    if (!teamId || typeof teamId !== 'string') {
      return { success: false, error: 'A valid team id is required.' };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in.' };
    }

    const memberships = await loadMemberships(supabase, user.id);
    const isMember = memberships.some((m) => m.teamId === teamId);
    if (!isMember) {
      return { success: false, error: 'You are not a member of this team.' };
    }

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_BASEBALL_TEAM_COOKIE, teamId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ACTIVE_BASEBALL_TEAM_COOKIE_MAX_AGE,
    });

    return { success: true };
  } catch (error) {
    await logServerException(error, {
      action: 'setActiveBaseballTeam',
      featureArea: 'baseball-auth',
      source: 'server_action',
      handled: true,
    });
    return { success: false, error: 'Could not switch teams. Please try again.' };
  }
}
