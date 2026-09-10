'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendarHero — the calendar's masthead
 * ----------------------------------------------------------------------------
 * One native-feeling header on the shared chrome material, sticky under the
 * app bar and the hub sub-nav:
 *
 *   1. Title row   — the period as a large title: the month word with the year
 *                    quiet beside it, the exact range in Week, the day in Day.
 *                    The title is also the date-jump (a CalendarSurface in a
 *                    PopoverPanel). Right cluster: "Today" (only when away
 *                    from it, carrying today's number the way a calendar
 *                    glyph does) · More (below xl) · the ONE primary action
 *                    (from md up; on a phone the parent floats it above the
 *                    tab bar so the row breathes).
 *   2. Control row — the full-width Fairway Segmented in its shared depth
 *                    presentation (sunken track, floating thumb). Previous / next sit
 *                    beside it from md up. On a phone the period turns like a
 *                    page — the schedule below swipes — the way iOS Calendar,
 *                    Fantastical and Google Calendar all do it, so the
 *                    switcher keeps the whole row and nothing is squeezed.
 *   3. Day strip   — Day view only, where a week of nearby dates is exactly
 *                    the scope on screen.
 *
 * The masthead measures itself and publishes `--fw-calendar-hero-h` on the
 * page column so the schedule's sticky day headings pin exactly beneath it.
 * A range fetch in flight is a 2px line along the masthead's bottom edge
 * (`busy`), not a banner between the header and the list.
 *
 * Material is the frost bar recipe — `fw-frost fw-frost-bar` (globals.css,
 * "FAIRWAY FROST": `.fw-frost-bar` is the edge-to-edge floating-toolbar tier,
 * a rim on its foot only, no top/side border). `.fw-frost` carries the
 * reduced-transparency, no-backdrop-filter and forced-colors fallbacks, so
 * nothing extra is needed here. Nothing here glows, washes or floats on its
 * own; every control is the shared Fairway primitive in its shared state.
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
import { motion } from 'framer-motion';
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
import { Button, IconButton, PopoverPanel, PressTarget, Segmented, Toolbar } from '@/components/fairway';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayDayStrip } from './FairwayDayStrip';
import surfaces from './CalendarSurfaces.module.css';

export type FairwayCalendarViewId = 'day' | 'week' | 'month' | 'agenda';

/** The CSS custom property the masthead publishes on its host column. */
export const CALENDAR_HERO_HEIGHT_VAR = '--fw-calendar-hero-h';

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
  /** A range fetch is in flight: a thin progress line along the bottom edge. */
  busy?: boolean;
}

/** Week view names its exact scope, split so the year can sit quiet:
 *  "Sep 6 – 12" + ", 2026"; "Aug 30 – Sep 5" + ", 2026"; a week that crosses
 *  the year keeps both years in the main run ("Dec 27, 2026 – Jan 2, 2027").
 *  Sunday-start weeks, matching the parent's visible window. */
