'use client';

import { CalendarDays, ChevronLeft, ChevronRight, Plus, Rss, TriangleAlert } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ChCalendarData } from '../../data/calendar';
import { Badge } from '../../ui/Badge';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/Button';
import { PhoneIconAction } from '../../ui/PhoneBar';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Segmented } from '../../ui/Segmented';
import { Swap } from '../../ui/Swap';
import { haptic } from '../../lib/haptics';
import { EventPeek } from './peek';
import { PhoneTop, useBackFromMore } from '../../shell/phone-chrome';
import { addDays, dayNum, dowOf, fmtHour, isMajor, monthCells, monthName, weekDates, yearOf, type ChCalEvent, type ChCalPerson, type ChCalView } from './model';
import { AgendaView, eventTitle, type ChNow } from './views';

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
  onView,
  onOpen,
  onNew,
  onSubscribe,
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
  onView: (view: ChCalView, anchor: string) => void;
  onOpen: (id: string, date: string) => void;
  onNew: (date: string) => void;
  onSubscribe: () => void;
}) {
  const coach = data.role === 'coach';
  const backFromMore = useBackFromMore();
  const pv = phoneViewOf(view);
  const setPv = (v: ChCalPhoneView) => onView(desktopViewOf(v), anchor);

  return (
    <main className="ch-calm" aria-label="Calendar">
      {coach ? (
        <PhoneTop start title="Calendar" action={<PhoneIconAction icon={Plus} label="New event" onClick={() => onNew(anchor)} />} />
      ) : (
        <PhoneTop title="Calendar" back={{ label: 'More', onBack: backFromMore }} action={<PhoneIconAction icon={Rss} label="Add to calendar app" onClick={onSubscribe} />} />
      )}
      {/* The page's opening (the Ledger kit's PageIntro, as an h2: the bar holds the page's h1): the year and the team's
          timezone engraved over the month, and the view switch beside it. */}
      <header className="ch-intro ch-calm-head">
        <span className="ch-intro__eyebrow ch-num">
          {yearOf(anchor)} · {data.zoneLabel}
        </span>
        <span className="ch-intro__row">
          <h2 className="ch-intro__title ch-calm-title">{monthName(anchor)}</h2>
          <span className="ch-intro__action">
            <Segmented<ChCalPhoneView>
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
          </span>
        </span>
      </header>
      {notices}
      {!data.eventsError && (
        <SectionBoundary surface={`calendar.phone.${pv}`} label="The calendar" code="CH-6210">
          {/* CH-6604: Day, Month and List settle in as the switch moves (base in, quick out); instant with reduced motion. */}
          <Swap swapKey={pv}>
            {pv === 'day' && <DayView anchor={anchor} events={events} people={people} now={now} flagged={flagged} selId={selId} onDay={(d) => onView('day', d)} onOpen={onOpen} coach={coach} range={data.range} />}
            {pv === 'month' && <MonthGrid anchor={anchor} events={events} now={now} onPick={(d) => onView('day', d)} />}
            {pv === 'list' &&
              (events.some((e) => e.date >= now.date) ? (
                <AgendaView events={events} people={people} now={now} selId={selId} flagged={flagged} onSelect={(id) => onOpen(id, events.find((e) => e.id === id)?.date ?? anchor)} />
              ) : (
                <EmptyState code="CH-6301" icon={CalendarDays} title="Nothing on the calendar in this range" body={coach ? 'Events you publish show here, with replies and overlaps.' : 'Events your coach invites you to show here.'} />
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
  range,
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
  /** The dates the page has loaded: a neighbouring day outside it waits for its week instead of reading as empty. */
  range: { from: string; to: string };
}) {
  const week = weekDates(anchor);
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
      <DayPage date={date} events={events} people={people} now={now} flagged={flagged} selId={selId} onOpen={onOpen} coach={coach} onWeek={live ? (dir) => ((swiped.current = false), onDay(addDays(anchor, 7 * dir))) : undefined} />
    );
  return (
    <>
      <ol className="ch-calm-week" aria-label="This week" style={{ ['--ch-calm-at' as string]: Math.max(0, week.indexOf(anchor)) }}>
        {week.map((d) => {
          const n = events.filter((e) => e.date === d && e.type !== 'class' && e.type !== 'busy').length;
          return (
            <li key={d}>
              <button
                type="button"
                className={'ch-calm-week__d' + (d === anchor ? ' is-on' : '') + (d === now.date ? ' is-today' : '')}
                aria-pressed={d === anchor}
                aria-label={`${dowOf(d)} ${dayNum(d)}${d === now.date ? ', today' : ''}, ${n} ${n === 1 ? 'event' : 'events'}`}
                onClick={() => {
                  if (d !== anchor) haptic('select');
                  swiped.current = false;
                  onDay(d);
                }}
              >
                <em>{dowOf(d).slice(0, 1)}</em>
                <b className="ch-num">{dayNum(d)}</b>
                <i>
                  {Array.from({ length: Math.min(3, n) }, (_, j) => (
                    <span key={j} />
                  ))}
                </i>
              </button>
            </li>
          );
        })}
      </ol>
      <DayPager
        anchor={anchor}
        onSettle={(d) => {
          swiped.current = true;
          onDay(d);
        }}
        prev={page(addDays(anchor, -1), false)}
        next={page(addDays(anchor, 1), false)}
      >
        <Swap swapKey={day.slide} kind="slide" dir={day.dir} className="ch-calm-dayswap">
          {page(anchor, true)}
        </Swap>
      </DayPager>
    </>
  );
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
  onWeek,
}: {
  date: string;
  events: ChCalEvent[];
  people: Map<string, ChCalPerson>;
  now: ChNow;
  flagged: Set<string>;
  selId: string | null;
  onOpen: (id: string, date: string) => void;
  coach: boolean;
  onWeek?: (dir: 1 | -1) => void;
}) {
  const anchor = date;
  const list = events.filter((e) => e.date === anchor).sort(byStart);
  const team = list.filter((e) => e.type !== 'class' && e.type !== 'busy');
  const blocks = list.length - team.length;
  const isToday = anchor === now.date;
  // The now line sits before the first timed event still to start; when the rest of the day is behind us it closes the list.
  const nowAt = isToday ? list.findIndex((e) => !e.allDay && (e.start ?? 0) > now.hour) : -1;
  const nowLast = isToday && nowAt === -1 && list.some((e) => !e.allDay && (e.end ?? 0) <= now.hour);
  const nowLine = (
    <div className="ch-calm-now" role="separator" aria-label={`Now, ${fmtHour(now.hour)}`}>
      <span className="ch-num">{fmtHour(now.hour)}</span>
    </div>
  );
  return (
    <>
      <div className="ch-calm-dayk">
        <h3>
          {dowOf(anchor)} {dayNum(anchor)} {monthName(anchor)}
        </h3>
        <span className="ch-num">
          {team.length} {team.length === 1 ? 'event' : 'events'}
          {blocks > 0 ? ` · ${blocks} ${coach ? (blocks === 1 ? 'class or busy block' : 'classes or busy blocks') : blocks === 1 ? 'class' : 'classes'}` : ''}
        </span>
        {/* P006 D5, B2: the week before and after without going through Month; the same reach a swipe gives, for
            VoiceOver and the keyboard. */}
        {onWeek && (
          <span className="ch-calm-weekstep">
            <IconButton icon={ChevronLeft} label="Previous week" size="sm" onClick={() => (haptic('select'), onWeek(-1))} />
            <IconButton icon={ChevronRight} label="Next week" size="sm" onClick={() => (haptic('select'), onWeek(1))} />
          </span>
        )}
      </div>
      {!list.length ? (
        <EmptyState compact code="CH-6308" icon={CalendarDays} title="Nothing on this day" body={coach ? 'Tap + to plan something for the team.' : 'Events your coach invites you to show here.'} />
      ) : (
        <ol className="ch-calm-agenda">
          {list.map((e, i) => {
            const past = isToday && !e.allDay && (e.end ?? 0) <= now.hour;
            const live = isToday && !e.allDay && (e.start ?? 0) <= now.hour && (e.end ?? 0) > now.hour;
            const block = e.type === 'class' || e.type === 'busy';
            return (
              <li key={`${e.id}${e.date}`}>
                {i === nowAt && nowLine}
                {/* P006-C3: a hold lifts the event's card with its actions; the row keeps its tap. */}
                <EventPeek e={e} coach={coach} people={people} onOpen={() => onOpen(e.id, e.date)}>
                  <button
                    type="button"
                    className={`ch-calm-ev is-${e.type}` + (past ? ' is-past' : '') + (live ? ' is-live' : '') + (selId === e.id ? ' is-sel' : '') + (e.cancelled ? ' is-cancelled' : '')}
                    aria-label={`${eventTitle(e, people)}, ${e.allDay ? 'all day' : `${fmtHour(e.start!)} to ${fmtHour(e.end!)}`}${flagged.has(e.id) ? ', schedule overlap' : ''}${e.cancelled ? ', cancelled' : ''}`}
                    onClick={() => {
                      haptic('select');
                      onOpen(e.id, e.date);
                    }}
                  >
                    <span className="ch-calm-ev__t ch-num">
                      {e.allDay ? 'All day' : fmtHour(e.start!, false)}
                      {!e.allDay && <em>{fmtHour(e.end!, false)}</em>}
                    </span>
                    {/* The day's rail, as on Home's Today: a dot in the event's colour, a ring for time that isn't free. */}
                    <span className="ch-calm-ev__rail" aria-hidden="true">
                      <i className={`ch-dot-${e.type}`} />
                    </span>
                    <span className="ch-calm-ev__b">
                      <b>{eventTitle(e, people)}</b>
                      <span>{block ? (e.busyOnly ? 'Busy' : e.type === 'busy' ? 'Your busy time' : [e.title, e.location].filter(Boolean).join(' · ')) : (e.location ?? '')}</span>
                    </span>
                    {flagged.has(e.id) ? (
                      <span className="ch-calm-ev__w" aria-hidden="true">
                        <Icon icon={TriangleAlert} size={13} />
                      </span>
                    ) : live ? (
                      <Badge tone="accent">Now</Badge>
                    ) : null}
                  </button>
                </EventPeek>
                {nowLast && i === list.length - 1 && nowLine}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

/**
 * P006-B2: the day pages left and right with the phone's own momentum (scroll-snap, one day a page), and a selection
 * tick once a page settles. Three pages: the day before, the day, the day after. When a neighbour settles, the page
 * becomes that day and the pager recentres on it, so the swipe never runs out. The neighbours are clipped to the day's
 * height and are inert: only the day on show is read or tapped.
 */
function DayPager({ anchor, onSettle, prev, next, children }: { anchor: string; onSettle: (date: string) => void; prev: ReactNode; next: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mid = useRef<HTMLElement | null>(null);
  const settle = useRef(onSettle);
  settle.current = onSettle;
  // On the day, before paint: a recentre never shows as a jump.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.clientWidth;
  }, [anchor]);
  useEffect(() => {
    const el = ref.current;
    const m = mid.current;
    if (!el || !m) return;
    const fit = new ResizeObserver(() => el.style.setProperty('--ch-calm-page-h', `${m.offsetHeight}px`));
    fit.observe(m);
    let timer = 0;
    const done = () => {
      window.clearTimeout(timer);
      const w = el.clientWidth;
      if (!w) return;
      const i = Math.round(el.scrollLeft / w);
      if (i === 1 || Math.abs(el.scrollLeft - i * w) > 2) return;
      haptic('select');
      settle.current(addDays(anchorRef.current, i === 0 ? -1 : 1));
    };
    // `scrollend` where WebKit has it; else the scroll going quiet.
    const quiet = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(done, 140);
    };
    const hasEnd = 'onscrollend' in window;
    el.addEventListener(hasEnd ? 'scrollend' : 'scroll', hasEnd ? done : quiet, { passive: true });
    return () => {
      fit.disconnect();
      window.clearTimeout(timer);
      el.removeEventListener(hasEnd ? 'scrollend' : 'scroll', hasEnd ? done : quiet);
    };
  }, []);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  return (
    <div className="ch-calm-pager" ref={ref}>
      <section className="ch-calm-page is-side" inert aria-hidden="true">
        {prev}
      </section>
      <section className="ch-calm-page" ref={mid} aria-label="The day">
        {children}
      </section>
      <section className="ch-calm-page is-side" inert aria-hidden="true">
        {next}
      </section>
    </div>
  );
}

/** The month as a compact grid: a dot for a day with events, a dark one for a competition. A day opens its Day view. */
function MonthGrid({ anchor, events, now, onPick }: { anchor: string; events: ChCalEvent[]; now: ChNow; onPick: (date: string) => void }) {
  const cells = monthCells(anchor);
  return (
    <section className="ch-calm-month" aria-label={`${monthName(anchor)}`}>
      <div className="ch-calm-month__h" aria-hidden="true">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="ch-calm-month__g">
        {cells.map(({ date, out }) => {
          const evs = events.filter((e) => e.date === date && e.type !== 'class' && e.type !== 'busy');
          const major = evs.some((e) => isMajor(e.type));
          return (
            <button
              key={date}
              type="button"
              className={'ch-calm-month__c' + (out ? ' is-out' : '') + (date === now.date ? ' is-today' : '') + (date === anchor ? ' is-on' : '')}
              aria-label={`${dowOf(date)} ${dayNum(date)} ${monthName(date)}: ${evs.length ? `${evs.length} ${evs.length === 1 ? 'event' : 'events'}${major ? ', competition' : ''}` : 'no events'}`}
              onClick={() => {
                haptic('select');
                onPick(date);
              }}
            >
              <b className="ch-num">{dayNum(date)}</b>
              {major ? <i className="is-major" /> : evs.length ? <i /> : null}
            </button>
          );
        })}
      </div>
      <div className="ch-calm-month__lg" aria-hidden="true">
        <span>
          <i className="is-major" />
          Competition
        </span>
        <span>
          <i />
          Practice or meeting
        </span>
      </div>
    </section>
  );
}
