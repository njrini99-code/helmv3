'use client';

/**
 * P-4 4.4, the desktop Month. Each day is a gridcell holding its day button (the numeral, which opens the day) and one
 * button per event shown, so chips can be dragged and cells take drops without nesting buttons. A run over several days
 * draws once per week row as a ribbon across its cells (squared where the week breaks, a chevron on a cut end).
 *
 * A coach drags a chip to another day and it keeps its time; a ribbon keeps its length and times. dnd-kit runs the
 * gesture (pointer 5px, touch hold 450ms, keyboard), with its own auto-scroll off (P-4 changelog: it writes scrollTop
 * behind Lenis). The overlay lifts the chip at 1.02 with no tilt; the pill says "Fri 17 · 8:42 AM". The grid is a
 * roving tab stop: arrows move between days, the focused day's chips take Tab, and dnd-kit's arrows stay inside it.
 */
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { haptic } from '../../lib/haptics';
import { chSpringCurve, CH_DUR, CH_EASE } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { chSupportsLinear } from '../../lib/sheet-drag';
import { useChClock } from '../../lib/use-clock';
import { plural } from '../../lib/plural';
import { Icon } from '../../ui/Icon';
import { barSpan, daysBetween, draggable, isBar, laneBars, moveSpan, type ChBarTarget, type ChLaneBar, type ChMoveTarget } from './drag-model';
import { addDays, dayNum, dowOf, fmtHour, isMajor, monthCells, monthName, type ChCalEvent } from './model';
import { TYPE_ICON } from './type-icon';
import { roundLabel, RoundTitle } from './round-label';
import type { ChDragKind } from './use-time-drag';

const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const longDay = (d: string) => `${DOW_LONG[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${dayNum(d)} ${monthName(d)}`;
const LANE_PX = 24;

/** CH-6806: what the month says while a chip is carried by keyboard or pointer. */
export function monthAnnouncements(clock: ReturnType<typeof useChClock>): Announcements {
  const ev = (a: { data: { current?: unknown } }) => (a.data.current as { e: ChCalEvent }).e;
  const timeOf = (e: ChCalEvent) => (e.allDay || e.start == null ? '' : ` at ${fmtHour(e.start, true, clock)}`);
  return {
    onDragStart: ({ active: a }) => `Picked up ${ev(a).title}, ${longDay(ev(a).date)}. Arrow keys choose a day, Space drops, Escape cancels.`,
    onDragOver: ({ over: o }) => (o ? `Over ${longDay(String(o.id))}.` : undefined),
    onDragEnd: ({ active: a, over: o }) => (o ? `${ev(a).title} moved to ${longDay(String(o.id))}${timeOf(ev(a))}.` : `Move cancelled. ${ev(a).title} stays on ${longDay(ev(a).date)}.`),
    onDragCancel: ({ active: a }) => `Move cancelled. ${ev(a).title} stays on ${longDay(ev(a).date)}.`,
  };
}

type Now = { date: string };

