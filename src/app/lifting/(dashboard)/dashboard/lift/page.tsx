// =============================================================================
// src/app/lifting/(dashboard)/dashboard/lift/page.tsx
//
// LIFTING LAB — Athlete-facing "Lift" home (server component route wrapper).
//
// Resolution:
//   1. Authenticate the user.
//   2. Resolve the athlete's helm_lifting_athletes.id (multi-sport: baseball →
//      golf → direct user_id fallback, mirroring player-sessions.ts).
//   3. Fetch upcoming (today + future open) and recent (completed/missed)
//      sessions from helm_lifting_sessions via athlete-self RLS.
//   4. Check today's readiness check-in.
//   5. Mount PlayerLiftHomeClient with the assembled props.
//
// If the user has no athlete row (e.g. a coach navigating to the route), they
// see an honest empty state without erroring. The session fetch relies on
// helm_lifting_is_my_athlete RLS, so the Supabase client only returns the
// caller's own rows.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { PlayerLiftHomeClient } from '@/components/lifting/players/PlayerLiftHomeClient';
import type {
  HelmLiftingSessionRow,
  HelmLiftingSessionStatus,
  HelmLiftingReadinessCheckinRow,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Athlete ID resolution — mirrors player-sessions.ts getMyLiftToday
// ---------------------------------------------------------------------------

async function resolveAthleteId(userId: string): Promise<string | null> {
  const supabase = await createClient();

  // 1. Baseball player → org → athlete row
  const { data: baseballRow } = await fromUntyped(supabase, 'baseball_players')
    .select('id, baseball_teams(organization_id)')
    .eq('user_id', userId)
    .maybeSingle() as {
    data: { id: string; baseball_teams?: { organization_id?: string } | null } | null;
  };

  if (baseballRow) {
    const orgId = baseballRow.baseball_teams?.organization_id ?? null;
    if (orgId) {
      const { data: athleteRow } = await fromUntyped(supabase, 'helm_lifting_athletes')
        .select('id')
        .eq('organization_id', orgId)
        .eq('sport', 'baseball')
        .eq('sport_player_id', baseballRow.id)
        .eq('is_active', true)
        .maybeSingle() as { data: { id: string } | null };
      if (athleteRow) return athleteRow.id;
    }
  }

  // 2. Golf player → org → athlete row
  const { data: golfRow } = await fromUntyped(supabase, 'golf_players')
    .select('id, golf_team_members(golf_teams(organization_id))')
    .eq('user_id', userId)
    .maybeSingle() as {
    data: {
      id: string;
      golf_team_members?: Array<{ golf_teams?: { organization_id?: string } | null }> | null;
    } | null;
  };

  if (golfRow) {
    const orgId = golfRow.golf_team_members?.[0]?.golf_teams?.organization_id ?? null;
    if (orgId) {
      const { data: athleteRow } = await fromUntyped(supabase, 'helm_lifting_athletes')
        .select('id')
        .eq('organization_id', orgId)
        .eq('sport', 'golf')
        .eq('sport_player_id', golfRow.id)
        .eq('is_active', true)
        .maybeSingle() as { data: { id: string } | null };
      if (athleteRow) return athleteRow.id;
    }
  }

  // 3. Direct user_id fallback (e.g. non-sport-specific lab accounts)
  const { data: directRow } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle() as { data: { id: string } | null };

  return directRow?.id ?? null;
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

const OPEN_STATUSES: HelmLiftingSessionStatus[] = ['assigned', 'started', 'modified'];
const RECENT_DAYS = 14;

async function fetchPlayerSessions(athleteId: string): Promise<{
  upcoming: HelmLiftingSessionRow[];
  recent: HelmLiftingSessionRow[];
}> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Upcoming: today + future + overdue open
  const { data: upcomingRows } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('*')
    .eq('athlete_id', athleteId)
    .or(
      `and(scheduled_date.gte.${today}),` +
        `and(status.in.(assigned,started,modified),scheduled_date.lt.${today})`,
    )
    .order('scheduled_date', { ascending: true })
    .limit(20) as { data: HelmLiftingSessionRow[] | null };

  const upcoming = (upcomingRows ?? []).filter(
    (s) => s.scheduled_date >= today || OPEN_STATUSES.includes(s.status),
  );

  // Recent: completed / missed / excused in the last RECENT_DAYS days
  const { data: recentRows } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('*')
    .eq('athlete_id', athleteId)
    .in('status', ['completed', 'missed', 'excused'])
    .gte('scheduled_date', cutoff)
    .lte('scheduled_date', today)
    .order('scheduled_date', { ascending: false })
    .limit(10) as { data: HelmLiftingSessionRow[] | null };

  return {
    upcoming,
    recent: recentRows ?? [],
  };
}

async function checkReadinessToday(athleteId: string): Promise<boolean> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('checkin_date', today)
    .maybeSingle() as { data: HelmLiftingReadinessCheckinRow | null };

  return data !== null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PlayerLiftPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/lifting/login');
  }

  const athleteId = await resolveAthleteId(user.id);

  // No athlete row — show empty state via client with empty arrays
  const [sessions, readinessSubmittedToday] = athleteId
    ? await Promise.all([
        fetchPlayerSessions(athleteId),
        checkReadinessToday(athleteId),
      ])
    : [{ upcoming: [], recent: [] }, false];

  return (
    <PlayerLiftHomeClient
      upcoming={sessions.upcoming}
      recent={sessions.recent}
      readinessSubmittedToday={readinessSubmittedToday}
    />
  );
}
