'use client';

import { useMemo, useState, memo } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
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
    IconSparkles,
    IconBell
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { ShineEffect } from '@/components/ui/shine-effect';
import { EmptyState } from '@/components/ui/empty-state';
import { CalendarWidget } from '@/components/dashboard/calendar-widget';
import { RecentActivityFeed } from '@/components/golf/RecentActivityFeed';

// OPTIMIZATION: Code split heavy components - only load when needed
const TrendChart = dynamic(() => import('./TrendChart').then(mod => ({ default: mod.TrendChart })), {
    loading: () => <div className="h-[200px] bg-white/45 backdrop-blur-[20px] rounded-2xl border border-white/30 animate-pulse" />,
    ssr: false // Chart doesn't need SSR
});

const V2InsightsFeed = dynamic(() => import('@/components/golf/coachhelm/v2').then(mod => ({ default: mod.V2InsightsFeed })), {
    loading: () => <div className="h-[300px] bg-white/45 backdrop-blur-[20px] rounded-2xl border border-white/30 animate-pulse" />,
    ssr: true // Insights can be SSR'd
});

const CoachAlertCenter = dynamic(() => import('@/components/golf/coachhelm/alerts').then(mod => ({ default: mod.CoachAlertCenter })), {
    loading: () => <div className="h-[200px] bg-white/45 backdrop-blur-[20px] rounded-2xl border border-white/30 animate-pulse" />,
    ssr: true
});
import {
    PremiumGlassCard,
    PremiumStatCard,
    QuickActionCard,
    SectionHeader,
    RoundRow,
    TopPerformerRow,
    containerVariants,
    itemVariants
} from '@/components/golf/dashboard';
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
        player_name: string;
        course_name: string;
        total_score: number;
        total_to_par: number;
        round_date: string;
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
                'relative overflow-hidden rounded-2xl p-6 mb-6', // Standardized: 16px
                'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
                'border border-white/10',
                'shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]'
            )}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
        >
            {/* Ambient glow */}
            <div className="absolute right-0 top-0 w-40 h-40 bg-primary-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute left-0 bottom-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

            <div className="relative z-10 flex items-center justify-between gap-4">
                <div>
                    <h3 className="text-white/90 text-sm font-semibold mb-1 flex items-center gap-2">
                        <IconUsers size={16} className="text-primary-400" />
                        Team Invite Code
                    </h3>
                    <p className="text-white/50 text-xs">Share this code with players to join your roster</p>
                </div>
                <motion.button
                    onClick={handleCopy}
                    className={cn(
                        'flex items-center gap-3 px-4 py-2.5 rounded-lg', // Standardized: 12px
                        'bg-white/10 hover:bg-white/15 border border-white/10',
                        'text-sm font-mono tracking-widest text-white',
                        'transition-all duration-200'
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    {copied ? (
                        <>
                            <IconCheck size={16} className="text-primary-400" />
                            <span className="text-primary-400">Copied!</span>
                        </>
                    ) : (
                        <>
                            <span>{inviteCode}</span>
                            <IconCopy size={14} className="text-white/50" />
                        </>
                    )}
                </motion.button>
            </div>
        </motion.div>
    );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CoachDashboard({ data }: { data: CoachDashboardData }) {
    const { coach, team, stats, recentRounds, topPlayers, calendarEvents, teamScoringTrend } = data;

    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    }, []);

    const firstName = coach.full_name?.split(' ')[0] || 'Coach';

    const trendData = teamScoringTrend || [
        { label: 'Jan', value: 76.5 },
        { label: 'Feb', value: 75.8 },
        { label: 'Mar', value: 75.2 },
        { label: 'Apr', value: 74.5 },
        { label: 'May', value: 73.8 },
    ];

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
                <div className="max-w-7xl mx-auto px-6 py-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                                {greeting}, {firstName}
                            </h1>
                            <p className="text-slate-500 mt-0.5 flex items-center gap-2 text-sm">
                                <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                                {team?.name || 'Golf Team'}
                            </p>
                        </div>
                        <div className="hidden md:flex items-center gap-3">
                            <div className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-lg', // Standardized: 12px
                                'bg-slate-100/60 backdrop-blur-sm', // More transparent
                                'border border-slate-200/40',
                                'text-sm text-slate-500'
                            )}>
                                <kbd className="px-1.5 py-0.5 bg-white rounded-md text-xs font-medium shadow-sm border border-slate-200">⌘</kbd>
                                <kbd className="px-1.5 py-0.5 bg-white rounded-md text-xs font-medium shadow-sm border border-slate-200">K</kbd>
                                <span className="text-slate-400 ml-1">Quick actions</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <motion.div
                className="max-w-7xl mx-auto px-6 py-8"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {/* Invite Code */}
                {team?.join_code && stats.rosterSize < 20 && (
                    <InviteCodeCard inviteCode={team.join_code} />
                )}

                {/* Stats Grid */}
                <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8" variants={itemVariants}>
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

                {/* Two Column Layout */}
                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Left Column */}
                    <motion.div className="space-y-6" variants={itemVariants}>
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

                        {/* CoachHelm V2 Insights */}
                        {team && coach && (
                            <div>
                                <SectionHeader
                                    title="CoachHelm AI"
                                    icon={<IconSparkles size={14} />}
                                    action={{ label: 'Settings', href: '/golf/dashboard/settings/coaching-intelligence' }}
                                />
                                <PremiumGlassCard glow>
                                    <V2InsightsFeed teamId={team.id} coachId={coach.id} />
                                </PremiumGlassCard>
                            </div>
                        )}

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

                    {/* Right Column */}
                    <motion.div className="lg:col-span-2 space-y-6" variants={itemVariants}>
                        {/* Player Alerts - AI-Generated Alerts for Proactive Coaching */}
                        {team && coach && (
                            <div>
                                <SectionHeader
                                    title="Player Alerts"
                                    icon={<IconBell size={14} />}
                                    action={{ label: 'View All', href: '/golf/dashboard/alerts' }}
                                />
                                <CoachAlertCenter
                                    coachId={coach.id}
                                    teamId={team.id}
                                    maxVisible={3}
                                    compact
                                />
                            </div>
                        )}

                        {/* Team Performance Chart */}
                        {stats.teamScoringAverage && (
                            <div>
                                <SectionHeader title="Team Performance Trend" />
                                <PremiumGlassCard glow>
                                    <TrendChart
                                        data={trendData}
                                        valueLabel="Team Avg"
                                        reverse={true}
                                    />
                                </PremiumGlassCard>
                            </div>
                        )}

                        {/* Recent Rounds */}
                        <div>
                            <SectionHeader
                                title="Recent Rounds"
                                action={{ label: 'View All', href: '/golf/dashboard/stats' }}
                            />
                            <PremiumGlassCard noPadding>
                                <ShineEffect />
                                {recentRounds.length === 0 ? (
                                    <EmptyState
                                        type="rounds"
                                        variant="compact"
                                        description="Players can submit rounds from their dashboard"
                                        action={undefined}
                                    />
                                ) : (
                                    <div className="divide-y divide-white/20">
                                        {recentRounds.map((round) => (
                                            <RoundRow
                                                key={round.id}
                                                playerName={round.player_name}
                                                courseName={round.course_name}
                                                score={round.total_score}
                                                toPar={round.total_to_par}
                                                date={round.round_date}
                                            />
                                        ))}
                                    </div>
                                )}
                            </PremiumGlassCard>
                        </div>

                        {/* Activity Feed */}
                        {team && (
                            <div>
                                <SectionHeader title="Recent Activity" />
                                <PremiumGlassCard>
                                    <ShineEffect />
                                    <RecentActivityFeed teamId={team.id} limit={5} />
                                </PremiumGlassCard>
                            </div>
                        )}
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
}