export function DndMonth({
  anchor,
  events,
  now,
  selDate,
  onPick,
  onMove,
  onBarMove,
  coach,
}: {
  anchor: string;
  events: ChCalEvent[];
  now: Now;
  selDate: string;
  onPick: (date: string) => void;
  onMove?: (e: ChCalEvent, to: ChMoveTarget, kind: ChDragKind) => void;
  onBarMove?: (e: ChCalEvent, to: ChBarTarget) => void;
  coach?: boolean;
}) {
  const clock = useChClock();
  const reduced = useChReducedMotion();
  const cells = monthCells(anchor);
  const weeks = useMemo(() => Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7)), [cells]);
  const team = events.filter((e) => e.type !== 'class' && e.type !== 'busy');
  const [focusDate, setFocusDate] = useState(() => (cells.some((c) => c.date === selDate) ? selDate : cells.find((c) => !c.out)!.date));
  const grid = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<{ e: ChCalEvent; ribbon: boolean } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  /** The day under the pointer when a ribbon was grabbed, so a drop moves it by the days the pointer went. */
  const grabDate = useRef<string | null>(null);
  const canDrag = (e: ChCalEvent) => !!coach && !!draggable(e, true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 450, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: dayCoordinates }),
  );
  const announcements = monthAnnouncements(clock);
  const drop: DropAnimation | null = reduced
    ? null
    : (() => {
        const c = chSpringCurve('settle');
        return chSupportsLinear() ? { duration: c.ms, easing: c.linear } : { duration: CH_DUR.base * 1000, easing: `cubic-bezier(${CH_EASE.join(',')})` };
      })();

  const start = ({ active: a }: DragStartEvent) => {
    const d = a.data.current as { e: ChCalEvent; ribbon: boolean };
    setActive(d);
    if (!d.ribbon || !grabDate.current) grabDate.current = d.e.date;
  };
  const end = ({ active: a, over: o }: DragEndEvent) => {
    setActive(null);
    setOver(null);
    const d = a.data.current as { e: ChCalEvent; ribbon: boolean };
    const target = o ? String(o.id) : null;
    const from = grabDate.current ?? d.e.date;
    grabDate.current = null;
    if (!target || target === from) return;
    const days = daysBetween(from, target);
    if (isBar(d.e)) onBarMove?.(d.e, moveSpan(barSpan(d.e), days));
    else if (d.e.start != null && d.e.end != null) onMove?.(d.e, { date: addDays(d.e.date, days), start: d.e.start, end: d.e.end }, 'move');
  };

  /** Arrows between days on the grid's one tab stop; Enter opens the day. Alt with the arrows moves a chip a day. */
  const gridKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    const t = ev.target as HTMLElement;
    if (!t.classList.contains('ch-mo__n')) return;
    const step = ev.key === 'ArrowLeft' ? -1 : ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowUp' ? -7 : ev.key === 'ArrowDown' ? 7 : 0;
    if (!step) return;
    const next = addDays(focusDate, step);
    if (!cells.some((c) => c.date === next)) return;
    ev.preventDefault();
    setFocusDate(next);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-date="${next}"] .ch-mo__n`)?.focus());
  };

  const body = (
    <div className="ch-mo ch-cal-surface">
      <div className="ch-mo__dow" aria-hidden="true">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="ch-mo__grid" role="grid" aria-label={`${monthName(anchor)} ${anchor.slice(0, 4)}`} ref={grid} onKeyDown={gridKey}>
        {weeks.map((week) => {
          const dates = week.map((c) => c.date);
          const ribbons = laneBars(team, dates);
          const lanes = ribbons.length ? Math.max(...ribbons.map((r) => r.row + 1)) : 0;
          return (
            <div key={dates[0]} className="ch-mo__week" role="row">
              {week.map(({ date, out }, ci) => {
                const evs = team.filter((e) => e.date === date && !isBar(e)).sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
                const spanned = team.filter((e) => e.date === date && isBar(e)).length;
                const shown = evs.slice(0, Math.max(0, 3 - lanes));
                const hidden = evs.length - shown.length;
                return (
                  <Cell key={date} date={date} over={over === date} drop={!!active}>
                    <div
                      className={'ch-mo__cell' + (out ? ' is-out' : '') + (date === now.date ? ' is-today' : !out && date < now.date ? ' is-past' : '') + (date === selDate ? ' is-sel' : '') + (over === date ? ' is-target' : '')}
                      style={lanes ? ({ ['--ch-mo-lanes' as string]: lanes } as React.CSSProperties) : undefined}
                    >
                      <button
                        type="button"
                        data-print-visible
                        className="ch-mo__n"
                        tabIndex={date === focusDate ? 0 : -1}
                        aria-label={`${dowOf(date)} ${dayNum(date)} ${monthName(date)}: ${evs.length + spanned ? plural(evs.length + spanned, 'event') : 'no events'}`}
                        aria-pressed={date === selDate}
                        onFocus={() => setFocusDate(date)}
                        onClick={() => {
                          haptic('select');
                          onPick(date);
                        }}
                      >
                        {dayNum(date)}
                      </button>
                      {ribbons
                        .filter((r) => r.c0 === ci)
                        .map((r) => (
                          <Ribbon key={r.e.id} r={r} tab={dates.includes(focusDate) && r.c0 <= dates.indexOf(focusDate) && dates.indexOf(focusDate) <= r.c1} canDrag={canDrag(r.e)} onPick={() => onPick(r.span.from < dates[0]! ? dates[0]! : r.span.from)} onGrab={(d) => (grabDate.current = d)} dates={dates} lifted={active?.e.id === r.e.id} />
                        ))}
                      <div className="ch-mo__evs">
                        {shown.map((e) => (
                          <Chip key={e.id} e={e} tab={date === focusDate} canDrag={canDrag(e)} onPick={() => onPick(date)} lifted={active?.e.id === e.id} onAltMove={(d) => e.start != null && e.end != null && onMove?.(e, { date: addDays(e.date, d), start: e.start, end: e.end }, 'move')} />
                        ))}
                        {hidden > 0 && <span className="ch-mo__more">{hidden} more</span>}
                      </div>
                    </div>
                  </Cell>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
  if (!coach) return body;
  return (
    <DndContext
      sensors={sensors}
      autoScroll={false}
      collisionDetection={dayCollision}
      accessibility={{ announcements, screenReaderInstructions: { draggable: 'Press Space to pick the event up. Arrow keys choose a day, Space drops it there, Escape cancels.' } }}
      onDragStart={start}
      onDragOver={({ over: o }) => {
        const d = o ? String(o.id) : null;
        if (d && d !== over) haptic('select');
        setOver(d);
      }}
      onDragEnd={end}
      onDragCancel={() => {
        setActive(null);
        setOver(null);
        grabDate.current = null;
      }}
    >
      {body}
      <DragOverlay dropAnimation={drop}>
        {active && (
          <div className="ch-mo__lift" data-ch-code="CH-6806">
            <span className={'ch-mo__ev' + (isMajor(active.e.type) ? ` is-major is-${active.e.type}` : '')}>
              {isMajor(active.e.type) ? <Icon icon={TYPE_ICON[active.e.type]} size={11} /> : <i className={`ch-dot-${active.e.type}`} />}
              <span>{active.e.title}</span>
            </span>
            {over && (
              <span className="ch-dd-pill ch-num">
                <span>
                  {dowOf(over)} {dayNum(over)}
                  {active.e.allDay || active.e.start == null ? '' : ` · ${fmtHour(active.e.start, true, clock)}`}
                </span>
              </span>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/** The day under the pointer; by keyboard (no pointer), the cell nearest the moved chip. */
const dayCollision: CollisionDetection = (args) => (args.pointerCoordinates ? pointerWithin(args) : closestCenter(args));

/** dnd-kit's arrows inside the month: a day left or right, a week up or down, onto the next cell's centre. */
const dayCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const step = event.code === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' ? 1 : event.code === 'ArrowUp' ? -7 : event.code === 'ArrowDown' ? 7 : 0;
  if (!step) return undefined;
  event.preventDefault();
  const cur = context.over?.id ? String(context.over.id) : (context.active?.data.current as { e: ChCalEvent } | undefined)?.e.date;
  if (!cur) return currentCoordinates;
  const rect = context.droppableRects.get(addDays(cur, step));
  if (!rect) return currentCoordinates;
  const w = context.collisionRect?.width ?? 0;
  const h = context.collisionRect?.height ?? 0;
  return { x: rect.left + rect.width / 2 - w / 2, y: rect.top + rect.height / 2 - h / 2 };
};

function Cell({ date, children, over, drop }: { date: string; children: ReactNode; over: boolean; drop: boolean }) {
  const { setNodeRef } = useDroppable({ id: date });
  return (
    <div ref={setNodeRef} role="gridcell" data-date={date} className="ch-mo__gc" aria-selected={over && drop ? true : undefined}>
      {children}
    </div>
  );
}

function useMaybeDraggable(id: string, data: object, on: boolean) {
  const d = useDraggable({ id, data, disabled: !on });
  return on ? d : { ...d, attributes: {}, listeners: undefined };
}

function Chip({ e, tab, canDrag, onPick, lifted, onAltMove }: { e: ChCalEvent; tab: boolean; canDrag: boolean; onPick: () => void; lifted: boolean; onAltMove: (days: number) => void }) {
  const { setNodeRef, attributes, listeners } = useMaybeDraggable(`chip:${e.id}`, { e, ribbon: false }, canDrag);
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-print-visible
      {...attributes}
      {...listeners}
      tabIndex={tab ? 0 : -1}
      aria-roledescription={canDrag ? 'draggable event' : undefined}
      aria-label={`${roundLabel(e, e.title).name}${roundLabel(e, e.title).spoken}${e.allDay || e.start == null ? '' : `, ${fmtHour(e.start, true)}`}`}
      className={'ch-mo__ev' + (isMajor(e.type) ? ` is-major is-${e.type}` : '') + (canDrag ? ' is-draggable' : '') + (lifted ? ' is-held' : '')}
      onKeyDown={(ev) => {
        if (canDrag && ev.altKey && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
          ev.preventDefault();
          ev.stopPropagation();
          onAltMove(ev.key === 'ArrowLeft' ? -1 : 1);
          return;
        }
        listeners?.onKeyDown?.(ev);
      }}
      onClick={() => {
        haptic('select');
        onPick();
      }}
    >
      {isMajor(e.type) ? <Icon icon={TYPE_ICON[e.type]} size={11} /> : <i className={`ch-dot-${e.type}`} />}
      <RoundTitle e={e} title={e.title} />
    </button>
  );
}

function Ribbon({ r, tab, canDrag, onPick, onGrab, dates, lifted }: { r: ChLaneBar; tab: boolean; canDrag: boolean; onPick: () => void; onGrab: (date: string) => void; dates: string[]; lifted: boolean }) {
  const { setNodeRef, attributes, listeners } = useMaybeDraggable(`ribbon:${r.e.id}:${dates[0]}`, { e: r.e, ribbon: true }, canDrag);
  const n = r.c1 - r.c0 + 1;
  const { e, span } = r;
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-print-visible
      {...attributes}
      {...listeners}
      tabIndex={tab ? 0 : -1}
      aria-roledescription={canDrag ? 'draggable event' : undefined}
      aria-label={`${roundLabel(e, e.title).name}${roundLabel(e, e.title).spoken}, ${dowOf(span.from)} ${dayNum(span.from)} to ${dowOf(span.to)} ${dayNum(span.to)}`}
      className={`ch-mo__ribbon ch-ev--${e.type}${isMajor(e.type) ? ' is-major' : ''}${r.clipStart ? ' is-clip-start' : ''}${r.clipEnd ? ' is-clip-end' : ''}${canDrag ? ' is-draggable' : ''}${lifted ? ' is-held' : ''}`}
      style={{ ['--ch-mo-span' as string]: n, ['--ch-mo-lane' as string]: r.row } as React.CSSProperties}
      onPointerDownCapture={(ev) => {
        const box = ev.currentTarget.getBoundingClientRect();
        const i = box.width > 0 ? Math.min(n - 1, Math.max(0, Math.floor(((ev.clientX - box.left) / box.width) * n))) : 0;
        onGrab(dates[r.c0 + i]!);
      }}
      onClick={() => {
        haptic('select');
        onPick();
      }}
    >
      <Icon icon={TYPE_ICON[e.type]} size={11} />
      <RoundTitle e={e} title={e.title} />
    </button>
  );
}

export const MONTH_LANE_PX = LANE_PX;
