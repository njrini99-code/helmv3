'use client';

import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Ellipsis, Plus, Rss, TriangleAlert, X } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ChCalendarData } from '../../data/calendar';
import { Badge } from '../../ui/Badge';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { Button, IconButton } from '../../ui/Button';
import { PhoneIconAction } from '../../ui/PhoneBar';
import { MenuSheet } from '../../ui/ContextMenu';
import type { MenuItem } from '../../ui/Menu';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { ScrollPager } from '../../ui/ScrollPager';
import { Segmented } from '../../ui/Segmented';
import { Swap } from '../../ui/Swap';
import { WeekStrip, type WeekStripDay } from '../../ui/WeekStrip';
import { haptic } from '../../lib/haptics';
import { useChClock } from '../../lib/use-clock';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { claimTouch } from '../../lib/touch-claim';
import type { PeekLift } from '../../ui/Peek';
import { DayTimeline, flipFrom, rectsOf, usePhoneDayDrag } from './day-timeline';
import type { ChMoveTarget } from './drag-model';
import { EventPeek } from './peek';
import { MarkBadge, MovedAwayRow, useRowMark } from './change-note';
import type { ChMovedAway } from './change-view';
import { useMarkReader } from '../../lib/use-change-marks';
import { PhoneTop } from '../../shell/phone-chrome';
import { addDays, dayNum, dowOf, fmtHour, monthKey, monthName, playerReplyNeeded, rangeLabel, startLabel, weekDates, yearOf, type ChCalEvent, type ChCalPerson, type ChCalView } from './model';
import { AgendaView, eventTitle, type ChNow } from './views';
import { roundLabel } from './round-label';
import { MonthGrid } from './month';
import { plural, pluralWord } from '../../lib/plural';

/** The phone's three views (board: Day, Month, List); the desktop's week is the phone's Day. */
export type ChCalPhoneView = 'day' | 'month' | 'list';
export const phoneViewOf = (v: ChCalView): ChCalPhoneView => (v === 'month' ? 'month' : v === 'agenda' ? 'list' : 'day');
const desktopViewOf = (v: ChCalPhoneView): ChCalView => (v === 'month' ? 'month' : v === 'list' ? 'agenda' : 'day');

const byStart = (a: ChCalEvent, b: ChCalEvent) => (a.allDay ? -1 : (a.start ?? 0)) - (b.allDay ? -1 : (b.start ?? 0));

/**
 * Calendar on the phone (v2, design/handoff/Coach - Calendar - Mobile.html,
 * m-cal.jsx): the month and a Day, Month or List switch; Day is the week
 * strip and that day's agenda with classes and the now line. An event opens
 * in a sheet (the desktop's detail panel, in `Calendar`). The coach's tab
 * root has New event in the top bar; a player reaches Calendar from More.
 * State, writes and dialogs stay in `Calendar`, shared with desktop.
 */
