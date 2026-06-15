'use client';

import { useState, useEffect, memo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { m, useReducedMotion } from 'framer-motion';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    IconUsers,
    IconCalendar,
    IconFlag,
    IconChartBar,
    IconPlus,
    IconCopy,
    IconCheck,
    IconClock,
    IconChevronDown,
    IconGolf,
    IconTarget,
} from '@/components/icons';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import {
    SectionHeader,
    RecentRoundCard,
    TopPerformerRow,
    TodayTimeline,
    StatCardSparkline,
    ActionItemsCard,
    TeamPulseCard,
    DashboardErrorBoundary,
    containerVariants,
    itemVariants
} from '@/components/golf/dashboard';
import { Card } from '@/components/ui/card';
import { JoinRequestAlert } from '@/components/golf/roster/JoinRequestAlert';
import { ShimmerCard } from '@/components/ui/shimmer';
import type { CoachDashboardPayload, TodayEvent, ActionItem, TeamPulseData, DashboardDateRange } from '@/app/golf/actions/dashboard-data';
import type { CalendarEvent } from '@/lib/types/calendar';
import { Button } from '@/components/ui/button';

const TrendChart = dynamic(() => import('./TrendChart').then(mod => ({ default: mod.TrendChart })), {
    loading: () => <ShimmerCard className="h-[200px] rounded-2xl" />,
    ssr: false
});

// ============================================================================
// STABLE REFERENCES (prevents memoization breaks in child components)
// ============================================================================

const EMPTY_SPARKLINE: number[] = [];
const EMPTY_EVENTS: TodayEvent[] = [];
const EMPTY_ACTION_ITEMS: ActionItem[] = [];
const EMPTY_TEAM_PULSE: TeamPulseData = {
    improving: 0,
    stable: 0,
    declining: 0,
    roundsThisWeek: 0,
};

// ============================================================================
// TYPES
// ============================================================================

interface DashboardStats {
    rosterSize: number;
    upcomingEvents: number;
    activeQualifiers: number;
    teamScoringAverage: number | null;
    previousAverage?: number | null;
}

export interface CoachDashboardData {
    coach: import('@/lib/types/golf').GolfCoach;
    team: import('@/lib/types/golf').GolfTeam | null;
    stats: DashboardStats;
    recentRounds: Array<{
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
    }>;
    topPlayers: Array<{
        id: string;
        name: string;
        avg_score: number;
        rounds: number;
    }>;
    calendarEvents: CalendarEvent[];
    teamScoringTrend?: Array<{
        label: string;
        value: number;
    }>;
}

// ============================================================================
// LOCAL HELPERS
// ============================================================================

const InviteCodeCard = memo(function InviteCodeCard({ inviteCode }: { inviteCode?: string }) {
  const prefersReducedMotion = useReducedMotion();
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!inviteCode) return;
        try {
            await navigator.clipboard.writeText(inviteCode);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = inviteCode;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!inviteCode) return null;

    return (
        <m.div
            className="relative overflow-hidden rounded-3xl surface-matte"
            initial={prefersReducedMotion ? false : ({ opacity: 0, y: 14 })}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] })}
        >
            <div
                aria-hidden
                className="pointer-events-none absolute -right-12 -top-16 w-48 h-48 rounded-full opacity-70"
                style={{ background: 'radial-gradient(closest-side, rgba(22,163,74,0.10), transparent 70%)' }}
            />
            <div className="relative z-10 flex items-center justify-between gap-4 px-5 py-4 md:px-7 md:py-5">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-2xl bg-primary-50/70 flex items-center justify-center flex-shrink-0">
                        <IconUsers size={15} className="text-primary-700" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-body-sm md:text-body-sm font-medium text-warm-700 tracking-[-0.005em] truncate">
                            Share invite code with players
                        </p>
                        <p className="hidden sm:block text-caption text-warm-500 mt-0.5">
                            Tap to copy. They join from the welcome screen.
                        </p>
                    </div>
                </div>
                <m.button
                    onClick={handleCopy}
                    className={cn(
                        'inline-flex items-center gap-2 px-4 py-2 rounded-full',
                        'bg-cream-50/85 ring-1 ring-warm-200/60 hover:ring-primary-200/80 hover:bg-cream-50',
                        'text-body-sm font-mono tracking-[0.18em] text-primary-700',
                        'transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]'
                    )}
                    whileTap={{ scale: 0.97 }}
                >
                    {copied ? (
                        <>
                            <IconCheck size={13} className="text-primary-600" />
                            <span className="text-primary-600">Copied</span>
                        </>
                    ) : (
                        <>
                            <span>{inviteCode}</span>
                            <IconCopy size={11} className="text-primary-400" />
                        </>
                    )}
                </m.button>
            </div>
        </m.div>
    );
});

