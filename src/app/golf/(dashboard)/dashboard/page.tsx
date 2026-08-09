import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
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
import { getCurrentDecimalHourInTz } from '@/lib/utils/timezone';
import { getGreeting, timeOfDayForHour } from '@/lib/utils/time-of-day';

export const dynamic = 'force-dynamic';

const VALID_RANGES = new Set(['7d', '30d', '90d', 'season', 'all']);

/**
 * Resolve the dashboard opener's greeting phrase and date label ONCE, here on
 * the server, in the team's own timezone.
 *
 * FairwayCoachDashboard used to derive the greeting in a `useEffect` seeded
 * with a time-neutral "Welcome back", because deriving it during SSR was
 * assumed to mean pinning it to the server clock. It does not: the payload
 * already carries the team's timezone (`golf_team_settings.timezone`, defaulted
 * to America/New_York by dashboard-data.ts, so it is always a real zone), which
 * is the same value the client effect was reaching for. Resolving it here makes
 * the <h1> correct in the first painted byte instead of rewriting the largest
 * text on the page a beat after it lands.
 */
function resolveOpener(timezone: string): { greeting: string; todayLabel: string } {
    let greeting = 'Welcome back';
    try {
        greeting = getGreeting(timeOfDayForHour(getCurrentDecimalHourInTz(timezone)));
    } catch {
        /* unknown zone — the time-neutral phrase is never wrong */
    }

    let todayLabel = '';
    try {
        todayLabel = new Intl.DateTimeFormat('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            timeZone: timezone,
        }).format(new Date());
    } catch {
        /* unknown zone — the opener falls back to its static eyebrow */
    }

    return { greeting, todayLabel };
}

/**
 * A session can pass the top-of-page check yet expire before the data fetch
 * re-validates it (auth token refresh race — observed live as repeated
 * 'Not authenticated' digests on /golf/dashboard). Send that narrow case to
 * the login screen; anything else still surfaces to the route error boundary
 * (P002/P426 — real outages must never be swallowed).
 */
function redirectToLoginOnExpiredSession(error: unknown): never {
    if (error instanceof Error && error.message === 'Not authenticated') {
        redirect('/golf/login?returnTo=/golf/dashboard');
    }
    throw error;
}

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
    // Opener text resolved server-side in the team's timezone (see
    // resolveOpener) so the greeting never rewrites itself after hydration.
    const opener = props.enhancedData ? resolveOpener(props.enhancedData.timezone) : undefined;
    return (
        <div className={fairwayScope('min-h-full')}>
            <FairwayCoachDashboard
                data={props.data}
                enhancedData={props.enhancedData ?? undefined}
                dateRange={props.dateRange}
                joinRequests={props.joinRequests}
                greeting={opener?.greeting}
                todayLabel={opener?.todayLabel || undefined}
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
                greeting={
                    props.enhancedData ? resolveOpener(props.enhancedData.timezone).greeting : undefined
                }
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
            ]).catch(redirectToLoginOnExpiredSession);
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
        // This read used to be swallowed TWICE: a `try { } catch { }` that
        // discarded the exception, and only `.data` destructured — so the
        // supabase-js failure, which RESOLVES as { data: null, error } rather
        // than throwing, never reached the catch anyway. Either way teamId
        // became null, the hub fetch below was skipped by the `teamId ?` guard,
        // and the page rendered as though the player is on no team.
        //
        // That is precisely what the comment below forbids, so it now obeys it:
        // the failure surfaces to the route error boundary. A genuine new player
        // is unaffected — `.maybeSingle()` reports "no membership row" as
        // { data: null, error: null }, which is a real answer, not a failure.
        const { data: teamMember, error: teamMemberError } = await supabase
            .from('golf_team_members')
            .select('team_id')
            .eq('player_id', player.id)
            .eq('status', 'active')
            .maybeSingle();

        if (teamMemberError) {
            await logServerError(
                `[player dashboard] team membership read failed for player ${player.id}; the dashboard would render as though they are on no team: ${describeError(teamMemberError)}`,
                { action: 'golf.playerDashboard.resolveTeam', featureArea: 'teams' },
            );
            throw new Error('Failed to load your dashboard');
        }

        const teamId: string | null = teamMember?.team_id ?? null;

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
        ]).catch(redirectToLoginOnExpiredSession);
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
