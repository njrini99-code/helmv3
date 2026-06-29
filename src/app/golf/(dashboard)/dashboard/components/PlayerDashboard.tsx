'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { m, useReducedMotion } from 'framer-motion';
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
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PlayerFocusAreas } from '@/components/golf/coachhelm/insights';
import { ShimmerCard } from '@/components/ui/shimmer';

const TrendChart = dynamic(() => import('./TrendChart').then(mod => ({ default: mod.TrendChart })), {
    loading: () => <ShimmerCard className="h-[200px] rounded-2xl" />,
    ssr: false
});
import {
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
import { Card } from '@/components/ui/card';
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
  const prefersReducedMotion = useReducedMotion();
    return (
        <m.div
            className="mb-7 md:mb-9"
            initial={prefersReducedMotion ? false : ({ opacity: 0, y: 14 })}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] })}
        >
            {/* Cream-on-cream banner — no accent rail, no saturated tile.
                Reads as a section-level advisory, the kind a magazine
                runs above a chapter break. */}
            <div className="relative overflow-hidden rounded-3xl surface-matte">
                <div
                    aria-hidden
                    className="pointer-events-none absolute -right-16 -top-20 w-56 h-56 rounded-full opacity-80"
                    style={{ background: 'radial-gradient(closest-side, rgba(22,163,74,0.12), transparent 70%)' }}
                />

                <div className="relative flex items-center gap-5 md:gap-6 px-5 py-5 md:px-8 md:py-6">
                    <div className="w-12 h-12 rounded-2xl bg-primary-50/75 flex items-center justify-center flex-shrink-0">
                        <IconUsers size={20} className="text-primary-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-h3 md:text-h3 leading-tight font-medium tracking-[-0.012em] text-warm-900 mb-1">
                            Join your team
                        </h3>
                        <p className="text-warm-500 text-body-sm leading-relaxed max-w-md">
                            Drop in the invite code from your coach to unlock schedules, qualifiers, and CoachHelm insights.
                        </p>
                    </div>
                    <Link
                        href="/golf/dashboard/settings"
                        className={cn(
                            'inline-flex items-center gap-2 px-5 py-2.5 rounded-full flex-shrink-0 text-body-sm font-medium',
                            'bg-primary-600/95 text-white',
                            'shadow-[0_4px_14px_rgba(22,163,74,0.18)]',
                            'transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:bg-primary-700 hover:shadow-[0_8px_20px_rgba(22,163,74,0.24)]'
                        )}
                    >
                        <IconSettings size={14} />
                        <span className="hidden sm:inline">Enter code</span>
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
  const prefersReducedMotion = useReducedMotion();
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
        <div className="min-h-full bg-transparent relative overflow-x-clip">
            <div className="ambient-aurora" aria-hidden />
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
                className="max-w-[1280px] mx-auto px-4 md:px-6 py-4 md:py-6 min-w-0"
                variants={containerVariants}
                initial={prefersReducedMotion ? false : "hidden"}
                animate="visible"
            >
                {!team && <JoinTeamBanner />}

                {/* EMPTY STATE — first-time-player welcome moment. The page
                    background is already cream-warm, so the hero leans on a
                    single tall surface-apple panel with layered radial primary
                    glows, a Fraunces oversized headline, and a feature grid
                    that reads as four distinct iOS-tile previews instead of
                    one undifferentiated block. */}
                {stats.roundsPlayed === 0 ? (
                    <>
                        <m.div className="mb-7 md:mb-10" variants={itemVariants}>
                            <div className="relative overflow-hidden rounded-3xl surface-apple">
                                {/* Layered radial glows — primary in the upper-right,
                                    a softer secondary glow in the lower-left, both
                                    sized so they bleed into the cream gradient
                                    background instead of forming hard edges. */}
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute -right-24 -top-24 w-[420px] h-[420px] rounded-full"
                                    style={{ background: 'radial-gradient(closest-side, rgba(22,163,74,0.18), transparent 65%)' }}
                                />
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute -left-32 bottom-0 w-[360px] h-[360px] rounded-full"
                                    style={{ background: 'radial-gradient(closest-side, rgba(180,83,9,0.10), transparent 65%)' }}
                                />

                                <div className="relative px-6 py-10 md:px-12 md:py-14 text-center">
                                    {/* Icon stamp. iOS uses a glassy app-icon shape
                                        for hero illustrations — gradient body +
                                        inset highlight + soft drop shadow. */}
                                    <div
                                        className="relative w-20 h-20 md:w-24 md:h-24 mx-auto mb-6 rounded-3xl"
                                        style={{
                                            background: 'linear-gradient(165deg, #22c55e 0%, var(--color-primary-600) 50%, #15803d 100%)',
                                            boxShadow:
                                                '0 12px 32px rgba(22,163,74,0.32), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(0,0,0,0.12)',
                                        }}
                                    >
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <IconGolf size={40} className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]" />
                                        </div>
                                    </div>

                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-50/60 text-eyebrow font-medium uppercase tracking-[0.14em] text-primary-700 mb-5">
                                        <IconSparkles size={11} />
                                        Day 1
                                    </span>

                                    <h2 className="text-display md:text-[56px] leading-[1.02] font-light tracking-[-0.035em] text-warm-900 mb-5">
                                        Submit your first round.
                                    </h2>
                                    <p className="text-sm md:text-base text-warm-500 max-w-lg mx-auto mb-7 leading-relaxed">
                                        Strokes-gained, scoring averages, and CoachHelm insights all start with one round logged. Three minutes, hole by hole.
                                    </p>

                                    <Link
                                        href="/golf/dashboard/rounds/new"
                                        className={cn(
                                            'group inline-flex items-center gap-2 px-7 py-3.5 rounded-full',
                                            'bg-primary-600/95 text-white font-medium text-body tracking-[-0.005em]',
                                            'shadow-[0_4px_14px_rgba(22,163,74,0.20)]',
                                            'transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:bg-primary-700 hover:shadow-[0_8px_22px_rgba(22,163,74,0.28)]',
                                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-4 focus-visible:ring-offset-cream-50'
                                        )}
                                    >
                                        <IconPlus size={16} className="transition-transform duration-500 group-hover:rotate-90" />
                                        Submit your first round
                                    </Link>

                                    <div className="mt-12 md:mt-14 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-2xl mx-auto">
                                        {[
                                            { icon: <IconChartBar size={18} />, label: 'Scoring average', tone: 'primary' as const },
                                            { icon: <IconTarget size={18} />, label: 'Best round', tone: 'amber' as const },
                                            { icon: <IconTarget size={18} />, label: 'Performance trends', tone: 'blue' as const },
                                            { icon: <IconSparkles size={18} />, label: 'AI coaching', tone: 'violet' as const },
                                        ].map((item) => {
                                            const toneCls = {
                                                primary: 'bg-primary-50/70 text-primary-700',
                                                amber: 'bg-amber-50/70 text-amber-700',
                                                blue: 'bg-blue-50/70 text-blue-700',
                                                violet: 'bg-violet-50/70 text-violet-700',
                                            }[item.tone];
                                            return (
                                                <div
                                                    key={item.label}
                                                    className="group flex flex-col items-center text-center gap-3 p-5 rounded-2xl bg-cream-50/55 ring-1 ring-warm-200/35 transition-transform duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px]"
                                                >
                                                    <span className={cn('w-10 h-10 rounded-2xl flex items-center justify-center', toneCls)}>
                                                        {item.icon}
                                                    </span>
                                                    <span className="text-body-sm font-medium text-warm-700 leading-tight tracking-[-0.005em]">
                                                        {item.label}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </m.div>

                        {enhancedData && enhancedData.todayEvents.length > 0 && (
                            <m.div className="mb-7 md:mb-10" variants={itemVariants}>
                                <DashboardErrorBoundary name="Schedule">
                                    {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a custom component prop, not an ARIA role */}
                                    <TodayTimeline events={enhancedData.todayEvents} role="player" timezone={enhancedData.timezone} />
                                </DashboardErrorBoundary>
                            </m.div>
                        )}

                        <m.div variants={itemVariants}>
                            <DashboardErrorBoundary name="Focus Areas">
                                <SectionHeader title="My Focus Areas" icon={<IconTarget size={14} />} />
                                <Card variant="raised" glow>
                                    <PlayerFocusAreas playerId={player.id} />
                                </Card>
                            </DashboardErrorBoundary>
                        </m.div>
                    </>
                ) : (
                    /* NORMAL STATE */
                    <>
                        {/* ROW 1: Stat Cards */}
                        <DashboardErrorBoundary name="Stats">
                        <m.div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-7 md:mb-10" variants={itemVariants}>
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
                        <m.div className="grid grid-cols-1 lg:grid-cols-5 gap-5 md:gap-6 mb-7 md:mb-10 items-start" variants={itemVariants}>
                            {/* LEFT COLUMN */}
                            <div className="lg:col-span-3 flex flex-col gap-5 md:gap-6 min-w-0">
                                <DashboardErrorBoundary name="Schedule">
                                    <TodayTimeline
                                        events={enhancedData?.todayEvents ?? EMPTY_EVENTS}
                                        // eslint-disable-next-line jsx-a11y/aria-role -- role is a custom component prop, not an ARIA role
                                        role="player"
                                        timezone={enhancedData?.timezone}
                                    />
                                </DashboardErrorBoundary>

                                <DashboardErrorBoundary name="Scoring Trend">
                                <div className="w-full">
                                {chartData.length >= 2 ? (
                                    <>
                                        <SectionHeader title="Scoring Trend" />
                                        <Card variant="raised" glow>
                                            <div className="w-full min-h-[200px]">
                                                <TrendChart data={chartData} reverse={true} />
                                            </div>
                                        </Card>
                                    </>
                                ) : (
                                    <>
                                        <SectionHeader title="Scoring Trend" />
                                        <Card variant="raised">
                                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                                <div className="w-14 h-14 rounded-2xl bg-warm-100/65 flex items-center justify-center mb-4">
                                                    <IconChartBar size={22} className="text-warm-400" />
                                                </div>
                                                <p className="text-body-lg font-medium tracking-[-0.012em] text-warm-900 mb-1.5">Not enough data yet</p>
                                                <p className="text-body-sm text-warm-500">Submit 2+ rounds to see your scoring trend</p>
                                            </div>
                                        </Card>
                                    </>
                                )}
                                </div>
                                </DashboardErrorBoundary>

                                <DashboardErrorBoundary name="Today's Mission">
                                    <TodaysMissionCard playerId={player.id} />
                                </DashboardErrorBoundary>
                            </div>

                            {/* RIGHT COLUMN */}
                            <div className="lg:col-span-2 flex flex-col gap-5 md:gap-6 min-w-0">
                                <DashboardErrorBoundary name="Performance">
                                    <PerformanceRadar
                                        data={enhancedData?.strokesGained ?? EMPTY_STROKES_GAINED}
                                    />
                                </DashboardErrorBoundary>
                                <DashboardErrorBoundary name="Tasks">
                                    {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a custom component prop, not an ARIA role */}
                                    <ActionItemsCard items={enhancedData?.actionItems ?? EMPTY_ACTION_ITEMS} role="player" />
                                </DashboardErrorBoundary>
                                <DashboardErrorBoundary name="Focus Areas">
                                    <SectionHeader title="Focus Areas" icon={<IconTarget size={14} />} />
                                    <Card variant="raised" glow>
                                        <PlayerFocusAreas playerId={player.id} />
                                    </Card>
                                </DashboardErrorBoundary>
                            </div>
                        </m.div>

                        {/* ROW 4: Recent Rounds (full width) */}
                        <DashboardErrorBoundary name="Recent Rounds">
                        <m.div className="mb-7 md:mb-10" variants={itemVariants}>
                            <SectionHeader
                                title="Recent Rounds"
                                action={{ label: 'View All', href: '/golf/dashboard/rounds' }}
                            />
                            <Card variant="raised" noPadding>
                                <div className="divide-y divide-warm-200/30">
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
                            </Card>
                        </m.div>
                        </DashboardErrorBoundary>

                        {/* Secondary Stats */}
                        {enhancedData?.secondaryStats && (
                            <m.div className="mb-7 md:mb-10" variants={itemVariants}>
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
                                    'group flex items-center justify-center gap-2 w-full py-4 rounded-full text-body-sm font-medium tracking-[-0.005em]',
                                    'bg-primary-600/95 text-white',
                                    'shadow-[0_4px_14px_rgba(22,163,74,0.18)]',
                                    'transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:bg-primary-700 hover:shadow-[0_8px_22px_rgba(22,163,74,0.24)]'
                                )}
                            >
                                <IconPlus size={16} className="transition-transform duration-500 group-hover:rotate-90" />
                                Submit New Round
                            </Link>
                        </m.div>
                    </>
                )}
            </m.div>
        </div>
    );
}
