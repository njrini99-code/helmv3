import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import {
    getCachedCoachDashboardData,
    getCachedPlayerDashboardData,
    type DashboardDateRange,
    type CoachDashboardPayload,
    type PlayerDashboardPayload,
} from '@/app/golf/actions/dashboard-data';
// The legacy `CoachDashboard` JSX component was deleted in Wave W1 (Fairway is
// the only tree); `CoachDashboardData` was extracted to its own module so
// FairwayCoachDashboard and this route can both keep importing the type.
import type { CoachDashboardData } from './components/coach-dashboard-types';
import type { GolfCoach, GolfTeam, GolfPlayer } from '@/lib/types/golf';
import type { CalendarEvent } from '@/lib/types/calendar';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayCoachDashboard } from '@/components/fairway/pages/dashboard/FairwayCoachDashboard';
import { FairwayPlayerDashboard, type PlayerDashboardData } from '@/components/fairway/pages/dashboard/FairwayPlayerDashboard';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { getPlayerHubSummaryData, type PlayerHubSummaryData } from '@/app/golf/actions/player-hub-data';
import { getTeamJoinRequests, type JoinRequestData } from '@/app/golf/actions/teams';

export const dynamic = 'force-dynamic';

const VALID_RANGES = new Set(['7d', '30d', '90d', 'season', 'all']);

/**
 * Renders the coach dashboard inside the `.fairway-ds` scope on `bg-canvas`.
 * Fairway is the only tree (Wave W1) — the legacy CoachDashboard fork has
 * been removed.
 */
function renderCoachDashboard(props: {
    data: CoachDashboardData;
    enhancedData?: CoachDashboardPayload | null;
    dateRange: DashboardDateRange;
    // Fetched server-side (see the coach branch below) and passed straight
    // through so FairwayJoinRequestAlert renders from data already present at
    // first paint instead of self-fetching on mount — no post-hydration
    // reflow of everything below the banner.
    joinRequests?: JoinRequestData[];
}) {
    return (
        <div className={fairwayScope('min-h-full')}>
            <FairwayCoachDashboard
                data={props.data}
                enhancedData={props.enhancedData ?? undefined}
                dateRange={props.dateRange}
                joinRequests={props.joinRequests}
            />
        </div>
    );
}

/**
 * Renders the PLAYER dashboard inside the `.fairway-ds` scope on `bg-canvas`.
 * Fairway is the only tree (Wave W1) — the legacy PlayerDashboard fork has
 * been removed.
 */
function renderPlayerDashboard(props: {
    data: PlayerDashboardData;
    enhancedData?: PlayerDashboardPayload | null;
    hubData?: PlayerHubSummaryData | null;
}) {
    return (
        <div className={fairwayScope('min-h-full')}>
            <FairwayPlayerDashboard
                data={props.data}
                enhancedData={props.enhancedData ?? undefined}
                hubData={props.hubData ?? undefined}
            />
        </div>
    );
}

