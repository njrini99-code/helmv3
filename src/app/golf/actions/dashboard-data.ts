'use server';

import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { getTodayRangeForTz } from '@/lib/utils/timezone';
import { withAdminObserved } from '@/lib/admin/observed-action';

// ============================================================================
// TYPES
// ============================================================================

export interface TodayEvent {
    id: string;
    title: string;
    event_type: string;
    start_time: string;
    end_time: string | null;
    location: string | null;
    // Coach: RSVP counts; Player: own RSVP status
    rsvp_yes?: number;
    rsvp_total?: number;
    my_status?: string | null;
}

export interface SparklineStatCard {
    label: string;
    value: number | null;
    sparkline: number[]; // last 5 values (oldest → newest)
    trend?: 'improving' | 'declining' | 'stable';
    suffix?: string;
}

export interface ActionItem {
    id: string;
    type: 'task' | 'announcement' | 'deadline';
    title: string;
    date: string;
    priority?: string;
    status?: string;
    overdue?: boolean;
}

export interface TeamPulseData {
    improving: number;
    stable: number;
    declining: number;
    topMover?: { name: string; delta: number };
    roundsThisWeek: number;
}

export interface StrokesGainedSnapshot {
    sg_total: number | null;
    sg_off_tee: number | null;
    sg_approach: number | null;
    sg_around_green: number | null;
    sg_putting: number | null;
}

interface RecentRound {
    id: string;
    player_id: string;
    player_name: string;
    player_avatar_url: string | null;
    course_name: string;
    total_score: number;
    total_to_par: number;
    round_date: string;
    round_type: string | null;
    total_putts: number | null;
    total_fairways_hit: number | null;
    total_fairways: number | null;
    total_gir: number | null;
    total_gir_possible: number | null;
}

interface TopPlayer {
    id: string;
    name: string;
    avg_score: number;
    rounds: number;
}

interface ScoringTrend {
    label: string;
    value: number;
}

export interface CoachDashboardPayload {
    todayEvents: TodayEvent[];
    /**
     * True when the get_coach_today_schedule RPC failed. Distinguishes a
     * degraded/unloadable schedule from a genuinely empty day so the UI can
     * surface a "couldn't load" notice instead of the cheerful empty state.
     */
    todayScheduleError: boolean;
    stats: {
        rosterSize: number;
        upcomingEvents: number;
        activeQualifiers: number;
        teamScoringAverage: number | null;
        previousAverage: number | null;
    };
    sparklines: {
        scoringAvg: SparklineStatCard;
        girPct: SparklineStatCard;
        puttsPerRound: SparklineStatCard;
        rosterSize: SparklineStatCard;
    };
    teamPulse: TeamPulseData;
    actionItems: ActionItem[];
    recentRounds: RecentRound[];
    topPlayers: TopPlayer[];
    teamScoringTrend: ScoringTrend[];
    calendarEvents: Array<{
        id: string;
        title: string;
        event_type: string;
        start_time: string;
        end_time: string;
        location: string | null;
        created_by_id: string;
        is_recurring: boolean;
        created_at: string;
        updated_at: string;
    }>;
    teamName: string | null;
    joinCode: string | null;
    timezone: string;
}

export interface PlayerDashboardPayload {
    todayEvents: TodayEvent[];
    stats: {
        roundsPlayed: number;
        scoringAverage: number | null;
        bestRound: number | null;
        handicap: number | null;
        recentTrend?: 'improving' | 'declining' | 'stable';
    };
    sparklines: {
        scoringAvg: SparklineStatCard;
        girPct: SparklineStatCard;
        puttsPerRound: SparklineStatCard;
        handicap: SparklineStatCard;
    };
    secondaryStats: {
        firPct: number | null;
        scramblingPct: number | null;
        birdiesPerRound: number | null;
        bestRound: number | null;
    };
    strokesGained: StrokesGainedSnapshot;
    actionItems: ActionItem[];
    recentRounds: Array<{
        id: string;
        course_name: string;
        total_score: number;
        total_to_par: number;
        round_date: string;
    }>;
    scoringTrend: ScoringTrend[];
    teamName: string | null;
    timezone: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function getTodayRange(tz?: string): { start: string; end: string } {
    if (tz) {
        return getTodayRangeForTz(tz);
    }
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 86400000);
    return { start: start.toISOString(), end: end.toISOString() };
}

/** Trend for metrics where lower is better (scoring avg, putts).
 *  Uses split-half of last 5 values with 1.0-stroke threshold
 *  — aligned with stats page algorithm for consistency. */
function computeTrend(scores: number[]): 'improving' | 'declining' | 'stable' {
    if (scores.length < 3) return 'stable';
    const recent = scores.slice(0, 5); // newest first, up to 5
    const mid = Math.floor(recent.length / 2);
    const recentHalf = recent.slice(0, mid); // most recent
    const olderHalf = recent.slice(mid);     // older
    if (recentHalf.length === 0 || olderHalf.length === 0) return 'stable';
    const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length;
    if (recentAvg < olderAvg - 1) return 'improving';  // lower is better
    if (recentAvg > olderAvg + 1) return 'declining';
    return 'stable';
}

