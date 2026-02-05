'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
    IconUsers,
    IconCalendar,
    IconFlag,
    IconChartBar,
    IconGolf,
    IconPlus,
    IconArrowRight,
    IconMessage,
    IconSparkles,
    IconSettings,
    IconTarget
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { ShineEffect } from '@/components/ui/shine-effect';
import { EmptyState } from '@/components/ui/empty-state';
import { TrendChart } from './TrendChart';
import { PlayerFocusAreas } from '@/components/golf/coachhelm/insights';
import {
    PremiumGlassCard,
    PremiumStatCard,
    QuickActionCard,
    SectionHeader,
    RoundRow,
    containerVariants,
    itemVariants
} from '@/components/golf/dashboard';
import type { GolfPlayer, GolfTeam } from '@/lib/types/golf';

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
        recentTrend?: 'up' | 'down' | 'stable';
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
// LOCAL HELPER COMPONENTS (Shared components imported from @/components/golf/dashboard)
// ============================================================================

function JoinTeamBanner() {
    return (
        <motion.div
            className="mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
        >
            <div className={cn(
                'relative overflow-hidden rounded-2xl p-6', // Standardized: 16px
                'bg-gradient-to-r from-primary-600 to-primary-500',
                'border border-primary-500/50',
                'shadow-[0_8px_32px_rgba(22,163,74,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]'
            )}>
                {/* Ambient glows */}
                <div className="absolute right-0 top-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute left-0 bottom-0 w-32 h-32 bg-white/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

                <div className="relative flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"> {/* Standardized: 12px */}
                        <IconUsers size={24} className="text-white" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-white mb-1">
                            Join Your Team
                        </h3>
                        <p className="text-white/80 text-sm mb-4">
                            You haven't joined a team yet. Get your invite code from your coach to access team features.
                        </p>
                        <Link
                            href="/golf/dashboard/settings"
                            className={cn(
                                'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg', // Standardized: 12px
                                'bg-white text-primary-700 font-semibold text-sm',
                                'shadow-[0_2px_8px_rgba(0,0,0,0.1)]',
                                'hover:bg-primary-50 transition-colors'
                            )}
                        >
                            <IconSettings size={16} />
                            Enter Invite Code
                            <IconArrowRight size={14} />
                        </Link>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PlayerDashboard({ data }: { data: PlayerDashboardData }) {
    const { player, team, stats, recentRounds } = data;
    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    }, []);

    // Prepare chart data from recent rounds (reverse so time goes left to right)
    const chartData = useMemo(() => {
        const sortedRounds = [...recentRounds].reverse();
        return sortedRounds.map(r => ({
            label: new Date(r.round_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: r.total_score
        }));
    }, [recentRounds]);

    return (
        <div className="min-h-screen bg-cream-gradient">
            {/* Header Section - Enhanced Premium Glass Panel */}
            <div
                className={cn(
                    'sticky top-0 z-20',
                    'bg-white/60 backdrop-blur-[24px]', // More transparent, stronger blur
                    'border-b border-white/30',
                    'shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                )}
                style={{ viewTransitionName: 'page-header' }}
            >
                <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
                                {greeting}, {player.first_name}
                            </h1>
                            <p className="text-slate-500 mt-0.5 flex items-center gap-2 text-sm">
                                <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                                {team?.name || 'Golf Team'}
                                <span className="text-slate-300">•</span>
                                <span className="capitalize">{player.graduation_year ? `Class of ${player.graduation_year}` : 'Player'}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <motion.div
                className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {/* Join Team Banner - show if player has no team */}
                {!team && <JoinTeamBanner />}

                {/* Stats Grid */}
                <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8" variants={itemVariants}>
                    <PremiumStatCard
                        icon={<IconGolf size={20} />}
                        iconColor="text-primary-600"
                        iconBg="bg-primary-50"
                        label="Rounds Played"
                        value={stats.roundsPlayed}
                        href="/golf/dashboard/rounds"
                        accent
                    />
                    <PremiumStatCard
                        icon={<IconChartBar size={20} />}
                        iconColor="text-slate-600"
                        iconBg="bg-slate-100"
                        label="Scoring Average"
                        value={stats.scoringAverage ? stats.scoringAverage.toFixed(1) : '--'}
                        trend={stats.recentTrend === 'up'
                            ? { value: 0.5, positive: false }
                            : stats.recentTrend === 'down'
                                ? { value: 0.5, positive: true }
                                : null}
                        href="/golf/dashboard/stats"
                    />
                    <PremiumStatCard
                        icon={<IconFlag size={20} />}
                        iconColor="text-amber-600"
                        iconBg="bg-amber-50"
                        label="Best Round"
                        value={stats.bestRound || '--'}
                    />
                    <PremiumStatCard
                        icon={<IconSparkles size={20} />}
                        iconColor="text-violet-600"
                        iconBg="bg-violet-50"
                        label="Handicap"
                        value={stats.handicap !== null ? stats.handicap.toFixed(1) : '--'}
                    />
                </motion.div>

                {/* Two Column Layout */}
                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Left Column - Quick Actions & Focus Areas */}
                    <motion.div className="space-y-6" variants={itemVariants}>
                        <div>
                            <SectionHeader title="Quick Actions" />
                            <div className="space-y-2">
                                <QuickActionCard
                                    icon={<IconPlus size={18} className="text-white" />}
                                    label="Submit Round"
                                    description="Log your score"
                                    href="/golf/dashboard/rounds"
                                    variant="primary"
                                />
                                <QuickActionCard
                                    icon={<IconChartBar size={18} className="text-slate-600" />}
                                    label="View My Stats"
                                    description="Performance analytics"
                                    href="/golf/dashboard/stats"
                                />
                                <QuickActionCard
                                    icon={<IconCalendar size={18} className="text-slate-600" />}
                                    label="View Calendar"
                                    description="Upcoming events"
                                    href="/golf/dashboard/calendar"
                                />
                                <QuickActionCard
                                    icon={<IconMessage size={18} className="text-slate-600" />}
                                    label="Messages"
                                    description="Chat with coaches"
                                    href="/golf/dashboard/messages"
                                />
                            </div>
                        </div>

                        {/* Focus Areas */}
                        <div>
                            <SectionHeader
                                title="My Focus Areas"
                                icon={<IconTarget size={14} />}
                            />
                            <PremiumGlassCard glow>
                                <ShineEffect />
                                <PlayerFocusAreas playerId={player.id} />
                            </PremiumGlassCard>
                        </div>
                    </motion.div>

                    {/* Right Column - Recent Rounds & Charts */}
                    <motion.div className="lg:col-span-2 space-y-6" variants={itemVariants}>
                        {/* Scoring Trend Chart */}
                        {chartData.length >= 2 && (
                            <div>
                                <SectionHeader title="Scoring Trend" />
                                <PremiumGlassCard glow>
                                    <TrendChart
                                        data={chartData}
                                        reverse={true}
                                    />
                                </PremiumGlassCard>
                            </div>
                        )}

                        {/* Recent Rounds */}
                        <div>
                            <SectionHeader
                                title="My Recent Rounds"
                                action={{ label: 'View All', href: '/golf/dashboard/rounds' }}
                            />
                            <PremiumGlassCard noPadding>
                                <ShineEffect />
                                {recentRounds.length > 0 ? (
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
                                ) : (
                                    <EmptyState
                                        type="rounds"
                                        variant="compact"
                                        action={{ label: 'Submit First Round', href: '/golf/dashboard/rounds' }}
                                    />
                                )}
                            </PremiumGlassCard>
                        </div>
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
}
