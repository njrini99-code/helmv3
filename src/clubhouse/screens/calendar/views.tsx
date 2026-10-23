'use client';

import { ChevronDown, ChevronUp, TriangleAlert } from 'lucide-react';
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { haptic } from '../../lib/haptics';
import { useChClock } from '../../lib/use-clock';
import { clockHourLabel, meridiemOfHour } from '../../lib/clock-format';
import { ClassGroupBlock } from './class-group';
import { EventPeek } from './peek';
import {
  CAL_END,
  CAL_HH,
  CAL_START,
  TYPE_LABEL,
  dayNum,
  dowOf,
  fmtHour,
  isMajor,
  groupClasses,
  isClassGroup,
  layoutLanes,
  monthCells,
  monthName,
  rangeLabel,
  startLabel,
  addDays,
  type ChCalEvent,
  type ChCalPerson,
  type ChDaylight,
} from './model';

import { TYPE_ICON } from './type-icon';
export { TYPE_ICON };

export interface ChNow {
  date: string;
  hour: number;
  /** The instant itself, once the browser's clock is read (absent on the server's first render and in a frozen preview). */
  ms?: number;
}

/**
 * What a block says. A class shown as Busy never leaks its title or room. A class is named for whose it is ("Priya ·
 * STAT 201"), except the viewer's own (`viewerId`): a player's own class is just "ECON 101".
 */
export function eventTitle(e: ChCalEvent, people: Map<string, ChCalPerson>, viewerId?: string | null): string {
  if (e.type === 'busy') return `Busy · ${e.title}`;
  if (e.type !== 'class') return e.title;
  const first = e.owner && e.owner !== viewerId ? people.get(e.owner)?.name.split(' ')[0] : null;
  if (e.busyOnly) return first ? `${first} · Busy` : 'Busy';
  return first ? `${first} · ${e.title}` : e.title;
}

/** Where a dragged event would land: its day and decimal hours. */
export interface ChMoveTarget {
  date: string;
  start: number;
  end: number;
}

export const snapQuarter = (h: number) => Math.round(h * 4) / 4;

/**
 * What a coach can drag (P006-B3): one timed team event they can edit, on one day. A series asks "this event or all"
 * and a multi-day event moves its whole span, so both stay in the editor; classes and busy time aren't team events.
 */
export const movable = (e: ChCalEvent) => e.canEdit && !e.allDay && !e.cancelled && !e.seriesId && !e.span && e.start != null && e.end != null && e.type !== 'class' && e.type !== 'busy';

/** The events an invitee of `e` is already at (or in class for) where `e` would land. */
export function clashesAt(e: ChCalEvent, to: ChMoveTarget, events: ChCalEvent[]): Set<string> {
  const who = new Set(e.people);
  return new Set(
    events
      .filter((o) => o.id !== e.id && o.date === to.date && !o.allDay && !o.cancelled && o.start != null && o.end != null && o.start < to.end && to.start < o.end)
      .filter((o) => (o.type === 'class' ? o.owner != null && who.has(o.owner) : o.people.some((p) => who.has(p))))
      .map((o) => o.id),
  );
}

const byStart = (a: ChCalEvent, b: ChCalEvent) => (a.allDay ? -1 : (a.start ?? 0)) - (b.allDay ? -1 : (b.start ?? 0));

/** An event that has ended: on a day before today, or today with its end at or before now. */
export function isPastEvent(e: ChCalEvent, now: ChNow): boolean {
  if (e.date < now.date) return true;
  return e.date === now.date && !e.allDay && e.end != null && e.end <= now.hour;
}