// ============================================================================
// DATE RANGE SELECTOR
// ============================================================================

type DateRange = '7d' | '30d' | '90d' | 'season' | 'all';

const DATE_RANGE_OPTIONS: { value: DateRange; label: string; shortLabel: string }[] = [
    { value: '7d', label: 'Last 7 Days', shortLabel: '7D' },
    { value: '30d', label: 'Last 30 Days', shortLabel: '30D' },
    { value: '90d', label: 'Last 90 Days', shortLabel: '90D' },
    { value: 'season', label: 'This Season', shortLabel: 'Season' },
    { value: 'all', label: 'All Time', shortLabel: 'All' },
];

const DateRangeSelector = memo(function DateRangeSelector({
    value,
    onChange,
}: {
    value: DateRange;
    onChange: (range: DateRange) => void;
}) {
    const [open, setOpen] = useState(false);
    const selected = DATE_RANGE_OPTIONS.find(o => o.value === value);

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="pill-soft" aria-label="Select date range">
                    <IconClock size={12} className="text-warm-400" />
                    <span className="hidden sm:inline">{selected?.label}</span>
                    <span className="sm:hidden">{selected?.shortLabel}</span>
                    <IconChevronDown size={12} className={cn('text-warm-400 transition-transform duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]', open && 'rotate-180')} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {DATE_RANGE_OPTIONS.map((option) => (
                    <DropdownMenuItem
                        key={option.value}
                        onSelect={() => onChange(option.value)}
                        selected={option.value === value}
                    >
                        {option.label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface CoachDashboardProps {
    data: CoachDashboardData;
    enhancedData?: CoachDashboardPayload | null;
    dateRange?: DashboardDateRange;
}

export function CoachDashboard({ data, enhancedData, dateRange: initialRange = 'all' }: CoachDashboardProps) {
  const prefersReducedMotion = useReducedMotion();
    const { coach, team, stats, recentRounds, topPlayers, teamScoringTrend } = data;
    const router = useRouter();
    const [dateRange, setDateRange] = useState<DateRange>(initialRange);

    const handleDateRangeChange = useCallback((range: DateRange) => {
        setDateRange(range);
        // Navigate with search param to trigger server re-fetch
        const url = range === 'all' ? '/golf/dashboard' : `/golf/dashboard?range=${range}`;
        router.push(url);
    }, [router]);

    // Defer time-dependent values to client to avoid hydration mismatch
    // (server timezone differs from browser timezone)
    const [greeting, setGreeting] = useState('');
    const [todayStr, setTodayStr] = useState('');
    useEffect(() => {
        const now = new Date();
        const hour = now.getHours();
        setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
        setTodayStr(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
    }, []);

    const firstName = coach.full_name?.split(' ')[0] || 'Coach';

    // Rounds are now filtered server-side based on dateRange URL param
    const filteredRounds = recentRounds;

    const hasTrendData = teamScoringTrend && teamScoringTrend.length >= 2;

    return (
        <div className="min-h-full bg-transparent relative overflow-x-clip">
            <div className="ambient-aurora" aria-hidden />
            {/* HEADER */}
            <LargeTitleHeader
                title={`${greeting}, ${firstName}`}
                subtitle={
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse flex-shrink-0" aria-hidden="true" />
                        <span className="text-warm-500 text-sm font-medium truncate">
                            {team?.name || 'Golf Team'}
                        </span>
                        {todayStr && (
                            <>
                                <span className="hidden md:inline text-warm-300" aria-hidden="true">&middot;</span>
                                <span className="hidden md:inline text-warm-400 text-xs truncate" suppressHydrationWarning>
                                    {todayStr}
                                </span>
                            </>
                        )}
                    </div>
                }
            >
                <DateRangeSelector value={dateRange} onChange={handleDateRangeChange} />
                <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cream-100/70 ring-1 ring-warm-200/45 text-eyebrow text-warm-400">
                    <kbd className="px-1 py-0.5 rounded text-eyebrow font-medium text-warm-500 tabular-nums">&#8984;</kbd>
                    <kbd className="px-1 py-0.5 rounded text-eyebrow font-medium text-warm-500">K</kbd>
                </div>
            </LargeTitleHeader>

            {/* MAIN CONTENT */}
            <m.div
                className="max-w-[1280px] mx-auto px-4 md:px-6 py-4 md:py-6 min-w-0"
                variants={containerVariants}
                initial={prefersReducedMotion ? false : "hidden"}
                animate="visible"
            >
                <JoinRequestAlert />

                {team?.join_code && team.join_code !== 'DEMO01' && stats.rosterSize < 20 && (
                    <m.div className="mb-4" variants={itemVariants}>
                        <InviteCodeCard inviteCode={team.join_code} />
                    </m.div>
                )}
                {team?.join_code && team.join_code !== 'DEMO01' && stats.rosterSize >= 20 && (
                    <div className="mb-6 px-5 py-3.5 rounded-2xl bg-amber-50/70 ring-1 ring-amber-200/55 text-body-sm text-amber-700">
                        Invite code is hidden because your roster has reached the 20-player limit.
                    </div>
                )}

                {/* Editorial hero plinth — magazine-cover framing for the
                    coach's daily landing page. Sits beneath the sticky
                    LargeTitleHeader so the editorial copy gets a sculpted-
                    matte foundation that anchors the page's first read. */}
                <Reveal>
                    <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
                        <PageHeader
                            eyebrow="Coach Dashboard"
                            eyebrowAccent="primary"
                            title="Your team today."
                            subtitle={
                                stats.rosterSize === 0
                                    ? 'Invite players to start tracking rounds, qualifiers, and team performance.'
                                    : `${stats.rosterSize} ${stats.rosterSize === 1 ? 'player' : 'players'} on the roster${
                                          (enhancedData?.actionItems?.length ?? 0) > 0
                                              ? ` · ${enhancedData?.actionItems?.length} ${
                                                    enhancedData?.actionItems?.length === 1 ? 'action item' : 'action items'
                                                } waiting`
                                              : ''
                                      }${stats.upcomingEvents > 0 ? ` · ${stats.upcomingEvents} upcoming ${stats.upcomingEvents === 1 ? 'event' : 'events'}` : ''}.`
                            }
                        />
                    </div>
                </Reveal>

                {/* ROW 1: Horizontal Day Timeline (full width) */}
                <m.div className="mb-7 md:mb-10" variants={itemVariants}>
                    <DashboardErrorBoundary name="Schedule">
                        <TodayTimeline
                            events={enhancedData?.todayEvents ?? EMPTY_EVENTS}
                            // eslint-disable-next-line jsx-a11y/aria-role -- role is a custom component prop, not an ARIA role
                            role="coach"
                            timezone={enhancedData?.timezone}
                        />
                    </DashboardErrorBoundary>
                </m.div>

                {/* ROW 2: Quick Stats */}
                <DashboardErrorBoundary name="Stats">
                <m.div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-7 md:mb-10" variants={itemVariants}>
                    <StatCardSparkline
                        label="Scoring Avg"
                        value={enhancedData?.sparklines.scoringAvg.value ?? (stats.teamScoringAverage ? Number(stats.teamScoringAverage.toFixed(1)) : null)}
                        sparkline={enhancedData?.sparklines.scoringAvg.sparkline ?? EMPTY_SPARKLINE}
                        icon={<IconChartBar size={18} />}
                        iconColor="text-primary-600"
                        iconBg="bg-primary-50"
                        href="/golf/dashboard/stats/team"
                        trend={enhancedData?.sparklines.scoringAvg.trend}
                        accent
                    />
                    <StatCardSparkline
                        label="GIR%"
                        value={enhancedData?.sparklines.girPct.value ?? null}
                        sparkline={enhancedData?.sparklines.girPct.sparkline ?? EMPTY_SPARKLINE}
                        icon={<IconTarget size={18} />}
                        iconColor="text-warm-600"
                        iconBg="bg-warm-100"
                        href="/golf/dashboard/stats/team"
                        suffix="%"
                        trend={enhancedData?.sparklines.girPct.trend}
                    />
                    <StatCardSparkline
                        label="Putts/Rd"
                        value={enhancedData?.sparklines.puttsPerRound.value ?? null}
                        sparkline={enhancedData?.sparklines.puttsPerRound.sparkline ?? EMPTY_SPARKLINE}
                        icon={<IconGolf size={18} />}
                        iconColor="text-amber-600"
                        iconBg="bg-amber-50"
                        href="/golf/dashboard/stats/team"
                        trend={enhancedData?.sparklines.puttsPerRound.trend}
                    />
                    <StatCardSparkline
                        label="Roster"
                        value={stats.rosterSize}
                        sparkline={EMPTY_SPARKLINE}
                        icon={<IconUsers size={18} />}
                        iconColor="text-violet-600"
                        iconBg="bg-violet-50"
                        href="/golf/dashboard/roster"
                    />
                </m.div>
                </DashboardErrorBoundary>

                {/* ROW 3: Recent Rounds + Notifications/Actions side by side */}
                <DashboardErrorBoundary name="Recent Rounds">
                <m.div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6 mb-7 md:mb-10" variants={itemVariants}>
                    <div className="lg:col-span-2 min-w-0">
                        <SectionHeader title="Recent Rounds" action={{ label: 'View All', href: '/golf/dashboard/rounds' }} />
                        <Card variant="raised" noPadding>
                            {filteredRounds.length === 0 ? (
                                <EmptyState
                                    type="rounds"
                                    variant="compact"
                                    description={dateRange !== 'all' ? 'No rounds in the selected time period.' : 'Players can submit rounds from their dashboard'}
                                    action={null}
                                />
                            ) : (
                                <div className="divide-y divide-warm-200/30">
                                    {filteredRounds.slice(0, 6).map((round) => (
                                        <RecentRoundCard
                                            key={round.id}
                                            id={round.id}
                                            playerId={round.player_id}
                                            playerName={round.player_name}
                                            playerAvatarUrl={round.player_avatar_url}
                                            courseName={round.course_name}
                                            score={round.total_score}
                                            toPar={round.total_to_par}
                                            date={round.round_date}
                                            roundType={round.round_type}
                                            totalPutts={round.total_putts}
                                            totalFairwaysHit={round.total_fairways_hit}
                                            totalFairways={round.total_fairways}
                                            totalGir={round.total_gir}
                                            totalGirPossible={round.total_gir_possible}
                                        />
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>
                    <div className="flex flex-col gap-5 md:gap-6 min-w-0">
                        {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a custom component prop, not an ARIA role */}
                        <ActionItemsCard items={enhancedData?.actionItems ?? EMPTY_ACTION_ITEMS} role="coach" />
                    </div>
                </m.div>
                </DashboardErrorBoundary>

                {/* ROW 4: Trend + Team Pulse + Top Performers */}
                <DashboardErrorBoundary name="Performance Trend">
                <m.div className="grid grid-cols-1 lg:grid-cols-5 gap-5 md:gap-6 mb-7 md:mb-10" variants={itemVariants}>
                    <div className="lg:col-span-3 min-w-0">
                        <SectionHeader title="Performance Trend" />
                        {hasTrendData ? (
                            <Card variant="raised" glow>
                                <TrendChart data={teamScoringTrend} valueLabel="Team Avg" reverse={true} />
                            </Card>
                        ) : (
                            <Card variant="raised">
                                <div className="flex flex-col items-center justify-center py-10 md:py-12 text-center">
                                    <div className="w-14 h-14 rounded-2xl bg-warm-100/65 flex items-center justify-center mb-5">
                                        <IconChartBar size={22} className="text-warm-400" />
                                    </div>
                                    <h3 className="text-body-lg font-medium tracking-[-0.012em] text-warm-900 mb-2">No trend data yet</h3>
                                    <p className="text-body-sm text-warm-500 max-w-sm mb-7 leading-relaxed">
                                        Trends appear once your players submit rounds across multiple months.
                                    </p>
                                    <Link
                                        href="/golf/dashboard/roster"
                                        className={cn(
                                            'group inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-body-sm font-medium',
                                            'bg-primary-600/95 text-white',
                                            'shadow-[0_4px_14px_rgba(22,163,74,0.18)]',
                                            'transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:bg-primary-700 hover:shadow-[0_8px_20px_rgba(22,163,74,0.24)]'
                                        )}
                                    >
                                        <IconPlus size={14} className="transition-transform duration-500 group-hover:rotate-90" />
                                        Invite Players
                                    </Link>
                                </div>
                            </Card>
                        )}
                    </div>
                    <div className="lg:col-span-2 flex flex-col gap-5 md:gap-6 min-w-0">
                        <TeamPulseCard data={enhancedData?.teamPulse ?? EMPTY_TEAM_PULSE} />
                        <div className="min-w-0">
                            <SectionHeader
                                title="Top Performers"
                                action={{ label: 'Full Rankings', href: '/golf/dashboard/stats/team' }}
                            />
                            <Card variant="raised" noPadding>
                                {topPlayers.length > 0 ? (
                                    <div className="divide-y divide-warm-200/30">
                                        {topPlayers.slice(0, 5).map((player, i) => (
                                            <Link key={player.id} href={`/golf/dashboard/players/${player.id}`} prefetch={false}>
                                                <TopPerformerRow rank={i + 1} name={player.name} avgScore={player.avg_score} rounds={player.rounds} />
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState type="stats" variant="compact" />
                                )}
                            </Card>
                        </div>
                    </div>
                </m.div>
                </DashboardErrorBoundary>

                {/* QUICK ACTIONS */}
                <m.div variants={itemVariants} className="mt-2">
                    <div className="flex flex-wrap items-center gap-3">
                        <Link
                            href="/golf/dashboard/roster"
                            className={cn(
                                'group inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-body-sm font-medium tracking-[-0.005em]',
                                'bg-primary-600/95 text-white',
                                'shadow-[0_4px_14px_rgba(22,163,74,0.18)]',
                                'transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:bg-primary-700 hover:shadow-[0_8px_20px_rgba(22,163,74,0.24)]'
                            )}
                        >
                            <IconPlus size={14} className="transition-transform duration-500 group-hover:rotate-90" />
                            Add Player
                        </Link>
                        <Link href="/golf/dashboard/calendar" className="pill-soft">
                            <IconCalendar size={14} />
                            Schedule Event
                        </Link>
                        <Link href="/golf/dashboard/qualifiers" className="pill-soft">
                            <IconFlag size={14} />
                            Create Qualifier
                        </Link>
                    </div>
                </m.div>
            </m.div>
        </div>
    );
}
