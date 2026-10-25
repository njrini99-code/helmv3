'use client';

import { ChevronDown, ChevronUp, TriangleAlert } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { WasValue } from '../../ui/WasValue';
import { haptic } from '../../lib/haptics';
import { restyleClock } from '../../lib/clock-format';
import { useMarkReader } from '../../lib/use-change-marks';
import { useChClock } from '../../lib/use-clock';
import { clockHourLabel, meridiemOfHour } from '../../lib/clock-format';
import { ClassGroupBlock } from './class-group';
import { barPill, clashSummary, daysBetween, draggable, isBar, laneBars, movePill, resizePill, type ChBarTarget, type ChLaneBar, type ChMoveTarget } from './drag-model';
import { useBarDrag } from './use-bar-drag';
import { DndMonth } from './month-dnd';
import { useTimeDrag, type ChDragKind, type ChTimeDrag } from './use-time-drag';
import { chSpringCurve, CH_EASE } from '../../lib/motion';
import { chSupportsLinear } from '../../lib/sheet-drag';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { EventPeek } from './peek';
import { MarkBadge, MovedAwayRow, OldSlotLine, agendaSub, markGlyph, useRowMark } from './change-note';
import type { ChMovedAway } from './change-view';
import {
  CAL_END,
  CAL_HH,
  CAL_START,
  TYPE_LABEL,
  dayNum,
  dowOf,
  fmtHour,
  groupClasses,
  isClassGroup,
  layoutLanes,
  monthName,
  rangeLabel,
  startLabel,
  addDays,
  type ChCalEvent,
  type ChCalPerson,
  type ChDaylight,
} from './model';

import { TYPE_ICON } from './type-icon';
import { pluralWord } from '../../lib/plural';
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

// P-4: the drag maths live in drag-model.ts; these names stay importable from here.
export { clashesAt, snapTime as snapQuarter, type ChMoveTarget } from './drag-model';
/** What drags in the time grid: one day's timed team event (a run over several days drags as a bar, P-4 4.5). */
export const movable = (e: ChCalEvent) => draggable(e, true) === 'timed' && !e.span;

/** P-4 4.1: a block's size tier by its drawn height (desktop hour 52px, so a quarter is 13px). */
export function blockTier(h: number): 'sliver' | 'short' | 'standard' | 'tall' {
  return h < 24 ? 'sliver' : h < 40 ? 'short' : h < 70 ? 'standard' : 'tall';
}

const byStart = (a: ChCalEvent, b: ChCalEvent) => (a.allDay ? -1 : (a.start ?? 0)) - (b.allDay ? -1 : (b.start ?? 0));

/** An event that has ended: on a day before today, or today with its end at or before now. */
export function isPastEvent(e: ChCalEvent, now: ChNow): boolean {
  if (e.date < now.date) return true;
  return e.date === now.date && !e.allDay && e.end != null && e.end <= now.hour;
}