export function CalendarPhone({
  data,
  events,
  people,
  now,
  anchor,
  view,
  flagged,
  selId,
  notices,
  eventsNotice,
  onView,
  onStep,
  onOpen,
  onNew,
  onSubscribe,
  more,
  onMove,
}: {
  data: ChCalendarData;
  events: ChCalEvent[];
  people: Map<string, ChCalPerson>;
  now: ChNow;
  anchor: string;
  view: ChCalView;
  flagged: Set<string>;
  selId: string | null;
  /** The failed-read notices, shared with desktop. */
  notices: ReactNode;
  /** CH-6201, when the events didn't load: Day keeps its week strip and arrows and shows this where the day's list goes. */
  eventsNotice?: ReactNode;
  onView: (view: ChCalView, anchor: string) => void;
  /** The Calendar's step (its arrow keys): one day, week or month on from where the page is headed, with a tick. */
  onStep: (dir: 1 | -1) => void;
  onOpen: (id: string, date: string) => void;
  onNew: (date: string) => void;
  onSubscribe: () => void;
  /** The coach's More (row 81): desktop's items without Print (Add to calendar app, Add busy time, Overlaps). */
  more?: MenuItem[];
  /** P-4 4.7: a coach's held move from the phone Day (Calendar's `useHeldMoves`); players get none. */
  onMove?: (e: ChCalEvent, to: ChMoveTarget, kind: 'move' | 'resize') => void;
}) {
  const coach = data.role === 'coach';
  // A player's own class is titled without their name; their replies still owed are marked (P006, wave 7).
  const viewerId = coach ? null : data.viewerPlayerId;
  const pv = phoneViewOf(view);
  const setPv = (v: ChCalPhoneView) => onView(desktopViewOf(v), anchor);
  // B10.4: away from today (another day, or another month on Month), a Today key brings the page back, as on desktop.
  const away = pv === 'month' ? monthKey(anchor) !== monthKey(now.date) : anchor !== now.date;
  const goToday = () => {
    haptic('select');
    onView(view, now.date);
  };
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <main className="ch-calm" aria-label="Calendar">
      {coach ? (
        <PhoneTop start title="Calendar" action={<PhoneIconAction icon={Plus} label="New event" onClick={() => onNew(anchor)} />} />
      ) : (
        <PhoneTop title="Calendar" start action={<PhoneIconAction icon={Rss} label="Add to calendar app" onClick={onSubscribe} />} />
      )}
      {/* The page's opening (the Ledger kit's PageIntro, as an h2: the bar holds the page's h1): the year and the team's
          timezone engraved over the month, and the view switch beside it. */}
      <header className="ch-intro ch-calm-head">
        <span className="ch-intro__eyebrow ch-num">
          {yearOf(anchor)} · {data.zoneLabel}
        </span>
        {/* On the eyebrow's line at the right, so it takes no room when it comes and goes. */}
        {away && (
          <Button size="sm" variant="ghost" className="ch-calm-today" leftIcon={CalendarCheck} onClick={goToday} feel={null}>
            Today
          </Button>
        )}
        <span className="ch-intro__row">
          <h2 className="ch-intro__title ch-calm-title">{monthName(anchor)}</h2>
          <span className="ch-intro__action">
            <Segmented<ChCalPhoneView> redraws
              size="sm"
              label="View"
              value={pv}
              onChange={setPv}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'month', label: 'Month' },
                { value: 'list', label: 'List' },
              ]}
            />
            {/* Row 81: the coach's More, beside the view switch; the top bar keeps its one action, New event (B10.1). */}
            {!!more?.length && <IconButton icon={Ellipsis} label="More" className="ch-calm-more" onClick={() => setMoreOpen(true)} />}
          </span>
        </span>
      </header>
      {more && <MenuSheet open={moreOpen} title="Calendar" label="More" items={more} onClose={() => setMoreOpen(false)} />}
      {notices}
      {data.eventsError &&
        (pv === 'day' ? (
          <DayView anchor={anchor} events={[]} people={people} now={now} flagged={flagged} selId={selId} onDay={(d) => onView('day', d)} onOpen={onOpen} coach={coach} viewerId={viewerId} range={data.range} failed={eventsNotice} />
        ) : (
          eventsNotice
        ))}
      {!data.eventsError && (
        <SectionBoundary surface={`calendar.phone.${pv}`} label="The calendar" code="CH-6210">
          {/* CH-6604: Day, Month and List settle in as the switch moves (base in, quick out); instant with reduced motion. */}
          <Swap swapKey={pv} resize="instant">
            {pv === 'day' && <DayView anchor={anchor} events={events} people={people} now={now} flagged={flagged} selId={selId} onDay={(d) => onView('day', d)} onOpen={onOpen} coach={coach} viewerId={viewerId} range={data.range} onNew={onNew} onMove={coach ? onMove : undefined} movedAway={data.movedAway} />}
            {pv === 'month' && <MonthGrid anchor={anchor} events={events} now={now} onPick={(d) => onView('day', d)} onStep={onStep} onMonth={(d) => onView('month', d)} />}
            {pv === 'list' &&
              (events.some((e) => e.date >= now.date) ? (
                <AgendaView events={events} people={people} now={now} selId={selId} flagged={flagged} onSelect={(id) => onOpen(id, events.find((e) => e.id === id)?.date ?? anchor)} viewerId={viewerId} movedAway={data.movedAway} onOpenAt={onOpen} />
              ) : (
                <EmptyState code="CH-6301" icon={CalendarDays} title="Nothing on the calendar in this range" body={coach ? 'Events you publish show here, with any overlaps and replies.' : 'Events your coach invites you to show here.'} />
              ))}
          </Swap>
        </SectionBoundary>
      )}
    </main>
  );
}

