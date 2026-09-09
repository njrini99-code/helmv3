'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendarHero — the calendar's toolbar
 * ----------------------------------------------------------------------------
 * Two quiet rows on the shared chrome material, sticky under the app header:
 *
 *   1. Title row   — month/date context (the title is also the date-jump:
 *                    it opens a CalendarSurface to pick any day) · "Today"
 *                    (only when away from it) · More (phone) · the ONE
 *                    primary action.
 *   2. Control row — the explicit view selector (Fairway Segmented) and the
 *                    previous / next pair. At xl+ (a wide desktop stage) the secondary actions sit
 *                    here as quiet ghost pills instead of behind More.
 *   3. Day strip   — Day view only, where a week of nearby dates is exactly
 *                    the scope on screen. Agenda, Week and Month do not show
 *                    a strip that would misstate their scope.
 *
 * Material comes from the shell (`fw-glass-chrome`, with its own opaque
 * reduced-transparency fallback). Nothing here glows, washes or floats on
 * its own; every control is the shared Fairway primitive in its shared state.
 *
 * The player's "Respond" action is NOT a header CTA — it is rendered by the
 * parent as a contextual row beside the schedule, when there is something to
 * respond to.
 *
 * HYDRATION: `nowRef` is parent-owned (serverNow→nowRef). "Today" uses
 * isSameDay(focusDate, nowRef), never Date.now().
 * ========================================================================== */

import * as React from 'react';
import { endOfWeek, format, isSameDay, isSameMonth, isSameYear, startOfWeek } from 'date-fns';
import { CalendarSurface } from '@/components/fairway/calendar';
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  ScanLine,
} from 'lucide-react';
import { Button, IconButton, PopoverPanel, PressTarget, Segmented } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayDayStrip } from './FairwayDayStrip';

export type FairwayCalendarViewId = 'day' | 'week' | 'month' | 'agenda';

export interface FairwayCalendarHeroProps {
  focusDate: Date;
  selectedDate: Date;
  /** All visible events — for the day-strip density dots. */
  events: CalendarEvent[];
  /** Parent-owned reference "now" (seeded from serverNow). */
  nowRef: Date;
  /** Whether the active lens is the single Day view (shows the day strip). */
  isDayView?: boolean;
  isCoach: boolean;
  /** Prev / Next / Today. */
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  /** Day-strip tap. */
  onSelectDate: (date: Date) => void;
  /** Team timezone for the day-strip density dots (IANA). */
  teamTimezone?: string | null;
  /**
   * The coach's ONE primary action (create). Players get no header CTA —
   * their response action lives beside the schedule (see parent).
   */
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
  /** View switcher. */
  view?: FairwayCalendarViewId;
  viewOptions?: ReadonlyArray<{ value: FairwayCalendarViewId; label: string }>;
  onViewChange?: (view: FairwayCalendarViewId) => void;
  /** Secondary actions. Each is omitted from the UI when absent. */
  onFindTime?: () => void;
  onConflicts?: () => void;
  onSubscribe?: () => void;
  onAvailability?: () => void;
  /** Real count of open conflicts (badge on the Conflicts action). `null` = unknown. */
  conflictCount?: number | null;
}

/** Week view names its exact scope: "Sep 6 – 12, 2026", "Aug 30 – Sep 5, 2026",
 *  "Dec 27, 2026 – Jan 2, 2027". Sunday-start weeks, matching the parent's
 *  visible window. */
export function weekRangeTitle(focusDate: Date): string {
  const start = startOfWeek(focusDate, { weekStartsOn: 0 });
  const end = endOfWeek(focusDate, { weekStartsOn: 0 });
  if (!isSameYear(start, end)) return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
  if (!isSameMonth(start, end)) return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  return `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`;
}