export function EventBlock({
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
  hh = CAL_HH,
  drag,
  state,
  past = false,
  onSlot,
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
  /** An hour's height in px: the desktop grid's 52 unless set (the phone's unfolded day is 64, P-4 4.7.2). */
  hh?: number;
  /** P006-B3 / P-4: a coach's block can be picked up, stretched by its grips, or nudged with Alt and the arrows. */
  drag?: {
    onPointerDown: (ev: PointerEvent<HTMLElement>) => void;
    onKeyDown: (ev: KeyboardEvent<HTMLElement>) => boolean;
    moved: () => boolean;
    grip: (edge: 'start' | 'end') => (ev: PointerEvent<HTMLElement>) => void;
  };
  /** While a block is dragged: the footprint where it was (`held`), the card in hand (`card`), or a clash (`clash`). */
  state?: 'held' | 'card' | 'clash';
  /** It has ended: it steps back so what is still to come reads first (it comes forward on hover, focus and selection). */
  past?: boolean;
  /** P-14: a changed block shows where it was while the pointer rests on it or it has focus. */
  onSlot?: (on: boolean) => void;
}) {
  const clock = useChClock();
  const rowMark = useRowMark();
  const mark = state === 'card' ? null : rowMark(e);
  const start = Math.max(e.start!, from);
  const end = Math.min(e.end!, to);
  const top = (start - from) * hh;
  // At least one line of title (A26): a 15-minute block was 20px and cut its title's descenders.
  const h = Math.max((end - start) * hh - 2, 22);
  const short = h < 40;
  // P-4 4.1 tiers: a sliver (under 24px) is one 12px row with no glyph; from 24px the type's glyph leads the title.
  const tier = blockTier(h);
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
  const when = e.cancelled ? ['Cancelled'] : timed ? [fmtHour(e.start!, false, clock), meridiemOfHour(e.start!, clock), ...(short ? [] : [` – ${fmtHour(e.end!, true, clock)}`])].filter(Boolean) : [rangeLabel(e, clock)];
  const where = !shared && h > 70 && e.location && !e.busyOnly ? ` · ${e.location}` : null;
  // P-14: a changed block that is tall enough carries the old value in its time line, struck, as the last part (the fit hides
  // a part with every part after it, so it goes first); a short or cascaded one carries a glyph instead. A cancelled one is struck.
  const wide = !short && !shared;
  const wasTime = wide && mark?.change.was.time ? mark.change.was.time : null;
  const wasPlace = wide && where && mark?.change.was.place ? mark.change.was.place : null;
  const showWarn = (flagged || state === 'clash') && !short;
  const showChg = !showWarn && !!mark && !e.cancelled && (short || shared);
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
      className={`ch-ev ch-ev--${e.cancelled ? 'other' : e.type}${tier === 'sliver' ? ' ch-ev--sliver' : ''}${e.cancelled ? ' is-cancelled' : ''}${short ? ' ch-ev--short' : ''}${shared ? ' ch-ev--lane' : ''}${under ? ' ch-ev--under' : ''}${lines ? ' ch-ev--wrap' : ''}${sel ? ' is-sel' : ''}${drag ? ' is-draggable' : ''}${state ? ` is-${state}` : ''}${past && !state ? ' is-past' : ''}`}
      data-ev-id={state === 'card' ? undefined : e.id}
      style={{ top, height: h, left: `calc(${left}% + 3px)`, width: `calc(${100 - left}% - 6px)`, zIndex: under || state === 'card' ? undefined : shared ? lane + 1 : undefined, ...(lines ? { '--ch-ev-lines': lines } : {}) } as CSSProperties}
      aria-label={`${title}, ${rangeLabel(e, clock)}${past && !state ? ', ended' : ''}${flagged ? ', schedule overlap' : ''}${e.cancelled ? ', cancelled' : ''}${mark?.aria ?? ''}${drag ? '. Alt and the arrow keys move it; add Shift to change its length' : ''}`}
      aria-pressed={sel}
      aria-hidden={state === 'card' || undefined}
      tabIndex={state === 'card' ? -1 : undefined}
      onPointerDown={drag?.onPointerDown}
      onPointerEnter={mark ? () => onSlot?.(true) : undefined}
      onPointerLeave={mark ? () => onSlot?.(false) : undefined}
      onFocus={mark ? () => onSlot?.(true) : undefined}
      onBlur={mark ? () => onSlot?.(false) : undefined}
      onKeyDown={drag && ((ev) => void drag.onKeyDown(ev))}
      onClick={() => {
        // A drop is not a click: the pointer that moved the block doesn't also open it.
        if (drag?.moved()) return;
        haptic('select');
        onSelect(e.id);
      }}
    >
      <span className="ch-ev__t">
        {tier !== 'sliver' && <Icon icon={TYPE_ICON[e.type]} size={12} className="ch-ev__g" />}
        {title}
      </span>
      <span className="ch-ev__m ch-ev__m--fit">
        {when.map((part, i) => (
          <span key={i}>{part}</span>
        ))}
        {where && <span>{where}</span>}
        {wasPlace && (
          <span className="ch-ev__was">
            <WasValue changeId={mark!.change.id}>{wasPlace}</WasValue>
          </span>
        )}
        {wasTime && (
          <span className="ch-ev__was">
            <WasValue changeId={mark!.change.id}>{restyleClock(wasTime, clock)}</WasValue>
          </span>
        )}
      </span>
      {showWarn && (
        <span className="ch-ev__warn" aria-hidden="true">
          <Icon icon={TriangleAlert} size={10} />
        </span>
      )}
      {showChg && (
        <span className="ch-ev__chg" aria-hidden="true">
          <Icon icon={markGlyph(mark!.change)} size={12} />
        </span>
      )}
      {/* P-4 4.3: the resize grips, pointer-only (the keyboard path is Alt+Shift); a block under 32px keeps the bottom one. */}
      {drag && !state && (
        <>
          {h >= 32 && <span className="ch-ev__grip is-top" aria-hidden="true" onPointerDown={drag.grip('start')} onClick={(ev) => ev.stopPropagation()} />}
          <span className={'ch-ev__grip is-bottom' + (h < 32 ? ' is-small' : '')} aria-hidden="true" onPointerDown={drag.grip('end')} onClick={(ev) => ev.stopPropagation()} />
        </>
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
  onBarMove,
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
  /** P006-B3 / P-4, the coach's desktop: an event dropped at a new day and time (decimal hours). Absent, nothing drags. */
  onMove?: (e: ChCalEvent, to: ChMoveTarget, kind: ChDragKind) => void;
  /** P-4 4.5: an all-day event or a run over several days dropped on new days (times kept). Absent, bars don't drag. */
  onBarMove?: (e: ChCalEvent, to: ChBarTarget) => void;
  /** P006-A1: a day's sunrise, golden hour and sunset on the team's clock (the global light's sun); absent, no daylight. */
  daylight?: (date: string) => ChDaylight;
  /** P006-C3: the hover card's Nudge is the coach's. */
  coach?: boolean;
}) {
  // 6 AM to 9 PM, widened to the hour around anything earlier or later on the days shown, so a 5 AM bus or a 9:30 PM
  // meeting is on the grid instead of dropped from it (CAL-07).
  // A run over several days is a bar in the all-day lane now (P-4 4.5, OC-3); its hours still count for clashes.
  const timed = events.filter((e) => !isBar(e) && e.start != null && e.end != null && dates.includes(e.date));
  // P-4 4.3: a drag at the grid's edge grows it an hour at a time; the extra hours go when the drag does.
  const [grow, setGrow] = useState({ before: 0, after: 0 });
  const from = Math.max(0, Math.min(CAL_START, ...timed.map((e) => Math.floor(e.start!))) - grow.before);
  const to = Math.min(24, Math.max(CAL_END, ...timed.map((e) => Math.ceil(e.end!))) + grow.after);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const clock = useChClock();
  const nowLabel = fmtHour(now.hour, false, clock);
  const nowVisible = now.hour >= from && now.hour <= to;
  const grid = useRef<HTMLDivElement | null>(null);
  const refocus = useRef<string | null>(null);
  const engine = useTimeDrag({
    grid,
    dates,
    bounds: { from, to },
    hourPx: CAL_HH,
    rail: RAIL_PX,
    events,
    coach: !!onMove,
    onDrop: (e, target, kind) => {
      // Focus stays on the moved block by id, even when it lands in another column (a new element).
      if (document.activeElement instanceof HTMLElement && document.activeElement.dataset.evId === e.id) refocus.current = e.id;
      onMove?.(e, target, kind);
    },
    onGrow: (edge) => {
      if (edge === 'after' ? to >= 24 : from <= 0) return false;
      setGrow((g) => ({ ...g, [edge]: g[edge] + 1 }));
      return true;
    },
  });
  const drag = engine.state;
  // P-14: a changed block shows where it was while it is hovered, focused or selected.
  const [rested, setRested] = useState<string | null>(null);
  const rowMark = useRowMark();
  const slotEvent = drag ? undefined : events.find((x) => x.id === (rested ?? selId) && x.change && dates.includes(x.date));
  const slot = slotEvent ? rowMark(slotEvent)?.change.fromSlot : undefined;
  const lane = useRef<HTMLDivElement | null>(null);
  const bars = laneBars(events, dates);
  const barEngine = useBarDrag({ lane, dates, rail: RAIL_PX, coach: !!onBarMove, onDrop: (e, to) => onBarMove?.(e, to) });
  const bd = barEngine.state;
  const rows = Math.max(1, ...bars.map((b) => b.row + 1));
  useEffect(() => {
    if (!drag && (grow.before || grow.after)) setGrow({ before: 0, after: 0 });
  }, [drag, grow.before, grow.after]);
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    const el = grid.current?.querySelector<HTMLElement>(`[data-ev-id="${CSS.escape(id)}"]`);
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true });
      refocus.current = null;
    }
  });
  // The invitees' clashes, lit while the block is held where it would land.
  const clashes = drag?.clashes ?? null;
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
              className={'ch-wk__day' + (d === now.date ? ' is-today' : '') + (drag?.kind === 'move' && drag.to.date === d ? ' is-target' : '')}
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
        <div className="ch-wk__allday" ref={lane} style={{ gridTemplateRows: `repeat(${rows}, 26px)` }}>
          <span style={{ gridRow: `1 / span ${rows}` }}>All day</span>
          {bars.map((b) => (
            <LaneBar key={b.e.id} b={b} people={people} viewerId={viewerId} sel={selId === b.e.id} onSelect={onSelect} drag={barEngine.bind(b.e)} state={bd?.e.id === b.e.id ? 'held' : undefined} />
          ))}
          {bd &&
            (() => {
              const first = dates[0]!;
              const c0 = Math.max(0, daysBetween(first, bd.to.from));
              const c1 = Math.min(dates.length - 1, daysBetween(first, bd.to.to));
              const row = bars.find((x) => x.e.id === bd.e.id)?.row ?? 0;
              if (c1 < 0 || c0 > dates.length - 1) return null;
              const pill = bd.edge === 'to' ? `Now ends ${barPill({ from: bd.to.to, to: bd.to.to })}` : bd.edge === 'from' ? `Now starts ${barPill({ from: bd.to.from, to: bd.to.from })}` : barPill(bd.to);
              return (
                <div className="ch-dd-barcard" aria-hidden="true" style={{ gridColumn: `${c0 + 2} / ${c1 + 3}`, gridRow: row + 1 }}>
                  <LaneBar b={{ e: bd.e, span: bd.to, c0, c1, row, clipStart: bd.to.from < first, clipEnd: bd.to.to > dates[dates.length - 1]! }} people={people} viewerId={viewerId} sel={false} onSelect={() => {}} state="card" />
                  <span className="ch-dd-pill ch-num">
                    <span>{pill}</span>
                  </span>
                </div>
              );
            })()}
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
          const laid = layoutLanes(groupClasses(events.filter((e) => !isBar(e) && e.date === d && e.start != null && e.end != null)));
          return (
            <div key={d} className={'ch-wk__col' + (d === now.date ? ' is-today' : d < now.date ? ' is-past' : '') + (drag?.kind === 'move' && drag.to.date === d ? ' is-target' : '')}>
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
                    drag={engine.bind(g)}
                    state={drag?.e.id === g.id ? 'held' : clashes?.has(g.id) ? 'clash' : undefined}
                    past={isPastEvent(g, now)}
                    onSlot={(on) => setRested((cur) => (on ? g.id : cur === g.id ? null : cur))}
                  />
                </EventPeek>
                );
              })}
              {slot && slot.date === d && slot.start != null && slot.label && slot.start >= from && slot.start <= to && (
                <OldSlotLine top={(slot.start - from) * CAL_HH} label={restyleClock(`Was ${slot.label}`, clock)} />
              )}
              {d === now.date && nowVisible && (
                <div className="ch-wk__now" /* CH-6603: the current time, a line across today */ style={{ top: (now.hour - from) * CAL_HH }} role="separator" aria-label={`Now, ${fmtHour(now.hour, true, clock)}`}>
                  <span className="ch-wk__nowlbl">{nowLabel}</span>
                </div>
              )}
            </div>
          );
        })}
        {drag && <DragCard drag={drag} dates={dates} from={from} people={people} viewerId={viewerId} events={events} grid={grid} />}
      </div>
    </div>
  );
}

