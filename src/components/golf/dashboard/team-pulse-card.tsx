'use client';

import { memo } from 'react';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconTrendingUp, IconActivity } from '@/components/icons';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { EmptyState } from '@/components/ui/empty-state';
import type { TeamPulseData } from '@/app/golf/actions/dashboard-data';

// ============================================================================
// COMPONENT
// ============================================================================

interface TeamPulseCardProps {
    data: TeamPulseData;
}

export const TeamPulseCard = memo(function TeamPulseCard({ data }: TeamPulseCardProps) {
    const { improving, stable, declining, topMover, roundsThisWeek } = data;
    const total = improving + stable + declining;

    // Calculate bar widths (minimum 4% to keep segments visible)
    const improvingPct = total > 0 ? Math.max((improving / total) * 100, improving > 0 ? 4 : 0) : 0;
    const decliningPct = total > 0 ? Math.max((declining / total) * 100, declining > 0 ? 4 : 0) : 0;
    const stablePct = total > 0 ? 100 - improvingPct - decliningPct : 100;

    return (
        <div className={cn(
            'relative overflow-clip surface-matte rounded-3xl p-6'
        )}>
            <div
                aria-hidden
                className="pointer-events-none absolute -top-16 -right-12 w-40 h-40 rounded-full opacity-70"
                style={{ background: 'radial-gradient(closest-side, rgba(22,163,74,0.10), transparent 70%)' }}
            />

            <div className="relative z-10">
                <div className="flex items-end justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <IconActivity size={14} className="text-primary-600" />
                        <h3 className="text-[15px] md:text-[17px] font-medium text-warm-700 tracking-[-0.012em]">
                            Team Pulse
                        </h3>
                    </div>
                    <span className="text-[12px] text-warm-400 tabular-nums">
                        <AnimatedNumber value={roundsThisWeek} /> rounds this week
                    </span>
                </div>

                {/* Segmented bar */}
                {total > 0 ? (
                    <>
                        <div
                            role="img"
                            aria-label={`Team pulse: ${improving} improving, ${stable} stable, ${declining} declining`}
                            className="h-2 rounded-full overflow-hidden flex bg-warm-100/70 mb-4"
                        >
                            <m.div
                                className="bg-primary-500/85 rounded-l-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${improvingPct}%` }}
                                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                            />
                            <m.div
                                className="bg-warm-300/85"
                                initial={{ width: 0 }}
                                animate={{ width: `${stablePct}%` }}
                                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
                            />
                            <m.div
                                className="bg-red-400/85 rounded-r-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${decliningPct}%` }}
                                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.35 }}
                            />
                        </div>

                        <div className="flex items-center justify-between gap-2 mb-5">
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                                <span className="text-[12px] text-warm-600">
                                    <span className="font-medium tabular-nums text-warm-900"><AnimatedNumber value={improving} /></span> improving
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-warm-300" />
                                <span className="text-[12px] text-warm-600">
                                    <span className="font-medium tabular-nums text-warm-900"><AnimatedNumber value={stable} /></span> stable
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                <span className="text-[12px] text-warm-600">
                                    <span className="font-medium tabular-nums text-warm-900"><AnimatedNumber value={declining} /></span> declining
                                </span>
                            </div>
                        </div>

                        {topMover && (
                            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-primary-50/55">
                                <div className="w-8 h-8 rounded-2xl bg-primary-100/80 flex items-center justify-center flex-shrink-0">
                                    <IconTrendingUp size={14} className="text-primary-700" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium text-primary-800 truncate tracking-[-0.005em]">
                                        Top Mover: {topMover.name}
                                    </p>
                                    <p className="text-[11px] text-primary-600">
                                        {topMover.delta} {topMover.delta === 1 ? 'stroke' : 'strokes'} lower avg
                                    </p>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <EmptyState
                        variant="compact"
                        icon={<IconActivity size={24} />}
                        title="No player trends yet"
                        description="Trends appear after players submit 6+ rounds."
                    />
                )}
            </div>
        </div>
    );
});