/** Trend for metrics where higher is better (GIR%, FIR%) */
function computeTrendHigherIsBetter(values: number[], threshold = 2): 'improving' | 'declining' | 'stable' {
    if (values.length < 3) return 'stable';
    const recent = values.slice(0, 5);
    const mid = Math.floor(recent.length / 2);
    const recentHalf = recent.slice(0, mid);
    const olderHalf = recent.slice(mid);
    if (recentHalf.length === 0 || olderHalf.length === 0) return 'stable';
    const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length;
    if (recentAvg > olderAvg + threshold) return 'improving';  // GIR went UP = good
    if (recentAvg < olderAvg - threshold) return 'declining';  // GIR went DOWN = bad
    return 'stable';
}

/** Build sparkline from an array of round objects by grouping into last N periods */
function buildSparkline(
    rounds: Array<{ round_date: string; value: number | null }>,
    count: number = 5
): number[] {
    // Take the most recent `count` non-null values (already sorted newest-first)
    const values = rounds
        .map(r => r.value)
        .filter((v): v is number => v !== null)
        .slice(0, count)
        .reverse(); // oldest → newest for sparkline
    return values;
}

// ============================================================================
// COACH DASHBOARD DATA
// ============================================================================

export type DashboardDateRange = '7d' | '30d' | '90d' | 'season' | 'all';