/**
 * P-4 4.5: one bar across the days an all-day event or a run covers, in the week's all-day lane. A run prints its start
 * at the left end and its end at the right; an end that runs past the week is cut in a chevron and has no grip here.
 */
function LaneBar({
  b,
  people,
  viewerId,
  sel,
  onSelect,
  drag,
  state,
}: {
  b: ChLaneBar;
  people: Map<string, ChCalPerson>;
  viewerId?: string | null;
  sel: boolean;
  onSelect: (id: string) => void;
  drag?: { moved: () => boolean; onPointerDown: (ev: PointerEvent<HTMLElement>) => void; onKeyDown: (ev: KeyboardEvent<HTMLElement>) => void; grip: (edge: 'from' | 'to') => (ev: PointerEvent<HTMLElement>) => void };
  state?: 'held' | 'card';
}) {
  const clock = useChClock();
  const { e, span } = b;
  const title = eventTitle(e, people, viewerId);
  const run = !e.allDay && e.span?.start != null && e.span.end != null;
  const days = span.from === span.to ? `${dowOf(span.from)} ${dayNum(span.from)}` : `${dowOf(span.from)} ${dayNum(span.from)} to ${dowOf(span.to)} ${dayNum(span.to)}`;
  return (
    <button
      type="button"
      data-print-visible
      data-ev-id={state === 'card' ? undefined : e.id}
      className={`ch-ev-bar ch-ev-bar--span ch-ev--${e.type}${e.cancelled ? ' is-cancelled' : ''}${sel ? ' is-sel' : ''}${drag ? ' is-draggable' : ''}${state ? ` is-${state}` : ''}${b.clipStart ? ' is-clip-start' : ''}${b.clipEnd ? ' is-clip-end' : ''}`}
      style={state === 'card' ? undefined : { gridColumn: `${b.c0 + 2} / ${b.c1 + 3}`, gridRow: b.row + 1 }}
      aria-label={`${title}, ${days}${e.cancelled ? ', cancelled' : ''}${drag ? '. Alt and the arrow keys move it a day; add Shift to change its last day' : ''}`}
      aria-pressed={sel}
      tabIndex={state === 'card' ? -1 : undefined}
      onPointerDown={drag?.onPointerDown}
      onKeyDown={drag?.onKeyDown}
      onClick={() => {
        if (drag?.moved()) return;
        haptic('select');
        onSelect(e.id);
      }}
    >
      <Icon icon={TYPE_ICON[e.type]} size={12} className="ch-ev__g" />
      {run && !b.clipStart && <em className="ch-ev-bar__t ch-num">{fmtHour(e.span!.start!, true, clock)}</em>}
      <span>{title}</span>
      {run && !b.clipEnd && <em className="ch-ev-bar__t ch-ev-bar__end ch-num">{fmtHour(e.span!.end!, true, clock)}</em>}
      {drag && !state && (
        <>
          {!b.clipStart && <span className="ch-ev-bar__grip is-from" aria-hidden="true" onPointerDown={drag.grip('from')} onClick={(ev) => ev.stopPropagation()} />}
          {!b.clipEnd && <span className="ch-ev-bar__grip is-to" aria-hidden="true" onPointerDown={drag.grip('to')} onClick={(ev) => ev.stopPropagation()} />}
        </>
      )}
    </button>
  );
}

