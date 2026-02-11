'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconCalendar, IconMapPin, IconUsers } from '@/components/icons';
import type { TodayEvent } from '@/app/golf/actions/dashboard-data';

// ============================================================================
// EVENT TYPE CONFIG
// ============================================================================

const EVENT_TYPE_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
    practice: { dot: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400' },
    tournament: { dot: 'bg-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400' },
    qualifier: { dot: 'bg-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-400' },
    meeting: { dot: 'bg-slate-400', bg: 'bg-slate-400/10', text: 'text-slate-400' },
    travel: { dot: 'bg-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-400' },
    workout: { dot: 'bg-orange-500', bg: 'bg-orange-500/10', text: 'text-orange-400' },
    other: { dot: 'bg-slate-400', bg: 'bg-slate-400/10', text: 'text-slate-400' },
};

function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatEventType(type: string): string {
    const map: Record<string, string> = {
        practice: 'Practice', tournament: 'Tournament', qualifier: 'Qualifier',
        meeting: 'Meeting', travel: 'Travel', workout: 'Workout', other: 'Event',
        game: 'Match', scrimmage: 'Scrimmage', class: 'Class',
    };
    return map[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

// ============================================================================
// COMPONENT
// ============================================================================

interface TodayTimelineProps {
    events: TodayEvent[];
    role: 'coach' | 'player';
}

export function TodayTimeline({ events, role }: TodayTimelineProps) {
    // Find which event is "current" (happening now)
    const currentEventIndex = useMemo(() => {
        const now = Date.now();
        return events.findIndex(e => {
            const start = new Date(e.start_time).getTime();
            const end = e.end_time ? new Date(e.end_time).getTime() : start + 3600000;
            return now >= start && now <= end;
        });
    }, [events]);

    if (events.length === 0) {
        return (
            <div
                className={cn(
                    'relative overflow-hidden rounded-2xl',
                    'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
                    'border border-white/10',
                    'shadow-[0_8px_32px_rgba(0,0,0,0.25)]',
                    'p-6 md:p-8'
                )}
            >
                {/* Ambient glows */}
                <div className="absolute right-0 top-0 w-40 h-40 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="absolute left-0 bottom-0 w-32 h-32 bg-blue-500/8 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center justify-center text-center py-4">
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                        <IconCalendar size={22} className="text-white/50" />
                    </div>
                    <p className="text-white/70 text-sm font-medium mb-1">Nothing scheduled today</p>
                    <p className="text-white/40 text-xs mb-4">Enjoy the free time or plan ahead</p>
                    <Link
                        href="/golf/dashboard/calendar"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white/70 hover:text-white transition-colors"
                    >
                        <IconCalendar size={12} />
                        View Calendar
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-2xl',
                'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
                'border border-white/10',
                'shadow-[0_8px_32px_rgba(0,0,0,0.25)]',
                'p-5 md:p-6'
            )}
        >
            {/* Ambient glows */}
            <div className="absolute right-0 top-0 w-40 h-40 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute left-0 bottom-0 w-32 h-32 bg-blue-500/8 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider">
                        Today&apos;s Schedule
                    </h3>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-xs font-medium text-white/60 tabular-nums">
                        {events.length}
                    </span>
                </div>
                <Link
                    href="/golf/dashboard/calendar"
                    className="text-xs text-white/40 hover:text-white/60 transition-colors"
                >
                    Full calendar →
                </Link>
            </div>

            {/* Timeline */}
            <div className="relative z-10">
                {/* Vertical line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gradient-to-b from-primary-500/40 via-primary-500/20 to-transparent" />

                <div className="space-y-3">
                    {events.map((event, i) => {
                        const colors = (EVENT_TYPE_COLORS[event.event_type] ?? EVENT_TYPE_COLORS['other'])!;
                        const isCurrent = i === currentEventIndex;
                        const isPast = new Date(event.end_time || event.start_time).getTime() < Date.now();

                        return (
                            <m.div
                                key={event.id}
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                className={cn(
                                    'relative flex items-start gap-3 pl-7',
                                    isPast && !isCurrent && 'opacity-50'
                                )}
                            >
                                {/* Timeline dot */}
                                <div className="absolute left-0 top-2">
                                    {isCurrent ? (
                                        <div className="relative">
                                            <div className={cn('w-[22px] h-[22px] rounded-full', colors.dot, 'opacity-100')} />
                                            <div className={cn('absolute inset-0 w-[22px] h-[22px] rounded-full', colors.dot, 'animate-ping opacity-30')} />
                                        </div>
                                    ) : (
                                        <div className={cn('w-[22px] h-[22px] rounded-full border-2 border-slate-600', isPast ? 'bg-slate-700' : 'bg-slate-800')} />
                                    )}
                                </div>

                                {/* Event card */}
                                <div className={cn(
                                    'flex-1 rounded-xl p-3',
                                    isCurrent
                                        ? 'bg-white/10 border border-white/15'
                                        : 'bg-white/5 border border-white/5 hover:bg-white/8 transition-colors'
                                )}>
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <div className="flex-1 min-w-0">
                                            <p className={cn(
                                                'text-sm font-semibold truncate',
                                                isCurrent ? 'text-white' : 'text-white/80'
                                            )}>
                                                {event.title}
                                            </p>
                                        </div>
                                        <span className={cn(
                                            'flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider',
                                            colors.bg, colors.text
                                        )}>
                                            {formatEventType(event.event_type)}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-3 text-xs text-white/50">
                                        <span className="tabular-nums">
                                            {formatTime(event.start_time)}
                                            {event.end_time && ` – ${formatTime(event.end_time)}`}
                                        </span>
                                        {event.location && (
                                            <span className="flex items-center gap-1 truncate">
                                                <IconMapPin size={10} />
                                                <span className="truncate">{event.location}</span>
                                            </span>
                                        )}
                                    </div>

                                    {/* RSVP badge (coach) or status (player) */}
                                    {role === 'coach' && event.rsvp_total !== undefined && (
                                        <div className="flex items-center gap-1.5 mt-2">
                                            <IconUsers size={11} className="text-white/40" />
                                            <span className="text-[11px] text-white/50 tabular-nums">
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
                            </m.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
