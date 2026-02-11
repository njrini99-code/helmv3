'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import {
    IconUsers,
    IconChartBar,
    IconGolf,
    IconPlus,
    IconArrowRight,
    IconSparkles,
    IconSettings,
    IconTarget,
    IconMenu,
    IconBell,
} from '@/components/icons';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { ShineEffect } from '@/components/ui/shine-effect';
import { useSidebar } from '@/contexts/sidebar-context';
import { PlayerFocusAreas } from '@/components/golf/coachhelm/insights';

const TrendChart = dynamic(() => import('./TrendChart').then(mod => ({ default: mod.TrendChart })), {
    loading: () => <div className="h-[200px] bg-white/45 backdrop-blur-[20px] rounded-2xl border border-white/30 animate-pulse" />,
    ssr: false
});
import {
    PremiumGlassCard,
    SectionHeader,
    RoundRow,
    TodayTimeline,
    StatCardSparkline,
    ActionItemsCard,
    PerformanceRadar,
    QuickStatRow,
    containerVariants,
    itemVariants
} from '@/components/golf/dashboard';
import type { GolfPlayer, GolfTeam } from '@/lib/types/golf';
import type { PlayerDashboardPayload } from '@/app/golf/actions/dashboard-data';

// ============================================================================
// TYPES
// ============================================================================

export interface PlayerDashboardData {
    player: GolfPlayer;
    team: GolfTeam | null;
    stats: {
        roundsPlayed: number;
        scoringAverage: number | null;
        bestRound: number | null;
        handicap: number | null;
        recentTrend?: 'improving' | 'declining' | 'stable';
    };
    recentRounds: Array<{
        id: string;
        course_name: string;
        total_score: number;
        total_to_par: number;
        round_date: string;
    }>;
}

// ============================================================================
// LOCAL HELPERS
// ============================================================================

function JoinTeamBanner() {
    return (
        <m.div
            className="mb-4 md:mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
        >
            <div className={cn(
                'relative overflow-hidden rounded-2xl p-4 md:p-6',
                'bg-gradient-to-r from-primary-600 to-primary-500',
                'border border-primary-500/50',
                'shadow-[0_8px_32px_rgba(22,163,74,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]'
            )}>
                <div className="hidden md:block absolute right-0 top-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="hidden md:block absolute left-0 bottom-0 w-32 h-32 bg-white/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
                <div className="relative flex items-start gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                        <IconUsers size={20} className="text-white md:hidden" />
                        <IconUsers size={24} className="text-white hidden md:block" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base md:text-lg font-bold text-white mb-1">Join Your Team</h3>
                        <p className="text-white/80 text-xs md:text-sm mb-3 md:mb-4">
                            Get your invite code from your coach to access team features.
                        </p>
                        <Link
                            href="/golf/dashboard/settings"
                            className={cn(
                                'inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg',
                                'bg-white text-primary-700 font-semibold text-xs md:text-sm',
                                'shadow-[0_2px_8px_rgba(0,0,0,0.1)]',
                                'hover:bg-primary-50 transition-colors active:scale-95'
                            )}
                        >
                            <IconSettings size={14} className="md:hidden" />
                            <IconSettings size={16} className="hidden md:block" />
                            <span className="md:hidden">Join Team</span>
                            <span className="hidden md:inline">Enter Invite Code</span>
                            <IconArrowRight size={12} className="md:hidden" />
                            <IconArrowRight size={14} className="hidden md:block" />
                        </Link>
                    </div>
                </div>
            </div>
        </m.div>
    );
}

// ============================================================================
// MAIN COMPONENT — BENTO LAYOUT
// ============================================================================

interface PlayerDashboardProps {
    data: PlayerDashboardData;
    enhancedData?: PlayerDashboardPayload | null;
}