/** The time grid's hour rail, left of the first column (calendar.css .ch-wk__grid's first track). */
const RAIL_PX = 52;

/**
 * P-4 4.2-4.3, the card in hand with a mouse: the event in full material, a touch larger and lifted, snapped to where it
 * would land and gliding there (one element across quarters and days, so it reads as one object). The pill rides above
 * it ("Wed 15 · 4:00 – 6:00 PM", a clash on a second line) and flips below it near the visible top.
 */
function DragCard({ drag, dates, from, people, viewerId, events, grid }: { drag: ChTimeDrag; dates: string[]; from: number; people: Map<string, ChCalPerson>; viewerId?: string | null; events: ChCalEvent[]; grid: RefObject<HTMLDivElement | null> }) {
  const clock = useChClock();
  const reduced = useChReducedMotion();
  const box = useRef<HTMLDivElement | null>(null);
  const [below, setBelow] = useState(false);
  const col = Math.max(0, dates.indexOf(drag.to.date));
  const { e, to } = drag;
  const top = (to.start - from) * CAL_HH;
  useGlide(box, `${col}:${to.start}:${to.end}`, reduced);
  useLayoutEffect(() => {
    const el = box.current;
    const head = grid.current?.closest('.ch-wk')?.querySelector('.ch-wk__top')?.getBoundingClientRect().bottom ?? 0;
    if (el) setBelow(el.getBoundingClientRect().top - head < 40);
  }, [top, grid]);
  const pill = drag.kind === 'resize' ? resizePill(drag.edge!, to, clock) : movePill(e, to, clock);
  const clash = clashSummary(e, drag.clashes, events, people).line;
  return (
    <div
      ref={box}
      className="ch-dd-card"
      aria-hidden="true"
      style={{ top, height: Math.max((to.end - to.start) * CAL_HH, 22), left: `calc(${RAIL_PX}px + (100% - ${RAIL_PX}px) * ${col} / ${dates.length})`, width: `calc((100% - ${RAIL_PX}px) / ${dates.length})` } as CSSProperties}
    >
      <EventBlock e={{ ...e, date: to.date, start: to.start, end: to.end }} lane={0} lanes={1} sel={false} flagged={false} people={people} viewerId={viewerId} onSelect={() => {}} from={to.start} to={to.end} state="card" />
      <span className={'ch-dd-pill ch-num' + (below ? ' is-below' : '') + (clash ? ' is-clash' : '')}>
        <span>{pill}</span>
        {clash && <span className="ch-dd-pill__clash">{clash}</span>}
      </span>
    </div>
  );
}