/**
 * The week strip, then the chosen day's agenda: classes in their place, the now line on today. The chosen day is one
 * green plate that glides along the strip to the day you tap, and the day's agenda slides 12px the way the day went
 * (CH-6606). Both are instant with reduced motion and with Animations off (the duration tokens are zero there).
 */
function DayView({
  anchor,
  events,
  people,
  now,
  flagged,
  selId,
  onDay,
  onOpen,
  coach,
  viewerId,
  range,
  failed,
  onNew,
  movedAway,
  onMove,
}: {
  anchor: string;
  events: ChCalEvent[];
  people: Map<string, ChCalPerson>;
  now: ChNow;
  flagged: Set<string>;
  selId: string | null;
  onDay: (date: string) => void;
  onOpen: (id: string, date: string) => void;
  coach: boolean;
  /** The signed-in player (null for a coach): their own class titles, and the replies they still owe. */
  viewerId: string | null;
  /** New event on a day (coach): the empty day's action. */
  onNew?: (date: string) => void;
  /** The dates the page has loaded: a neighbouring day outside it waits for its week instead of reading as empty. */
  range: { from: string; to: string };
  /** The events didn't load (CH-6201): the strip and the week arrows still move the page, with no counts and no swipe,
   * and this notice stands where the day's list goes. */
  failed?: ReactNode;
  /** P-14: events that left a day for another; each is a quiet row on the day it left. */
  movedAway?: ChMovedAway[];
  onMove?: (e: ChCalEvent, to: ChMoveTarget, kind: 'move' | 'resize') => void;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  const reduced = useChReducedMotion();
  const hint = useDragHint();
  // P-4 4.7: the gesture's owner sits above the pager and the day's swap, so a day change mid-drag swaps what is drawn
  // and never unmounts the row the finger is on.
  const engine = usePhoneDayDrag({ root, events, coach: coach && !!onMove, anchor, reduced, onDrop: (e, to, kind) => onMove?.(e, to, kind), onDay, onLanded: hint.dismiss });
  const held = !!engine.lifted || engine.unfolded;
  const shown = engine.unfolded ? engine.day : anchor;
  const week = weekDates(shown);
  const stripDays = (dates: string[]): WeekStripDay[] =>
    dates.map((d) => {
      const n = events.filter((e) => e.date === d && e.type !== 'class' && e.type !== 'busy').length;
      // A player's reply still owed that day: one amber dot beside the day's own (wave 7).
      const reply = !failed && events.some((e) => e.date === d && playerReplyNeeded(e, viewerId, now));
      return {
        date: d,
        top: dowOf(d).slice(0, 1),
        num: dayNum(d),
        isToday: d === now.date,
        dots: failed ? 0 : n,
        flag: reply ? 'reply' : undefined,
        label: `${dowOf(d)} ${dayNum(d)}${d === now.date ? ', today' : ''}${failed ? '' : `, ${plural(n, 'event')}`}${reply ? ', needs your reply' : ''}`,
      };
    });
  // The day on show and the way it went: a later day comes in from the right, an earlier one from the left. A swipe has
  // already carried the day into place, so it keeps the slide's key and nothing slides twice (P006-B2).
  const swiped = useRef(false);
  const [day, setDay] = useState<{ key: string; dir: 1 | -1; slide: string }>({ key: anchor, dir: 1, slide: anchor });
  if (day.key !== anchor) setDay({ key: anchor, dir: anchor > day.key ? 1 : -1, slide: swiped.current ? day.slide : anchor });
  const page = (date: string, live: boolean) =>
    date < range.from || date > range.to ? (
      <div className="ch-calm-dayk is-waiting" aria-hidden="true">
        <h3>
          {dowOf(date)} {dayNum(date)} {monthName(date)}
        </h3>
      </div>
    ) : (
      <DayPage
        date={date}
        events={events}
        people={people}
        now={now}
        flagged={flagged}
        selId={selId}
        onOpen={onOpen}
        coach={coach}
        viewerId={viewerId}
        onWeek={live ? (dir) => ((swiped.current = false), onDay(addDays(anchor, 7 * dir))) : undefined}
        onNew={live ? onNew : undefined}
        liftFor={live && onMove ? engine.liftFor : undefined}
        onAdjust={live && onMove ? engine.adjust : undefined}
        liftedId={live ? (engine.lifted?.id ?? null) : null}
        hint={live && onMove && hint.show ? hint.dismiss : undefined}
        movedAway={movedAway}
      />
    );
  return (
    <div ref={root} className={'ch-calm-dayv' + (held ? ' is-held' : '') + (engine.unfolded ? ' is-unfolded' : '')}>
      <WeekStrip
        label="This week"
        days={stripDays(week)}
        selected={shown}
        frozen={held}
        dropDate={engine.over}
        onSelect={(d) => {
          if (d !== anchor) haptic('select');
          swiped.current = false;
          onDay(d);
        }}
        onPage={failed ? undefined : (dir) => ((swiped.current = false), onDay(addDays(anchor, 7 * dir)))}
        around={{ prev: stripDays(weekDates(addDays(shown, -7))), next: stripDays(weekDates(addDays(shown, 7))) }}
      />
      {failed ? (
        <DayPage date={anchor} events={[]} people={people} now={now} flagged={flagged} selId={selId} onOpen={onOpen} coach={coach} viewerId={viewerId} onWeek={(dir) => onDay(addDays(anchor, 7 * dir))} failed={failed} />
      ) : (
        <ScrollPager
          pageKey={anchor}
          className="ch-calm-pager"
          pageClassName="ch-calm-page"
          label="The day"
          frozen={held}
          onSettle={(dir) => {
            swiped.current = true;
            onDay(addDays(anchor, dir));
          }}
          prev={page(addDays(anchor, -1), false)}
          next={page(addDays(anchor, 1), false)}
        >
          <Swap swapKey={day.slide} kind="slide" dir={day.dir} className="ch-calm-dayswap">
            {page(anchor, true)}
          </Swap>
        </ScrollPager>
      )}
      <DayTimeline engine={engine} events={events} people={people} now={now} viewerId={viewerId} range={range} />
    </div>
  );
}

const HINT_KEY = 'ch-cal-drag-hint';

/** P-4 4.7.7 (OC-6): "Hold an event to move it." once per device, until the first drag or the close. */
function useDragHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(window.localStorage.getItem(HINT_KEY) !== 'done');
    } catch {
      setShow(false);
    }
  }, []);
  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(HINT_KEY, 'done');
    } catch {
      // A private window keeps no note: the hint simply comes back next time.
    }
  };
  return { show, dismiss };
}