export function PlayerDashboard({ data, enhancedData }: PlayerDashboardProps) {
    const { player, team, stats, recentRounds } = data;
    const { toggleMobile } = useSidebar();

    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    }, []);

    const chartData = useMemo(() => {
        const sortedRounds = [...recentRounds].reverse();
        return sortedRounds.map(r => ({
            label: new Date(r.round_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: r.total_score
        }));
    }, [recentRounds]);

    return (
        <div className="min-h-full bg-transparent">
            {/* STICKY HEADER */}
            <div className={cn(
                'sticky top-0 z-20',
                'bg-white/60 backdrop-blur-[24px]',
                'border-b border-white/30',
                'shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
            )}>
                <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-5">
                    <div className="flex items-center gap-3">
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
                        <div className="flex-1 min-w-0">
                            <h1 className="text-lg md:text-2xl font-bold tracking-tight text-slate-900 truncate">
                                {greeting}, {player.first_name}
                            </h1>
                            <p className="text-slate-500 mt-0.5 flex items-center gap-1.5 md:gap-2 text-xs md:text-sm">
                                <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-500 animate-pulse flex-shrink-0" />
                                <span className="truncate">{team?.name || 'Your Team'}</span>
                                <span className="text-slate-300 hidden sm:inline">&middot;</span>
                                <span className="capitalize hidden sm:inline">{player.graduation_year ? `Class of ${player.graduation_year}` : 'Player'}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <m.div
                className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {!team && <JoinTeamBanner />}

                {stats.roundsPlayed === 0 ? (
                    /* ═══════════════════════════════════════════
                       EMPTY STATE — no rounds yet
                       ═══════════════════════════════════════════ */
                    <>
                        {/* Hero empty state */}
                        <m.div className="mb-5 md:mb-8" variants={itemVariants}>
                            <PremiumGlassCard glow className="!p-0 overflow-hidden">
                                <div className="relative p-6 md:p-10 text-center">
                                    <div className="absolute right-0 top-0 w-48 h-48 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                                    <div className="absolute left-0 bottom-0 w-36 h-36 bg-violet-500/8 rounded-full blur-2xl translate-y-1/3 -translate-x-1/4 pointer-events-none" />
                                    <div className="relative z-10">
                                        <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-4 md:mb-5 rounded-2xl bg-gradient-to-br from-primary-50 to-emerald-50 flex items-center justify-center shadow-sm">
                                            <IconGolf size={32} className="text-primary-500 md:hidden" />
                                            <IconGolf size={40} className="text-primary-500 hidden md:block" />
                                        </div>
                                        <h3 className="text-lg md:text-xl font-bold text-slate-900 mb-2">Ready to Track Your Game</h3>
                                        <p className="text-sm md:text-base text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
                                            Submit your first round to unlock scoring averages, performance trends, and AI-powered coaching insights.
                                        </p>
                                        <Link
                                            href="/golf/dashboard/rounds/new"
                                            className={cn(
                                                'inline-flex items-center gap-2 px-5 py-3 rounded-xl',
                                                'bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm',
                                                'shadow-[0_4px_16px_rgba(22,163,74,0.3)]',
                                                'transition-all duration-200 active:scale-[0.97]'
                                            )}
                                        >
                                            <IconPlus size={16} />
                                            Submit Your First Round
                                        </Link>
                                        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                                            {[
                                                { icon: <IconChartBar size={18} />, label: 'Scoring Average' },
                                                { icon: <IconTarget size={18} />, label: 'Best Round' },
                                                { icon: <IconTarget size={18} />, label: 'Performance Trends' },
                                                { icon: <IconSparkles size={18} />, label: 'AI Coaching' },
                                            ].map((item) => (
                                                <div key={item.label} className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-white/40 border border-white/30">
                                                    <div className="text-slate-400">{item.icon}</div>
                                                    <span className="text-xs font-medium text-slate-500">{item.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </PremiumGlassCard>
                        </m.div>

                        {/* Today's schedule even when no rounds */}
                        {enhancedData && enhancedData.todayEvents.length > 0 && (
                            <m.div className="mb-5 md:mb-8" variants={itemVariants}>
                                <TodayTimeline events={enhancedData.todayEvents} role="player" />
                            </m.div>
                        )}

                        {/* Focus Areas */}
                        <m.div variants={itemVariants}>
                            <SectionHeader title="My Focus Areas" icon={<IconTarget size={14} />} />
                            <PremiumGlassCard glow>
                                <ShineEffect />
                                <PlayerFocusAreas playerId={player.id} />
                            </PremiumGlassCard>
                        </m.div>
                    </>
                ) : (
                    /* ═══════════════════════════════════════════
                       NORMAL STATE — has rounds (BENTO LAYOUT)
                       ═══════════════════════════════════════════ */
                    <>
                        {/* HERO ROW: Today's Schedule + Performance Radar */}
                        <m.div className="grid md:grid-cols-5 gap-4 md:gap-6 mb-5 md:mb-8" variants={itemVariants}>
                            <div className="md:col-span-3">
                                <TodayTimeline
                                    events={enhancedData?.todayEvents || []}
                                    role="player"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <PerformanceRadar
                                    data={enhancedData?.strokesGained || {
                                        sg_total: null,
                                        sg_off_tee: null,
                                        sg_approach: null,
                                        sg_around_green: null,
                                        sg_putting: null,
                                    }}
                                />
                            </div>
                        </m.div>

                        {/* STAT ROW: 4 sparkline cards */}
                        <m.div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4 mb-5 md:mb-8" variants={itemVariants}>
                            <StatCardSparkline
                                label="Scoring Avg"
                                value={enhancedData?.sparklines.scoringAvg.value ?? stats.scoringAverage}
                                sparkline={enhancedData?.sparklines.scoringAvg.sparkline || []}
                                icon={<IconChartBar size={20} />}
                                iconColor="text-primary-600"
                                iconBg="bg-primary-50"
                                href="/golf/dashboard/stats"
                                trend={enhancedData?.sparklines.scoringAvg.trend || stats.recentTrend}
                                reverseColor
                                accent
                            />
                            <StatCardSparkline
                                label="GIR%"
                                value={enhancedData?.sparklines.girPct.value ?? null}
                                sparkline={enhancedData?.sparklines.girPct.sparkline || []}
                                icon={<IconTarget size={20} />}
                                iconColor="text-slate-600"
                                iconBg="bg-slate-100"
                                href="/golf/dashboard/stats"
                                suffix="%"
                            />
                            <StatCardSparkline
                                label="Putts/Rd"
                                value={enhancedData?.sparklines.puttsPerRound.value ?? null}
                                sparkline={enhancedData?.sparklines.puttsPerRound.sparkline || []}
                                icon={<IconGolf size={20} />}
                                iconColor="text-amber-600"
                                iconBg="bg-amber-50"
                                href="/golf/dashboard/stats"
                                reverseColor
                            />
                            <StatCardSparkline
                                label="Handicap"
                                value={enhancedData?.sparklines.handicap.value ?? (stats.handicap !== null ? Number(Number(stats.handicap).toFixed(1)) : null)}
                                sparkline={[]}
                                icon={<IconSparkles size={20} />}
                                iconColor="text-violet-600"
                                iconBg="bg-violet-50"
                                href="/golf/dashboard/stats"
                            />
                        </m.div>

                        {/* MAIN BENTO: Trend + Action Items */}
                        <m.div className="grid lg:grid-cols-5 gap-4 md:gap-6 mb-5 md:mb-8" variants={itemVariants}>
                            <div className="lg:col-span-3">
                                {chartData.length >= 2 && (
                                    <>
                                        <SectionHeader title="Scoring Trend" />
                                        <PremiumGlassCard glow>
                                            <TrendChart data={chartData} reverse={true} />
                                        </PremiumGlassCard>
                                    </>
                                )}
                            </div>
                            <div className="lg:col-span-2">
                                <SectionHeader title="Action Items" icon={<IconBell size={14} />} />
                                <ActionItemsCard items={enhancedData?.actionItems || []} role="player" />
                            </div>
                        </m.div>

                        {/* BOTTOM BENTO: Focus Areas + Recent Rounds */}
                        <m.div className="grid lg:grid-cols-5 gap-4 md:gap-6 mb-5 md:mb-8" variants={itemVariants}>
                            <div className="lg:col-span-2">
                                <SectionHeader title="My Focus Areas" icon={<IconTarget size={14} />} />
                                <PremiumGlassCard glow>
                                    <ShineEffect />
                                    <PlayerFocusAreas playerId={player.id} />
                                </PremiumGlassCard>
                            </div>
                            <div className="lg:col-span-3">
                                <SectionHeader
                                    title="My Recent Rounds"
                                    action={{ label: 'View All', href: '/golf/dashboard/rounds' }}
                                />
                                <PremiumGlassCard noPadding>
                                    <ShineEffect />
                                    <div className="divide-y divide-white/20">
                                        {recentRounds.map((round) => (
                                            <RoundRow
                                                key={round.id}
                                                courseName={round.course_name}
                                                score={round.total_score}
                                                toPar={round.total_to_par}
                                                date={round.round_date}
                                            />
                                        ))}
                                    </div>
                                </PremiumGlassCard>
                            </div>
                        </m.div>

                        {/* SECONDARY STATS ROW */}
                        {enhancedData?.secondaryStats && (
                            <m.div className="mb-5 md:mb-8" variants={itemVariants}>
                                <QuickStatRow stats={[
                                    { label: 'FIR%', value: enhancedData.secondaryStats.firPct, suffix: '%' },
                                    { label: 'Scrambling', value: enhancedData.secondaryStats.scramblingPct, suffix: '%' },
                                    { label: 'Birdies/Rd', value: enhancedData.secondaryStats.birdiesPerRound },
                                    { label: 'Best Round', value: enhancedData.secondaryStats.bestRound },
                                ]} />
                            </m.div>
                        )}

                        {/* CTA: Submit Round */}
                        <m.div variants={itemVariants}>
                            <Link
                                href="/golf/dashboard/rounds/new"
                                className={cn(
                                    'flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-sm font-semibold',
                                    'bg-primary-600 hover:bg-primary-700 text-white',
                                    'shadow-[0_4px_16px_rgba(22,163,74,0.25)]',
                                    'transition-all duration-200 active:scale-[0.98]'
                                )}
                            >
                                <IconPlus size={16} />
                                Submit New Round
                            </Link>
                        </m.div>
                    </>
                )}
            </m.div>
        </div>
    );
}
