'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconCalendar, IconMapPin, IconUsers, IconClock, IconArrowRight } from '@/components/icons';
import type { TodayEvent } from '@/app/golf/actions/dashboard-data';

// ============================================================================
// EVENT TYPE CONFIG
// ============================================================================

const EVENT_TYPE_CONFIG: Record<string, { dot: string; bg: string; text: string; label: string; accent: string }> = {
    practice: { dot: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-300', label: 'Practice', accent: 'border-l-blue-400' },
    tournament: { dot: 'bg-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-300', label: 'Tournament', accent: 'border-l-amber-400' },
    qualifier: { dot: 'bg-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-300', label: 'Qualifier', accent: 'border-l-violet-400' },
    meeting: { dot: 'bg-slate-400', bg: 'bg-slate-400/10', text: 'text-slate-400', label: 'Meeting', accent: 'border-l-slate-400' },
    travel: { dot: 'bg-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-300', label: 'Travel', accent: 'border-l-cyan-400' },
    workout: { dot: 'bg-orange-500', bg: 'bg-orange-500/10', text: 'text-orange-300', label: 'Workout', accent: 'border-l-orange-400' },
    game: { dot: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-300', label: 'Match', accent: 'border-l-emerald-400' },
    scrimmage: { dot: 'bg-teal-500', bg: 'bg-teal-500/10', text: 'text-teal-300', label: 'Scrimmage', accent: 'border-l-teal-400' },
    class: { dot: 'bg-indigo-500', bg: 'bg-indigo-500/10', text: 'text-indigo-300', label: 'Class', accent: 'border-l-indigo-400' },
    other: { dot: 'bg-slate-400', bg: 'bg-slate-400/10', text: 'text-slate-400', label: 'Event', accent: 'border-l-slate-400' },
};

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getTimeUntil(iso: string): string {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff < 0) return 'Now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return remainMins > 0 ? `in ${hrs}h ${remainMins}m` : `in ${hrs}h`;
}

// ============================================================================
// COMPONENT
// ============================================================================

interface TodayTimelineProps {
    events: TodayEvent[];
    role: 'coach' | 'player';
}

export function TodayTimeline({ events, role }: TodayTimelineProps) {
    const currentEventIndex = useMemo(() => {
        const now = Date.now();
        return events.findIndex(e => {
            const start = new Date(e.start_time).getTime();
            const end = e.end_time ? new Date(e.end_time).getTime() : start + 3600000;
            return now >= start && now <= end;
        });
    }, [events]);

    const nextEventIndex = useMemo(() => {
        if (currentEventIndex >= 0) return -1;
        const now = Date.now();
        return events.findIndex(e => new Date(e.start_time).getTime() > now);
    }, [events, currentEventIndex]);

    if (events.length === 0) {
        return (
            <div className={cn(
                'relative overflow-hidden rounded-2xl h-full min-h-[200px]',
                'bg-gradient-to-br from-[#0f1419] via-[#151d27] to-[#0f1419]',
                'border border-white/[0.06]',
                'shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
            )}>
                <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                    backgroundSize: '24px 24px'
                }} />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[280px] h-[120px] bg-primary-500/[0.06] rounded-full blur-[60px] pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center justify-center text-center p-6 md:p-10 h-full">
                    <div className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mb-4">
                        <IconCalendar size={20} className="text-white/30" />
                    </div>
                    <p className="text-white/60 text-sm font-medium mb-1">Clear schedule today</p>
                    <p className="text-white/30 text-xs mb-5 max-w-[220px]">No events scheduled. Use this time for practice or recovery.</p>
                    <Link
                        href="/golf/dashboard/calendar"
                        className={cn(
                            'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium',
                            'bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08]',
                            'text-white/60 hover:text-white/80 transition-all duration-200'
                        )}
                    >
                        <IconCalendar size={13} />
                        View Full Calendar
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className={cn(
            'relative overflow-hidden rounded-2xl h-full',
            'bg-gradient-to-br from-[#0f1419] via-[#151d27] to-[#0f1419]',
            'border border-white/[0.06]',
            'shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
        )}>
            <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                backgroundSize: '24px 24px'
            }} />
            <div className="absolute top-0 right-0 w-[200px] h-[160px] bg-primary-500/[0.04] rounded-full blur-[60px] -translate-y-1/3 translate-x-1/4 pointer-events-none" />

            <div className="relative z-10 p-5 md:p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
                        <h3 className="text-[13px] font-semibold text-white/80 tracking-wide">
                            Today&apos;s Schedule
                        </h3>
                        <span className="px-1.5 py-0.5 rounded-md bg-white/[0.06] text-[11px] font-medium text-white/40 tabular-nums border border-white/[0.05]">
                            {events.length}
                        </span>
                    </div>
                    <Link
                        href="/golf/dashboard/calendar"
                        className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/50 transition-colors"
                    >
                        Calendar <IconArrowRight size={10} />
                    </Link>
                </div>

                {/* Events */}
                <div className="space-y-2">
                    {events.map((event, i) => {
                        const config = EVENT_TYPE_CONFIG[event.event_type] ?? EVENT_TYPE_CONFIG['other']!;
                        const isCurrent = i === currentEventIndex;
                        const isNext = i === nextEventIndex;
                        const isPast = !isCurrent && new Date(event.end_time || event.start_time).getTime() < Date.now();

                        return (
                            <m.div
                                key={event.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                className={cn(
                                    'relative rounded-xl border-l-[3px] transition-all duration-200',
                                    config.accent,
                                    isCurrent
                                        ? 'bg-white/[0.08] border border-white/[0.1] border-l-[3px]'
                                        : isPast
                                            ? 'bg-white/[0.02] opacity-40'
                                            : 'bg-white/[0.03] hover:bg-white/[0.06]',
                                    'p-3.5'
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <p className={cn(
                                                'text-[13px] font-semibold truncate',
                                                isCurrent ? 'text-white' : 'text-white/70'
                                            )}>
                                                {event.title}
                                            </p>
                                            {isCurrent && (
                                                <span className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-primary-500/20 text-primary-400 border border-primary-500/20">
                                                    <span className="w-1 h-1 rounded-full bg-primary-400 animate-pulse" />
                                                    Live
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3 text-[11px] text-white/40">
                                            <span className="flex items-center gap-1 tabular-nums">
                                                <IconClock size={10} className="text-white/30" />
                                                {formatTime(event.start_time)}
                                                {event.end_time && ` – ${formatTime(event.end_time)}`}
                                            </span>
                                            {event.location && (
                                                <span className="flex items-center gap-1 truncate">
                                                    <IconMapPin size={10} className="text-white/30" />
                                                    <span className="truncate">{event.location}</span>
                                                </span>
                                            )}
                                        </div>

                                        {role === 'coach' && event.rsvp_total !== undefined && (
                                            <div className="flex items-center gap-1.5 mt-2">
                                                <IconUsers size={10} className="text-white/30" />
                                                <span className="text-[10px] text-white/40 tabular-nums">
                                                    {event.rsvp_yes}/{event.rsvp_total} confirmed
                                                </span>
                                            </div>
                                        )}
                                        {role === 'player' && event.my_status && (
                                            <div className="mt-2">
                                                <span className={cn(
                                                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                                                    event.my_status === 'attending' || event.my_status === 'yes'
                                                        ? 'bg-primary-500/20 text-primary-400'
                                                        : event.my_status === 'declined' || event.my_status === 'no'
                                                            ? 'bg-red-500/20 text-red-400'
                                                            : 'bg-amber-500/20 text-amber-400'
                                                )}>
                                                    {event.my_status === 'attending' || event.my_status === 'yes' ? 'Attending' :
                                                     event.my_status === 'declined' || event.my_status === 'no' ? 'Declined' : 'Pending'}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                        <span className={cn(
                                            'px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider',
                                            config.bg, config.text
                                        )}>
                                            {config.label}
                                        </span>
                                        {isNext && (
                                            <span className="text-[10px] text-primary-400/80 font-medium tabular-nums">
                                                {getTimeUntil(event.start_time)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </m.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