/** One day's heading and agenda: classes in their place, the now line on today. `onWeek`: the day on show's week steps. */
function DayPage({
  date,
  events,
  people,
  now,
  flagged,
  selId,
  onOpen,
  coach,
  viewerId,
  onWeek,
  failed,
  onNew,
  movedAway,
  liftFor,
  onAdjust,
  liftedId = null,
  hint,
}: {
  date: string;
  events: ChCalEvent[];
  people: Map<string, ChCalPerson>;
  now: ChNow;
  flagged: Set<string>;
  selId: string | null;
  onOpen: (id: string, date: string) => void;
  coach: boolean;
  viewerId: string | null;
  onWeek?: (dir: 1 | -1) => void;
  /** The events didn't load: the heading and arrows stay, no count, and the notice in the list's place. */
  failed?: ReactNode;
  /** The day on show's New event (coach); the neighbouring days drawn beside it for a swipe have none. */
  onNew?: (date: string) => void;
  /** P-14: events that left a day for another; each is a quiet row on the day it left. */
  movedAway?: ChMovedAway[];
  /** P-4: a coach's movable row lifts on a hold (the day on show only). */
  liftFor?: (e: ChCalEvent) => PeekLift | undefined;
  /** P-4: the peek's "Adjust time". */
  onAdjust?: (e: ChCalEvent) => void;
  /** The row in hand. */
  liftedId?: string | null;
  /** The first-run hint is due: its close. */
  hint?: () => void;
}) {
  const clock = useChClock();
  const rowMark = useRowMark();
  const read = useMarkReader();
  const anchor = date;
  const list = events.filter((e) => e.date === anchor).sort(byStart);
  // The rows of events that left this day, at the time they started; not counted in the day's total, not part of the now line.
  const gone = (movedAway ?? []).filter((m) => m.fromDate === anchor && !read(m.changeId).got);
  // P-4 M12, M13: Undo, a refused or stale write, or another coach's move puts a row somewhere else in the
  // day; it glides there on smooth from where it stood. Measured against the list, so a scroll in between moves nothing.
  const reduced = useChReducedMotion();
  const agenda = useRef<HTMLOListElement | null>(null);
  const order = useRef('');
  const rowsAt = useRef<Map<string, DOMRect>>(new Map());
  useLayoutEffect(() => {
    const el = agenda.current;
    const key = list.map((e) => `${e.id}@${e.start}`).join(',');
    const was = order.current;
    order.current = key;
    if (!el) return void (rowsAt.current = new Map());
    const box = el.getBoundingClientRect();
    const before = rowsAt.current;
    const now = new Map([...rectsOf(el, ':scope > li[data-ev-id]')].map(([id, r]) => [id, new DOMRect(r.left - box.left, r.top - box.top, r.width, r.height)]));
    rowsAt.current = now;
    if (reduced || liftedId || !was || was === key) return;
    const from = new Map([...before].map(([id, r]) => [id, new DOMRect(r.left + box.left, r.top + box.top, r.width, r.height)]));
    flipFrom(el.querySelectorAll<HTMLElement>(':scope > li[data-ev-id]'), from, false);
  });
  const team = list.filter((e) => e.type !== 'class' && e.type !== 'busy');
  const blocks = list.length - team.length;
  const isToday = anchor === now.date;
  // The now line sits before the first timed event still to start; when the rest of the day is behind us it closes the list.
  const nowAt = isToday ? list.findIndex((e) => !e.allDay && (e.start ?? 0) > now.hour) : -1;
  const nowLast = isToday && nowAt === -1 && list.some((e) => !e.allDay && (e.end ?? 0) <= now.hour);
  const nowLine = (
    <div className="ch-calm-now" role="separator" aria-label={`Now, ${fmtHour(now.hour, true, clock)}`}>
      <span className="ch-num">{fmtHour(now.hour, true, clock)}</span>
    </div>
  );
  return (
    <>
      <div className="ch-calm-dayk">
        <h3>
          {dowOf(anchor)} {dayNum(anchor)} {monthName(anchor)}
        </h3>
        {/* An empty day has no "0 events": the empty state under it says so. */}
        {!failed && list.length > 0 && (
          <span className="ch-num">
            {team.length} {pluralWord(team.length, 'event')}
            {blocks > 0 ? ` · ${blocks} ${coach ? pluralWord(blocks, 'class or busy block', 'classes or busy blocks') : pluralWord(blocks, 'class', 'classes')}` : ''}
          </span>
        )}
        {/* P006 D5, B2: the week before and after without going through Month; the same reach a swipe gives, for
            VoiceOver and the keyboard. */}
        {onWeek && (
          <span className="ch-calm-weekstep">
            <IconButton icon={ChevronLeft} label="Previous week" size="sm" onClick={() => (haptic('select'), onWeek(-1))} />
            <IconButton icon={ChevronRight} label="Next week" size="sm" onClick={() => (haptic('select'), onWeek(1))} />
          </span>
        )}
      </div>
      {hint && !failed && list.some((e) => liftFor?.(e)) && (
        <p className="ch-calm-hint">
          <span>Hold an event to move it.</span>
          <IconButton icon={X} label="Dismiss" size="sm" className="ch-calm-hint__x" onClick={hint} />
        </p>
      )}
      {failed ? (
        failed
      ) : !list.length && !gone.length ? (
        <EmptyState
          compact
          code="CH-6308"
          icon={CalendarDays}
          title="Nothing on this day"
          body={coach ? 'Plan something for the team.' : 'Events your coach invites you to show here.'}
          action={
            coach && onNew ? (
              <Button size="sm" leftIcon={Plus} onClick={() => onNew(anchor)}>
                New event
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ol ref={agenda} className="ch-calm-agenda">
          {list.map((e, i) => {
            // The rows of events that left this day come before the first event that starts after them.
            const before = gone.filter((g) => (g.fromStart ?? -1) <= (e.allDay ? -1 : (e.start ?? 0)) && !list.slice(0, i).some((x) => (g.fromStart ?? -1) <= (x.allDay ? -1 : (x.start ?? 0))));
            const past = isToday && !e.allDay && (e.end ?? 0) <= now.hour;
            const live = isToday && !e.allDay && (e.start ?? 0) <= now.hour && (e.end ?? 0) > now.hour;
            const block = e.type === 'class' || e.type === 'busy';
            // The player's reply is still owed (and the server would take it): marked as Team Hub marks one.
            const reply = playerReplyNeeded(e, viewerId, now);
            const title = eventTitle(e, people, viewerId);
            const mark = rowMark(e);
            const lift = liftFor?.(e);
            return (
              <Fragment key={`${e.id}${e.date}`}>
                {before.map((g) => (
                  <li key={`away-${g.id}`}>
                    <MovedAwayRow g={g} variant="phone" onOpen={() => (haptic('select'), onOpen(g.id, g.toDate))} />
                  </li>
                ))}
              <li data-ev-id={e.id}>
                {i === nowAt && nowLine}
                {/* P006-C3: a hold lifts the event's card with its actions; the row keeps its tap. P-4: a coach's movable
                    row is picked up by the hold instead, and opens its peek when let go without moving. */}
                <EventPeek e={e} coach={coach} people={people} onOpen={() => onOpen(e.id, e.date)} lift={lift} onAdjust={onAdjust && (() => onAdjust(e))}>
                  <button
                    type="button"
                    className={`ch-calm-ev is-${e.type}` + (past ? ' is-past' : '') + (live ? ' is-live' : '') + (selId === e.id ? ' is-sel' : '') + (e.cancelled ? ' is-cancelled' : '') + (lift ? ' is-movable' : '') + (liftedId === e.id ? ' is-lifted' : '')}
                    onTouchStart={lift ? () => claimTouch('pending') : undefined}
                    aria-label={`${roundLabel(e, title).name}${roundLabel(e, title).spokenRound}, ${e.allDay ? 'all day' : e.span?.start != null ? rangeLabel(e, clock) : `${fmtHour(e.start!, true, clock)} to ${fmtHour(e.end!, true, clock)}`}${past ? ', ended' : ''}${flagged.has(e.id) ? ', schedule overlap' : ''}${reply ? ', needs your reply' : ''}${e.cancelled ? ', cancelled' : ''}${mark?.aria ?? ''}`}
                    // D-70: opening an event is plain navigation, so it is silent (F-0071).
                    onClick={() => onOpen(e.id, e.date)}
                  >
                    <span className="ch-calm-ev__t ch-num">
                      {startLabel(e, false, clock)}
                      {!e.allDay && <em>{fmtHour(e.end!, false, clock)}</em>}
                    </span>
                    {/* The day's rail, as on Home's Today: a dot in the event's colour, a ring for time that isn't free. */}
                    <span className="ch-calm-ev__rail" aria-hidden="true">
                      <i className={`ch-dot-${e.type}`} />
                    </span>
                    <span className="ch-calm-ev__b">
                      <b>{title}</b>
                      {/* A class's code is already in its title ("Priya · STAT 201"), so its line names only the room. */}
                      <span className={mark?.sub ? 'ch-calm-ev__sub' : undefined}>{mark?.sub ?? (block && e.busyOnly ? 'Busy' : e.type === 'busy' ? 'Your busy time' : [roundLabel(e, title).caption, e.location].filter(Boolean).join(' · '))}</span>
                    </span>
                    {reply ? (
                      // The reply is the action on this row; an overlap still reads in its label and on the event.
                      <Badge tone="warning">Reply</Badge>
                    ) : flagged.has(e.id) ? (
                      <span className="ch-calm-ev__w" aria-hidden="true">
                        <Icon icon={TriangleAlert} size={13} />
                      </span>
                    ) : e.cancelled ? (
                      <Badge tone="warning">Cancelled</Badge>
                    ) : mark ? (
                      // A live event that moved shows Moved, not Now, until Got it (P-14).
                      <MarkBadge change={mark.change} />
                    ) : live ? (
                      <Badge tone="accent">Now</Badge>
                    ) : null}
                  </button>
                </EventPeek>
                {nowLast && i === list.length - 1 && nowLine}
              </li>
              </Fragment>
            );
          })}
          {gone
            .filter((g) => !list.some((x) => (g.fromStart ?? -1) <= (x.allDay ? -1 : (x.start ?? 0))))
            .map((g) => (
              <li key={`away-${g.id}`}>
                <MovedAwayRow g={g} variant="phone" onOpen={() => (haptic('select'), onOpen(g.id, g.toDate))} />
              </li>
            ))}
        </ol>
      )}
    </>
  );
}