export default async function GolfDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const params = await searchParams;
    const dateRange: DashboardDateRange = VALID_RANGES.has(params.range ?? '') ? (params.range as DashboardDateRange) : 'all';

    // React.cache() dedupes getUser() + profile queries across render tree
    // Eliminates 4-6 redundant Supabase round-trips vs ad-hoc getUser()
    const session = await getGolfSessionProfile();

    if (!session) {
        redirect('/golf/login');
    }

    const { userId, coach, player } = session;

    // Supabase client only needed for team lookups (not auth)
    const supabase = await createClient();

    // ── Coach dashboard ──
    if (coach) {
        // Get team via organization (deterministic: handles orgs with >1 team).
        // P002/P426: a real DB/network outage must SURFACE to the route
        // error.tsx (RouteErrorBoundary), not be swallowed into a fake "coach
        // without team" empty state indistinguishable from a genuine new coach.
        // A genuine no-team coach resolves to `undefined` WITHOUT throwing, so
        // letting this throw only fires on a true failure.
        let teamId: string | undefined;
        if (coach.organization_id) {
            teamId = (await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id)) ?? undefined;
        }

        if (teamId) {
            // P002/P426: a real DB/network outage must SURFACE — the route
            // error.tsx (RouteErrorBoundary) offers a retry. Previously this caught
            // the failure and rendered a zeroed dashboard indistinguishable from a
            // healthy empty team (roster 0, "No rounds logged yet"), hiding the
            // outage AND bypassing the already-wired retry boundary. A genuine new
            // team returns empty arrays/zero counts WITHOUT throwing (see
            // getCoachDashboardData), so letting this throw only fires on a true
            // failure.
            // Fetch the join-request banner's data alongside the dashboard payload
            // (not after it, client-side) so FairwayJoinRequestAlert can render
            // from a prop at first paint — the banner used to self-fetch on
            // mount, which meant it popped in after hydration and reflowed the
            // KPI/rounds content below it. A request failure degrades to "no
            // pending requests" (an empty array) rather than surfacing an error
            // here — the banner is a convenience callout, not core dashboard data.
            const [payload, joinRequestsResult] = await Promise.all([
                getCachedCoachDashboardData(coach.id, userId, teamId, dateRange),
                getTeamJoinRequests(),
            ]);
            const joinRequests: JoinRequestData[] =
                joinRequestsResult.success && joinRequestsResult.data ? joinRequestsResult.data : [];

            const data: CoachDashboardData = {
                coach: {
                    id: coach.id,
                    user_id: userId,
                    organization_id: coach.organization_id || null,
                    full_name: coach.full_name,
                    avatar_url: coach.avatar_url || null,
                    created_at: '',
                } as GolfCoach,
                team: payload.teamName
                    ? ({ id: teamId, name: payload.teamName, season: null, join_code: payload.joinCode, created_at: '' } as GolfTeam)
                    : null,
                stats: payload.stats,
                recentRounds: payload.recentRounds,
                topPlayers: payload.topPlayers,
                calendarEvents: payload.calendarEvents as CalendarEvent[],
                teamScoringTrend: payload.teamScoringTrend.length > 0 ? payload.teamScoringTrend : undefined,
            };

            return renderCoachDashboard({ data, enhancedData: payload, dateRange, joinRequests });
        }

        // Coach without team — empty state
        const emptyData: CoachDashboardData = {
            coach: {
                id: coach.id,
                user_id: userId,
                organization_id: coach.organization_id || null,
                full_name: coach.full_name,
                avatar_url: coach.avatar_url || null,
                created_at: '',
            } as GolfCoach,
            team: null,
            stats: { rosterSize: 0, upcomingEvents: 0, activeQualifiers: 0, teamScoringAverage: null, previousAverage: null },
            recentRounds: [],
            topPlayers: [],
            calendarEvents: [],
            teamScoringTrend: undefined,
        };

        return renderCoachDashboard({ data: emptyData, dateRange });
    }

    // ── Player dashboard ──
    if (player) {
        // Get team via membership
        let teamId: string | null = null;
        try {
            const { data: teamMember } = await supabase
                .from('golf_team_members')
                .select('team_id')
                .eq('player_id', player.id)
                .eq('status', 'active')
                .maybeSingle();
            teamId = teamMember?.team_id ?? null;
        } catch {
            // Network failure — proceed with null teamId
        }

        // P002/P426: a real DB/network outage must SURFACE to the route
        // error.tsx (RouteErrorBoundary) instead of being swallowed into a
        // fake-empty player dashboard indistinguishable from a healthy new
        // player. A genuine new player returns empty arrays/zero counts
        // WITHOUT throwing, so letting this throw only fires on a true failure.
        //
        // WAVE W2: fetch the former Hub's triage data (tasks/RSVP/announcements/
        // trips) in parallel — teamless players get `null` (skip), exactly like
        // the standalone Hub page skipped them before.
        const [payload, hubData] = await Promise.all([
            getCachedPlayerDashboardData(player.id, userId, teamId),
            teamId ? getPlayerHubSummaryData(teamId, player.id) : Promise.resolve(null),
        ]);
        const nameParts = `${player.first_name} ${player.last_name}`.split(' ');

        const data: PlayerDashboardData = {
            player: {
                id: player.id,
                user_id: userId,
                first_name: nameParts[0] || '',
                last_name: nameParts.slice(1).join(' ') || '',
                avatar_url: player.avatar_url || null,
                handicap: payload.stats.handicap,
                created_at: '',
            } as GolfPlayer,
            team: payload.teamName
                ? ({ id: teamId || '', name: payload.teamName, season: null, join_code: null, created_at: '' } as unknown as GolfTeam)
                : null,
            stats: payload.stats,
            recentRounds: payload.recentRounds,
        };

        return renderPlayerDashboard({ data, enhancedData: payload, hubData });
    }

    // No role found — redirect to onboarding
    redirect('/golf/signup');
}
