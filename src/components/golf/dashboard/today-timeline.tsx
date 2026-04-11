'use client';

import { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconCalendar, IconMapPin, IconClock, IconArrowRight } from '@/components/icons';
import type { TodayEvent } from '@/app/golf/actions/dashboard-data';
import { formatTimeInTz, toDecimalHourInTz, getCurrentDecimalHourInTz } from '@/lib/utils/timezone';

// ============================================================================
// EVENT TYPE CONFIG
// ============================================================================

const EVENT_TYPE_CONFIG: Record<string, { dot: string; bg: string; text: string; label: string; border: string }> = {
    practice: { dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', label: 'Practice', border: 'border-blue-200' },
    tournament: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', label: 'Tournament', border: 'border-amber-200' },
    qualifier: { dot: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700', label: 'Qualifier', border: 'border-violet-200' },
    meeting: { dot: 'bg-warm-400', bg: 'bg-warm-50', text: 'text-warm-600', label: 'Meeting', border: 'border-warm-200' },
    travel: { dot: 'bg-cyan-500', bg: 'bg-cyan-50', text: 'text-cyan-700', label: 'Travel', border: 'border-cyan-200' },
    workout: { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', label: 'Workout', border: 'border-orange-200' },
    game: { dot: 'bg-primary-500', bg: 'bg-primary-50', text: 'text-primary-700', label: 'Match', border: 'border-primary-200' },
    scrimmage: { dot: 'bg-teal-500', bg: 'bg-teal-50', text: 'text-teal-700', label: 'Scrimmage', border: 'border-teal-200' },
    class: { dot: 'bg-indigo-500', bg: 'bg-indigo-50', text: 'text-indigo-700', label: 'Class', border: 'border-indigo-200' },
    other: { dot: 'bg-warm-400', bg: 'bg-warm-50', text: 'text-warm-600', label: 'Event', border: 'border-warm-200' },
};

function getTimeUntil(iso: string, now: number): string {
    const diff = new Date(iso).getTime() - now;
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
    timezone?: string;
}

export function TodayTimeline({ events, role, timezone }: TodayTimelineProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const nowRef = useRef<HTMLDivElement>(null);

    // Defer time-dependent values to client to avoid hydration mismatch
    // (server time differs from browser time; Intl.DateTimeFormat timezone also differs)
    const [mounted, setMounted] = useState(false);
    const [currentHour, setCurrentHour] = useState(12); // stable default for SSR
    const [nowTs, setNowTs] = useState(0);
    const [tz, setTz] = useState(timezone || 'UTC');

    useEffect(() => {
        // Resolve browser timezone on mount (Intl may differ between server and client)
        const resolvedTz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        setTz(resolvedTz);
        setMounted(true);
        setCurrentHour(getCurrentDecimalHourInTz(resolvedTz));
        setNowTs(Date.now());
    }, [timezone]);

    // Re-render every 60s to move the "now" indicator
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentHour(getCurrentDecimalHourInTz(tz));
            setNowTs(Date.now());
        }, 60_000);
        return () => clearInterval(interval);
    }, [tz]);

    // Scroll to the current time indicator on mount
    useEffect(() => {
        if (nowRef.current && scrollRef.current) {
            const container = scrollRef.current;
            const indicator = nowRef.current;
            const offset = indicator.offsetLeft - container.clientWidth / 3;
            container.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
        }
    }, [mounted]);

    // Determine the visible hour range (6 AM to 10 PM, or expand to fit events)
    const { startHour, endHour, hours } = useMemo(() => {
        let minH = 6;
        let maxH = 22;
        for (const e of events) {
            const s = toDecimalHourInTz(e.start_time, tz);
            const end = e.end_time ? toDecimalHourInTz(e.end_time, tz) : s + 1;
            if (s < minH) minH = Math.floor(s);
            if (end > maxH) maxH = Math.ceil(end);
        }
        const hrs: number[] = [];
        for (let h = minH; h <= maxH; h++) hrs.push(h);
        return { startHour: minH, endHour: maxH, hours: hrs };
    }, [events, tz]);

    const totalHours = endHour - startHour;
    // Each hour = 120px for a nice spread on desktop, tighter on mobile
    const HOUR_WIDTH = 120;
    const totalWidth = totalHours * HOUR_WIDTH;
    const TIMELINE_HEIGHT = 160;

    const hourToX = (h: number) => ((h - startHour) / totalHours) * totalWidth;
    const nowX = hourToX(currentHour);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!scrollRef.current) return;
        const scrollAmount = 200;
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            scrollRef.current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        }
    }, []);

    if (events.length === 0) {
        return (
            <div className={cn(
                'relative overflow-clip rounded-2xl h-full min-h-[200px]',
                'glass-premium',
            )}>
                <div className="relative z-10 flex flex-col items-center justify-center text-center p-8 md:p-10 h-full">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-50 to-emerald-50 flex items-center justify-center mb-5">
                        <IconCalendar size={26} className="text-primary-600/70" />
                    </div>
                    <p className="text-[15px] font-semibold text-warm-900 tracking-tight mb-1.5">Clear schedule today</p>
                    <p className="text-xs leading-relaxed text-warm-500 mb-6 max-w-[240px]">No events scheduled. Use this time for practice or recovery.</p>
                    <Link
                        href="/golf/dashboard/calendar"
                        className={cn(
                            'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium',
                            'bg-primary-50 hover:bg-primary-100 border border-primary-200/60',
                            'text-primary-700 transition-all duration-200'
                        )}
                    >
                        <IconCalendar size={13} />
                        View Full Calendar
                    </Link>
                </div>
            </div>
        );
    }

    // Find the first upcoming event index
    const nextIdx = events.findIndex(e => toDecimalHourInTz(e.start_time, tz) > currentHour);

    return (
        <div
            role="region"
            aria-label="Today's schedule"
            aria-roledescription="timeline"
            className={cn(
                'relative overflow-clip rounded-2xl',
                'glass-premium',
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                    <h3 className="text-[13px] font-semibold text-warm-600 tracking-wide">
                        Today&apos;s Schedule
                    </h3>
                    <span className="px-1.5 py-0.5 rounded-md bg-warm-100 text-label font-medium text-warm-500 tabular-nums">
                        {events.length}
                    </span>
                </div>
                <Link
                    href="/golf/dashboard/calendar"
                    className="flex items-center gap-1 text-label text-warm-400 hover:text-primary-600 transition-colors"
                >
                    Calendar <IconArrowRight size={10} />
                </Link>
            </div>

            {/* ── Mobile: compact event list ── */}
            <div className="md:hidden px-4 pb-4 space-y-2">
                {events.map((event, i) => {
                    const config = EVENT_TYPE_CONFIG[event.event_type] ?? EVENT_TYPE_CONFIG['other']!;
                    const startH = toDecimalHourInTz(event.start_time, tz);
                    const endH = event.end_time ? toDecimalHourInTz(event.end_time, tz) : startH + 1;
                    const isPast = endH < currentHour;
                    const isCurrent = currentHour >= startH && currentHour <= endH;
                    const isNext = !isCurrent && i === nextIdx;

                    return (
                        <m.div
                            key={event.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            className={cn(
                                'rounded-xl border p-3.5 transition-all duration-200',
                                config.border,
                                isCurrent
                                    ? 'bg-white/90 shadow-[0_2px_12px_rgba(0,0,0,0.08)] ring-1 ring-primary-200'
                                    : isPast
                                        ? 'bg-warm-50/60 opacity-50'
                                        : 'bg-white/70',
                            )}
                        >
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                                <p className={cn(
                                    'text-sm font-semibold',
                                    isCurrent ? 'text-warm-900' : 'text-warm-700'
                                )}>
                                    {event.title}
                                </p>
                                {isCurrent && (
                                    <span className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-primary-50 text-primary-600 border border-primary-200/60">
                                        <span className="w-1 h-1 rounded-full bg-primary-500 animate-pulse" />
                                        Live
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-3 text-xs text-warm-400">
                                <span className="flex items-center gap-1 tabular-nums">
                                    <IconClock size={11} className="text-warm-300" />
                                    {formatTimeInTz(event.start_time, tz)}
                                    {event.end_time && ` – ${formatTimeInTz(event.end_time, tz)}`}
                                </span>
                                {event.location && (
                                    <span className="flex items-center gap-1 truncate">
                                        <IconMapPin size={11} className="text-warm-300" />
                                        <span className="truncate">{event.location}</span>
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-2 mt-2">
                                <span className={cn(
                                    'px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider',
                                    config.bg, config.text
                                )}>
                                    {config.label}
                                </span>
                                {isNext && (
                                    <span className="text-xs text-primary-600 font-medium tabular-nums">
                                        {getTimeUntil(event.start_time, nowTs)}
                                    </span>
                                )}
                                {role === 'coach' && event.rsvp_total !== undefined && (
                                    <span className="text-xs text-warm-400 tabular-nums">
                                        {event.rsvp_yes}/{event.rsvp_total} confirmed
                                    </span>
                                )}
                            </div>
                        </m.div>
                    );
                })}
            </div>

            {/* ── Desktop: horizontal scrolling timeline ── */}
            <div
                ref={scrollRef}
                tabIndex={0}
                role="group"
                aria-label="Timeline events, use left and right arrow keys to scroll"
                onKeyDown={handleKeyDown}
                className="hidden md:block overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-warm-200 scrollbar-track-transparent pb-4 px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 rounded-lg"
            >
                <div className="relative" style={{ width: totalWidth + 40, height: TIMELINE_HEIGHT }}>
                    {/* Hour markers */}
                    <div className="flex items-end" style={{ width: totalWidth + 40, height: 28 }}>
                        {hours.map(h => {
                            const x = hourToX(h);
                            const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
                            return (
                                <div key={h} className="absolute" style={{ left: x + 20 }}>
                                    <span className="text-micro font-medium text-warm-300 tabular-nums whitespace-nowrap">
                                        {label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Tick lines */}
                    {hours.map(h => {
                        const x = hourToX(h);
                        return (
                            <div
                                key={`tick-${h}`}
                                className="absolute top-7 bottom-0"
                                style={{ left: x + 20, width: 1 }}
                            >
                                <div className="w-px h-full bg-warm-100" />
                            </div>
                        );
                    })}

                    {/* Current time indicator — only shown after hydration to avoid mismatch */}
                    <div
                        ref={nowRef}
                        className={cn('absolute top-6 bottom-0 z-20', !mounted && 'invisible')}
                        style={{ left: nowX + 20 }}
                    >
                        <div className="relative">
                            <div className="w-2 h-2 rounded-full bg-primary-500 shadow-[0_0_8px_rgba(22,163,74,0.4)] -translate-x-[3px]" />
                            <div className="w-px h-[calc(100%+40px)] bg-primary-500/40" style={{ marginLeft: 0 }} />
                        </div>
                    </div>

                    {/* Event blocks */}
                    {(() => {
                        const ROW_HEIGHT = 76;
                        const ROW_GAP = 4;
                        const rowEnds: number[] = [];
                        const eventRows: number[] = [];
                        for (const event of events) {
                            const sH = toDecimalHourInTz(event.start_time, tz);
                            const eH = event.end_time ? toDecimalHourInTz(event.end_time, tz) : sH + 1;
                            const leftPx = hourToX(sH);
                            const widthPx = Math.max((eH - sH) / totalHours * totalWidth, 100);
                            const rightPx = leftPx + widthPx;

                            let assignedRow = -1;
                            for (let r = 0; r < rowEnds.length; r++) {
                                if (leftPx >= (rowEnds[r] ?? 0) + 4) {
                                    assignedRow = r;
                                    break;
                                }
                            }
                            if (assignedRow === -1) {
                                assignedRow = rowEnds.length;
                                rowEnds.push(0);
                            }
                            rowEnds[assignedRow] = rightPx;
                            eventRows.push(assignedRow);
                        }
                        const totalRows = Math.max(rowEnds.length, 1);
                        const containerHeight = totalRows * ROW_HEIGHT + (totalRows - 1) * ROW_GAP;

                        return (
                            <div className="relative" style={{ marginTop: 8, paddingLeft: 20, paddingRight: 20, height: containerHeight }}>
                                {events.map((event, i) => {
                                    const config = EVENT_TYPE_CONFIG[event.event_type] ?? EVENT_TYPE_CONFIG['other']!;
                                    const sH = toDecimalHourInTz(event.start_time, tz);
                                    const eH = event.end_time ? toDecimalHourInTz(event.end_time, tz) : sH + 1;
                                    const leftPx = hourToX(sH);
                                    const widthPx = Math.max((eH - sH) / totalHours * totalWidth, 100);
                                    const row = eventRows[i] ?? 0;
                                    const topPx = row * (ROW_HEIGHT + ROW_GAP);

                                    const isPast = eH < currentHour;
                                    const isCurrent = currentHour >= sH && currentHour <= eH;
                                    const isNext = !isCurrent && i === nextIdx;

                                    const eventLabel = `${event.title}, ${config.label}, ${formatTimeInTz(event.start_time, tz)}${event.end_time ? ` to ${formatTimeInTz(event.end_time, tz)}` : ''}${event.location ? `, ${event.location}` : ''}${isCurrent ? ', happening now' : ''}`;

                                    return (
                                        <m.div
                                            key={event.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                            className="absolute"
                                            style={{ left: leftPx, width: widthPx, top: topPx }}
                                            aria-label={eventLabel}
                                        >
                                            <div className={cn(
                                                'rounded-xl border p-3 transition-all duration-200 h-full',
                                                config.border,
                                                isCurrent
                                                    ? cn('bg-white/90 shadow-[0_2px_12px_rgba(0,0,0,0.08)]', 'ring-1 ring-primary-200')
                                                    : isPast
                                                        ? 'bg-warm-50/60 opacity-50'
                                                        : 'bg-white/70 hover:bg-white/90 hover:shadow-sm',
                                            )}>
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <p className={cn(
                                                        'text-[12px] font-semibold truncate',
                                                        isCurrent ? 'text-warm-900' : 'text-warm-700'
                                                    )}>
                                                        {event.title}
                                                    </p>
                                                    {isCurrent && (
                                                        <span className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-primary-50 text-primary-600 border border-primary-200/60">
                                                            <span className="w-1 h-1 rounded-full bg-primary-500 animate-pulse" />
                                                            Live
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 text-micro text-warm-400">
                                                    <span className="flex items-center gap-1 tabular-nums">
                                                        <IconClock size={9} className="text-warm-300" />
                                                        {formatTimeInTz(event.start_time, tz)}
                                                        {event.end_time && ` – ${formatTimeInTz(event.end_time, tz)}`}
                                                    </span>
                                                    {event.location && (
                                                        <span className="flex items-center gap-1 truncate">
                                                            <IconMapPin size={9} className="text-warm-300" />
                                                            <span className="truncate">{event.location}</span>
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 mt-1.5">
                                                    <span className={cn(
                                                        'px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider',
                                                        config.bg, config.text
                                                    )}>
                                                        {config.label}
                                                    </span>
                                                    {isNext && (
                                                        <span className="text-micro text-primary-600 font-medium tabular-nums">
                                                            {getTimeUntil(event.start_time, nowTs)}
                                                        </span>
                                                    )}
                                                    {role === 'coach' && event.rsvp_total !== undefined && (
                                                        <span className="text-micro text-warm-400 tabular-nums">
                                                            {event.rsvp_yes}/{event.rsvp_total} confirmed
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </m.div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}