async function getCoachDashboardDataImpl(
    _coachId: string,
    userId: string,
    teamId: string,
    dateRange: DashboardDateRange = 'all'
): Promise<CoachDashboardPayload> {
    const supabase = await createClient();

    // Auth check + timezone in parallel (timezone only needs teamId, not user)
    const [authResult, timezoneResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase
            .from('golf_team_settings')
            .select('timezone')
            .eq('team_id', teamId)
            .maybeSingle(),
    ]);

    const { data: { user } } = authResult;
    if (!user) throw new Error('Not authenticated');
    if (user.id !== userId) throw new Error('Unauthorized');

    const teamTimezone = (timezoneResult.data as { timezone?: string } | null)?.timezone || 'America/New_York';
    const { start: todayStart, end: todayEnd } = getTodayRange(teamTimezone);
    const now = new Date().toISOString();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    // Compute date cutoff for the selected range
    let dateCutoff: string | null = null;
    if (dateRange !== 'all') {
        const nowMs = Date.now();
        switch (dateRange) {
            case '7d': dateCutoff = new Date(nowMs - 7 * 86400000).toISOString().split('T')[0]!; break;
            case '30d': dateCutoff = new Date(nowMs - 30 * 86400000).toISOString().split('T')[0]!; break;
            case '90d': dateCutoff = new Date(nowMs - 90 * 86400000).toISOString().split('T')[0]!; break;
            case 'season': {
                const d = new Date();
                const yr = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
                dateCutoff = `${yr}-08-01`;
                break;
            }
        }
    }

    // ── Parallel batch 1: Team info + roster + events + qualifiers + today's events + tasks + announcements + calendar ──
    const [
        teamResult,
        rosterCountResult,
        eventsCountResult,
        qualifiersCountResult,
        todayEventsResult,
        playersResult,
        pendingTasksResult,
        recentAnnouncementsResult,
        calendarEventsResult,
    ] = await Promise.all([
        supabase.from('golf_teams').select('id, name, season, join_code, created_at').eq('id', teamId).single(),
        supabase.from('golf_team_members').select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('status', 'active'),
        supabase.from('golf_events').select('id', { count: 'exact', head: true }).eq('team_id', teamId).gte('start_time', now),
        supabase.from('golf_qualifiers').select('id', { count: 'exact', head: true }).eq('team_id', teamId).in('status', ['upcoming', 'in_progress']),
        // Today's events + RSVP counts in a single RPC (consolidates the
        // sequential RSVP fetch that previously ran outside this Promise.all).
        // Returns jsonb array of { id, title, event_type, start_time, end_time, location, rsvp_yes, rsvp_total }.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc('get_coach_today_schedule', {
            p_team_id:     teamId,
            p_today_start: todayStart,
            p_today_end:   todayEnd,
        }) as Promise<{ data: TodayEvent[] | null; error: unknown }>,
        // All active players for round queries
        supabase.from('golf_team_members')
            .select('player:golf_players(id, first_name, last_name, avatar_url)')
            .eq('team_id', teamId)
            .eq('status', 'active'),
        // Pending tasks (assigned by this coach's team)
        supabase
            .from('golf_tasks')
            .select('id, title, due_date, priority, status')
            .eq('team_id', teamId)
            .in('status', ['pending', 'in_progress'])
            .order('due_date', { ascending: true, nullsFirst: false })
            .limit(20),
        // Recent announcements
        supabase
            .from('golf_announcements')
            .select('id, title, created_at, urgency')
            .eq('team_id', teamId)
            .not('published_at', 'is', null)
            .order('published_at', { ascending: false })
            .limit(5),
        // Calendar events (moved from sequential fetch at end)
        supabase
            .from('golf_events')
            .select('id, title, event_type, start_time, end_time, location, created_at, updated_at')
            .eq('team_id', teamId)
            .gte('start_time', now)
            .order('start_time', { ascending: true })
            .limit(20),
    ]);

    const team = teamResult.data;
    const rosterSize = rosterCountResult.count || 0;
    const upcomingEvents = eventsCountResult.count || 0;
    const activeQualifiers = qualifiersCountResult.count || 0;

    // Today events + RSVP counts are now delivered fully-shaped by the
    // get_coach_today_schedule RPC above. Capture the RPC error explicitly: a
    // failed call also yields `data == null` → []`, which must NOT be rendered as
    // the cheerful "clear schedule" empty state. The flag lets the UI surface a
    // distinct degraded notice instead (same honesty rule as the page catch).
    const todayScheduleError = todayEventsResult.error != null;
    const todayEvents: TodayEvent[] = (todayEventsResult.data as TodayEvent[] | null) ?? [];

    // Extract players
    const teamMembersData = playersResult.data as Array<{ player: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null }> | null;
    const players = teamMembersData?.map(tm => tm.player).filter((p): p is NonNullable<typeof p> => p !== null) || [];
    const playerIds = players.map(p => p.id);

    // ── Parallel batch 2: Rounds data (needs playerIds) ──
    let recentRounds: RecentRound[] = [];
    let topPlayers: TopPlayer[] = [];
    let teamScoringTrend: ScoringTrend[] = [];
    let teamScoringAverage: number | null = null;
    let previousAverage: number | null = null;
    let sparklines: CoachDashboardPayload['sparklines'] = {
        scoringAvg: { label: 'Team Scoring Avg', value: null, sparkline: [] },
        girPct: { label: 'Team GIR%', value: null, sparkline: [], suffix: '%' },
        puttsPerRound: { label: 'Team Putts/Rd', value: null, sparkline: [] },
        rosterSize: { label: 'Roster Size', value: rosterSize, sparkline: [] },
    };
    const teamPulse: TeamPulseData = { improving: 0, stable: 0, declining: 0, roundsThisWeek: 0 };

    if (playerIds.length > 0) {
        // Both round queries are paginated via fetchAllRowsResult so the FULL
        // windowed round set is covered (PostgREST hard-caps a single response
        // at 1000 rows; the previous `.limit(200)` silently truncated every KPI
        // — team scoring avg, GIR%, putts/Rd, top players, monthly trend — for
        // any window with >200 rounds). Pagination needs a stable total order:
        // round_date DESC keeps the newest-first ordering the downstream
        // consumers rely on (sparklines, split-half trends), with unique `id`
        // as tiebreaker so page boundaries don't drift.
        //
        // recentRounds is paginated too (not display-only): the coach dashboard
        // derives `roundsLogged = recentRounds.length` for the "N rounds in
        // window" footnote and the KPI coverage gate, so its count must match
        // the round set the KPIs are computed over. The Recent Rounds table
        // still renders only the first 8.
        const recentRoundsPromise = fetchAllRowsResult((from, to) => {
            let q = supabase
                .from('golf_rounds')
                .select('id, player_id, course_name, total_score, score_to_par, round_date, round_type, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, player:golf_players(first_name, last_name, avatar_url)')
                .in('player_id', playerIds)
                .eq('status', 'completed')
                .not('total_score', 'is', null);
            if (dateCutoff) q = q.gte('round_date', dateCutoff);
            return q
                .order('round_date', { ascending: false })
                .order('id', { ascending: true })
                .range(from, to);
        }, undefined, { table: 'golf_rounds', action: 'getCoachDashboardData', feature: 'coach_dashboard', sport: 'golf' });

        // All rounds query with optional date filter + holes_played for normalization
        const allRoundsPromise = fetchAllRowsResult((from, to) => {
            let q = supabase
                .from('golf_rounds')
                .select('id, player_id, total_score, score_to_par, round_date, holes_played, total_putts, total_gir, total_gir_possible')
                .in('player_id', playerIds)
                .eq('status', 'completed')
                .not('total_score', 'is', null);
            if (dateCutoff) q = q.gte('round_date', dateCutoff);
            return q
                .order('round_date', { ascending: false })
                .order('id', { ascending: true })
                .range(from, to);
        }, undefined, { table: 'golf_rounds', action: 'getCoachDashboardData', feature: 'coach_dashboard', sport: 'golf' });

        const [recentRoundsResult, allRoundsResult, weekRoundsResult] = await Promise.all([
            recentRoundsPromise,
            allRoundsPromise,
            // Rounds this week
            supabase
                .from('golf_rounds')
                .select('id', { count: 'exact', head: true })
                .in('player_id', playerIds)
                .eq('status', 'completed')
                .gte('round_date', weekAgo.split('T')[0]),
        ]);

        // Map recent rounds
        type RoundWithPlayer = {
            id: string; player_id: string; course_name: string | null;
            total_score: number | null; score_to_par: number | null; round_date: string;
            round_type: string | null; total_putts: number | null;
            total_fairways_hit: number | null; total_fairways: number | null;
            total_gir: number | null; total_gir_possible: number | null;
            player?: { first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
        };

        if (recentRoundsResult.data) {
            recentRounds = (recentRoundsResult.data as RoundWithPlayer[]).map(r => ({
                id: r.id,
                player_id: r.player_id,
                player_name: `${r.player?.first_name || ''} ${r.player?.last_name || ''}`.trim() || 'Unknown',
                player_avatar_url: r.player?.avatar_url || null,
                course_name: r.course_name || 'Unknown Course',
                total_score: r.total_score ?? 0,
                total_to_par: r.score_to_par ?? 0,
                round_date: r.round_date,
                round_type: r.round_type || null,
                total_putts: r.total_putts,
                total_fairways_hit: r.total_fairways_hit,
                total_fairways: r.total_fairways,
                total_gir: r.total_gir,
                total_gir_possible: r.total_gir_possible,
            }));
        }

        const allRounds = allRoundsResult.data || [];
        teamPulse.roundsThisWeek = weekRoundsResult.count || 0;

        if (allRounds.length > 0) {
            // Group rounds by player once — used by both top-players and team-pulse rollups.
            // Was O(P × R) per rollup × 2 rollups = O(2·P·R); now O(R) once + O(P) lookup.
            type AllRound = typeof allRounds[number];
            const roundsByPlayer = new Map<string, AllRound[]>();
            for (const r of allRounds) {
                const arr = roundsByPlayer.get(r.player_id);
                if (arr) arr.push(r);
                else roundsByPlayer.set(r.player_id, [r]);
            }

            // Team scoring average + trend — 18-hole rounds only, matching the
            // canonical cache scoring_average (update_player_stats_complete uses
            // v_rounds_18). Normalizing 9-hole rounds would diverge from the
            // per-player scoring averages shown elsewhere.
            const normalizedScores = allRounds
                .filter(r => r.total_score != null && r.total_score > 0
                    && (((r as { holes_played?: number | null }).holes_played ?? 18) === 18))
                .map(r => r.total_score!);
            if (normalizedScores.length > 0) {
                teamScoringAverage = normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length;
            }
            if (normalizedScores.length >= 10) {
                const midpoint = Math.floor(normalizedScores.length / 2);
                const olderScores = normalizedScores.slice(midpoint);
                previousAverage = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;
            }

            // Top players — single-pass lookup via roundsByPlayer Map
            const playerAvgs: TopPlayer[] = [];
            players.forEach(p => {
                const pRounds = roundsByPlayer.get(p.id) ?? [];
                if (pRounds.length > 0) {
                    const pNormScores = pRounds
                        .filter(r => r.total_score != null && r.total_score > 0)
                        .map(r => {
                            const holes = (r as { holes_played?: number | null }).holes_played ?? 18;
                            if (holes <= 0) return null;
                            return holes < 18 ? (r.total_score! / holes) * 18 : r.total_score!;
                        })
                        .filter((s): s is number => s !== null);
                    if (pNormScores.length > 0) {
                        const avg = pNormScores.reduce((a, b) => a + b, 0) / pNormScores.length;
                        playerAvgs.push({
                            id: p.id,
                            name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown',
                            avg_score: avg,
                            rounds: pNormScores.length
                        });
                    }
                }
            });
            topPlayers = playerAvgs.sort((a, b) => a.avg_score - b.avg_score).slice(0, 5);

            // Team scoring trend (by month)
            const roundsByYearMonth: Record<string, { label: string; scores: number[] }> = {};
            allRounds.forEach(round => {
                if (!round.round_date || round.total_score === null) return;
                // round_date is a date-only column; parse the YYYY-MM substring (or pin
                // the label to UTC) so a date-only round on the 1st is not shifted into
                // the prior month when the server TZ is west of UTC.
                const sortKey = round.round_date.slice(0, 7); // 'YYYY-MM'
                const label = new Date(`${round.round_date}T00:00:00Z`)
                    .toLocaleString('default', { month: 'short', year: '2-digit', timeZone: 'UTC' });
                if (!roundsByYearMonth[sortKey]) roundsByYearMonth[sortKey] = { label, scores: [] };
                const holes = (round as { holes_played?: number | null }).holes_played ?? 18;
                const normalizedScore = holes > 0 && holes < 18
                    ? Math.round((round.total_score / holes) * 18)
                    : round.total_score;
                roundsByYearMonth[sortKey].scores.push(normalizedScore);
            });
            teamScoringTrend = Object.entries(roundsByYearMonth)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([, { label, scores: s }]) => ({
                    label,
                    value: Number((s.reduce((a, b) => a + b, 0) / s.length).toFixed(1))
                }));

            // Sparklines — group last 5 rounds for each metric (team-wide)
            const scoringSparkRounds = allRounds.slice(0, 20).map(r => ({ round_date: r.round_date, value: r.total_score }));
            const puttsSparkRounds = allRounds.slice(0, 20).map(r => ({ round_date: r.round_date, value: r.total_putts }));
            const girSparkRounds = allRounds.slice(0, 20).map(r => ({
                round_date: r.round_date,
                value: r.total_gir !== null && r.total_gir_possible && r.total_gir_possible > 0
                    ? Math.round((r.total_gir / r.total_gir_possible) * 100)
                    : null
            }));

            const scoringSparkline = buildSparkline(scoringSparkRounds);
            const puttsSparkline = buildSparkline(puttsSparkRounds);
            const girSparkline = buildSparkline(girSparkRounds);

            // Compute current KPI values over the FULL windowed round set.
            // `allRounds` already respects the selected window (via dateCutoff).
            // Previously these used `allRounds.slice(0, 20)` — an arbitrary
            // latest-20 cap unrelated to the window — so the headline GIR%
            // reflected only a recent slump (e.g. 56% over the last 20 rounds vs
            // the true 64.5% for the season) and disagreed with the team stats page.
            //
            // GIR% is a WEIGHTED aggregate (sum made / sum opportunities), matching
            // the team stats page; this also keeps 9-hole rounds from skewing it.
            let girMadeTotal = 0;
            let girPossibleTotal = 0;
            for (const r of allRounds) {
                if (r.total_gir !== null && r.total_gir_possible && r.total_gir_possible > 0) {
                    girMadeTotal += r.total_gir;
                    girPossibleTotal += r.total_gir_possible;
                }
            }
            const avgGir = girPossibleTotal > 0 ? (girMadeTotal / girPossibleTotal) * 100 : null;

            // Putts/round over the full window — HOLE-WEIGHTED: (sum putts ÷ sum
            // holes played) × 18, matching the canonical cache
            // (update_player_stats_complete), the stats page, and the team page.
            // A mean of per-round normalized values over-weights short rounds.
            let puttsTotal = 0;
            let puttsHolesTotal = 0;
            for (const r of allRounds) {
                if (r.total_putts !== null) {
                    puttsTotal += r.total_putts;
                    puttsHolesTotal += (r as { holes_played?: number | null }).holes_played ?? 18;
                }
            }
            const avgPutts = puttsHolesTotal > 0 ? (puttsTotal / puttsHolesTotal) * 18 : null;

            // Compute GIR% and Putts trends (need arrays sorted newest-first)
            const girTrendValues = allRounds.slice(0, 20)
                .filter(r => r.total_gir !== null && r.total_gir_possible && r.total_gir_possible > 0)
                .map(r => (r.total_gir! / r.total_gir_possible!) * 100);
            const puttsTrendValues = allRounds.slice(0, 20).map(r => r.total_putts).filter((p): p is number => p !== null);

            sparklines = {
                scoringAvg: {
                    label: 'Team Scoring Avg',
                    value: teamScoringAverage ? Number(teamScoringAverage.toFixed(1)) : null,
                    sparkline: scoringSparkline,
                    trend: computeTrend(normalizedScores),
                },
                girPct: {
                    label: 'Team GIR%',
                    value: avgGir !== null ? Number(avgGir.toFixed(1)) : null,
                    sparkline: girSparkline,
                    suffix: '%',
                    trend: computeTrendHigherIsBetter(girTrendValues),
                },
                puttsPerRound: {
                    label: 'Team Putts/Rd',
                    value: avgPutts !== null ? Number(avgPutts.toFixed(1)) : null,
                    sparkline: puttsSparkline,
                    trend: computeTrend(puttsTrendValues),
                },
                rosterSize: {
                    label: 'Roster Size',
                    value: rosterSize,
                    sparkline: [],
                },
            };

            // Team pulse — per-player trend using normalized 18-hole equivalents
            // (aligned with stats page algorithm: 3+ rounds, split-half, 1.0 threshold)
            let bestDelta = 0;
            let bestMoverName = '';
            players.forEach(p => {
                const pRounds = roundsByPlayer.get(p.id) ?? [];
                // Normalize to 18-hole equivalents (matches stats page)
                const pNormalized = pRounds
                    .map(r => {
                        if (r.total_score === null) return null;
                        const hp = (r as { holes_played?: number | null }).holes_played ?? 18;
                        return Math.round(r.total_score * (18 / hp));
                    })
                    .filter((s): s is number => s !== null);
                if (pNormalized.length < 3) return; // Need 3+ rounds for trend
                const trend = computeTrend(pNormalized);
                if (trend === 'improving') teamPulse.improving++;
                else if (trend === 'declining') teamPulse.declining++;
                else teamPulse.stable++;

                // Top mover
                if (pNormalized.length >= 3) {
                    const recent5 = pNormalized.slice(0, 5);
                    const mid = Math.floor(recent5.length / 2);
                    const recentAvg = recent5.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
                    const olderAvg = recent5.slice(mid).reduce((a, b) => a + b, 0) / (recent5.length - mid);
                    const delta = olderAvg - recentAvg; // positive = improvement
                    if (delta > bestDelta) {
                        bestDelta = delta;
                        bestMoverName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
                    }
                }
            });
            if (bestMoverName && bestDelta > 0) {
                teamPulse.topMover = { name: bestMoverName, delta: Number(bestDelta.toFixed(1)) };
            }
        }
    }

    // Build action items
    const actionItems: ActionItem[] = [];
    // `today` for the overdue comparison must agree with the team's own local
    // day (already resolved above as teamTimezone for todayStart/todayEnd) —
    // not the server's UTC day, or a task due "today" in a non-UTC timezone
    // reads as overdue (or not) a day early/late. todayStart is already
    // `${dateStr}T00:00:00` in that timezone, so its date portion IS today.
    const today = todayStart.split('T')[0] ?? '';

    // Tasks
    if (pendingTasksResult.data) {
        for (const task of pendingTasksResult.data) {
            const isOverdue = task.due_date && task.due_date < today;
            actionItems.push({
                id: task.id,
                type: isOverdue ? 'deadline' : 'task',
                title: task.title,
                date: task.due_date || '',
                priority: task.priority || undefined,
                status: task.status || undefined,
                overdue: isOverdue || false,
            });
        }
    }

    // Recent announcements
    if (recentAnnouncementsResult.data) {
        for (const ann of recentAnnouncementsResult.data) {
            actionItems.push({
                id: ann.id,
                type: 'announcement',
                title: ann.title,
                date: ann.created_at || '',
                priority: ann.urgency || undefined,
            });
        }
    }

    // Build calendar events (fetched in batch 1)
    const calendarEvents = (calendarEventsResult.data || []).map(event => ({
        id: event.id,
        title: event.title,
        event_type: event.event_type,
        start_time: event.start_time,
        end_time: event.end_time || event.start_time,
        location: event.location,
        created_by_id: userId,
        is_recurring: false,
        created_at: event.created_at || new Date().toISOString(),
        updated_at: event.updated_at || new Date().toISOString(),
    }));

    return {
        todayEvents,
        todayScheduleError,
        stats: {
            rosterSize,
            upcomingEvents,
            activeQualifiers,
            teamScoringAverage,
            previousAverage,
        },
        sparklines,
        teamPulse,
        actionItems,
        recentRounds,
        topPlayers,
        teamScoringTrend,
        calendarEvents,
        teamName: team?.name || null,
        joinCode: team?.join_code || null,
        timezone: teamTimezone,
    };
}