export function weekRangeTitleParts(focusDate: Date): { main: string; quiet: string } {
  const start = startOfWeek(focusDate, { weekStartsOn: 0 });
  const end = endOfWeek(focusDate, { weekStartsOn: 0 });
  if (!isSameYear(start, end)) {
    return { main: `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`, quiet: '' };
  }
  const main = isSameMonth(start, end)
    ? `${format(start, 'MMM d')} – ${format(end, 'd')}`
    : `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
  return { main, quiet: `, ${format(end, 'yyyy')}` };
}

export function weekRangeTitle(focusDate: Date): string {
  const { main, quiet } = weekRangeTitleParts(focusDate);
  return `${main}${quiet}`;
}

/** The little calendar page the "Today" control carries — today's number
 *  under a thick top rule, the way the system calendar glyph draws it. */
function TodayGlyph({ day }: { day: number }) {
  return (
    <span
      aria-hidden
      className="grid h-[18px] w-[18px] place-items-center rounded-sm border-[1.5px] border-t-[4px] border-current pt-px text-eyebrow font-bold leading-none tracking-normal tabular-nums"
    >
      {day}
    </span>
  );
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
  busy = false,
}: FairwayCalendarHeroProps) {
  const reduceMotion = useReducedMotionGuard();
  // The separator lives in the main run (a trailing space), not at the head of
  // the quiet span: accessible-name computation drops a nested span's leading
  // whitespace, which would announce "July2026".
  const title = isDayView
    ? { main: format(focusDate, 'EEEE, MMMM d'), quiet: '', short: format(focusDate, 'EEE, MMM d') }
    : view === 'week'
      ? weekRangeTitleParts(focusDate)
      : { main: `${format(focusDate, 'MMMM')} `, quiet: format(focusDate, 'yyyy') };
  const titleText = `${title.main}${title.quiet}`;
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
  // Day steps by a WEEK, not a day: FairwayCalendar's navigate() routes both
  // Day and Week through addDays(d, dir * 7) because the day-strip is the
  // single-day picker and these arrows turn the page. The label has to match
  // what the button does -- an AT user cannot see the strip to infer it.
  const stepLabel = view === 'month' || view === 'agenda' ? 'month' : 'week';

  // Publish the masthead's height on the host column so the schedule's sticky
  // day headings can pin exactly under it (the strip in Day view changes it).
  const sectionRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const section = sectionRef.current;
    const host = section?.parentElement;
    if (!section || !host) return;
    const publish = () => host.style.setProperty(CALENDAR_HERO_HEIGHT_VAR, `${section.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === 'undefined') return () => host.style.removeProperty(CALENDAR_HERO_HEIGHT_VAR);
    const observer = new ResizeObserver(publish);
    observer.observe(section);
    return () => {
      observer.disconnect();
      host.style.removeProperty(CALENDAR_HERO_HEIGHT_VAR);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-label="Calendar controls"
      className={cn(
        // One composed bar — sticky under the app header + hub sub-nav
        // (AppShell publishes both offsets), on the shared sticky tier so it
        // stacks correctly against the rest of the chrome ladder. MATTE, not
        // frost: a backdrop-filter that sits over the scrolling stage is
        // re-blurred on every scroll frame on a phone (owner perf
        // requirement, 2026-09-10), so the bar is opaque with a foot hairline.
        // (`.fw-frost-static`, the blur-free frost look, replaces this once
        // it lands in globals.css.)
        'sticky top-[calc(var(--golf-mobile-header-offset)+var(--fw-hub-subnav-offset,0px))] z-[var(--fw-z-sticky)]',
        'border-b border-border-subtle bg-surface',
        // Edge-to-edge geometry: the masthead sits ON the list, the way a
        // native bar floats over content.
        '-mx-4 px-4 pb-2.5 pt-2 md:-mx-6 md:px-6 md:pb-3 md:pt-3',
        // From `md` up, `FairwayCalendarToolbar` (below) is the masthead —
        // ONE composed, frost `Toolbar` row rather than this matte bar's two
        // stacked lines. This phone bar stays mounted (not conditionally
        // rendered) so its own height-publishing effect and every pinned
        // test targeting it directly are unaffected; only visibility changes.
        'md:hidden',
      )}
    >
      {/* Row 1 — the period, and the primary action. */}
      <div className="flex min-h-11 items-center gap-1 md:gap-2">
        <h1 className="min-w-0 flex-1 truncate font-fw-sans text-h2 text-text-primary">
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
              <PressTarget className="-mx-2 inline-flex min-h-11 max-w-full items-center gap-1 rounded-fw-sm px-2 py-1 text-left [@media(hover:hover)]:hover:bg-surface-sunken">
                {/* Re-keyed on change so a new period settles in rather than
                    snapping — one quiet rise, no exit choreography. */}
                <motion.span
                  key={titleText}
                  initial={reduceMotion ? false : { opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="truncate"
                >
                  {'short' in title && title.short ? (
                    <>
                      {/* Phone: the short day beside a strip that already names
                          it; the full form stays the accessible text. */}
                      <span aria-hidden className="md:hidden">{title.short}</span>
                      <span className="sr-only md:not-sr-only">{title.main}</span>
                    </>
                  ) : (
                    title.main
                  )}
                  {title.quiet ? (
                    <span className="font-medium text-text-tertiary">{title.quiet}</span>
                  ) : null}
                </motion.span>
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
          // size="sm" already clears 44px here: Button's `sm` sizing sets
          // `[@media(pointer:coarse)]:min-h-[44px]` (controls/button.tsx —
          // sizeStyles.sm), so a touch pointer gets the full target without
          // the desktop-dense sizing changing.
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate('today')}
            leftIcon={<TodayGlyph day={nowRef.getDate()} />}
            className="px-2.5"
          >
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
              // size="sm" already clears 44px on touch: IconButton's `sm`
              // sizing sets `[@media(pointer:coarse)]:h-11 w-11` (controls/
              // button.tsx — iconSizeStyles.sm).
              <IconButton
                variant="secondary"
                size="sm"
                aria-label="More calendar actions"
                className="xl:hidden"
              >
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
          // From md up the primary action is a labelled button in the bar. On a
          // phone it floats above the tab bar instead (the parent renders that
          // one), so the title row keeps its air.
          <Button
            variant="primary"
            size="md"
            onClick={onPrimaryAction}
            leftIcon={<Plus />}
            className="hidden md:inline-flex"
          >
            {ctaLabel}
          </Button>
        ) : null}
      </div>

      {/* Row 2 — the explicit view selector; stepping from md up (a phone
          swipes the schedule instead, and the title jumps anywhere). */}
      <div className="mt-2 flex items-center gap-2">
        {hasViews ? (
          <div className="min-w-0 flex-1 md:flex-none">
            {/* Segmented already fires fwHaptic('selection') on every commit
                (controls/segmented.tsx, its ToggleGroup.Root onValueChange) —
                wrapping onViewChange here to add a second tick would
                double-fire the haptic on every view change, so onViewChange
                is passed straight through. */}
            <Segmented<FairwayCalendarViewId>
              options={viewOptions!}
              value={view!}
              onValueChange={onViewChange!}
              size="md"
              fullWidth
              aria-label="Calendar view"
              className="md:w-auto"
            />
          </div>
        ) : null}
        <div className="hidden shrink-0 items-center gap-0.5 md:flex">
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

      {/* A range fetch in flight: a hairline of progress along the bottom
          edge, where a native bar shows it, never a banner in the list. */}
      {busy ? (
        <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 -bottom-px h-[2px] overflow-hidden">
          <span className="sr-only">Loading events for this date range…</span>
          <span aria-hidden className={cn('block h-full w-1/3 rounded-full bg-accent-500', surfaces.indeterminate)} />
        </div>
      ) : null}
    </section>
  );
}

