'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import {
    IconUsers,
    IconChartBar,
    IconGolf,
    IconPlus,
    IconSparkles,
    IconSettings,
    IconTarget,
} from '@/components/icons';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { ShineEffect } from '@/components/ui/shine-effect';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PlayerFocusAreas } from '@/components/golf/coachhelm/insights';

const TrendChart = dynamic(() => import('./TrendChart').then(mod => ({ default: mod.TrendChart })), {
    loading: () => <div className="h-[200px] bg-cream-100/55 backdrop-blur-[20px] rounded-2xl border border-warm-200/45 animate-pulse" />,
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
    DashboardErrorBoundary,
    TodaysMissionCard,
    containerVariants,
    itemVariants
} from '@/components/golf/dashboard';
import type { GolfPlayer, GolfTeam } from '@/lib/types/golf';
import type { PlayerDashboardPayload, TodayEvent, ActionItem, StrokesGainedSnapshot } from '@/app/golf/actions/dashboard-data';

// ============================================================================
// STABLE REFERENCES (prevents memoization breaks in child components)
// ============================================================================

const EMPTY_SPARKLINE: number[] = [];
const EMPTY_EVENTS: TodayEvent[] = [];
const EMPTY_ACTION_ITEMS: ActionItem[] = [];
const EMPTY_STROKES_GAINED: StrokesGainedSnapshot = {
    sg_total: null,
    sg_off_tee: null,
    sg_approach: null,
    sg_around_green: null,
    sg_putting: null,
};

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
            className="mb-4 md:mb-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
        >
            <div className={cn(
                'relative overflow-hidden rounded-2xl p-4 md:p-5',
                'bg-gradient-to-r from-primary-600 to-primary-500',
                'border border-primary-500/50',
                'shadow-[0_4px_16px_rgba(22,163,74,0.2)]'
            )}>
                <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="relative flex items-center gap-3 md:gap-4">
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                        <IconUsers size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm md:text-base font-bold text-white mb-0.5">Join Your Team</h3>
                        <p className="text-white/70 text-xs">Get your invite code from your coach to access team features.</p>
                    </div>
                    <Link
                        href="/golf/dashboard/settings"
                        className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg flex-shrink-0',
                            'bg-white text-primary-700 font-semibold text-xs',
                            'shadow-sm hover:bg-primary-50 transition-colors active:scale-95'
                        )}
                    >
                        <IconSettings size={14} />
                        <span className="hidden sm:inline">Enter Code</span>
                        <span className="sm:hidden">Join</span>
                    </Link>
                </div>
            </div>
        </m.div>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface PlayerDashboardProps {
    data: PlayerDashboardData;
    enhancedData?: PlayerDashboardPayload | null;
}