const observedGetCoachDashboardData = withAdminObserved(
    'getCoachDashboardData',
    { sport: 'golf', feature: 'coach_dashboard' },
    getCoachDashboardDataImpl,
);

export async function getCoachDashboardData(
    _coachId: string,
    userId: string,
    teamId: string,
    dateRange: DashboardDateRange = 'all'
): Promise<CoachDashboardPayload> {
    return observedGetCoachDashboardData(_coachId, userId, teamId, dateRange);
}

// ============================================================================
// PLAYER DASHBOARD DATA
// ============================================================================

async function getPlayerDashboardDataImpl(
    playerId: string,
    _userId: string,
    teamId: string | null
): Promise<PlayerDashboardPayload> {
    const supabase = await createClient();

    // Auth check + timezone in parallel
    const [authResult, playerTimezoneResult] = await Promise.all([
        supabase.auth.getUser(),
        teamId
            ? supabase.from('golf_team_settings').select('timezone').eq('team_id', teamId).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);

    const { data: { user } } = authResult;
    if (!user) throw new Error('Not authenticated');

    const playerTeamTimezone = (playerTimezoneResult.data as { timezone?: string } | null)?.timezone || 'America/New_York';
    const { start: todayStart, end: todayEnd } = getTodayRange(playerTeamTimezone);
    // `today` for the overdue comparison must agree with the player's own
    // team-local day (playerTeamTimezone, resolved above) — not the server's
    // UTC day. todayStart is already `${dateStr}T00:00:00` in that timezone,
    // so its date portion IS today.
    const today = todayStart.split('T')[0] ?? '';

    // ── Parallel batch: team, rounds, handicap, stats cache, today events, tasks, announcements ──
    const [
        teamResult,
        roundsResult,
        playerDetailResult,
        statsCacheResult,
        todayEventsResult,
        pendingTasksResult,
        announcementsResult,
    ] = await Promise.all([
        teamId
            ? supabase.from('golf_teams').select('id, name, season, join_code, created_at').eq('id', teamId).single()
            : Promise.resolve({ data: null }),
        supabase
            .from('golf_rounds')
            .select('id, course_name, total_score, score_to_par, round_date, holes_played, total_putts, total_gir, total_gir_possible')
            .eq('player_id', playerId)
            .eq('status', 'completed')
            .not('total_score', 'is', null)
            .order('round_date', { ascending: false })
            .limit(50),
        supabase.from('golf_players').select('handicap').eq('id', playerId).single(),
        supabase
            .from('golf_player_stats_cache')
            .select('sg_total_per_round, sg_tee_per_round, sg_approach_per_round, sg_around_green_per_round, sg_putting_per_round, scrambling_percentage, birdies, rounds_played, scoring_average, best_round, gir_percentage, driving_accuracy_percentage, putts_per_round')
            .eq('player_id', playerId)
            .maybeSingle(),
        // Today's events
        teamId
            ? supabase
                .from('golf_events')
                .select('id, title, event_type, start_time, end_time, location')
                .eq('team_id', teamId)
                .gte('start_time', todayStart)
                .lt('start_time', todayEnd)
                .order('start_time', { ascending: true })
                .limit(10)
            : Promise.resolve({ data: [] as Array<{ id: string; title: string; event_type: string; start_time: string; end_time: string | null; location: string | null }> }),
        // Pending task ASSIGNMENTS for this player. golf_tasks.assigned_to is
        // never written — assignment lives in the M:N golf_task_assignments join
        // (the table create/complete actually write). Keying on the player's own
        // assignment status here is what makes the Hub/home pending-task list
        // reflect reality (and clear when the player completes).
        teamId
            ? supabase
                .from('golf_task_assignments')
                .select('task_id, status')
                .eq('player_id', playerId)
                .in('status', ['pending', 'in_progress'])
                .limit(50)
            : Promise.resolve({ data: [] as Array<{ task_id: string; status: string | null }> }),
        // Recent announcements
        teamId
            ? supabase
                .from('golf_announcements')
                .select('id, title, created_at, urgency')
                .eq('team_id', teamId)
                .not('published_at', 'is', null)
                .order('published_at', { ascending: false })
                .limit(5)
            : Promise.resolve({ data: [] as Array<{ id: string; title: string; created_at: string | null; urgency: string | null }> }),
    ]);

    const team = teamResult.data;
    const rounds = roundsResult.data || [];
    const playerHandicap = playerDetailResult.data?.handicap ?? null;
    const statsCache = statsCacheResult.data as {
        sg_total_per_round: number | null;
        sg_tee_per_round: number | null;
        sg_approach_per_round: number | null;
        sg_around_green_per_round: number | null;
        sg_putting_per_round: number | null;
        scrambling_percentage: number | null;
        birdies: number | null;
        rounds_played: number | null;
        scoring_average: number | null;
        best_round: number | null;
        gir_percentage: number | null;
        driving_accuracy_percentage: number | null;
        putts_per_round: number | null;
    } | null;

    // Fetch player's own RSVP for today's events
    const todayEventsRaw = todayEventsResult.data || [];
    let todayEvents: TodayEvent[] = todayEventsRaw.map(e => ({
        id: e.id,
        title: e.title,
        event_type: e.event_type,
        start_time: e.start_time,
        end_time: e.end_time,
        location: e.location,
    }));

    if (todayEvents.length > 0) {
        const eventIds = todayEvents.map(e => e.id);
        const { data: myRsvps } = await supabase
            .from('golf_event_attendance')
            .select('event_id, status')
            .in('event_id', eventIds)
            .eq('player_id', playerId);

        if (myRsvps) {
            const rsvpMap = new Map(myRsvps.map(r => [r.event_id, r.status]));
            todayEvents = todayEvents.map(e => ({
                ...e,
                my_status: rsvpMap.get(e.id) || null,
            }));
        }
    }

    // Headline stats (rounds played / scoring avg / best round) come from
    // golf_player_stats_cache — the canonical per-player stats source,
    // trigger-refreshed on round submit. Computing them from the `rounds`
    // fetch above silently capped them at the latest 50 rounds (roundsPlayed
    // stuck at 50, scoringAverage/bestRound over a truncated set). The
    // 50-round fetch now feeds ONLY recent-form widgets (sparklines, trend
    // arrows, scoring trend, recent-rounds list). A null cache row (player
    // with no completed rounds) preserves the cold-start null/zero behavior.
    const roundsPlayed = statsCache?.rounds_played ?? 0;
    const scoringAverage = statsCache?.scoring_average != null ? Number(statsCache.scoring_average) : null;
    const bestRound = statsCache?.best_round != null ? Number(statsCache.best_round) : null;

    // Recent trend is intentionally recent-form: 18-hole-normalized scores from
    // the latest rounds (matches the cache's normalized best_round convention).
    const normalizedScores = rounds
        .filter(r => r.total_score != null && r.total_score > 0)
        .map(r => {
            const holes = (r as { holes_played?: number | null }).holes_played ?? 18;
            if (holes <= 0) return null;
            return holes < 18 ? (r.total_score! / holes) * 18 : r.total_score!;
        })
        .filter((s): s is number => s !== null);
    const recentTrend = computeTrend(normalizedScores);

    // Sparklines
    const scoringSparkline = buildSparkline(rounds.map(r => ({ round_date: r.round_date, value: r.total_score })));
    const puttsSparkline = buildSparkline(rounds.map(r => ({ round_date: r.round_date, value: r.total_putts })));
    const girSparkline = buildSparkline(rounds.map(r => ({
        round_date: r.round_date,
        value: r.total_gir !== null && r.total_gir_possible && r.total_gir_possible > 0
            ? Math.round((r.total_gir! / r.total_gir_possible!) * 100)
            : null
    })));

    // Current GIR% and Putts/Rd headline values also come from the canonical
    // stats cache so the same player shows the same numbers everywhere:
    // gir_percentage is the weighted aggregate (sum made / sum opportunities)
    // and putts_per_round is hole-weighted ((sum putts ÷ sum holes) × 18),
    // both computed over ALL rounds — not the capped 50-round fetch.
    const avgGir = statsCache?.gir_percentage != null ? Number(statsCache.gir_percentage) : null;
    const avgPutts = statsCache?.putts_per_round != null ? Number(statsCache.putts_per_round) : null;

    // Per-round series (newest first) feeding the sparkline trend arrows. These
    // are intentionally per-round (not the windowed aggregate above) — the trend
    // is a recent-vs-older split of individual rounds. Putts normalized to 18.
    const girValues = rounds
        .filter(r => r.total_gir !== null && r.total_gir_possible && r.total_gir_possible > 0)
        .map(r => (r.total_gir! / r.total_gir_possible!) * 100);
    const puttsValues = rounds
        .filter((r): r is typeof r & { total_putts: number } => r.total_putts !== null)
        .map(r => {
            const hp = (r as { holes_played?: number | null }).holes_played ?? 18;
            return hp > 0 && hp < 18 ? (r.total_putts * 18) / hp : r.total_putts;
        });

    // Secondary stats — FIR% from the cache's driving_accuracy_percentage
    // (weighted aggregate: sum hit / sum recorded fairway opportunities over
    // ALL rounds), mirroring avgGir above and the coach/team/stats pages.
    const firPct = statsCache?.driving_accuracy_percentage != null
        ? Number(Number(statsCache.driving_accuracy_percentage).toFixed(1))
        : null;

    // Birdies per round — sourced from the maintained stats cache (golf_player_stats_cache
    // is trigger-refreshed on round submit). `birdies` is the season total over
    // `rounds_played`; divide for the per-round figure. Null when the cache row is
    // absent or has no rounds yet (cold-start → the card shows its empty state).
    const birdiesPerRound: number | null =
        statsCache?.birdies != null && (statsCache.rounds_played ?? 0) > 0
            ? Number((Number(statsCache.birdies) / statsCache.rounds_played!).toFixed(2))
            : null;

    // Scoring trend (per round, newest last)
    const scoringTrend: ScoringTrend[] = [...rounds].reverse()
        .filter(r => r.total_score !== null)
        .map(r => ({
            label: new Date(r.round_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: r.total_score!
        }));

    // Action items
    const actionItems: ActionItem[] = [];
    // Resolve the player's pending task ASSIGNMENTS into task details. The
    // assignment rows (from golf_task_assignments) carry the per-player status;
    // golf_tasks supplies title/due_date/priority. Status comes from the
    // assignment (the player's own progress), not golf_tasks.status.
    const pendingAssignments = (pendingTasksResult.data || []) as Array<{ task_id: string; status: string | null }>;
    if (pendingAssignments.length > 0) {
        const statusByTaskId = new Map(pendingAssignments.map(a => [a.task_id, a.status]));
        const pendingTaskIds = [...statusByTaskId.keys()];
        const { data: taskDetails } = await supabase
            .from('golf_tasks')
            .select('id, title, due_date, priority')
            .in('id', pendingTaskIds)
            .order('due_date', { ascending: true, nullsFirst: false })
            .limit(15);

        for (const task of taskDetails || []) {
            const isOverdue = task.due_date && task.due_date < today;
            actionItems.push({
                id: task.id,
                type: isOverdue ? 'deadline' : 'task',
                title: task.title,
                date: task.due_date || '',
                priority: task.priority || undefined,
                status: statusByTaskId.get(task.id) || undefined,
                overdue: isOverdue || false,
            });
        }
    }
    if (announcementsResult.data) {
        for (const ann of announcementsResult.data) {
            actionItems.push({
                id: ann.id,
                type: 'announcement',
                title: ann.title,
                date: ann.created_at || '',
                priority: ann.urgency || undefined,
            });
        }
    }

    // Strokes gained — pull per-round averages from stats cache
    const strokesGained: StrokesGainedSnapshot = {
        sg_total: statsCache?.sg_total_per_round != null ? Number(Number(statsCache.sg_total_per_round).toFixed(2)) : null,
        sg_off_tee: statsCache?.sg_tee_per_round != null ? Number(Number(statsCache.sg_tee_per_round).toFixed(2)) : null,
        sg_approach: statsCache?.sg_approach_per_round != null ? Number(Number(statsCache.sg_approach_per_round).toFixed(2)) : null,
        sg_around_green: statsCache?.sg_around_green_per_round != null ? Number(Number(statsCache.sg_around_green_per_round).toFixed(2)) : null,
        sg_putting: statsCache?.sg_putting_per_round != null ? Number(Number(statsCache.sg_putting_per_round).toFixed(2)) : null,
    };

    return {
        todayEvents,
        stats: {
            roundsPlayed,
            scoringAverage: scoringAverage !== null ? Number(scoringAverage.toFixed(1)) : null,
            bestRound,
            handicap: playerHandicap,
            recentTrend: rounds.length >= 6 ? recentTrend : undefined,
        },
        sparklines: {
            scoringAvg: {
                label: 'Scoring Avg',
                value: scoringAverage !== null ? Number(scoringAverage.toFixed(1)) : null,
                sparkline: scoringSparkline,
                trend: rounds.length >= 6 ? recentTrend : undefined,
            },
            girPct: {
                label: 'GIR%',
                value: avgGir !== null ? Number(avgGir.toFixed(1)) : null,
                sparkline: girSparkline,
                suffix: '%',
                trend: computeTrendHigherIsBetter(girValues),
            },
            puttsPerRound: {
                label: 'Putts/Rd',
                value: avgPutts !== null ? Number(avgPutts.toFixed(1)) : null,
                sparkline: puttsSparkline,
                trend: computeTrend(puttsValues),
            },
            handicap: {
                label: 'Handicap',
                value: playerHandicap !== null ? Number(Number(playerHandicap).toFixed(1)) : null,
                sparkline: [],
            },
        },
        secondaryStats: {
            firPct,
            scramblingPct: statsCache?.scrambling_percentage != null ? Number(Number(statsCache.scrambling_percentage).toFixed(1)) : null,
            birdiesPerRound,
            bestRound,
        },
        strokesGained,
        actionItems,
        recentRounds: rounds.slice(0, 5).map(r => ({
            id: r.id,
            course_name: r.course_name || 'Unknown Course',
            total_score: r.total_score ?? 0,
            total_to_par: r.score_to_par ?? 0,
            round_date: r.round_date,
        })),
        scoringTrend,
        teamName: team?.name || null,
        timezone: playerTeamTimezone,
    };
}

const observedGetPlayerDashboardData = withAdminObserved(
    'getPlayerDashboardData',
    { sport: 'golf', feature: 'player_hub' },
    getPlayerDashboardDataImpl,
);

export async function getPlayerDashboardData(
    playerId: string,
    _userId: string,
    teamId: string | null
): Promise<PlayerDashboardPayload> {
    return observedGetPlayerDashboardData(playerId, _userId, teamId);
}

// ============================================================================
// DIRECT EXPORTS — for server component pages
// ============================================================================
// Note: unstable_cache was removed because it wraps functions that call
// cookies() via createClient(), which is not supported in Next.js 16.
// The page is force-dynamic anyway, so caching provides minimal benefit.

async function getCachedCoachDashboardDataImpl(...args: Parameters<typeof getCoachDashboardData>) {
  return getCoachDashboardDataImpl(...args);
}
const observedGetCachedCoachDashboardData = withAdminObserved(
  'getCachedCoachDashboardData',
  { sport: 'golf', feature: 'coach_dashboard' },
  getCachedCoachDashboardDataImpl,
);
export async function getCachedCoachDashboardData(...args: Parameters<typeof getCoachDashboardData>) {
  return observedGetCachedCoachDashboardData(...args);
}

async function getCachedPlayerDashboardDataImpl(...args: Parameters<typeof getPlayerDashboardData>) {
  return getPlayerDashboardDataImpl(...args);
}
const observedGetCachedPlayerDashboardData = withAdminObserved(
  'getCachedPlayerDashboardData',
  { sport: 'golf', feature: 'player_hub' },
  getCachedPlayerDashboardDataImpl,
);
export async function getCachedPlayerDashboardData(...args: Parameters<typeof getPlayerDashboardData>) {
  return observedGetCachedPlayerDashboardData(...args);
}