function EventBlock({
  e,
  lane,
  lanes,
  sel,
  flagged,
  people,
  viewerId,
  onSelect,
  from,
  to,
  drag,
  state,
  past = false,
}: {
  e: ChCalEvent;
  lane: number;
  lanes: number;
  sel: boolean;
  flagged: boolean;
  people: Map<string, ChCalPerson>;
  /** The signed-in player: their own class is titled without their name. */
  viewerId?: string | null;
  onSelect: (id: string) => void;
  /** The grid's first and last hour. */
  from: number;
  to: number;
  /** P006-B3: a coach's block can be picked up (pointer) or nudged 15 minutes (Alt+↑/↓). */
  drag?: { onPointerDown: (ev: PointerEvent<HTMLButtonElement>) => void; onNudge: (dir: 1 | -1) => void; moved: () => boolean };
  /** While a block is dragged: it is the one held (`held`), the ghost where it would land (`ghost`), or a clash (`clash`). */
  state?: 'held' | 'ghost' | 'clash';
  /** It has ended: it steps back so what is still to come reads first (it comes forward on hover, focus and selection). */
  past?: boolean;
}) {
  const clock = useChClock();
  const start = Math.max(e.start!, from);
  const end = Math.min(e.end!, to);
  const top = (start - from) * CAL_HH;
  // At least one line of title (A26): a 15-minute block was 20px and cut its title's descenders.
  const h = Math.max((end - start) * CAL_HH - 2, 22);
  const short = h < 40;
  /** Overlapping events cascade, as Apple Calendar does (owner, 2026-10-06: the split lanes crushed titles into
   *  fragments): each later lane steps right and lies over the earlier ones, reaching the column's right edge, so every
   *  block keeps a readable width and an earlier one shows in full above where the next begins. */
  const step = lanes > 1 ? Math.min(46, 70 / (lanes - 1)) : 0;
  const left = step * lane;
  const shared = lanes > 1;
  // A busy block (someone's time, not a team event) lies under the events it overlaps, whatever its lane (A26): stepped in
  // over a team round it hid the round's title.
  const under = shared && (e.type === 'busy' || e.busyOnly);
  const title = eventTitle(e, people, viewerId);
  // The time in parts, each kept whole: the block shows as many as fit on its one line (calendar.css, .ch-ev__m--fit),
  // so a narrow block reads "8:00 AM" and a narrower one "8:00", never a cut "8:00 – 9:…" or a bare start where AM or PM
  // fits. The start carries its half, so a range reads "8:00 AM – 9:30 AM". A short block gives only its start; a day
  // of a run over several days keeps rangeLabel's one phrase ("From 8:00 AM").
  const timed = !e.allDay && !(e.span?.start != null && e.span.end != null && e.date);
  // On the 24-hour clock there is no half to carry: "08:00" and "08:00 – 09:30".
  const when = timed ? [fmtHour(e.start!, false, clock), meridiemOfHour(e.start!, clock), ...(short ? [] : [` – ${fmtHour(e.end!, true, clock)}`])].filter(Boolean) : [rangeLabel(e, clock)];
  const where = !shared && h > 70 && e.location && !e.busyOnly ? ` · ${e.location}` : null;
  // P006 D2: a block on its own wraps its title to the lines its height leaves above the time (padding 12, gap 2, time 15;
  // a title line is 15.6), at most three, so "Bus to Pinehurst" isn't cut to "Bus to Pine…" in a block with room.
  // One line keeps the plain cut-off, which shows more of the title than a word-wrapped clamp.
  const fit = Math.min(3, Math.floor((h - 29) / 15.6));
  const lines = short || shared || fit < 2 ? undefined : fit;
  return (
    <button
      type="button"
      data-print-visible
      // CH-6801: a button named with its title, time and any overlap. CH-6601: it lifts on hover and marks its selection.
      className={`ch-ev ch-ev--${e.type}${short ? ' ch-ev--short' : ''}${shared ? ' ch-ev--lane' : ''}${under ? ' ch-ev--under' : ''}${lines ? ' ch-ev--wrap' : ''}${sel ? ' is-sel' : ''}${drag ? ' is-draggable' : ''}${state ? ` is-${state}` : ''}${past && !state ? ' is-past' : ''}`}
      style={{ top, height: h, left: `calc(${left}% + 3px)`, width: `calc(${100 - left}% - 6px)`, zIndex: state === 'ghost' ? 6 : under ? undefined : shared ? lane + 1 : undefined, ...(lines ? { '--ch-ev-lines': lines } : {}) } as CSSProperties}
      aria-label={`${title}, ${rangeLabel(e, clock)}${past && !state ? ', ended' : ''}${flagged ? ', schedule overlap' : ''}${drag ? '. Alt and the arrow keys move it 15 minutes' : ''}`}
      aria-pressed={sel}
      aria-hidden={state === 'ghost' || undefined}
      tabIndex={state === 'ghost' ? -1 : undefined}
      onPointerDown={drag?.onPointerDown}
      onKeyDown={
        drag &&
        ((ev) => {
          if (!ev.altKey || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
          ev.preventDefault();
          drag.onNudge(ev.key === 'ArrowUp' ? -1 : 1);
        })
      }
      onClick={() => {
        // A drop is not a click: the pointer that moved the block doesn't also open it.
        if (drag?.moved()) return;
        haptic('select');
        onSelect(e.id);
      }}
    >
      <span className="ch-ev__t">{title}</span>
      <span className="ch-ev__m ch-ev__m--fit">
        {when.map((part, i) => (
          <span key={i}>{part}</span>
        ))}
        {where && <span>{where}</span>}
      </span>
      {flagged && !short && (
        <span className="ch-ev__warn" aria-hidden="true">
          <Icon icon={TriangleAlert} size={10} />
        </span>
      )}
    </button>
  );
}

export function TimeGrid({
  dates,
  events,
  people,
  now,
  selId,
  flagged,
  onSelect,
  onDay,
  onMove,
  daylight,
  coach = false,
  viewerId,
}: {
  dates: string[];
  events: ChCalEvent[];
  people: Map<string, ChCalPerson>;
  /** The signed-in player: their own class is titled without their name. */
  viewerId?: string | null;
  now: ChNow;
  selId: string | null;
  flagged: Set<string>;
  onSelect: (id: string) => void;
  onDay: (date: string) => void;
  /** P006-B3, the coach's desktop: an event dropped at a new day and time (decimal hours). Absent, nothing drags. */
  onMove?: (e: ChCalEvent, to: ChMoveTarget) => void;
  /** P006-A1: a day's sunrise, golden hour and sunset on the team's clock (the global light's sun); absent, no daylight. */
  daylight?: (date: string) => ChDaylight;
  /** P006-C3: the hover card's Nudge is the coach's. */
  coach?: boolean;
}) {
  // 6 AM to 9 PM, widened to the hour around anything earlier or later on the days shown, so a 5 AM bus or a 9:30 PM
  // meeting is on the grid instead of dropped from it (CAL-07).
  const timed = events.filter((e) => !e.allDay && e.start != null && e.end != null && dates.includes(e.date));
  const from = Math.max(0, Math.min(CAL_START, ...timed.map((e) => Math.floor(e.start!))));
  const to = Math.min(24, Math.max(CAL_END, ...timed.map((e) => Math.ceil(e.end!))));
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const clock = useChClock();
  const nowLabel = fmtHour(now.hour, false, clock);
  const nowVisible = now.hour >= from && now.hour <= to;
  const grid = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ e: ChCalEvent; to: ChMoveTarget } | null>(null);
  const moved = useRef(false);
  const target = (e: ChCalEvent, x: number, y: number, y0: number): ChMoveTarget => {
    const rect = grid.current!.getBoundingClientRect();
    const col = Math.min(dates.length - 1, Math.max(0, Math.floor(((x - rect.left - 52) / (rect.width - 52)) * dates.length)));
    const len = e.end! - e.start!;
    const start = Math.min(to - len, Math.max(from, snapQuarter(e.start! + (y - y0) / CAL_HH)));
    return { date: dates[col]!, start, end: start + len };
  };
  const dragFor = (e: ChCalEvent) =>
    onMove && movable(e)
      ? {
          moved: () => moved.current,
          onNudge: (dir: 1 | -1) => {
            const start = e.start! + dir * 0.25;
            if (start < 0 || e.end! + dir * 0.25 > 24) return;
            haptic('select');
            onMove(e, { date: e.date, start, end: e.end! + dir * 0.25 });
          },
          onPointerDown: (ev: PointerEvent<HTMLButtonElement>) => {
            if (ev.button !== 0 || ev.pointerType === 'touch') return;
            const x0 = ev.clientX;
            const y0 = ev.clientY;
            moved.current = false;
            let last: ChMoveTarget | null = null;
            const move = (m: globalThis.PointerEvent) => {
              if (!moved.current && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
              moved.current = true;
              const t = target(e, m.clientX, m.clientY, y0);
              // A detent: a tick each time the block lands on a new quarter hour or day.
              if (last && (last.start !== t.start || last.date !== t.date)) haptic('select');
              last = t;
              setDrag({ e, to: t });
            };
            const up = () => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
              window.removeEventListener('pointercancel', cancel);
              setDrag(null);
              if (moved.current && last && (last.date !== e.date || last.start !== e.start)) onMove(e, last);
              // The click that follows this pointerup still sees `moved`; clear it after.
              window.setTimeout(() => (moved.current = false), 0);
            };
            const cancel = () => {
              last = null;
              up();
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', cancel);
          },
        }
      : undefined;
  // The invitees' clashes, lit while the block is held where it would land.
  const clashes = drag ? clashesAt(drag.e, drag.to, events) : null;
  return (
    <div
      className="ch-wk ch-cal-surface"
      style={{ ['--ch-cols' as string]: dates.length, ['--ch-hours' as string]: to - from, ['--ch-hh' as string]: `${CAL_HH}px` }}
    >
      {/* The days and the all-day row stay pinned under the top bar while the hours scroll (P006-B1 opens mid-day). */}
      <div className="ch-wk__top">
        <div className="ch-wk__head">
          <div />
          {dates.map((d) => (
            <button
              key={d}
              type="button"
              data-print-visible
              className={'ch-wk__day' + (d === now.date ? ' is-today' : '')}
              onClick={() => {
                haptic('select');
                onDay(d);
              }}
              aria-label={`${dowOf(d)} ${dayNum(d)} ${monthName(d)}${d === now.date ? ', today' : ''}. Open the day`}
            >
              <span className="ch-wk__d">{dowOf(d)}</span>
              <span className="ch-wk__n">{dayNum(d)}</span>
            </button>
          ))}
        </div>
        <div className="ch-wk__allday">
          <span>All day</span>
          {dates.map((d) => (
            <div key={d} className="ch-wk__allcell">
              {events
                .filter((e) => e.allDay && e.date === d)
                .map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    data-print-visible
                    className={`ch-ev-bar ch-ev--${e.type}${selId === e.id ? ' is-sel' : ''}`}
                    aria-pressed={selId === e.id}
                    onClick={() => {
                      haptic('select');
                      onSelect(e.id);
                    }}
                  >
                    <Icon icon={TYPE_ICON[e.type]} size={12} />
                    <span>{eventTitle(e, people, viewerId)}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </div>
      <div className={'ch-wk__grid' + (drag ? ' is-dragging' : '')} data-first={dates[0]} data-from={from} ref={grid}>
        <div className="ch-wk__rail" aria-hidden="true">
          {hours.map(
            (h) =>
              h > from && (
                <span key={h} style={{ top: (h - from) * CAL_HH }}>
                  {clockHourLabel(h, clock)}
                </span>
              ),
          )}
        </div>
        {dates.map((d) => {
          const laid = layoutLanes(groupClasses(events.filter((e) => !e.allDay && e.date === d && e.start != null && e.end != null)));
          return (
            <div key={d} className={'ch-wk__col' + (d === now.date ? ' is-today' : d < now.date ? ' is-past' : '')}>
              {daylight && <Daylight dl={daylight(d)} from={from} to={to} label={d === dates[dates.length - 1]} />}
              {/* Today's hours behind the now line take the past days' wash, so the day reads from the line down. */}
              {d === now.date && nowVisible && <span className="ch-wk__gone" aria-hidden="true" style={{ height: (now.hour - from) * CAL_HH }} />}
              {laid.map((l) => {
                const g = l.e;
                if (isClassGroup(g)) return <ClassGroupBlock key={g.id} g={g} lane={l.lane} lanes={l.lanes} selId={selId} people={people} onSelect={onSelect} from={from} to={to} />;
                return (
                <EventPeek key={g.id} e={g} coach={coach} people={people} onOpen={() => onSelect(g.id)} disabled={!!drag}>
                  <EventBlock
                    e={g}
                    lane={l.lane}
                    lanes={l.lanes}
                    sel={selId === g.id}
                    flagged={flagged.has(g.id)}
                    people={people}
                    viewerId={viewerId}
                    onSelect={onSelect}
                    from={from}
                    to={to}
                    drag={dragFor(g)}
                    state={drag?.e.id === g.id ? 'held' : clashes?.has(g.id) ? 'clash' : undefined}
                    past={isPastEvent(g, now)}
                  />
                </EventPeek>
                );
              })}
              {drag && drag.to.date === d && (
                <EventBlock e={{ ...drag.e, date: d, start: drag.to.start, end: drag.to.end }} lane={0} lanes={1} sel={false} flagged={false} people={people} viewerId={viewerId} onSelect={() => {}} from={from} to={to} state="ghost" />
              )}
              {d === now.date && nowVisible && (
                <div className="ch-wk__now" /* CH-6603: the current time, a line across today */ style={{ top: (now.hour - from) * CAL_HH }} role="separator" aria-label={`Now, ${fmtHour(now.hour, true, clock)}`}>
                  <span className="ch-wk__nowlbl">{nowLabel}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * P006-A1: daylight on the grid. The hours before sunrise and after sunset take a night wash, golden hour a warm band,
 * and the last column shown (the grid's quiet edge) says when the sun sets. Light on the frame, under the events: it never
 * tints an event or a figure, and a block covers it.
 */
function Daylight({ dl, from, to, label }: { dl: ChDaylight; from: number; to: number; label: boolean }) {
  const clock = useChClock();
  const y = (h: number) => (Math.min(to, Math.max(from, h)) - from) * CAL_HH;
  return (
    <span className="ch-wk__sky" aria-hidden="true">
      {dl.rise !== null && dl.rise > from && <i className="is-night" style={{ top: 0, height: y(dl.rise) }} />}
      {dl.set !== null && dl.set < to && <i className="is-night" style={{ top: y(dl.set), bottom: 0 }} />}
      {dl.golden !== null && dl.set !== null && dl.set > dl.golden && <i className="is-golden" style={{ top: y(dl.golden), height: y(dl.set) - y(dl.golden) }} />}
      {label && dl.set !== null && dl.set > from && dl.set < to && (
        <em className="ch-wk__sunset ch-num" style={{ top: y(dl.set) }}>
          Sunset {fmtHour(dl.set, true, clock)}
        </em>
      )}
    </span>
  );
}

export function MonthView({
  anchor,
  events,
  now,
  selDate,
  onPick,
}: {
  anchor: string;
  events: ChCalEvent[];
  now: ChNow;
  selDate: string;
  onPick: (date: string) => void;
}) {
  const cells = monthCells(anchor);
  return (
    <div className="ch-mo ch-cal-surface">
      <div className="ch-mo__dow" aria-hidden="true">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="ch-mo__grid">
        {cells.map(({ date, out }) => {
          const evs = events.filter((e) => e.date === date && e.type !== 'class' && e.type !== 'busy').sort(byStart);
          const shown = evs.slice(0, 3);
          return (
            <button
              key={date}
              type="button"
              data-print-visible
              className={'ch-mo__cell' + (out ? ' is-out' : '') + (date === now.date ? ' is-today' : !out && date < now.date ? ' is-past' : '') + (date === selDate ? ' is-sel' : '')}
              aria-label={`${dowOf(date)} ${dayNum(date)} ${monthName(date)}: ${evs.length ? `${evs.length} ${evs.length === 1 ? 'event' : 'events'}` : 'no events'}`}
              aria-pressed={date === selDate}
              onClick={() => {
                haptic('select');
                onPick(date);
              }}
            >
              <span className="ch-mo__n">{dayNum(date)}</span>
              {shown.map((e) => (
                <span key={e.id} className={'ch-mo__ev' + (isMajor(e.type) ? ' is-major' : '')}>
                  <i className={`ch-dot-${e.type}`} />
                  <span>{e.title}</span>
                </span>
              ))}
              {evs.length > 3 && <span className="ch-mo__more">{evs.length - 3} more</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AgendaView({
  events,
  people,
  now,
  selId,
  flagged,
  onSelect,
  viewerId,
}: {
  events: ChCalEvent[];
  people: Map<string, ChCalPerson>;
  now: ChNow;
  selId: string | null;
  flagged: Set<string>;
  onSelect: (id: string) => void;
  /** The signed-in player: their own class is titled without their name. */
  viewerId?: string | null;
}) {
  const clock = useChClock();
  const [early, setEarly] = useState(false);
  const days = [...new Set(events.map((e) => e.date))].sort();
  const past = days.filter((d) => d < now.date);
  const list = early ? days : days.filter((d) => d >= now.date);
  const tomorrow = addDays(now.date, 1);
  const label = (d: string) => (d === now.date ? 'Today' : d === tomorrow ? 'Tomorrow' : `${dowOf(d)} ${dayNum(d)}`);
  const inDays = (d: string) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${now.date}T12:00:00Z`)) / 86400000);

  return (
    <div className="ch-ag">
      {past.length > 0 && (
        <div>
          <Button size="sm" variant="ghost" leftIcon={early ? ChevronUp : ChevronDown} onClick={() => setEarly(!early)}>
            {early ? 'Hide earlier days' : `Show ${past.length} earlier ${past.length === 1 ? 'day' : 'days'}`}
          </Button>
        </div>
      )}
      {list.map((d) => {
        const evs = events.filter((e) => e.date === d).sort(byStart);
        const rows: React.ReactNode[] = [];
        evs.forEach((e, i) => {
          const prev = evs[i - 1];
          if (d === now.date && !e.allDay && e.start! > now.hour && (!prev || prev.allDay || prev.start! <= now.hour)) {
            rows.push(
              <div key="now" className="ch-ag__now" role="separator" aria-label={`Now, ${fmtHour(now.hour, true, clock)}`}>
                <span>Now · {fmtHour(now.hour, true, clock)}</span>
              </div>,
            );
          }
          rows.push(
            <button
              key={e.id}
              type="button"
              data-print-visible
              className={'ch-ag__row' + (selId === e.id ? ' is-sel' : '') + (e.type === 'class' || e.type === 'busy' ? ' is-class' : '')}
              aria-pressed={selId === e.id}
              onClick={() => {
                haptic('select');
                onSelect(e.id);
              }}
            >
              <span className="ch-ag__t">
                {startLabel(e, true, clock)}
                {!e.allDay && <span>{fmtHour(e.end!, true, clock)}</span>}
              </span>
              <span className={`ch-ag__dot ch-dot-${e.type}`} aria-hidden="true" />
              <span style={{ minWidth: 0 }}>
                <span className="ch-ag__a">{e.type === 'class' && e.owner && e.owner !== viewerId && people.get(e.owner) ? `${people.get(e.owner)!.name} · ${e.title}` : e.type === 'busy' ? e.title : eventTitle(e, people, viewerId)}</span>
                <span className="ch-ag__b">
                  {e.type === 'busy' ? 'Your busy time · only you see it' : TYPE_LABEL[e.type]}
                  {e.location && !e.busyOnly ? ` · ${e.location}` : ''}
                </span>
              </span>
              {flagged.has(e.id) ? (
                <Badge tone="warning">
                  <Icon icon={TriangleAlert} size={11} />
                  Overlap
                </Badge>
              ) : (
                <span />
              )}
            </button>,
          );
        });
        const n = inDays(d);
        const sub = d === now.date || d === tomorrow ? `${dowOf(d)}, ${dayNum(d)} ${monthName(d)}` : n > 0 && n < 7 ? `In ${n} days` : `${dayNum(d)} ${monthName(d)}`;
        return (
          <section key={d} className={'ch-ag__day' + (d === now.date ? ' is-today' : '')} aria-label={label(d)}>
            <div className={'ch-ag__when' + (d === now.date ? ' is-today' : '')}>
              <b>{label(d)}</b>
              <span>{sub}</span>
            </div>
            <div className="ch-ag__list ch-cal-surface">{rows}</div>
          </section>
        );
      })}
    </div>
  );
}
