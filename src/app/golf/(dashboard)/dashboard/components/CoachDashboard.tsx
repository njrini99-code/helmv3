'use client';

import { useMemo, useState, useEffect, useRef, memo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { m, AnimatePresence } from 'framer-motion';
import {
    IconUsers,
    IconCalendar,
    IconFlag,
    IconChartBar,
    IconPlus,
    IconCopy,
    IconCheck,
    IconMenu,
    IconClock,
    IconChevronDown,
    IconGolf,
    IconTarget,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/contexts/sidebar-context';
import { ShineEffect } from '@/components/ui/shine-effect';
import { EmptyState } from '@/components/ui/empty-state';
import {
    PremiumGlassCard,
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
import { JoinRequestAlert } from '@/components/golf/roster/JoinRequestAlert';
import type { CoachDashboardPayload, TodayEvent, ActionItem, TeamPulseData } from '@/app/golf/actions/dashboard-data';
import type { CalendarEvent } from '@/lib/types/calendar';

const TrendChart = dynamic(() => import('./TrendChart').then(mod => ({ default: mod.TrendChart })), {
    loading: () => <div className="h-[200px] bg-white/45 backdrop-blur-[20px] rounded-2xl border border-white/30 animate-pulse" />,
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
            className={cn(
                'relative overflow-hidden rounded-2xl',
                'bg-gradient-to-r from-primary-50 via-primary-50/80 to-emerald-50',
                'border border-primary-200/40',
                'shadow-[0_1px_4px_rgba(0,0,0,0.04)]'
            )}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
        >
            <div className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 md:px-5 md:py-3.5">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <IconUsers size={13} className="text-primary-600" />
                    </div>
                    <p className="text-primary-700 text-xs font-medium">Share invite code with players</p>
                </div>
                <m.button
                    onClick={handleCopy}
                    className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg',
                        'bg-white/80 hover:bg-white border border-primary-200/60',
                        'text-xs font-mono tracking-widest text-primary-700',
                        'transition-all duration-200 active:scale-95'
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
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open]);

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setOpen(!open)}
                className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                    'bg-white/50 backdrop-blur-sm border border-white/30',
                    'text-warm-600 hover:text-warm-800 hover:bg-white/70',
                    'transition-all duration-150 active:scale-95 shadow-sm'
                )}
                aria-label="Select date range"
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <IconClock size={12} className="text-warm-400" />
                <span className="hidden sm:inline">{selected?.label}</span>
                <span className="sm:hidden">{selected?.shortLabel}</span>
                <IconChevronDown size={12} className={cn('text-warm-400 transition-transform', open && 'rotate-180')} />
            </button>
            <AnimatePresence>
                {open && (
                    <>
                        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                        <m.div
                            initial={{ opacity: 0, y: -4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            role="listbox"
                            aria-label="Date range options"
                            className={cn(
                                'absolute right-0 top-full mt-1 z-40',
                                'bg-white/95 backdrop-blur-xl rounded-xl',
                                'border border-warm-200/50 shadow-lg py-1 min-w-[160px]'
                            )}
                        >
                            {DATE_RANGE_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    role="option"
                                    aria-selected={option.value === value}
                                    onClick={() => { onChange(option.value); setOpen(false); }}
                                    className={cn(
                                        'w-full text-left px-3 py-2 text-sm transition-colors',
                                        option.value === value
                                            ? 'text-primary-700 bg-primary-50 font-medium'
                                            : 'text-warm-600 hover:bg-warm-50'
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </m.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface CoachDashboardProps {
    data: CoachDashboardData;
    enhancedData?: CoachDashboardPayload | null;
}

export function CoachDashboard({ data, enhancedData }: CoachDashboardProps) {
    const { coach, team, stats, recentRounds, topPlayers, teamScoringTrend } = data;
    const { toggleMobile } = useSidebar();
    const [dateRange, setDateRange] = useState<DateRange>('all');

    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    }, []);

    const firstName = coach.full_name?.split(' ')[0] || 'Coach';

    const filteredRounds = useMemo(() => {
        if (dateRange === 'all') return recentRounds;
        const now = new Date();
        let cutoff: Date;
        switch (dateRange) {
            case '7d': cutoff = new Date(now.getTime() - 7 * 86400000); break;
            case '30d': cutoff = new Date(now.getTime() - 30 * 86400000); break;
            case '90d': cutoff = new Date(now.getTime() - 90 * 86400000); break;
            case 'season': {
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

    const todayStr = useMemo(() => {
        return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }, []);

    return (
        <div className="min-h-full bg-transparent">
            {/* HEADER */}
            <div className={cn(
                'sticky top-0 z-20',
                'bg-white/70 backdrop-blur-[20px]',
                'border-b border-warm-200/40',
            )}>
                <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={toggleMobile}
                                className={cn(
                                    'lg:hidden p-2 -ml-2 rounded-xl',
                                    'text-warm-500 hover:text-warm-700 hover:bg-warm-100/80',
                                    'transition-colors duration-150 active:scale-95',
                                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
                                )}
                                aria-label="Open navigation menu"
                            >
                                <IconMenu size={22} />
                            </button>
                            <div className="min-w-0">
                                <h1 className="text-lg md:text-xl font-bold tracking-tight text-warm-900 truncate">
                                    {greeting}, {firstName}
                                </h1>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse flex-shrink-0" />
                                    <span className="text-warm-500 text-xs font-medium truncate">{team?.name || 'Golf Team'}</span>
                                    <span className="hidden md:inline text-warm-300">&middot;</span>
                                    <span className="hidden md:inline text-warm-400 text-xs">{todayStr}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <DateRangeSelector value={dateRange} onChange={setDateRange} />
                            <div className={cn(
                                'hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
                                'bg-warm-50/80 border border-warm-200/40',
                                'text-xs text-warm-400'
                            )}>
                                <kbd className="px-1 py-0.5 bg-white rounded text-[10px] font-medium shadow-sm border border-warm-200/60">&#8984;</kbd>
                                <kbd className="px-1 py-0.5 bg-white rounded text-[10px] font-medium shadow-sm border border-warm-200/60">K</kbd>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <m.div
                className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <JoinRequestAlert />

                {team?.join_code && stats.rosterSize < 20 && (
                    <m.div className="mb-4" variants={itemVariants}>
                        <InviteCodeCard inviteCode={team.join_code} />
                    </m.div>
                )}
                {team?.join_code && stats.rosterSize >= 20 && (
                    <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
                        Invite code is hidden because your roster has reached the 20-player limit.
                    </div>
                )}

                {/* ROW 1: Horizontal Day Timeline (full width) */}
                <m.div className="mb-5 md:mb-6" variants={itemVariants}>
                    <DashboardErrorBoundary name="Schedule">
                        <TodayTimeline
                            events={enhancedData?.todayEvents ?? EMPTY_EVENTS}
                            role="coach"
                            timezone={enhancedData?.timezone}
                        />
                    </DashboardErrorBoundary>
                </m.div>

                {/* ROW 2: Quick Stats */}
                <DashboardErrorBoundary name="Stats">
                <m.div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-5 md:mb-6" variants={itemVariants}>
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
                <m.div className="grid lg:grid-cols-3 gap-4 md:gap-5 mb-5 md:mb-6" variants={itemVariants}>
                    <div className="lg:col-span-2">
                        <SectionHeader title="Recent Rounds" action={{ label: 'View All', href: '/golf/dashboard/rounds' }} />
                        <PremiumGlassCard noPadding>
                            <ShineEffect />
                            {filteredRounds.length === 0 ? (
                                <EmptyState
                                    type="rounds"
                                    variant="compact"
                                    description={dateRange !== 'all' ? 'No rounds in the selected time period.' : 'Players can submit rounds from their dashboard'}
                                    action={null}
                                />
                            ) : (
                                <div className="divide-y divide-white/15">
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
                        </PremiumGlassCard>
                    </div>
                    <div className="flex flex-col gap-4 md:gap-5">
                        <ActionItemsCard items={enhancedData?.actionItems ?? EMPTY_ACTION_ITEMS} role="coach" />
                    </div>
                </m.div>
                </DashboardErrorBoundary>

                {/* ROW 4: Trend + Team Pulse + Top Performers */}
                <DashboardErrorBoundary name="Performance Trend">
                <m.div className="grid lg:grid-cols-5 gap-4 md:gap-5 mb-5 md:mb-6" variants={itemVariants}>
                    <div className="lg:col-span-3">
                        <SectionHeader title="Performance Trend" />
                        {hasTrendData ? (
                            <PremiumGlassCard glow>
                                <TrendChart data={teamScoringTrend} valueLabel="Team Avg" reverse={true} />
                            </PremiumGlassCard>
                        ) : (
                            <PremiumGlassCard>
                                <div className="flex flex-col items-center justify-center py-8 md:py-10 text-center">
                                    <div className="w-12 h-12 rounded-full bg-warm-100/80 flex items-center justify-center mb-4">
                                        <IconChartBar size={22} className="text-warm-400" />
                                    </div>
                                    <h3 className="text-base font-semibold text-warm-800 mb-1.5">No trend data yet</h3>
                                    <p className="text-sm text-warm-500 max-w-xs mb-5 leading-relaxed">
                                        Trends appear once your players submit rounds across multiple months.
                                    </p>
                                    <Link
                                        href="/golf/dashboard/roster"
                                        className={cn(
                                            'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
                                            'bg-primary-600 hover:bg-primary-700 text-white',
                                            'transition-colors duration-150 shadow-sm'
                                        )}
                                    >
                                        <IconPlus size={16} />
                                        Invite Players
                                    </Link>
                                </div>
                            </PremiumGlassCard>
                        )}
                    </div>
                    <div className="lg:col-span-2 flex flex-col gap-4 md:gap-5">
                        <TeamPulseCard data={enhancedData?.teamPulse ?? EMPTY_TEAM_PULSE} />
                        <div>
                            <SectionHeader
                                title="Top Performers"
                                action={{ label: 'Full Rankings', href: '/golf/dashboard/stats/team' }}
                            />
                            <PremiumGlassCard noPadding>
                                <ShineEffect />
                                {topPlayers.length > 0 ? (
                                    <div className="divide-y divide-white/20">
                                        {topPlayers.slice(0, 5).map((player, i) => (
                                            <TopPerformerRow key={player.id} rank={i + 1} name={player.name} avgScore={player.avg_score} rounds={player.rounds} />
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState type="stats" variant="compact" />
                                )}
                            </PremiumGlassCard>
                        </div>
                    </div>
                </m.div>
                </DashboardErrorBoundary>

                {/* QUICK ACTIONS */}
                <m.div variants={itemVariants}>
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href="/golf/dashboard/roster" className={cn(
                            'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium',
                            'bg-primary-600 text-white hover:bg-primary-700 transition-colors shadow-sm active:scale-95'
                        )}>
                            <IconPlus size={14} />
                            Add Player
                        </Link>
                        <Link href="/golf/dashboard/calendar" className={cn(
                            'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium',
                            'bg-white/60 text-warm-700 hover:bg-white/80 transition-colors border border-white/40 shadow-sm active:scale-95'
                        )}>
                            <IconCalendar size={14} />
                            Schedule Event
                        </Link>
                        <Link href="/golf/dashboard/qualifiers" className={cn(
                            'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium',
                            'bg-white/60 text-warm-700 hover:bg-white/80 transition-colors border border-white/40 shadow-sm active:scale-95'
                        )}>
                            <IconFlag size={14} />
                            Create Qualifier
                        </Link>
                    </div>
                </m.div>
            </m.div>
        </div>
    );
}
