import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/types/database';

export type CoachType = Database['public']['Enums']['baseball_coach_type'];
export type PlayerType = Database['public']['Enums']['baseball_player_type'];
export type UserRole = Database['public']['Enums']['user_role'];

export interface CoachProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  coach_type: CoachType;
  organization_id: string | null;
  onboarding_completed: boolean | null;
}

export interface PlayerProfile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  player_type: PlayerType;
  onboarding_completed: boolean | null;
  recruiting_activated: boolean | null;
}

export interface SessionProfile {
  userId: string;
  role: UserRole | null;
  coach: CoachProfile | null;
  player: PlayerProfile | null;
}

/**
 * React.cache()-wrapped session profile fetch.
 *
 * Deduplicates auth DB queries across all server components, layouts, and
 * server actions within the same React render tree (single request).
 *
 * Before: middleware + layout + sub-layout + page + action = ~12 DB queries
 * After:  single batch deduped by React.cache() = 4 queries (getUser + 3 selects)
 *
 * Usage (server components / server actions):
 *   import { getSessionProfile } from '@/lib/auth/session';
 *   const session = await getSessionProfile();
 *   if (!session) redirect('/baseball/login');
 */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  // Single-trip: fetch user role + both profiles in parallel
  const [userResult, coachResult, playerResult] = await Promise.all([
    supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('baseball_coaches')
      .select('id, user_id, full_name, coach_type, organization_id, onboarding_completed')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('baseball_players')
      .select('id, user_id, first_name, last_name, player_type, onboarding_completed, recruiting_activated')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const declaredRole = (userResult.data?.role ?? null) as UserRole | null;
  const coach = coachResult.data as CoachProfile | null;
  const player = playerResult.data as PlayerProfile | null;

  // Profile presence is the source of truth; declared role is tiebreak
  const resolvedRole: UserRole | null =
    coach && player
      ? (declaredRole ?? 'coach')
      : coach
        ? 'coach'
        : player
          ? 'player'
          : declaredRole;

  return {
    userId: user.id,
    role: resolvedRole,
    coach,
    player,
  };
});

// ============================================================================
// GOLF SESSION (React.cache deduplication — same pattern as baseball above)
// ============================================================================

export interface GolfCoachProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  organization_id: string | null;
  avatar_url: string | null;
}

export interface GolfPlayerProfile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  handicap: number | null;
}

export interface GolfSessionProfile {
  userId: string;
  role: 'coach' | 'player' | null;
  coach: GolfCoachProfile | null;
  player: GolfPlayerProfile | null;
}

/**
 * React.cache()-wrapped golf session profile fetch.
 *
 * Deduplicates the getUser() + golf_coaches + golf_players queries across all
 * server components, layouts, and server actions in the same React render tree.
 * Without this, each page + action re-runs 4–6 redundant Supabase queries.
 *
 * Usage:
 *   import { getGolfSessionProfile } from '@/lib/auth/session';
 *   const session = await getGolfSessionProfile();
 *   if (!session) redirect('/golf/login');
 */
export const getGolfSessionProfile = cache(async (): Promise<GolfSessionProfile | null> => {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  // Single-trip: coach + player in parallel
  const [coachResult, playerResult] = await Promise.all([
    supabase
      .from('golf_coaches')
      .select('id, user_id, full_name, organization_id, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('golf_players')
      .select('id, user_id, first_name, last_name, avatar_url, handicap')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const coach = coachResult.data as GolfCoachProfile | null;
  const player = playerResult.data as GolfPlayerProfile | null;
  const role = coach ? 'coach' : player ? 'player' : null;

  return { userId: user.id, role, coach, player };
});

/**
 * Require an authenticated golf coach session.
 * Throws if not authenticated or not a golf coach.
 */
export async function requireGolfCoachSession(): Promise<
  Omit<GolfSessionProfile, 'coach'> & { coach: GolfCoachProfile }
> {
  const session = await getGolfSessionProfile();
  if (!session?.coach) throw new Error('Unauthorized: golf coach role required');
  return session as Omit<GolfSessionProfile, 'coach'> & { coach: GolfCoachProfile };
}

/**
 * Require an authenticated golf player session.
 * Throws if not authenticated or not a golf player.
 */
export async function requireGolfPlayerSession(): Promise<
  Omit<GolfSessionProfile, 'player'> & { player: GolfPlayerProfile }
> {
  const session = await getGolfSessionProfile();
  if (!session?.player) throw new Error('Unauthorized: golf player role required');
  return session as Omit<GolfSessionProfile, 'player'> & { player: GolfPlayerProfile };
}

// ============================================================================
// BASEBALL REQUIRE HELPERS
// ============================================================================

/**
 * Require an authenticated session. Throws 'Unauthorized' if not logged in.
 * Use in server actions where you want to throw rather than redirect.
 */
export async function requireSession(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) throw new Error('Unauthorized');
  return session;
}

/**
 * Require an authenticated coach session.
 * Throws if not authenticated or not a coach.
 */
export async function requireCoachSession(): Promise<
  Omit<SessionProfile, 'coach'> & { coach: CoachProfile }
> {
  const session = await requireSession();
  if (session.role !== 'coach' || !session.coach) {
    throw new Error('Unauthorized: coach role required');
  }
  return session as Omit<SessionProfile, 'coach'> & { coach: CoachProfile };
}

/**
 * Require an authenticated player session.
 * Throws if not authenticated or not a player.
 */
export async function requirePlayerSession(): Promise<
  Omit<SessionProfile, 'player'> & { player: PlayerProfile }
> {
  const session = await requireSession();
  if (session.role !== 'player' || !session.player) {
    throw new Error('Unauthorized: player role required');
  }
  return session as Omit<SessionProfile, 'player'> & { player: PlayerProfile };
}
