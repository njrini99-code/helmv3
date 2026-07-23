import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Users } from 'lucide-react';
import { fairwayScope } from '@/lib/redesign/flag';
import { Button, EmptyState, InlineNotice } from '@/components/fairway';
import { FairwayCoachRoster } from '@/components/fairway/pages/roster/FairwayCoachRoster';
import { FairwayPlayerRoster } from '@/components/fairway/pages/roster/FairwayPlayerRoster';
import { getTeamJoinRequests } from '@/app/golf/actions/teams';
import { loadCoachIntents } from '@/lib/coachhelm/v3/intent/loader';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { computeScoringTrendFromRounds } from '@/lib/golf/scoring-trend';
import { loadActiveGoalsForPlayers } from '@/lib/coachhelm/v3/goals/loader';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import { loadPlayersStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { teamCohortText } from '@/components/golf/coachhelm/v3/StandingBar/utils';
import type { PlayersGridFocusArea } from '@/components/fairway';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team Roster | Helm Golf',
  description: 'Manage your golf team roster, view player stats, and track team performance',
};

// Cache roster page for 1 minute (balance between freshness and performance)
export const revalidate = 60;

interface PlayerWithStats {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  hometown: string | null;
  state: string | null;
  graduation_year: number | null;
  handicap: number | null;
  status: string | null;
  rounds_count?: number;
  avg_score?: number;
  last_seen?: string | null;
  // ── CoachHelm signal (Wave 2 Players-tab enrichment) — the SAME classifier
  // + loaders the Players sub-tab (PlayersGridView) and per-player deep-dives
  // already use, extended onto the roster LIST card so a coach doesn't have
  // to open every player individually to triage the team. ──────────────────
  /** Canonical scoring trend (`@/lib/golf/scoring-trend`), null when there
   *  isn't enough round history yet for a real signal (honest, not fake). */
  recent_trend?: 'improving' | 'declining' | 'stable' | null;
  /** golf_player_stats_cache.sg_total_per_round — null before the cache has
   *  a row for this player. */
  sg_total?: number | null;
  /** Team-percentile cohort text for the sg_total standing row (e.g. "Top
   *  quartile on team"), via the same `teamCohortText` helper StandingBar
   *  renders — empty string when cold-start / no team marker yet. */
  standing_tier?: string | null;
  /** Count of active/in_progress golf_player_focus_areas rows. */
  active_focus_areas?: number;
  /** Count of active v3 goals (golf_goals, state='active'). */
  active_goals?: number;
}

// `formatHandicap` was removed in the 2026-05-28 IA trim — the roster card
// now exposes only Avg Score inline; handicap surfaces on the player detail
// page. Re-add here if a future card revision restores the metric.

