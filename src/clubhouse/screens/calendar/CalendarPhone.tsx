'use client';

import { CalendarDays, Plus, Rss, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChCalendarData } from '../../data/calendar';
import { Badge } from '../../ui/Badge';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { PhoneIconAction } from '../../ui/PhoneBar';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Segmented } from '../../ui/Segmented';
import { haptic } from '../../lib/haptics';
import { PhoneTop, useBackFromMore } from '../../shell/phone-chrome';
import { dayNum, dowOf, fmtHour, isMajor, monthCells, monthName, weekDates, type ChCalEvent, type ChCalPerson, type ChCalView } from './model';
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
      <div className="ch-calm-head">
        <h2 className="ch-calm-title">{monthName(anchor)}</h2>
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
      </div>
      {notices}
      {!data.eventsError && (
        <SectionBoundary surface={`calendar.phone.${pv}`} label="The calendar" code="CH-6210">
          {pv === 'day' && <DayView anchor={anchor} events={events} people={people} now={now} flagged={flagged} selId={selId} onDay={(d) => onView('day', d)} onOpen={onOpen} coach={coach} />}
          {pv === 'month' && <MonthGrid anchor={anchor} events={events} now={now} onPick={(d) => onView('day', d)} />}
          {pv === 'list' &&
            (events.some((e) => e.date >= now.date) ? (
              <AgendaView events={events} people={people} now={now} selId={selId} flagged={flagged} onSelect={(id) => onOpen(id, events.find((e) => e.id === id)?.date ?? anchor)} />
            ) : (
              <EmptyState code="CH-6301" icon={CalendarDays} title="Nothing on the calendar in this range." body={coach ? 'Events you publish show here, with replies and overlaps.' : 'Events your coach invites you to show here.'} />
            ))}
        </SectionBoundary>
      )}
    </main>
  );
}

/** The week strip, then the chosen day's agenda: classes in their place, the now line on today. */
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
}) {
  const week = weekDates(anchor);
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
      <ol className="ch-calm-week" aria-label="This week">
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
      <div className="ch-calm-dayk">
        <b>
          {dowOf(anchor)} {dayNum(anchor)} {monthName(anchor)}
        </b>
        <span className="ch-num">
          {team.length} {team.length === 1 ? 'event' : 'events'}
          {blocks > 0 ? ` · ${blocks} ${coach ? (blocks === 1 ? 'class or busy block' : 'classes or busy blocks') : blocks === 1 ? 'class' : 'classes'}` : ''}
        </span>
      </div>
      {!list.length ? (
        <EmptyState compact code="CH-6308" icon={CalendarDays} title="Nothing on this day." body={coach ? 'Tap + to plan something for the team.' : 'Events your coach invites you to show here.'} />
      ) : (
        <ol className="ch-calm-agenda">
          {list.map((e, i) => {
            const past = isToday && !e.allDay && (e.end ?? 0) <= now.hour;
            const live = isToday && !e.allDay && (e.start ?? 0) <= now.hour && (e.end ?? 0) > now.hour;
            const block = e.type === 'class' || e.type === 'busy';
            return (
              <li key={`${e.id}${e.date}`}>
                {i === nowAt && nowLine}
                <button
                  type="button"
                  className={`ch-calm-ev is-${e.type}` + (past ? ' is-past' : '') + (selId === e.id ? ' is-sel' : '') + (e.cancelled ? ' is-cancelled' : '')}
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
                {nowLast && i === list.length - 1 && nowLine}
              </li>
            );
          })}
        </ol>
      )}
    </>
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