export function FairwayCalendarHero({
  focusDate,
  selectedDate,
  events,
  nowRef,
  isDayView = false,
  isCoach,
  onNavigate,
  onSelectDate,
  onPrimaryAction,
  primaryActionLabel,
  teamTimezone = null,
  view,
  viewOptions,
  onViewChange,
  onFindTime,
  onConflicts,
  onSubscribe,
  onAvailability,
  conflictCount = null,
}: FairwayCalendarHeroProps) {
  const title = isDayView
    ? format(focusDate, 'EEEE, MMMM d')
    : view === 'week'
      ? weekRangeTitle(focusDate)
      : format(focusDate, 'MMMM yyyy');
  const focusIsToday = isSameDay(focusDate, nowRef);
  const ctaLabel = primaryActionLabel ?? 'New event';
  const hasViews = Boolean(view && viewOptions && onViewChange);
  const conflictsLabel =
    conflictCount && conflictCount > 0 ? `Conflicts (${conflictCount})` : 'Conflicts';
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [jumpOpen, setJumpOpen] = React.useState(false);
  const secondaryActions = [
    onFindTime && isCoach
      ? { key: 'find', label: 'Find a time', icon: <ScanLine className="h-4 w-4" aria-hidden />, run: onFindTime }
      : null,
    onConflicts
      ? { key: 'conflicts', label: conflictsLabel, icon: <AlertTriangle className="h-4 w-4" aria-hidden />, run: onConflicts }
      : null,
    onAvailability
      ? { key: 'availability', label: 'My availability', icon: <CalendarClock className="h-4 w-4" aria-hidden />, run: onAvailability }
      : null,
    onSubscribe
      ? { key: 'subscribe', label: 'Add to phone', icon: <CalendarPlus className="h-4 w-4" aria-hidden />, run: onSubscribe }
      : null,
  ].filter((action): action is NonNullable<typeof action> => action !== null);

  // Agenda is month-scoped (its period is the title's month), so it steps by month too.
  const stepLabel = view === 'month' || view === 'agenda' ? 'month' : view === 'day' ? 'day' : 'week';

  return (
    <section
      aria-label="Calendar controls"
      className={cn(
        // Sticky under the app header + hub sub-nav (AppShell publishes both
        // offsets). The shell's chrome material keeps scrolled rows from
        // reading as ghost text behind the controls.
        'fw-glass-chrome sticky top-[calc(var(--golf-mobile-header-offset)+var(--fw-hub-subnav-offset,0px))] z-[9]',
        '-mx-4 border-b px-4 pb-2.5 pt-2 md:-mx-6 md:px-6 md:pb-3 md:pt-3',
      )}
    >
      {/* Row 1 — title and the primary action. */}
      <div className="flex items-center gap-1.5 md:gap-2">
        <h1 className="min-w-0 flex-1 truncate font-fw-sans text-h3 font-semibold text-text-primary md:text-h2">
          {/* The title is the date-jump: same headless CalendarSurface the
              DatePicker uses, in a PopoverPanel, behind an unstyled press. */}
          <PopoverPanel
            open={jumpOpen}
            onOpenChange={setJumpOpen}
            side="bottom"
            align="start"
            width="auto"
            ariaLabel="Jump to a date"
            trigger={
              <PressTarget className="-mx-1.5 inline-flex max-w-full items-center gap-1 rounded-fw-sm px-1.5 py-0.5 text-left hover:bg-surface-sunken">
                <span className="truncate">{title}</span>
                <span className="sr-only">, jump to a date</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
              </PressTarget>
            }
          >
            <CalendarSurface
              mode="single"
              selected={selectedDate}
              defaultMonth={focusDate}
              today={nowRef}
              size="cozy"
              glass={false}
              className="border-0 shadow-none"
              onSelect={(date) => {
                if (!date) return;
                onSelectDate(date);
                setJumpOpen(false);
              }}
            />
          </PopoverPanel>
        </h1>
        {!focusIsToday ? (
          <Button variant="ghost" size="sm" onClick={() => onNavigate('today')}>
            Today
          </Button>
        ) : null}
        {secondaryActions.length > 0 ? (
          <PopoverPanel
            open={moreOpen}
            onOpenChange={setMoreOpen}
            side="bottom"
            align="end"
            width="sm"
            ariaLabel="More calendar actions"
            trigger={
              <IconButton variant="ghost" size="sm" aria-label="More calendar actions" className="xl:hidden">
                <MoreHorizontal />
              </IconButton>
            }
          >
            {secondaryActions.map((action) => (
              <PopoverPanel.Item
                key={action.key}
                onClick={() => {
                  setMoreOpen(false);
                  action.run();
                }}
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-text-tertiary">{action.icon}</span>
                  {action.label}
                </span>
              </PopoverPanel.Item>
            ))}
          </PopoverPanel>
        ) : null}
        {onPrimaryAction && isCoach ? (
          <>
            <IconButton
              variant="primary"
              size="md"
              aria-label={ctaLabel}
              onClick={onPrimaryAction}
              className="md:hidden"
            >
              <Plus />
            </IconButton>
            <Button
              variant="primary"
              size="md"
              onClick={onPrimaryAction}
              leftIcon={<Plus />}
              className="hidden md:inline-flex"
            >
              {ctaLabel}
            </Button>
          </>
        ) : null}
      </div>

      {/* Row 2 — the explicit view selector and stepping. */}
      <div className="mt-2 flex items-center gap-2">
        {hasViews ? (
          <div className="min-w-0 flex-1 md:flex-none">
            <Segmented<FairwayCalendarViewId>
              options={viewOptions!}
              value={view!}
              onValueChange={onViewChange!}
              size="sm"
              fullWidth
              quiet
              aria-label="Calendar view"
              className="md:w-auto"
            />
          </div>
        ) : null}
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton variant="ghost" size="sm" aria-label={`Previous ${stepLabel}`} onClick={() => onNavigate('prev')}>
            <ChevronLeft />
          </IconButton>
          <IconButton variant="ghost" size="sm" aria-label={`Next ${stepLabel}`} onClick={() => onNavigate('next')}>
            <ChevronRight />
          </IconButton>
        </div>
        {secondaryActions.length > 0 ? (
          <div className="ml-auto hidden items-center gap-1 xl:flex">
            {secondaryActions.map((action) => (
              <Button key={action.key} variant="ghost" size="sm" leftIcon={action.icon} onClick={action.run}>
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Row 3 — Day view only: the week around the selected day. */}
      {isDayView ? (
        <div className="mt-2">
          <FairwayDayStrip
            focusDate={focusDate}
            selectedDate={selectedDate}
            events={events}
            nowRef={nowRef}
            teamTimezone={teamTimezone}
            onSelectDate={onSelectDate}
            onSwipe={(direction) => onNavigate(direction)}
          />
        </div>
      ) : null}
    </section>
  );
}