export default async function GolfRosterPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  const supabase = await createClient();

  if (!coach) {
    // Not a coach — check player path

    if (!player) {
      return (
        <div className={fairwayScope('min-h-full bg-canvas')}>
          <div className="mx-auto flex min-h-full w-full max-w-md items-center justify-center px-4 py-16">
            <EmptyState
              icon={<AlertCircle strokeWidth={1.75} />}
              title="Profile Not Found"
              description="Unable to find your profile. Please complete onboarding or contact support."
              action={
                <Button asChild variant="primary">
                  <Link href="/golf/coach">Complete Onboarding</Link>
                </Button>
              }
            />
          </div>
        </div>
      );
    }

    const { data: teamMember } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .maybeSingle();

    if (!teamMember?.team_id) {
      return (
        <div className={fairwayScope('min-h-full bg-canvas')}>
          <div className="mx-auto flex min-h-full w-full max-w-md items-center justify-center px-4 py-16">
            <EmptyState
              icon={<Users strokeWidth={1.75} />}
              title="No Team Found"
              description="You haven't joined a team yet. Ask your coach for a join code."
            />
          </div>
        </div>
      );
    }

    // Player roster is its own page — renders the Fairway player roster
    // (FairwayPlayerRoster). (The redesign path used to redirect into the Team
    // Hub Teammates tab, which made the "Roster" nav item a dead bounce — fixed
    // 2026-06-18.)

    // Fetch team info and teammates for player view
    const { data: playerTeam } = await supabase
      .from('golf_teams')
      .select('name')
      .eq('id', teamMember.team_id)
      .maybeSingle();

    // F083: a player's teammate list is active members only — pending invites
    // and removed players must not show up as teammates.
    const { data: tmData } = await supabase
      .from('golf_team_members')
      .select(`
        player:golf_players!inner (
          id, first_name, last_name, avatar_url, handicap, graduation_year,
          user:users(last_seen)
        )
      `)
      .eq('team_id', teamMember.team_id)
      .eq('status', 'active')
      .neq('player_id', player.id);

    const teammates = (tmData || [])
      .filter(tm => tm.player && !('error' in tm.player))
      .map(tm => {
        const p = tm.player as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          avatar_url: string | null;
          handicap: number | null;
          graduation_year: number | null;
          user?: { last_seen: string | null } | null;
        };
        return {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          avatar_url: p.avatar_url,
          handicap: p.handicap,
          graduation_year: p.graduation_year,
          last_seen: p.user?.last_seen || null,
        };
      })
      .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));

    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayPlayerRoster players={teammates} teamName={playerTeam?.name || 'Team'} />
      </div>
    );
  }

  // Get team_id from organization (deterministic: handles orgs with >1 team)
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

  if (!teamId) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto flex min-h-full w-full max-w-md items-center justify-center px-4 py-16">
          <EmptyState
            icon={<Users strokeWidth={1.75} />}
            title="No Team Assigned"
            description="You haven't created or joined a team yet. Create a team to start building your roster."
            action={
              <Button asChild variant="primary">
                <Link href="/golf/dashboard/team">Go to Team Settings</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  // Get team details
  const { data: team, error: teamError } = await supabase
    .from('golf_teams')
    .select('name, join_code')
    .eq('id', teamId)
    .maybeSingle();

  if (teamError) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto w-full max-w-2xl px-5 py-10 md:px-8">
          <InlineNotice tone="danger" title="Team Not Found">
            <p>Unable to load team information. The team may have been deleted.</p>
            <p className="mt-1 text-body-sm text-text-tertiary">Team ID: {teamId}</p>
            <p className="text-body-sm text-text-tertiary">Error: {teamError.message}</p>
          </InlineNotice>
        </div>
      </div>
    );
  }

  // Get players via team_members join - players are connected to teams through golf_team_members
  // Also fetch user's last_seen for online status indicator
  // F083: the coach roster shows active + inactive members (the status badge is
  // a coach affordance), but NOT 'pending' (player hasn't accepted the invite
  // yet — those live in PendingJoinRequests) or 'removed' (off the roster). The
  // unfiltered query was surfacing both as full roster cards.
  const { data: teamMembersData, error: playersError } = await supabase
    .from('golf_team_members')
    .select(`
      status,
      player:golf_players!inner (
        id,
        first_name,
        last_name,
        avatar_url,
        hometown,
        state,
        graduation_year,
        handicap,
        user:users (
          last_seen
        )
      )
    `)
    .eq('team_id', teamId)
    .in('status', ['active', 'inactive']);

  // Transform the data to flatten player info with status and last_seen
  const players = (teamMembersData || [])
    .filter(tm => tm.player && !('error' in tm.player))
    .map(tm => {
      const player = tm.player as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
        hometown: string | null;
        state: string | null;
        graduation_year: number | null;
        handicap: number | null;
        user?: { last_seen: string | null } | null;
      };
      return {
        id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        avatar_url: player.avatar_url,
        hometown: player.hometown,
        state: player.state,
        graduation_year: player.graduation_year,
        handicap: player.handicap,
        status: tm.status,
        last_seen: player.user?.last_seen || null,
      };
    })
    .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));

  if (playersError) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto w-full max-w-2xl px-5 py-10 md:px-8">
          <InlineNotice tone="danger" title="Error Loading Roster">
            <p>Unable to load team roster. Please try refreshing the page.</p>
            <p className="mt-1 text-body-sm text-text-tertiary">Error: {playersError.message}</p>
          </InlineNotice>
        </div>
      </div>
    );
  }

  const playerIds = players.map((p) => p.id);

  // Coach intent + join requests don't depend on the roster's rounds/stats
  // fetches below — run them in parallel with everything else instead of
  // as two more sequential round trips after the page's real work is done.
  const [coachIntents, jrRes] = await Promise.all([
    // Coach intent (CoachHelm v3): load every intent row this coach has
    // authored for their roster, keyed by player_id. The table is honestly
    // EMPTY until a coach sets intent — players with no row get `null`
    // below, which the IntentPill renders as its neutral "No intent"
    // cold-start chip. This is the coach view only; the player roster path
    // returned earlier.
    loadCoachIntents(coach.id),
    getTeamJoinRequests(),
  ]);
  const joinRequests = jrRes.success && jrRes.data ? jrRes.data : [];

  interface RoundStatRow {
    player_id: string;
    total_score: number | null;
    holes_played: number | null;
    /** Only used to sort each player's rounds most-recent-first for the
     *  trend classifier below — not read by the avg-score/rounds-count math. */
    round_date: string | null;
  }
  interface StatsCacheStatRow {
    player_id: string;
    sg_total_per_round: number | null;
  }
  interface FocusAreaStatRow {
    id: string;
    player_id: string;
    status: string | null;
    from_insight_id: string | null;
  }

  let allRounds: RoundStatRow[] = [];
  let statsCacheRows: StatsCacheStatRow[] = [];
  let focusAreaRows: FocusAreaStatRow[] = [];
  let goalsByPlayerMap = new Map<string, Goal[]>();
  let standingByPlayer = new Map<string, Map<MetricId, PlayerStanding>>();

  if (playerIds.length > 0) {
    // ONE parallel batch — rounds (for avg-score/trend), SG:Total cache,
    // focus-area status/outcome source, active goals, and standing all key
    // off the same playerIds and don't depend on each other. This is the
    // same shape the coach Brief's Players sub-tab already fetches
    // (intelligence/page.tsx's "roster + focus-area + goals + standing
    // block") — reused here so the Roster LIST card and the Players sub-tab
    // agree on what "trend"/"SG:Total"/"standing tier"/"focus areas"/"goals"
    // mean, without a second divergent computation.
    const [allRoundsResult, statsResult, focusResult, goalsMap, standingMap] = await Promise.all([
      // Fetch ALL rounds for ALL players. Paginated: PostgREST caps each
      // response at 1000 rows, and a full roster's accumulated round history
      // exceeds that — the old unpaginated `.in(...)` silently truncated at
      // 1000, under-counting rounds_count and skewing avg_score on every
      // roster card. `.order('id')` gives stable page boundaries (P444).
      fetchAllRowsResult<RoundStatRow>((from, to) =>
        supabase
          .from('golf_rounds')
          .select('player_id, total_score, holes_played, round_date')
          .in('player_id', playerIds)
          .not('total_score', 'is', null)
          .order('id', { ascending: true })
          .range(from, to),
      ),
      supabase
        .from('golf_player_stats_cache')
        .select('player_id, sg_total_per_round')
        .in('player_id', playerIds),
      supabase
        .from('golf_player_focus_areas')
        .select('id, player_id, status, from_insight_id')
        .in('player_id', playerIds),
      loadActiveGoalsForPlayers(playerIds).catch(() => new Map<string, Goal[]>()),
      loadPlayersStandingMap(playerIds).catch(() => new Map<string, Map<MetricId, PlayerStanding>>()),
    ]);
    allRounds = allRoundsResult.data ?? [];
    statsCacheRows = (statsResult.data as StatsCacheStatRow[] | null) ?? [];
    focusAreaRows = (focusResult.data as FocusAreaStatRow[] | null) ?? [];
    goalsByPlayerMap = goalsMap;
    standingByPlayer = standingMap;
  }

  // Recorded focus-area outcomes live on `golf_coach_insights.outcome_status`
  // (surfaced onto the originating focus area via from_insight_id) — the SAME
  // join the Players sub-tab performs, needed for the ported roster-health
  // header's "did the coaching land" outcome mix. Small + bounded by the
  // roster's own focus-area count.
  const sourceInsightIds = Array.from(
    new Set(focusAreaRows.map((fa) => fa.from_insight_id).filter((id): id is string => Boolean(id))),
  );
  const outcomeByInsightId: Record<string, string> = {};
  if (sourceInsightIds.length > 0) {
    const { data: insightOutcomes } = await supabase
      .from('golf_coach_insights')
      .select('id, outcome_status')
      .in('id', sourceInsightIds)
      .not('outcome_status', 'is', null);
    for (const row of insightOutcomes ?? []) {
      if (row.outcome_status) outcomeByInsightId[row.id] = row.outcome_status;
    }
  }

  // Group rounds by player_id in memory (fast!)
  const roundsByPlayer = allRounds.reduce((acc, round) => {
    if (!acc[round.player_id]) acc[round.player_id] = [];
    acc[round.player_id]!.push(round);
    return acc;
  }, {} as Record<string, RoundStatRow[]>);

  const sgTotalByPlayer: Record<string, number | null> = {};
  for (const row of statsCacheRows) {
    sgTotalByPlayer[row.player_id] = row.sg_total_per_round;
  }

  const standingTierByPlayer: Record<string, string | null> = {};
  for (const pid of playerIds) {
    const standing = standingByPlayer.get(pid)?.get('sg_total');
    standingTierByPlayer[pid] = standing ? teamCohortText(standing.team_pct, standing.team_n) || null : null;
  }

  const activeFocusAreasByPlayer: Record<string, number> = {};
  for (const fa of focusAreaRows) {
    if (fa.status === 'active' || fa.status === 'in_progress') {
      activeFocusAreasByPlayer[fa.player_id] = (activeFocusAreasByPlayer[fa.player_id] ?? 0) + 1;
    }
  }

  // Focus areas reshaped into the SAME PlayersGridFocusArea shape the ported
  // RosterHealthHeader instrument reads — id/area_type/title are unused by
  // its coverage/outcome-mix math, so only synthesized as honest placeholders
  // (never rendered) rather than fetched.
  const focusAreasForHealth: PlayersGridFocusArea[] = focusAreaRows.map((fa) => ({
    id: fa.id,
    area_type: 'general',
    title: null,
    player_id: fa.player_id,
    status: fa.status,
    outcome_status: fa.from_insight_id ? (outcomeByInsightId[fa.from_insight_id] ?? null) : null,
  }));

  // Map players to include stats — normalize to 18-hole equivalent, plus the
  // CoachHelm signal slice (trend / SG:Total / standing tier / focus-area +
  // goal counts) the enriched FairwayPlayerCard renders.
  const playersWithStats: PlayerWithStats[] = players.map((player) => {
    const rounds = roundsByPlayer[player.id] || [];
    const roundsCount = rounds.length;
    // Compute per-hole average then express as 18-hole equivalent
    let totalStrokes = 0;
    let totalHoles = 0;
    for (const r of rounds) {
      if (r.total_score) {
        const hp = r.holes_played ?? 18;
        totalStrokes += r.total_score;
        totalHoles += hp;
      }
    }
    const avgScore = totalHoles > 0 ? (totalStrokes / totalHoles) * 18 : 0;

    // Trend classifier needs most-recent-first order; the avg-score sum above
    // doesn't care about order, so this sort is scoped to a copy just for it.
    const mostRecentFirst = [...rounds].sort((a, b) =>
      (b.round_date ?? '').localeCompare(a.round_date ?? ''),
    );
    const trendResult = computeScoringTrendFromRounds(mostRecentFirst);

    return {
      ...player,
      rounds_count: roundsCount,
      avg_score: avgScore,
      last_seen: player.last_seen,
      recent_trend: trendResult.hasSignal ? trendResult.trend : null,
      sg_total: sgTotalByPlayer[player.id] ?? null,
      standing_tier: standingTierByPlayer[player.id] ?? null,
      active_focus_areas: activeFocusAreasByPlayer[player.id] ?? 0,
      active_goals: goalsByPlayerMap.get(player.id)?.length ?? 0,
    };
  });

  const teamName = team?.name || 'Team';
  const inviteCode = team?.join_code || null;

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayCoachRoster
        players={playersWithStats}
        teamName={teamName}
        inviteCode={inviteCode}
        intents={Object.fromEntries(coachIntents)}
        joinRequests={joinRequests}
        focusAreas={focusAreasForHealth}
      />
    </div>
  );
}