export function PlayerDashboard({ data, enhancedData }: PlayerDashboardProps) {
    const { player, team, stats, recentRounds } = data;

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

    const chartData = useMemo(() => {
        const sortedRounds = [...recentRounds].reverse();
        return sortedRounds
            .filter(r => r.total_score != null && Number.isFinite(r.total_score))
            .map(r => ({
                label: new Date(r.round_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                value: r.total_score
            }));
    }, [recentRounds]);

    return (
        <div className="min-h-full bg-transparent">
            {/* HEADER */}
            <LargeTitleHeader
                title={`${greeting}, ${player.first_name}`}
                subtitle={
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse flex-shrink-0" aria-hidden="true" />
                        <span className="text-warm-500 text-sm font-medium truncate">
                            {team?.name || 'Your Team'}
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
            />

            {/* MAIN CONTENT */}
            <m.div
                className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 min-w-0"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {!team && <JoinTeamBanner />}

                {stats.roundsPlayed === 0 ? (
                    /* EMPTY STATE */
                    <>
                        <m.div className="mb-5 md:mb-6" variants={itemVariants}>
                            <PremiumGlassCard glow className="!p-0 overflow-hidden">
                                <div className="relative p-6 md:p-10 text-center">
                                    <div className="absolute right-0 top-0 w-48 h-48 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                                    <div className="relative z-10">
                                        <div className="w-14 h-14 md:w-16 md:h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-50 flex items-center justify-center shadow-sm">
                                            <IconGolf size={28} className="text-primary-500 md:hidden" />
                                            <IconGolf size={32} className="text-primary-500 hidden md:block" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-warm-900 mb-2">Ready to Track Your Game</h3>
                                        <p className="text-sm text-warm-500 max-w-md mx-auto mb-6 leading-relaxed">
                                            Submit your first round to unlock scoring averages, performance trends, and AI-powered coaching insights.
                                        </p>
                                        <Link
                                            href="/golf/dashboard/rounds/new"
                                            className={cn(
                                                'inline-flex items-center gap-2 px-5 py-3 rounded-xl',
                                                'bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm',
                                                'shadow-[0_4px_16px_rgba(22,163,74,0.3)]',
                                                'transition-colors duration-200 active:scale-[0.97]'
                                            )}
                                        >
                                            <IconPlus size={16} />
                                            Submit Your First Round
                                        </Link>
                                        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {[
                                                { icon: <IconChartBar size={16} />, label: 'Scoring Average' },
                                                { icon: <IconTarget size={16} />, label: 'Best Round' },
                                                { icon: <IconTarget size={16} />, label: 'Performance Trends' },
                                                { icon: <IconSparkles size={16} />, label: 'AI Coaching' },
                                            ].map((item) => (
                                                <div key={item.label} className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-white/40 border border-warm-200/45">
                                                    <div className="text-warm-400">{item.icon}</div>
                                                    <span className="text-xs font-medium text-warm-500">{item.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </PremiumGlassCard>
                        </m.div>

                        {enhancedData && enhancedData.todayEvents.length > 0 && (
                            <m.div className="mb-5 md:mb-6" variants={itemVariants}>
                                <DashboardErrorBoundary name="Schedule">
                                    <TodayTimeline events={enhancedData.todayEvents} role="player" timezone={enhancedData.timezone} />
                                </DashboardErrorBoundary>
                            </m.div>
                        )}

                        <m.div variants={itemVariants}>
                            <DashboardErrorBoundary name="Focus Areas">
                                <SectionHeader title="My Focus Areas" icon={<IconTarget size={14} />} />
                                <PremiumGlassCard glow>
                                    <ShineEffect />
                                    <PlayerFocusAreas playerId={player.id} />
                                </PremiumGlassCard>
                            </DashboardErrorBoundary>
                        </m.div>
                    </>
                ) : (
                    /* NORMAL STATE */
                    <>
                        {/* ROW 1: Stat Cards */}
                        <DashboardErrorBoundary name="Stats">
                        <m.div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-5 md:mb-6" variants={itemVariants}>
                            <StatCardSparkline
                                label="Scoring Avg"
                                value={enhancedData?.sparklines.scoringAvg.value ?? stats.scoringAverage}
                                sparkline={enhancedData?.sparklines.scoringAvg.sparkline ?? EMPTY_SPARKLINE}
                                icon={<IconChartBar size={18} />}
                                iconColor="text-primary-600"
                                iconBg="bg-primary-50"
                                href="/golf/dashboard/stats"
                                trend={enhancedData?.sparklines.scoringAvg.trend || stats.recentTrend}
                                accent
                            />
                            <StatCardSparkline
                                label="GIR%"
                                value={enhancedData?.sparklines.girPct.value ?? null}
                                sparkline={enhancedData?.sparklines.girPct.sparkline ?? EMPTY_SPARKLINE}
                                icon={<IconTarget size={18} />}
                                iconColor="text-warm-600"
                                iconBg="bg-warm-100"
                                href="/golf/dashboard/stats"
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
                                href="/golf/dashboard/stats"
                                trend={enhancedData?.sparklines.puttsPerRound.trend}
                            />
                            <StatCardSparkline
                                label="Handicap"
                                value={enhancedData?.sparklines.handicap.value ?? (stats.handicap !== null ? Number(Number(stats.handicap).toFixed(1)) : null)}
                                sparkline={EMPTY_SPARKLINE}
                                icon={<IconSparkles size={18} />}
                                iconColor="text-violet-600"
                                iconBg="bg-violet-50"
                                href="/golf/dashboard/stats"
                            />
                        </m.div>
                        </DashboardErrorBoundary>

                        {/* ROW 2 + 3: Schedule / Trend (left) + Strokes Gained / Tasks / Focus Areas (right)
                            Combined into a single 2-column grid so each column
                            fills naturally — avoids the dead vertical space that
                            appeared when the shorter left column finished before
                            the taller right column. */}
                        <m.div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-5 mb-5 md:mb-6 items-start" variants={itemVariants}>
                            {/* LEFT COLUMN */}
                            <div className="lg:col-span-3 flex flex-col gap-4 md:gap-5 min-w-0">
                                <DashboardErrorBoundary name="Schedule">
                                    <TodayTimeline
                                        events={enhancedData?.todayEvents ?? EMPTY_EVENTS}
                                        role="player"
                                        timezone={enhancedData?.timezone}
                                    />
                                </DashboardErrorBoundary>

                                <DashboardErrorBoundary name="Scoring Trend">
                                <div className="w-full">
                                {chartData.length >= 2 ? (
                                    <>
                                        <SectionHeader title="Scoring Trend" />
                                        <PremiumGlassCard glow>
                                            <div className="w-full min-h-[200px]">
                                                <TrendChart data={chartData} reverse={true} />
                                            </div>
                                        </PremiumGlassCard>
                                    </>
                                ) : (
                                    <>
                                        <SectionHeader title="Scoring Trend" />
                                        <PremiumGlassCard>
                                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                                <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mb-3">
                                                    <IconChartBar size={24} className="text-warm-400" />
                                                </div>
                                                <p className="text-lg font-semibold text-warm-900 mb-1">Not enough data yet</p>
                                                <p className="text-sm text-warm-500">Submit 2+ rounds to see your scoring trend</p>
                                            </div>
                                        </PremiumGlassCard>
                                    </>
                                )}
                                </div>
                                </DashboardErrorBoundary>

                                <DashboardErrorBoundary name="Today's Mission">
                                    <TodaysMissionCard playerId={player.id} />
                                </DashboardErrorBoundary>
                            </div>

                            {/* RIGHT COLUMN */}
                            <div className="lg:col-span-2 flex flex-col gap-4 md:gap-5 min-w-0">
                                <DashboardErrorBoundary name="Performance">
                                    <PerformanceRadar
                                        data={enhancedData?.strokesGained ?? EMPTY_STROKES_GAINED}
                                    />
                                </DashboardErrorBoundary>
                                <DashboardErrorBoundary name="Tasks">
                                    <ActionItemsCard items={enhancedData?.actionItems ?? EMPTY_ACTION_ITEMS} role="player" />
                                </DashboardErrorBoundary>
                                <DashboardErrorBoundary name="Focus Areas">
                                    <SectionHeader title="Focus Areas" icon={<IconTarget size={14} />} />
                                    <PremiumGlassCard glow>
                                        <ShineEffect />
                                        <PlayerFocusAreas playerId={player.id} />
                                    </PremiumGlassCard>
                                </DashboardErrorBoundary>
                            </div>
                        </m.div>

                        {/* ROW 4: Recent Rounds (full width) */}
                        <DashboardErrorBoundary name="Recent Rounds">
                        <m.div className="mb-5 md:mb-6" variants={itemVariants}>
                            <SectionHeader
                                title="Recent Rounds"
                                action={{ label: 'View All', href: '/golf/dashboard/rounds' }}
                            />
                            <PremiumGlassCard noPadding>
                                <ShineEffect />
                                <div className="divide-y divide-white/20">
                                    {recentRounds.map((round) => (
                                        <RoundRow
                                            key={round.id}
                                            id={round.id}
                                            courseName={round.course_name}
                                            score={round.total_score}
                                            toPar={round.total_to_par}
                                            date={round.round_date}
                                        />
                                    ))}
                                </div>
                            </PremiumGlassCard>
                        </m.div>
                        </DashboardErrorBoundary>

                        {/* Secondary Stats */}
                        {enhancedData?.secondaryStats && (
                            <m.div className="mb-5 md:mb-6" variants={itemVariants}>
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
                                    'transition-colors duration-200 active:scale-[0.98]'
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