/**
 * A glide on the smooth spring from where an element was drawn to where it is now (FLIP), retargeted from its current
 * place when a new step lands mid-glide, so a fast drag never queues. Transform only (WAAPI translate); none under
 * reduced motion.
 */
function useGlide(ref: RefObject<HTMLElement | null>, key: string, reduced: boolean) {
  const last = useRef<DOMRect | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const shown = el.getBoundingClientRect();
    el.getAnimations?.().forEach((a) => a.cancel());
    const laid = el.getBoundingClientRect();
    const prev = last.current;
    last.current = laid;
    if (!prev || reduced || typeof el.animate !== 'function') return;
    // Where it shows now (old layout plus the glide in flight), measured against where it is laid out.
    const dx = prev.left - laid.left + (shown.left - laid.left);
    const dy = prev.top - laid.top + (shown.top - laid.top);
    if (!dx && !dy) return;
    const curve = chSpringCurve('smooth');
    el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: curve.ms, easing: chSupportsLinear() ? curve.linear : `cubic-bezier(${CH_EASE.join(',')})` });
  }, [ref, key, reduced]);
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

/** The desktop Month (P-4 4.4: gridcells, ribbons, and drag to another day for a coach). */
export function MonthView(props: {
  anchor: string;
  events: ChCalEvent[];
  now: ChNow;
  selDate: string;
  onPick: (date: string) => void;
  onMove?: (e: ChCalEvent, to: ChMoveTarget, kind: ChDragKind) => void;
  onBarMove?: (e: ChCalEvent, to: ChBarTarget) => void;
}) {
  return <DndMonth {...props} coach={!!props.onMove} />;
}