/* ============================================================================
 * FairwayCalendarToolbar — the desktop (>=768px) masthead
 * ----------------------------------------------------------------------------
 * `FairwayCalendarHero` above stays the phone masthead only (`md:hidden`,
 * matte on purpose — a backdrop-filter over the scrolling stage re-blurs on
 * every scroll frame on a phone). From `md` up the SAME period/view/action
 * controls this docs/design/fairway-facelift/screens/calendar.desktop.md
 * composition asks for live in ONE row built on the shared `Toolbar`
 * primitive instead: `material="frost"` + `sticky` is a primitive-level
 * combo the facelift's own enforcement ratchet (fairway-facelift-ratchets.
 * test.ts, guard 4) already allow-lists as supported and perf-tested, so
 * this masthead never hand-rolls sticky+blur itself.
 *
 * A GENUINELY SEPARATE component (not a second branch inside
 * `FairwayCalendarHero`): both mount unconditionally side by side (parent:
 * `FairwayCalendar`) and only their `className` (`md:hidden` / `hidden
 * md:flex`) picks which one paints. jsdom applies no breakpoints, so if this
 * were a second branch INSIDE `FairwayCalendarHero` its own pinned tests
 * (FairwayCalendarHero.test.tsx / .masthead.test.tsx, which render
 * `<FairwayCalendarHero>` directly) would see two <h1>s, two "Today"s, two
 * Segmenteds. As a separate export those tests never see this component at
 * all, so they're untouched. `FairwayCalendar.swipe.test.tsx` — which DOES
 * render the whole shell — reads the title via `getAllByRole('heading',
 * {level:1})[0]`, since both mastheads track the same `focusDate`/`view`
 * and always agree.
 *
 * The spec's desktop ascii also keeps a "ViewHeader" row above this Toolbar
 * carrying the h1. There is no ViewHeader on this route (grepped — none
 * exists), and adding one would also give the coach a second "New event"
 * button, contradicting the spec's own "ONE primary action." The h1 and the
 * primary action live in THIS row instead — a documented deviation, not an
 * omission (see this pass's report).
 *
 * The height-publishing that lets the stage's sticky day headings pin
 * exactly under the masthead is NOT done here (or duplicated in
 * `FairwayCalendarHero`): `FairwayCalendarHero`'s own effect measures ONLY
 * its own `<section>`, which is 0-height once `md:hidden` takes over, and
 * an independent effect here would race it on the same host column. Instead
 * `FairwayCalendar` wraps both mastheads in one ref'd column and publishes
 * ONE measurement of whichever is actually laid out — see the wrapper
 * comment at its call site.
 * ========================================================================== */

export interface FairwayCalendarToolbarProps {
  focusDate: Date;
  selectedDate: Date;
  nowRef: Date;
  isDayView?: boolean;
  isCoach: boolean;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onSelectDate: (date: Date) => void;
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
  view?: FairwayCalendarViewId;
  viewOptions?: ReadonlyArray<{ value: FairwayCalendarViewId; label: string }>;
  onViewChange?: (view: FairwayCalendarViewId) => void;
  onFindTime?: () => void;
  onConflicts?: () => void;
  onSubscribe?: () => void;
  onAvailability?: () => void;
  conflictCount?: number | null;
  busy?: boolean;
  className?: string;
}

