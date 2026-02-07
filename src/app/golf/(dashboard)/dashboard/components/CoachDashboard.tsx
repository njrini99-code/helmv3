'use client';

import { useMemo, useState, memo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
    IconUsers,
    IconCalendar,
    IconFlag,
    IconChartBar,
    IconPlus,
    IconMessage,
    IconBook,
    IconCopy,
    IconCheck,
    IconBell,
    IconMenu,
    IconClock,
    IconChevronDown,
    IconClipboardList,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/contexts/sidebar-context';
import { ShineEffect } from '@/components/ui/shine-effect';
import { EmptyState } from '@/components/ui/empty-state';
import { CalendarWidget } from '@/components/dashboard/calendar-widget';
import { RecentActivityFeed } from '@/components/golf/RecentActivityFeed';

// OPTIMIZATION: Code split heavy components - only load when needed
const TrendChart = dynamic(() => import('./TrendChart').then(mod => ({ default: mod.TrendChart })), {
    loading: () => <div className="h-[200px] bg-white/45 backdrop-blur-[20px] rounded-2xl border border-white/30 animate-pulse" />,
    ssr: false // Chart doesn't need SSR
});

const CoachAlertCenter = dynamic(() => import('@/components/golf/coachhelm/alerts').then(mod => ({ default: mod.CoachAlertCenter })), {
    loading: () => <div className="h-[200px] bg-white/45 backdrop-blur-[20px] rounded-2xl border border-white/30 animate-pulse" />,
    ssr: false // PERF: Parent layout is fully client-rendered, SSR adds no value here
});
import {
    PremiumGlassCard,
    PremiumStatCard,
    QuickActionCard,
    SectionHeader,
    RecentRoundCard,
    TopPerformerRow,
    containerVariants,
    itemVariants
} from '@/components/golf/dashboard';
import { JoinRequestAlert } from '@/components/golf/roster/JoinRequestAlert';
import type { GolfCoach, GolfTeam } from '@/lib/types/golf';
import type { CalendarEvent } from '@/lib/types/calendar';

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
    coach: GolfCoach;
    team: GolfTeam | null;
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
// LOCAL HELPER COMPONENTS (Shared components imported from @/components/golf/dashboard)
// ============================================================================

// OPTIMIZATION: Memoize component to prevent unnecessary re-renders
const InviteCodeCard = memo(function InviteCodeCard({ inviteCode }: { inviteCode?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!inviteCode) return;
        navigator.clipboard.writeText(inviteCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!inviteCode) return null;

    return (
        <motion.div
            className={cn(
                'relative overflow-hidden rounded-2xl p-4 md:p-6 mb-4 md:mb-6',
                'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
                'border border-white/10',
                'shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]'
            )}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
        >
            {/* Ambient glow - hidden on mobile */}
            <div className="hidden md:block absolute right-0 top-0 w-40 h-40 bg-primary-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="hidden md:block absolute left-0 bottom-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div className="min-w-0">
                    <h3 className="text-white/90 text-xs sm:text-sm font-semibold mb-0.5 sm:mb-1 flex items-center gap-2">
                        <IconUsers size={14} className="text-primary-400 sm:hidden" />
                        <IconUsers size={16} className="text-primary-400 hidden sm:block" />
                        Team Invite Code
                    </h3>
                    <p className="text-white/50 text-xs sm:text-xs">Share this code with players to join</p>
                </div>
                <motion.button
                    onClick={handleCopy}
                    className={cn(
                        'flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg',
                        'bg-white/10 hover:bg-white/15 border border-white/10',
                        'text-xs sm:text-sm font-mono tracking-widest text-white',
                        'transition-all duration-200 active:scale-95'
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    {copied ? (
                        <>
                            <IconCheck size={14} className="text-primary-400" />
                            <span className="text-primary-400">Copied!</span>
                        </>
                    ) : (
                        <>
                            <span>{inviteCode}</span>
                            <IconCopy size={12} className="text-white/50 sm:hidden" />
                            <IconCopy size={14} className="text-white/50 hidden sm:block" />
                        </>
                    )}
                </motion.button>
            </div>
        </motion.div>
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
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
                    'bg-white/60 backdrop-blur-sm border border-white/30',
                    'text-slate-600 hover:text-slate-900 hover:bg-white/80',
                    'transition-all duration-150 active:scale-95',
                    'shadow-sm'
                )}
                aria-label="Select date range"
            >
                <IconClock size={14} className="text-slate-400" />
                <span className="hidden sm:inline">{selected?.label}</span>
                <span className="sm:hidden">{selected?.shortLabel}</span>
                <IconChevronDown size={14} className={cn('text-slate-400 transition-transform', open && 'rotate-180')} />
            </button>

            <AnimatePresence>
                {open && (
                    <>
                        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: -4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className={cn(
                                'absolute right-0 top-full mt-1 z-40',
                                'bg-white/90 backdrop-blur-xl rounded-xl',
                                'border border-white/30 shadow-lg',
                                'py-1 min-w-[160px]'
                            )}
                        >
                            {DATE_RANGE_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => {
                                        onChange(option.value);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        'w-full text-left px-3 py-2 text-sm transition-colors',
                                        option.value === value
                                            ? 'text-primary-700 bg-primary-50 font-medium'
                                            : 'text-slate-600 hover:bg-slate-50'
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CoachDashboard({ data }: { data: CoachDashboardData }) {
    const { coach, team, stats, recentRounds, topPlayers, calendarEvents, teamScoringTrend } = data;
    const { toggleMobile } = useSidebar();
    const [dateRange, setDateRange] = useState<DateRange>('all');

    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    }, []);

    const firstName = coach.full_name?.split(' ')[0] || 'Coach';

    // Filter rounds based on selected date range
    const filteredRounds = useMemo(() => {
        if (dateRange === 'all') return recentRounds;
        const now = new Date();
        let cutoff: Date;
        switch (dateRange) {
            case '7d': cutoff = new Date(now.getTime() - 7 * 86400000); break;
            case '30d': cutoff = new Date(now.getTime() - 30 * 86400000); break;
            case '90d': cutoff = new Date(now.getTime() - 90 * 86400000); break;
            case 'season': {
                // Season starts Aug 1 of current academic year
                const month = now.getMonth();
                const year = month >= 7 ? now.getFullYear() : now.getFullYear() - 1;
                cutoff = new Date(year, 7, 1);
                break;
            }
            default: cutoff = new Date(0);
        }
        return recentRounds.filter(r => new Date(r.round_date) >= cutoff);
    }, [recentRounds, dateRange]);

    const hasTrendData = teamScoringTrend && teamScoringTrend.length >= 2;

    // Today's date for context
    const todayStr = useMemo(() => {
        return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }, []);

    return (
        <div className="min-h-full bg-transparent">
            {/* Header Section - Enhanced Premium Glass Panel */}
            <div
                className={cn(
                    'sticky top-0 z-20',
                    'bg-white/60 backdrop-blur-[24px]',
                    'border-b border-white/30',
                    'shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                )}
            >
                <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            {/* Mobile hamburger menu */}
                            <button
                                onClick={toggleMobile}
                                className={cn(
                                    'lg:hidden p-2 -ml-2 rounded-xl',
                                    'text-slate-500 hover:text-slate-700 hover:bg-slate-100/80',
                                    'transition-colors duration-150 active:scale-95',
                                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
                                )}
                                aria-label="Open navigation menu"
                            >
                                <IconMenu size={22} />
                            </button>

                            <div className="min-w-0">
                                <h1 className="text-lg md:text-2xl font-bold tracking-tight text-slate-900 truncate">
                                    {greeting}, {firstName}
                                </h1>
                                <p className="text-slate-500 mt-0.5 flex items-center gap-1.5 md:gap-2 text-xs md:text-sm">
                                    <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-500 animate-pulse flex-shrink-0" />
                                    <span className="truncate">{team?.name || 'Golf Team'}</span>
                                    <span className="hidden md:inline text-slate-400">|</span>
                                    <span className="hidden md:inline text-slate-400 truncate">{todayStr}</span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 md:gap-3">
                            <DateRangeSelector value={dateRange} onChange={setDateRange} />
                            <div className={cn(
                                'hidden md:flex items-center gap-2 px-3 py-2 rounded-lg',
                                'bg-slate-100/60 backdrop-blur-sm',
                                'border border-slate-200/40',
                                'text-sm text-slate-500'
                            )}>
                                <kbd className="px-1.5 py-0.5 bg-white rounded-md text-xs font-medium shadow-sm border border-slate-200">&#8984;</kbd>
                                <kbd className="px-1.5 py-0.5 bg-white rounded-md text-xs font-medium shadow-sm border border-slate-200">K</kbd>
                                <span className="text-slate-400 ml-1">Quick actions</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <motion.div
                className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {/* Pending Join Requests Alert */}
                <JoinRequestAlert />

                {/* Invite Code */}
                {team?.join_code && stats.rosterSize < 20 && (
                    <InviteCodeCard inviteCode={team.join_code} />
                )}

                {/* Stats Grid - tighter gap on mobile */}
                <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4 mb-5 md:mb-8" variants={itemVariants}>
                    <PremiumStatCard
                        icon={<IconUsers size={20} />}
                        iconColor="text-primary-600"
                        iconBg="bg-primary-50"
                        label="Roster Size"
                        value={stats.rosterSize}
                        subValue="Active players"
                        href="/golf/dashboard/roster"
                        accent
                    />
                    <PremiumStatCard
                        icon={<IconCalendar size={20} />}
                        iconColor="text-slate-600"
                        iconBg="bg-slate-100"
                        label="Upcoming Events"
                        value={stats.upcomingEvents}
                        subValue="This month"
                        href="/golf/dashboard/calendar"
                    />
                    <PremiumStatCard
                        icon={<IconFlag size={20} />}
                        iconColor="text-amber-600"
                        iconBg="bg-amber-50"
                        label="Active Qualifiers"
                        value={stats.activeQualifiers}
                        href="/golf/dashboard/qualifiers"
                    />
                    <PremiumStatCard
                        icon={<IconChartBar size={20} />}
                        iconColor="text-violet-600"
                        iconBg="bg-violet-50"
                        label="Team Average"
                        value={stats.teamScoringAverage ? stats.teamScoringAverage.toFixed(1) : '--'}
                        trend={stats.previousAverage && stats.teamScoringAverage
                            ? { value: stats.previousAverage - stats.teamScoringAverage, positive: stats.teamScoringAverage < stats.previousAverage }
                            : null}
                        href="/golf/dashboard/stats/team"
                    />
                </motion.div>

                {/* Quick Alerts + Recent Activity - Full Width Hero Section */}
                {team && coach && (
                    <motion.div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-5 md:mb-8" variants={itemVariants}>
                        {/* Quick Alerts */}
                        <div>
                            <SectionHeader
                                title="Quick Alerts"
                                icon={<IconBell size={14} />}
                                action={{ label: 'View All', href: '/golf/dashboard/alerts' }}
                            />
                            <CoachAlertCenter
                                coachId={coach.id}
                                teamId={team.id}
                                maxVisible={4}
                                compact
                            />
                        </div>

                        {/* Recent Activity */}
                        <div>
                            <SectionHeader title="Recent Activity" />
                            <PremiumGlassCard>
                                <ShineEffect />
                                <RecentActivityFeed teamId={team.id} limit={6} />
                            </PremiumGlassCard>
                        </div>
                    </motion.div>
                )}

                {/* Two Column Layout */}
                <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
                    {/* Left Column - Quick Actions, Top Performers, Calendar */}
                    <motion.div className="space-y-4 md:space-y-6" variants={itemVariants}>
                        {/* Quick Actions */}
                        <div>
                            <SectionHeader title="Quick Actions" />
                            <div className="space-y-2">
                                <QuickActionCard
                                    icon={<IconPlus size={18} className="text-white" />}
                                    label="Add Player"
                                    description="Invite to roster"
                                    href="/golf/dashboard/roster"
                                    variant="primary"
                                />
                                <QuickActionCard
                                    icon={<IconFlag size={18} className="text-slate-600" />}
                                    label="Create Qualifier"
                                    description="Set up team qualifier"
                                    href="/golf/dashboard/qualifiers"
                                />
                                <QuickActionCard
                                    icon={<IconCalendar size={18} className="text-slate-600" />}
                                    label="Schedule Event"
                                    description="Practice or tournament"
                                    href="/golf/dashboard/calendar"
                                />
                                <QuickActionCard
                                    icon={<IconClipboardList size={18} className="text-slate-600" />}
                                    label="Manage Tasks"
                                    description="Assign to players"
                                    href="/golf/dashboard/tasks"
                                />
                                <QuickActionCard
                                    icon={<IconBook size={18} className="text-slate-600" />}
                                    label="Post Announcement"
                                    description="Team updates"
                                    href="/golf/dashboard/announcements"
                                />
                                <QuickActionCard
                                    icon={<IconMessage size={18} className="text-slate-600" />}
                                    label="Messages"
                                    description="Team communication"
                                    href="/golf/dashboard/messages"
                                />
                            </div>
                        </div>

                        {/* Top Performers */}
                        <div>
                            <SectionHeader
                                title="Top Performers"
                                action={{ label: 'View All', href: '/golf/dashboard/stats/team' }}
                            />
                            <PremiumGlassCard noPadding>
                                <ShineEffect />
                                {topPlayers.length > 0 ? (
                                    <div className="divide-y divide-white/20">
                                        {topPlayers.slice(0, 3).map((player, i) => (
                                            <TopPerformerRow
                                                key={player.id}
                                                rank={i + 1}
                                                name={player.name}
                                                avgScore={player.avg_score}
                                                rounds={player.rounds}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState type="stats" variant="compact" />
                                )}
                            </PremiumGlassCard>
                        </div>

                        {/* Calendar Widget */}
                        <div>
                            <CalendarWidget
                                events={calendarEvents}
                                calendarUrl="/golf/dashboard/calendar"
                            />
                        </div>
                    </motion.div>

                    {/* Right Column - Trend, Rounds */}
                    <motion.div className="lg:col-span-2 space-y-4 md:space-y-6" variants={itemVariants}>
                        {/* Team Performance Chart */}
                        <div>
                            <SectionHeader title="Team Performance Trend" />
                            {hasTrendData ? (
                                <PremiumGlassCard glow>
                                    <TrendChart
                                        data={teamScoringTrend}
                                        valueLabel="Team Avg"
                                        reverse={true}
                                    />
                                </PremiumGlassCard>
                            ) : (
                                <PremiumGlassCard>
                                    <div className="flex flex-col items-center justify-center py-8 md:py-10 text-center">
                                        <div className="w-12 h-12 rounded-full bg-slate-100/80 flex items-center justify-center mb-4">
                                            <IconChartBar size={22} className="text-slate-400" />
                                        </div>
                                        <h3 className="text-base font-semibold text-slate-800 mb-1.5">
                                            No trend data yet
                                        </h3>
                                        <p className="text-sm text-slate-500 max-w-xs mb-5 leading-relaxed">
                                            Performance trends will appear once your players submit rounds across multiple months.
                                        </p>
                                        <Link
                                            href="/golf/dashboard/roster"
                                            className={cn(
                                                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
                                                'bg-primary-600 hover:bg-primary-700 text-white',
                                                'transition-colors duration-150',
                                                'shadow-sm hover:shadow-md'
                                            )}
                                        >
                                            <IconPlus size={16} />
                                            Invite Players
                                        </Link>
                                    </div>
                                </PremiumGlassCard>
                            )}
                        </div>

                        {/* Recent Rounds */}
                        <div>
                            <SectionHeader
                                title="Recent Rounds"
                                action={{ label: 'View All', href: '/golf/dashboard/rounds' }}
                            />
                            <PremiumGlassCard noPadding>
                                <ShineEffect />
                                {filteredRounds.length === 0 ? (
                                    <EmptyState
                                        type="rounds"
                                        variant="compact"
                                        description={dateRange !== 'all'
                                            ? `No rounds in the selected time period. Try expanding the date range.`
                                            : "Players can submit rounds from their dashboard"
                                        }
                                        action={null}
                                    />
                                ) : (
                                    <div className="divide-y divide-white/15">
                                        {filteredRounds.map((round) => (
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
                            </PremiumGlassCard>
                        </div>
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
}