export function AgendaView({
  events,
  people,
  now,
  selId,
  flagged,
  onSelect,
  viewerId,
  movedAway,
  onOpenAt,
}: {
  events: ChCalEvent[];
  people: Map<string, ChCalPerson>;
  now: ChNow;
  selId: string | null;
  flagged: Set<string>;
  onSelect: (id: string) => void;
  /** The signed-in player: their own class is titled without their name. */
  viewerId?: string | null;
  /** P-14: events that left a day for another; each is a quiet row on the day it left. */
  movedAway?: ChMovedAway[];
  /** Opens an event on a given day (a moved-away row opens it on its new day); absent, a plain select. */
  onOpenAt?: (id: string, date: string) => void;
}) {
  const clock = useChClock();
  const rowMark = useRowMark();
  const read = useMarkReader();
  const away = (movedAway ?? []).filter((m) => !read(m.changeId).got);
  const [early, setEarly] = useState(false);
  const days = [...new Set([...events.map((e) => e.date), ...away.map((m) => m.fromDate)])].sort();
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
            {early ? 'Hide earlier days' : `Show ${past.length} earlier ${pluralWord(past.length, 'day')}`}
          </Button>
        </div>
      )}
      {list.map((d) => {
        const evs = events.filter((e) => e.date === d).sort(byStart);
        const rows: React.ReactNode[] = [];
        // The day's rows in time order, with the rows of events that left this day among them (P-14).
        type Entry = { at: number; e?: ChCalEvent; g?: ChMovedAway };
        const entries: Entry[] = [
          ...evs.map((e): Entry => ({ at: e.allDay ? -1 : (e.start ?? 0), e })),
          ...away.filter((m) => m.fromDate === d).map((g): Entry => ({ at: g.fromStart ?? -1, g })),
        ].sort((x, y) => x.at - y.at);
        let prev: ChCalEvent | undefined;
        entries.forEach(({ e, g }) => {
          if (g) {
            rows.push(<MovedAwayRow key={`away-${g.id}`} g={g} variant="agenda" onOpen={() => (haptic('select'), onOpenAt ? onOpenAt(g.id, g.toDate) : onSelect(g.id))} />);
            return;
          }
          if (!e) return;
          const mk = rowMark(e);
          if (d === now.date && !e.allDay && e.start! > now.hour && (!prev || prev.allDay || prev.start! <= now.hour)) {
            rows.push(
              <div key="now" className="ch-ag__now" role="separator" aria-label={`Now, ${fmtHour(now.hour, true, clock)}`}>
                <span>Now · {fmtHour(now.hour, true, clock)}</span>
              </div>,
            );
          }
          prev = e;
          rows.push(
            <button
              key={e.id}
              type="button"
              data-print-visible
              className={'ch-ag__row' + (selId === e.id ? ' is-sel' : '') + (e.type === 'class' || e.type === 'busy' ? ' is-class' : '') + (e.cancelled ? ' is-cancelled' : '')}
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
                  {mk && !mk.change.partial && e.type !== 'busy' ? (
                    agendaSub(e.busyOnly ? null : e.location, mk.change, TYPE_LABEL[e.type], clock)
                  ) : (
                    <>
                      {e.type === 'busy' ? 'Your busy time · only you see it' : TYPE_LABEL[e.type]}
                      {e.location && !e.busyOnly ? ` · ${e.location}` : ''}
                    </>
                  )}
                </span>
              </span>
              {flagged.has(e.id) ? (
                <Badge tone="warning">
                  <Icon icon={TriangleAlert} size={11} />
                  Overlap
                </Badge>
              ) : e.cancelled ? (
                <Badge tone="warning">Cancelled</Badge>
              ) : mk ? (
                <MarkBadge change={mk.change} />
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
