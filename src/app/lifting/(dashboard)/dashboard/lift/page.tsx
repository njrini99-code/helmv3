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
import { resolveLiftingAthleteTimezone } from '@/lib/lifting/resolve-athlete-timezone';
import { todayIsoInTz, isoMinusDays } from '@/lib/baseball/daily-contract/contract-day';
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

async function fetchPlayerSessions(athleteId: string, today: string): Promise<{
  upcoming: HelmLiftingSessionRow[];
  recent: HelmLiftingSessionRow[];
}> {
  const supabase = await createClient();
  // `today` is the caller's already-timezone-resolved local day (see
  // PlayerLiftPage below) — never re-derive it from server UTC here, or the
  // upcoming/recent split silently reverts to the server's day boundary.
  const cutoff = isoMinusDays(today, RECENT_DAYS);

  // Today + future and overdue-but-still-open are fetched as SEPARATE bounded
  // queries (each with its own .limit()), not one combined .or(...) query
  // capped at 20 with a post-filter — a single capped query orders ascending
  // by scheduled_date, so overdue-open rows (earlier dates) sort BEFORE
  // today/future rows; 20+ overdue-open sessions would fill the entire cap
  // and push today's session out of the result set entirely (mirrors the
  // baseball Lift Home fix — src/app/baseball/(dashboard)/dashboard/lift/page.tsx).
  const [
    { data: currentFutureRows },
    { data: overdueOpenRows },
  ] = (await Promise.all([
    fromUntyped(supabase, 'helm_lifting_sessions')
      .select('*')
      .eq('athlete_id', athleteId)
      .in('status', OPEN_STATUSES)
      .gte('scheduled_date', today)
      .order('scheduled_date', { ascending: true })
      .limit(20),
    fromUntyped(supabase, 'helm_lifting_sessions')
      .select('*')
      .eq('athlete_id', athleteId)
      .in('status', OPEN_STATUSES)
      .lt('scheduled_date', today)
      .order('scheduled_date', { ascending: true })
      .limit(20),
  ])) as [
    { data: HelmLiftingSessionRow[] | null },
    { data: HelmLiftingSessionRow[] | null },
  ];

  // Overdue-open rows are all < today and already ascending, so concatenating
  // them ahead of the current/future rows (also ascending) preserves overall
  // chronological order without needing an extra merge-sort.
  const upcoming = [...(overdueOpenRows ?? []), ...(currentFutureRows ?? [])];

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

async function checkReadinessToday(athleteId: string, today: string): Promise<boolean> {
  const supabase = await createClient();

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

  // Resolve the athlete's own team-local "today" (session scheduled_date /
  // checkin_date bucketing) once — mirrors the baseball Daily Contract's
  // resolveTeamTimezone + todayIsoInTz idiom so a late-night athlete isn't
  // shown tomorrow's session as "today's lift" or told they haven't checked
  // in when they already have (server UTC day disagrees with their own).
  const today = athleteId
    ? todayIsoInTz(await resolveLiftingAthleteTimezone(athleteId))
    : null;

  // No athlete row — show empty state via client with empty arrays
  const [sessions, readinessSubmittedToday] = athleteId && today
    ? await Promise.all([
        fetchPlayerSessions(athleteId, today),
        checkReadinessToday(athleteId, today),
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
