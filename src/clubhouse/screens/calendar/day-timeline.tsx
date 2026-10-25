'use client';

/**
 * P-4 4.7: the phone Day's drag. A coach holds a movable event row: at 450ms it lifts (the peek's one `select` tick), a
 * 10px move unfolds the day into its hours under the finger, and the card follows the finger 1:1 while a landing slot
 * snaps to the quarter it would take. The sticky week strip and the screen's edges carry it to another day. On release
 * the card settles into the slot, the move is held for Undo (Calendar's `useHeldMoves`), and 600ms later the day folds
 * back into its list. "Adjust time" from the peek opens the same timeline with grips and Done / Cancel.
 *
 * Who owns the gesture (P-4 changelog): `DayView` mounts this engine and the timeline layer above its pager and swap,
 * so the row the finger went down on stays in the document for the whole touch (WebKit sends a detached node's
 * touchmoves nowhere), and the day the card is over is local state; the page's own day changes after the fold. One
 * non-passive `touchmove` on the root, registered at mount, keeps iOS from scrolling while a card is in hand and reads
 * the finger. On a phone the document scrolls (the canvas is `overflow: visible` there), so unfold, auto-scroll and
 * growth all move the window.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { haptic, hapticScrub } from '../../lib/haptics';
import { chSpringCurve, CH_EASE } from '../../lib/motion';
import { chSupportsLinear } from '../../lib/sheet-drag';
import { claimTouch, releaseTouch } from '../../lib/touch-claim';
import { isOffline } from '../../lib/use-action';
import { useChClock } from '../../lib/use-clock';
import type { PeekLift } from '../../ui/Peek';
import { Button } from '../../ui/Button';
import { autoScrollStep, clashesAt, clashSummary, draggable, hourAt, movePill, moveTarget, resizePill, resizeTarget, type ChMoveTarget } from './drag-model';
import { addDays, dayNum, dowOf, fmtHour, layoutLanes, monthName, type ChCalEvent, type ChCalPerson } from './model';
import { EventBlock, isPastEvent, type ChNow } from './views';

/** The unfolded day's hour (a quarter is 16px, a finger-sized step). */
export const PHONE_HH = 64;
/** Auto-scroll zone under the sticky strip and at the screen's foot. */
export const PHONE_ZONE_PX = 64;
/** A hold this close to the screen's side is the edge swipe's (GES-23); a card held here turns the day. */
export const EDGE_PX = 24;
/** A card over a strip day this long goes to that day. */
export const STRIP_SPRING_MS = 500;
/** A card at the screen's edge this long turns the day, and again every this long. */
export const EDGE_TURN_MS = 600;
/** The timeline folds back into the list this long after a drop. */
export const FOLD_MS = 600;
/** Ticks no closer than this on top of haptics' own floor. */
const TICK_MS = 80;
/** One more hour every this long while the card holds the timeline's first or last hour. */
const GROW_MS = 400;
/** The most the card gives sideways: held to its column, not railed. */
const SIDE_GIVE_PX = 12;

const sideGive = (dx: number) => Math.sign(dx) * SIDE_GIVE_PX * (1 - 1 / (Math.abs(dx) / 40 + 1));

export interface ChPhoneDrag {
  e: ChCalEvent;
  to: ChMoveTarget;
  mode: 'drag' | 'adjust';
  kind: 'move' | 'resize';
  edge?: 'start' | 'end';
  clashes: Set<string>;
}

/** The timeline's hours for a day: TimeGrid's rule, the earlier of 6 AM or an hour before the first event to the later of 9 PM or an hour after the last. */
export function dayBounds(events: ChCalEvent[], date: string, extra: { before: number; after: number } = { before: 0, after: 0 }): { from: number; to: number } {
  const timed = events.filter((e) => e.date === date && !e.allDay && e.start != null && e.end != null);
  const first = Math.min(6, ...timed.map((e) => Math.floor(e.start!) - 1));
  const last = Math.max(21, ...timed.map((e) => Math.ceil(e.end!) + 1));
  return { from: Math.max(0, first - extra.before), to: Math.min(24, last + extra.after) };
}

