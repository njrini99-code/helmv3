'use client';

import { memo } from 'react';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconTrendingUp, IconActivity } from '@/components/icons';
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
            'relative overflow-clip',
            'bg-glass-subtle backdrop-blur-glass-prominent',
            'border border-white/30 rounded-2xl',
            'shadow-glass p-5'
        )}>
            {/* Glow */}
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-primary-500/8 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <IconActivity size={14} className="text-primary-600" />
                        <h3 className="text-sm font-semibold text-warm-500 uppercase tracking-wider">
                            Team Pulse
                        </h3>
                    </div>
                    <span className="text-xs text-warm-400 tabular-nums">
                        {roundsThisWeek} rounds this week
                    </span>
                </div>

                {/* Segmented bar */}
                {total > 0 ? (
                    <>
                        <div
                            role="img"
                            aria-label={`Team pulse: ${improving} improving, ${stable} stable, ${declining} declining`}
                            className="h-3 rounded-full overflow-hidden flex bg-warm-100 mb-3"
                        >
                            <m.div
                                className="bg-primary-500 rounded-l-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${improvingPct}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                            />
                            <m.div
                                className="bg-warm-300"
                                initial={{ width: 0 }}
                                animate={{ width: `${stablePct}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                            />
                            <m.div
                                className="bg-red-400 rounded-r-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${decliningPct}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.3 }}
                            />
                        </div>

                        {/* Legend */}
                        <div className="flex items-center justify-between gap-2 mb-4">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />
                                <span className="text-xs text-warm-600">
                                    <span className="font-bold tabular-nums">{improving}</span> improving
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-warm-300" />
                                <span className="text-xs text-warm-600">
                                    <span className="font-bold tabular-nums">{stable}</span> stable
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                                <span className="text-xs text-warm-600">
                                    <span className="font-bold tabular-nums">{declining}</span> declining
                                </span>
                            </div>
                        </div>

                        {/* Top mover callout */}
                        {topMover && (
                            <div className={cn(
                                'flex items-center gap-2.5 px-3 py-2.5 rounded-xl',
                                'bg-primary-50/60 border border-primary-100/50'
                            )}>
                                <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                                    <IconTrendingUp size={14} className="text-primary-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-primary-800 truncate">
                                        Top Mover: {topMover.name}
                                    </p>
                                    <p className="text-label text-primary-600">
                                        {topMover.delta} {topMover.delta === 1 ? 'stroke' : 'strokes'} lower avg
                                    </p>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center text-center py-6">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-50 to-emerald-50 flex items-center justify-center mb-3">
                            <IconActivity size={22} className="text-primary-600/70" />
                        </div>
                        <p className="text-[15px] font-semibold text-warm-900 tracking-tight mb-1">No player trends yet</p>
                        <p className="text-xs leading-relaxed text-warm-500 max-w-[240px]">Trends appear after players submit 6+ rounds</p>
                    </div>
                )}
            </div>
        </div>
    );
});