/** The desktop `--golf-mobile-header-offset` + hub-sub-nav calc, shared
 *  verbatim with the phone bar's own `top-[calc(...)]` above so both clear
 *  the SAME fixed chrome, whichever is on screen. */
const DESKTOP_STICKY_TOP =
  'calc(var(--golf-mobile-header-offset) + var(--fw-hub-subnav-offset, 0px))';

export function FairwayCalendarToolbar({
  focusDate,
  selectedDate,
  nowRef,
  isDayView = false,
  isCoach,
  onNavigate,
  onSelectDate,
  onPrimaryAction,
  primaryActionLabel,
  view,
  viewOptions,
  onViewChange,
  onFindTime,
  onConflicts,
  onSubscribe,
  onAvailability,
  conflictCount = null,
  busy = false,
  className,
}: FairwayCalendarToolbarProps) {
  const [jumpOpen, setJumpOpen] = React.useState(false);
  const title = isDayView
    ? { main: format(focusDate, 'EEEE, MMMM d'), quiet: '' }
    : view === 'week'
      ? weekRangeTitleParts(focusDate)
      : { main: `${format(focusDate, 'MMMM')} `, quiet: format(focusDate, 'yyyy') };
  const focusIsToday = isSameDay(focusDate, nowRef);
  const ctaLabel = primaryActionLabel ?? 'New event';
  const hasViews = Boolean(view && viewOptions && onViewChange);
  const conflictsLabel =
    conflictCount && conflictCount > 0 ? `Conflicts (${conflictCount})` : 'Conflicts';
  // Same step semantics as the phone bar's prev/next (FairwayCalendar's own
  // navigate() routes Day through addDays(d, dir * 7) too).
  const stepLabel = view === 'month' || view === 'agenda' ? 'month' : 'week';

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
      ? { key: 'subscribe', label: 'Subscribe', icon: <CalendarPlus className="h-4 w-4" aria-hidden />, run: onSubscribe }
      : null,
  ].filter((action): action is NonNullable<typeof action> => action !== null);

  return (
    <div className={cn('relative', className)}>
      <Toolbar
        material="frost"
        sticky
        stickyTop={DESKTOP_STICKY_TOP}
        aria-label="Calendar controls"
        leading={
          <>
            <IconButton variant="ghost" size="sm" aria-label={`Previous ${stepLabel}`} onClick={() => onNavigate('prev')}>
              <ChevronLeft />
            </IconButton>
            <IconButton variant="ghost" size="sm" aria-label={`Next ${stepLabel}`} onClick={() => onNavigate('next')}>
              <ChevronRight />
            </IconButton>
            <h1 className="min-w-0 font-fw-sans text-h3 text-text-primary">
              <PopoverPanel
                open={jumpOpen}
                onOpenChange={setJumpOpen}
                side="bottom"
                align="start"
                width="auto"
                ariaLabel="Jump to a date"
                trigger={
                  <PressTarget className="-mx-2 inline-flex min-h-9 max-w-full items-center gap-1 whitespace-nowrap rounded-fw-sm px-2 py-1 text-left [@media(hover:hover)]:hover:bg-surface-sunken">
                    <span className="truncate">
                      {title.main}
                      {title.quiet ? <span className="font-medium text-text-tertiary">{title.quiet}</span> : null}
                    </span>
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
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigate('today')}
                leftIcon={<TodayGlyph day={nowRef.getDate()} />}
                className="px-2.5"
              >
                Today
              </Button>
            ) : null}
          </>
        }
        viewToggle={
          hasViews ? (
            <Segmented<FairwayCalendarViewId>
              options={viewOptions!}
              value={view!}
              onValueChange={onViewChange!}
              size="sm"
              aria-label="Calendar view"
            />
          ) : undefined
        }
        filters={
          secondaryActions.length > 0 ? (
            <>
              {secondaryActions.map((action) => (
                <Button key={action.key} variant="ghost" size="sm" leftIcon={action.icon} onClick={action.run}>
                  {action.label}
                </Button>
              ))}
            </>
          ) : undefined
        }
        primaryAction={
          onPrimaryAction && isCoach ? (
            <Button variant="primary" size="md" onClick={onPrimaryAction} leftIcon={<Plus />}>
              {ctaLabel}
            </Button>
          ) : undefined
        }
      />

      {/* Same progress-line convention as the phone bar. */}
      {busy ? (
        <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[2px] overflow-hidden rounded-b-card">
          <span className="sr-only">Loading events for this date range…</span>
          <span aria-hidden className={cn('block h-full w-1/3 rounded-full bg-accent-500', surfaces.indeterminate)} />
        </div>
      ) : null}
    </div>
  );
}