export function usePhoneDayDrag(opts: {
  root: RefObject<HTMLElement | null>;
  events: ChCalEvent[];
  coach: boolean;
  anchor: string;
  reduced: boolean;
  /** The held move: Calendar's `onMove` (series ask, Undo, the one write). */
  onDrop: (e: ChCalEvent, to: ChMoveTarget, kind: 'move' | 'resize') => void;
  /** After the fold: the page's day follows the card's. */
  onDay: (date: string) => void;
  /** A drag landed: the first-run hint goes. */
  onLanded?: () => void;
}) {
  const live = useRef(opts);
  live.current = opts;
  const [lifted, setLifted] = useState<ChCalEvent | null>(null);
  const [drag, setDrag] = useState<ChPhoneDrag | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [extra, setExtra] = useState({ before: 0, after: 0 });
  const [rail, setRail] = useState(92);
  const grid = useRef<HTMLDivElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  /** The gesture in refs: where the finger is, where it took the row, and the timers riding on it. */
  const g = useRef<{
    e: ChCalEvent;
    grabPx: number;
    x0: number;
    x: number;
    y: number;
    to: ChMoveTarget;
    day: string;
    started: boolean;
    tick: number;
    raf: number;
    last: number;
    strip: { date: string; timer: number } | null;
    edge: { dir: -1 | 1; timer: number } | null;
    grow: { edge: 'before' | 'after'; since: number } | null;
    align: boolean;
  } | null>(null);
  const fold = useRef(0);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const extraRef = useRef(extra);
  extraRef.current = extra;

  const shownDay = day ?? opts.anchor;
  const bounds = dayBounds(opts.events, shownDay, extra);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const stopTimers = () => {
    const s = g.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    if (s.strip) window.clearTimeout(s.strip.timer);
    if (s.edge) window.clearInterval(s.edge.timer);
    s.strip = null;
    s.edge = null;
    s.raf = 0;
  };

  const reset = useCallback(() => {
    stopTimers();
    g.current = null;
    setLifted(null);
    setDrag(null);
    setDay(null);
    setOver(null);
    setExtra({ before: 0, after: 0 });
  }, []);

  useEffect(
    () => () => {
      stopTimers();
      window.clearTimeout(fold.current);
    },
    [],
  );

  /** Where the finger puts the card: the time read against the timeline's current rect (scrolls and growth included). */
  const place = useCallback(() => {
    const s = g.current;
    const el = grid.current;
    if (!s || !el || !s.started) return;
    const r = el.getBoundingClientRect();
    const b = boundsRef.current;
    const e = s.e;
    const len = e.end! - e.start!;
    const grabH = Math.min(len, Math.max(0, s.grabPx / PHONE_HH));
    const span = moveTarget({ start: e.start!, end: e.end! }, hourAt(s.y, r.top, PHONE_HH, b.from), grabH, b);
    const to: ChMoveTarget = { date: s.day, ...span };
    if (card.current) card.current.style.transform = `translate3d(${sideGive(s.x - s.x0)}px, ${s.y - s.grabPx - r.top}px, 0)`;
    const now = performance.now();
    // Growth: the card holding the first or last hour asks for one more every 400ms.
    const edge = span.start <= b.from && b.from > 0 ? 'before' : span.end >= b.to && b.to < 24 ? 'after' : null;
    if (!edge) s.grow = null;
    else if (!s.grow || s.grow.edge !== edge) s.grow = { edge, since: now };
    else if (now - s.grow.since >= GROW_MS) {
      s.grow = { edge, since: now };
      setExtra((x) => ({ ...x, [edge]: x[edge] + 1 }));
      // An hour added on top pushes the grid down: the page follows in the same pass, so the card stays put.
      if (edge === 'before') window.scrollBy(0, PHONE_HH);
    }
    if (s.to.date === to.date && s.to.start === to.start && s.to.end === to.end) return;
    s.to = to;
    if (now - s.tick >= TICK_MS) {
      s.tick = now;
      hapticScrub('step');
    }
    setDrag({ e, to, mode: 'drag', kind: 'move', clashes: clashesAt(e, to, live.current.events) });
  }, []);

  const turnDay = useCallback(
    (date: string) => {
      const s = g.current;
      if (!s || date === s.day) return;
      s.day = date;
      haptic('select');
      setDay(date);
      setExtra({ before: 0, after: 0 });
      place();
    },
    [place],
  );

  /** The other day: a strip day held under the card for 500ms, or the screen's edge for 600ms (and again). */
  const reach = useCallback(() => {
    const s = g.current;
    if (!s) return;
    const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(s.x, s.y) : null;
    const d = (hit?.closest?.('.ch-wks [data-date]') as HTMLElement | null)?.dataset.date ?? null;
    if (d !== (s.strip?.date ?? null)) {
      if (s.strip) window.clearTimeout(s.strip.timer);
      s.strip = d && d !== s.day ? { date: d, timer: window.setTimeout(() => (turnDay(d), setOver(null)), STRIP_SPRING_MS) } : null;
      setOver(s.strip?.date ?? null);
    }
    const dir = s.x < EDGE_PX ? -1 : s.x > window.innerWidth - EDGE_PX ? 1 : 0;
    if (dir !== (s.edge?.dir ?? 0)) {
      if (s.edge) window.clearInterval(s.edge.timer);
      s.edge = dir ? { dir, timer: window.setInterval(() => g.current && turnDay(addDays(g.current.day, dir)), EDGE_TURN_MS) } : null;
    }
  }, [turnDay]);

  /** Auto-scroll near the sticky strip and the tab bar, in px/s; the card is re-placed every step. */
  const loop = useCallback(() => {
    const s = g.current;
    if (!s?.started) return;
    const t = performance.now();
    const dt = s.last ? t - s.last : 16;
    s.last = t;
    const root = live.current.root.current;
    const top = root?.querySelector('.ch-wks')?.getBoundingClientRect().bottom ?? 0;
    // No bottom bar on the phone since the section strip (tokens.css --ch-tabbar-h): the zone sits on the screen's foot.
    const bottom = window.innerHeight;
    const dy = s.y < top + PHONE_ZONE_PX ? -autoScrollStep(s.y - top, PHONE_ZONE_PX, dt) : s.y > bottom - PHONE_ZONE_PX ? autoScrollStep(bottom - s.y, PHONE_ZONE_PX, dt) : 0;
    if (dy) window.scrollBy(0, dy);
    place();
    s.raf = requestAnimationFrame(loop);
  }, [place]);

  const drop = useCallback(
    (cancelled: boolean) => {
      const s = g.current;
      if (!s) return;
      stopTimers();
      releaseTouch();
      if (!s.started) {
        reset();
        return;
      }
      hapticScrub('end');
      const e = s.e;
      const to = s.to;
      const moved = !cancelled && (to.date !== e.date || to.start !== e.start || to.end !== e.end);
      if (!moved) {
        reset();
        return;
      }
      // The card springs from the finger to its slot; the move is held for Undo; the day folds after 600ms.
      const el = card.current;
      const gridEl = grid.current;
      if (el && gridEl && !live.current.reduced && typeof el.animate === 'function') {
        const slot = (to.start - boundsRef.current.from) * PHONE_HH;
        const now = el.style.transform;
        el.style.transform = `translate3d(0, ${slot}px, 0)`;
        const curve = chSpringCurve('settle');
        el.animate([{ transform: now }, { transform: el.style.transform }], { duration: curve.ms, easing: chSupportsLinear() ? curve.linear : `cubic-bezier(${CH_EASE.join(',')})` });
      }
      live.current.onDrop(e, to, 'move');
      live.current.onLanded?.();
      g.current = null;
      window.clearTimeout(fold.current);
      fold.current = window.setTimeout(() => {
        const date = to.date;
        reset();
        if (date !== live.current.anchor) live.current.onDay(date);
      }, FOLD_MS);
    },
    [reset],
  );

  // Mount-time listeners on the root (the touched row stays inside it): a blocking touchmove that holds iOS still while
  // a card is in hand and reads the finger, and the touch's end as the drop.
  useEffect(() => {
    const root = opts.root.current;
    if (!root) return;
    const onMove = (ev: TouchEvent) => {
      const s = g.current;
      if (!s) return;
      if (ev.cancelable) ev.preventDefault();
      const t = ev.touches[0];
      if (!t || !s.started) return;
      s.x = t.clientX;
      s.y = t.clientY;
      place();
      reach();
    };
    const onEnd = () => drop(false);
    const onCancel = () => drop(true);
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onCancel);
    return () => {
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onCancel);
    };
  }, [opts.root, place, reach, drop]);

  // The unfold: in the layout pass that draws the timeline, the page scrolls so the event's slot is under the finger
  // (`slotTop - scrollTop = fingerY - grab`); the card doesn't jump.
  useLayoutEffect(() => {
    const s = g.current;
    const el = grid.current;
    if (!s?.align || !el) return;
    s.align = false;
    const slot = el.getBoundingClientRect().top + (s.e.start! - boundsRef.current.from) * PHONE_HH;
    const want = s.y - s.grabPx;
    if (Math.abs(slot - want) > 0.5) window.scrollBy(0, slot - want);
    place();
  });

  const liftFor = useCallback(
    (e: ChCalEvent): PeekLift | undefined => {
      if (draggable(e, live.current.coach) !== 'timed' || e.span) return undefined;
      return {
        lift: (at, rect) => {
          // The edge swipe's zone is the edge swipe's; offline, the peek opens as before (nothing could be written).
          if (at.x < EDGE_PX || at.x > window.innerWidth - EDGE_PX || isOffline()) return false;
          window.clearTimeout(fold.current);
          const row = live.current.root.current?.querySelector(`[data-ev-id="${CSS.escape(e.id)}"] .ch-calm-ev__b`);
          const rootLeft = live.current.root.current?.getBoundingClientRect().left ?? 0;
          if (row) setRail(Math.round(row.getBoundingClientRect().left - rootLeft));
          g.current = { e, grabPx: Math.max(0, at.y - rect.top), x0: at.x, x: at.x, y: at.y, to: { date: e.date, start: e.start!, end: e.end! }, day: e.date, started: false, tick: -Infinity, raf: 0, last: 0, strip: null, edge: null, grow: null, align: false };
          claimTouch('lifted');
          hapticScrub('start');
          setLifted(e);
          return true;
        },
        drag: (at) => {
          const s = g.current;
          if (!s) return;
          s.started = true;
          s.x = at.x;
          s.y = at.y;
          s.align = true;
          setDay(s.day);
          setDrag({ e, to: s.to, mode: 'drag', kind: 'move', clashes: clashesAt(e, s.to, live.current.events) });
          s.raf = requestAnimationFrame(loop);
        },
        settle: () => {
          hapticScrub('end');
          g.current = null;
          setLifted(null);
        },
        cancel: () => releaseTouch(),
      };
    },
    [loop],
  );

  /** "Adjust time": the timeline with the event selected, grips at both ends, Done and Cancel. */
  const adjust = useCallback((e: ChCalEvent) => {
    if (e.start == null || e.end == null) return;
    window.clearTimeout(fold.current);
    setDay(e.date);
    setDrag({ e, to: { date: e.date, start: e.start, end: e.end }, mode: 'adjust', kind: 'move', clashes: clashesAt(e, { date: e.date, start: e.start, end: e.end }, live.current.events) });
  }, []);

  /** A touch on an Adjust grip (`edge`) or on the body: it moves that edge, or the whole event, in quarters. */
  const adjustPointer = useCallback((ev: ReactPointerEvent<HTMLElement>, edge?: 'start' | 'end') => {
    const d = dragRef.current;
    const el = grid.current;
    if (!d || d.mode !== 'adjust' || !el) return;
    ev.stopPropagation();
    ev.preventDefault();
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    const origin = d.to;
    const r0 = el.getBoundingClientRect();
    const b = boundsRef.current;
    const grabH = hourAt(ev.clientY, r0.top, PHONE_HH, b.from) - origin.start;
    let last = origin;
    let tick = -Infinity;
    hapticScrub('start');
    const move = (m: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const h = hourAt(m.clientY, r.top, PHONE_HH, b.from);
      const span = edge ? resizeTarget(origin, edge, h, b) : moveTarget(origin, h, grabH, b);
      const to = { date: origin.date, ...span };
      if (to.start === last.start && to.end === last.end) return;
      last = to;
      const now = performance.now();
      if (now - tick >= TICK_MS) {
        tick = now;
        hapticScrub('step');
      }
      const base = dragRef.current!.e;
      const kind = to.end - to.start !== base.end! - base.start! ? 'resize' : 'move';
      setDrag({ e: base, to, mode: 'adjust', kind, edge: kind === 'resize' ? (edge ?? (to.start !== base.start ? 'start' : 'end')) : undefined, clashes: clashesAt(base, to, live.current.events) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      hapticScrub('end');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, []);

  const done = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    const { e, to } = d;
    if (to.start !== e.start || to.end !== e.end) {
      live.current.onDrop(e, to, to.end - to.start !== e.end! - e.start! ? 'resize' : 'move');
      live.current.onLanded?.();
    }
    reset();
  }, [reset]);

  return { lifted, drag, day: shownDay, over, bounds, rail, grid, card, liftFor, adjust, adjustPointer, done, cancel: reset, unfolded: !!drag };
}

/**
 * The unfolded day: hours down the list's time column, the day's events as blocks in the 4.1 materials from the list's
 * title column, the now line, the event in hand as a footprint where it was, a landing slot where it will go, and the
 * card on the finger with its pill. In Adjust time the event sits in its slot with two grips and a bar of Cancel and Done.
 */
export function DayTimeline({
  engine,
  events,
  people,
  now,
  viewerId,
  range,
}: {
  engine: ReturnType<typeof usePhoneDayDrag>;
  events: ChCalEvent[];
  people: Map<string, ChCalPerson>;
  now: ChNow;
  viewerId: string | null;
  range: { from: string; to: string };
}) {
  const clock = useChClock();
  const { drag, day, bounds, rail } = engine;
  if (!drag) return null;
  const { from, to } = bounds;
  const { e } = drag;
  const waiting = day < range.from || day > range.to;
  const laid = waiting ? [] : layoutLanes(events.filter((x) => x.date === day && !x.allDay && x.start != null && x.end != null && x.id !== e.id));
  const target = drag.to;
  const slotTop = (target.start - from) * PHONE_HH;
  const slotH = Math.max((target.end - target.start) * PHONE_HH, 22);
  const adjusting = drag.mode === 'adjust';
  const pill = drag.kind === 'resize' && drag.edge ? resizePill(drag.edge, target, clock) : movePill(e, target, clock);
  const clash = clashSummary(e, drag.clashes, events, people).line;
  const nowVisible = day === now.date && now.hour >= from && now.hour <= to;
  return (
    <section className={'ch-tl' + (adjusting ? ' is-adjust' : '')} aria-label={`${dowOf(day)} ${dayNum(day)} ${monthName(day)}, by the hour`} style={{ '--ch-tl-rail': `${rail}px` } as CSSProperties}>
      <div className="ch-calm-dayk">
        <h3>
          {dowOf(day)} {dayNum(day)} {monthName(day)}
        </h3>
      </div>
      <div ref={engine.grid} className="ch-tl__grid" style={{ height: (to - from) * PHONE_HH }}>
        {Array.from({ length: to - from }, (_, i) => (
          <span key={i} className="ch-tl__h" style={{ top: i * PHONE_HH }} aria-hidden="true">
            {i > 0 && <em className="ch-num">{fmtHour(from + i, true, clock)}</em>}
          </span>
        ))}
        <div className="ch-tl__col">
          {laid.map((l) => (
            <EventBlock key={`${l.e.id}${l.e.date}`} e={l.e} lane={l.lane} lanes={l.lanes} sel={false} flagged={false} people={people} viewerId={viewerId} onSelect={() => {}} from={from} to={to} hh={PHONE_HH} state={drag.clashes.has(l.e.id) ? 'clash' : undefined} past={isPastEvent(l.e, now)} />
          ))}
          {e.date === day && <EventBlock e={e} lane={0} lanes={1} sel={false} flagged={false} people={people} viewerId={viewerId} onSelect={() => {}} from={from} to={to} hh={PHONE_HH} state="held" />}
          {!adjusting && <span className="ch-tl__slot" aria-hidden="true" style={{ transform: `translateY(${slotTop}px)`, height: slotH }} />}
          {nowVisible && <div className="ch-wk__now" role="separator" aria-label={`Now, ${fmtHour(now.hour, true, clock)}`} style={{ top: (now.hour - from) * PHONE_HH }} />}
          <div
            ref={engine.card}
            className="ch-dd-card ch-tl__card"
            aria-hidden={adjusting ? undefined : true}
            style={{ height: slotH, ...(adjusting ? { transform: `translate3d(0, ${slotTop}px, 0)` } : {}) } as CSSProperties}
            onPointerDown={adjusting ? (ev) => engine.adjustPointer(ev) : undefined}
          >
            <EventBlock e={{ ...e, date: target.date, start: target.start, end: target.end }} lane={0} lanes={1} sel={adjusting} flagged={false} people={people} viewerId={viewerId} onSelect={() => {}} from={target.start} to={target.end} hh={PHONE_HH} state="card" />
            <span className={'ch-dd-pill ch-num' + (clash ? ' is-clash' : '')}>
              <span>{pill}</span>
              {clash && <span className="ch-dd-pill__clash">{clash}</span>}
            </span>
            {adjusting && (
              <>
                <span className="ch-tl__grip is-top" aria-hidden="true" onPointerDown={(ev) => engine.adjustPointer(ev, 'start')}>
                  <i />
                </span>
                <span className="ch-tl__grip is-bottom" aria-hidden="true" onPointerDown={(ev) => engine.adjustPointer(ev, 'end')}>
                  <i />
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      {adjusting && (
        <div className="ch-tl__bar" role="group" aria-label={`Adjust ${e.title}`}>
          <Button variant="ghost" onClick={engine.cancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={engine.done}>
            Done
          </Button>
        </div>
      )}
    </section>
  );
}
