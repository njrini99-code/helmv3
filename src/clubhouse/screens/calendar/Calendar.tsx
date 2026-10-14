'use client';

import { CalendarCheck, CalendarDays, Check, Lock, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Ellipsis, Plus, Printer, Rss, TriangleAlert, Users, X } from 'lucide-react';
import { AnimatePresence, m, useIsPresent } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useChSessionState } from '../../lib/session-state';
import type { ChCalendarData } from '../../data/calendar';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import { InlineNotice, PageNotice } from '../../ui/Notices';
import { EmptyState } from '../../ui/States';
import { SearchField } from '../../ui/SearchField';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Segmented } from '../../ui/Segmented';
import { Swap } from '../../ui/Swap';
import { useNow } from '../../lib/use-now';
import { haptic } from '../../lib/haptics';
import { chReport, chTrail } from '../../lib/track';
import { addDays, addMonths, CAL_HH, daylightOn, dayNum, dowOf, fmtHour, type ChDaylight, findOverlaps, focusHour, monthCells, monthKey, monthName, viewTitle, weekDates, yearOf, type ChCalEvent, type ChCalType, type ChCalView } from './model';
import { AgendaView, MonthView, TimeGrid, type ChMoveTarget, type ChNow } from './views';
import { updateGolfEvent } from '@/app/golf/actions/calendar-events';
import { offsetMinutesFor } from '@/lib/golf/timezone';
import { useToast } from '../../ui/Toast';
import { friendlyReason, isOffline } from '../../lib/use-action';
import { Attendance, EventDetail, Overlap, Summary, type ChInsp, type InspCtx } from './inspector';
import { CancelEvent, EventEditor, SubscribeSheet, type EditorSeed } from './editor';
import { BusySheet } from './extras';
import { CalendarPhone } from './CalendarPhone';
import { Modal } from '../../ui/Modal';
import { useChPhone } from '../../lib/use-phone';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { CH_POP, chTween } from '../../lib/motion';
import { useLightPlace } from '../../shell/light';
import { canvasLenis, canvasScrollNow, usePanelSmoothScroll } from '../../lib/smooth-scroll';
import { usePopoverFit } from '../../lib/use-popover-fit';
import { CalendarFirstRun } from './CalendarFirstRun';
import { chFocusQuietly } from '../../lib/focus-quietly';

function zonedNow(timeZone: string, d: Date): ChNow {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d)) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: (Number(p.hour) % 24) + Number(p.minute) / 60 };
}

/**
 * P006-B1: T or Today puts now (or the next event) about 30% down the canvas; the page itself opens at its top. A step
 * to another week keeps the canvas where it is, so the same hours stay in view. Instant with reduced motion; eased
 * otherwise. `tick` asks again; the request waits until the grid for `first` (the
 * first day on show) is on the page, since Today may have to load another week first.
 */
function useOpenOnNow(tick: number, first: string, on: boolean, hour: number | null, reduced: boolean) {
  const seen = useRef(0);
  const settle = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    if (!on || seen.current === tick) return;
    const canvas = document.getElementById('ch-canvas');
    const grid = document.querySelector<HTMLElement>(`.ch-wk__grid[data-first="${first}"]`);
    if (!canvas || !grid) return;
    const opening = seen.current === 0;
    seen.current = tick;
    // The page opens at its top (RouteFrame owns that); only T or Today moves the grid to now.
    if (hour == null || opening) return;
    const place = () =>
      Math.max(0, Math.round(grid.getBoundingClientRect().top - canvas.getBoundingClientRect().top + canvas.scrollTop + (hour - Number(grid.dataset.from ?? 0)) * CAL_HH - canvas.clientHeight * 0.3));
    settle.current?.();
    if (!reduced) {
      const lenis = canvasLenis();
      if (lenis) lenis.scrollTo(place());
      else canvas.scrollTo({ top: place(), behavior: 'smooth' });
      return;
    }
    // Held for a moment while a newly loaded week settles. A wheel, touch or key from the coach lets go at once, and so
    // does leaving the page.
    const until = Date.now() + 900;
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      for (const t of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.removeEventListener(t, stop, true);
      settle.current = null;
    };
    const hold = () => {
      if (!grid.isConnected) return stop();
      const to = place();
      if (Math.abs(canvas.scrollTop - to) > 2) canvasScrollNow(to);
      if (Date.now() < until) frame = requestAnimationFrame(hold);
      else stop();
    };
    for (const t of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(t, stop, { capture: true, passive: true });
    settle.current = stop;
    hold();
  }, [tick, first, on, hour, reduced]);
}

/**
 * P006-B3: how long a dragged event's move can be undone: the done toast's own life (ui/Toast.tsx DISMISS_MS.done), so
 * Undo is on screen for the whole window. Nothing is written until it closes, so invitees hear of a move only once
 * it stands, and an undone move never reaches anyone.
 */
const MOVE_UNDO_MS = 4000;
/** Widgets whose arrow keys move their own selection or focus, and the page's popovers (A-09). */
const COMPOSITE = '[role="radiogroup"], [role="tablist"], [role="menu"], [role="menubar"], [role="listbox"], [role="grid"], [role="tree"], [role="slider"], [role="dialog"]';
const toHHMM = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** Optimistic moves held for their Undo window, then written. Leaving the page writes a waiting move at once. */
/** `preview`: the dev preview keeps a move on screen and writes nothing. */
function useHeldMoves(timezone: string, events: ChCalEvent[], today: string, onSaved: () => void, preview: boolean) {
  const toast = useToast();
  const [moves, setMoves] = useState<Map<string, ChMoveTarget>>(() => new Map());
  const held = useRef<{ id: string; timer: number; write: () => void } | null>(null);
  const drop = useCallback((id: string) => setMoves((m) => (m.has(id) ? new Map([...m].filter(([k]) => k !== id)) : m)), []);
  // The server's copy has caught up: the moves already written stand on their own.
  useEffect(() => {
    setMoves((m) => (held.current && m.has(held.current.id) ? new Map([[held.current.id, m.get(held.current.id)!]]) : new Map()));
  }, [events]);
  const flush = useCallback(() => {
    const h = held.current;
    if (!h) return;
    window.clearTimeout(h.timer);
    h.write();
  }, []);
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);
  const move = useCallback(
    (e: ChCalEvent, to: ChMoveTarget) => {
      flush();
      if (isOffline()) {
        haptic('error');
        toast({ tone: 'error', title: `Couldn’t move ${e.title}: you’re offline`, body: 'Reconnect, then try again. Nothing was changed.', code: 'CH-1903' });
        return;
      }
      setMoves((m) => new Map(m).set(e.id, to));
      const write = () => {
        held.current = null;
        if (preview) return;
        chTrail('calendar move event');
        const startTime = toHHMM(to.start);
        const fail = (err: unknown) => {
          chReport(err, { surface: 'calendar.moveEvent', action: 'calendar.moveEvent' });
          drop(e.id);
          haptic('error');
          toast({ tone: 'error', title: `Couldn’t move ${e.title}`, body: (err instanceof Error && friendlyReason(err.message)) || 'It’s back where it was. Try again in a moment.', code: 'CH-6015' });
        };
        updateGolfEvent(e.id, {
          startDate: to.date,
          endDate: to.date,
          startTime,
          endTime: toHHMM(to.end),
          allDay: false,
          timezoneOffset: offsetMinutesFor(to.date, startTime, timezone) ?? undefined,
        } as never)
          .then((res) => (res?.success ? onSaved() : fail(new Error(res?.error || 'Move was not saved'))))
          .catch(fail);
      };
      held.current = { id: e.id, timer: window.setTimeout(write, MOVE_UNDO_MS), write };
      const day = to.date === e.date ? '' : ` ${to.date === today ? 'today' : `on ${dowOf(to.date)} ${dayNum(to.date)}`}`;
      toast({
        title: `Moved to ${fmtHour(to.start)}${day}`,
        action: {
          label: 'Undo',
          run: () => {
            const h = held.current;
            if (!h || h.id !== e.id) return;
            window.clearTimeout(h.timer);
            held.current = null;
            drop(e.id);
            haptic('select');
          },
        },
      });
    },
    [flush, drop, toast, timezone, today, onSaved, preview],
  );
  return { moves, move };
}

/**
 * A page popover's enter and exit (A-23, A-24): the Menu's pop on the quick tween (CH_POP); reduced motion and Animations
 * off fade at once. The copy on its way out leaves the accessibility tree and takes no input.
 */
function Pop({ panel, className, label, style, children }: { panel: RefObject<HTMLDivElement | null>; className: string; label: string; style?: CSSProperties; children: ReactNode }) {
  const reduced = useChReducedMotion();
  const present = useIsPresent();
  return (
    <m.div
      ref={panel}
      className={className}
      role="dialog"
      aria-label={label}
      aria-hidden={!present || undefined}
      inert={!present}
      style={style}
      initial={reduced ? { opacity: 0 } : CH_POP.initial}
      animate={reduced ? { opacity: 1 } : CH_POP.animate}
      exit={reduced ? { opacity: 0 } : CH_POP.exit}
      transition={chTween('quick', reduced)}
    >
      {children}
    </m.div>
  );
}

/** `onClose(true)`: Esc or Close, so focus goes back to the title; an outside click leaves focus where it went. */
function JumpPanel({ anchor, today, view, trigger, onPick, onClose }: { anchor: string; today: string; view: ChCalView; trigger: RefObject<HTMLElement | null>; onPick: (d: string) => void; onClose: (returnFocus: boolean) => void }) {
  const [month, setMonth] = useState(`${monthKey(anchor)}-01`);
  const ref = useRef<HTMLDivElement | null>(null);
  const placement = usePopoverFit(ref);
  const present = useIsPresent();
  const close = useRef(onClose);
  close.current = onClose;
  const range = view === 'week' ? new Set(weekDates(anchor)) : new Set([anchor]);
  // Opening puts focus on the day on show: once, not again each time the page behind it renders.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.is-range, .ch-cal-jump__d')?.focus();
  }, []);
  useEffect(() => {
    if (!present) return;
    // The title toggles the panel itself: a press on it is not an outside click.
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node) && close.current(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close.current(true);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [present, trigger]);
  return (
    <Pop panel={ref} className="ch-cal-jump" label="Jump to a date" style={placement}>
      <div className="ch-cal-jump__head">
        <span>
          {monthName(month)} {yearOf(month)}
        </span>
        <span className="ch-cal-jump__nav">
          <IconButton icon={ChevronLeft} label="Previous month" size="sm" onClick={() => setMonth(addMonths(month, -1))} />
          <IconButton icon={ChevronRight} label="Next month" size="sm" onClick={() => setMonth(addMonths(month, 1))} />
          <IconButton icon={X} label="Close" size="sm" onClick={() => onClose(true)} />
        </span>
      </div>
      <div className="ch-cal-jump__grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="ch-cal-jump__dow" aria-hidden="true">
            {d}
          </span>
        ))}
        {monthCells(month).map(({ date, out }) => (
          <button
            key={date}
            type="button"
            className={'ch-cal-jump__d' + (out ? ' is-out' : '') + (date === today ? ' is-today' : '') + (range.has(date) ? ' is-range' : '')}
            aria-label={`${dayNum(date)} ${monthName(date)}${date === today ? ', today' : ''}`}
            onClick={() => {
              haptic('select');
              onPick(date);
            }}
          >
            {dayNum(date)}
          </button>
        ))}
      </div>
    </Pop>
  );
}

function PeoplePicker({ people, sel, setSel }: { people: ChCalendarData['people']; sel: string[]; setSel: (s: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const popover = useRef<HTMLDivElement | null>(null);
  const placement = usePopoverFit(popover, open);
  // Esc and Done hand focus back to the trigger (A-24); an outside click leaves it where it went.
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    // Focus goes into the picker as it opens, on its search: typing finds a player, Tab reaches the list.
    popover.current?.querySelector<HTMLElement>('input')?.focus();
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close(true);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  const chosen = people.filter((p) => sel.includes(p.id));
  const stack = (chosen.length ? chosen : people).slice(0, 4);
  const count = chosen.length || people.length;
  const label = !chosen.length ? 'Everyone' : chosen.length === 1 ? chosen[0]!.name : `${chosen.length} players`;
  const detail = !chosen.length ? `Team schedule · ${people.length} ${people.length === 1 ? 'player' : 'players'}` : chosen.length === 1 ? 'Their events and classes' : chosen.map((p) => p.name.split(' ')[0]).join(', ');
  const list = people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const tog = (id: string) => {
    haptic('select');
    setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  };
  return (
    <div className="ch-pp" ref={ref}>
      <button ref={trigger} type="button" className={'ch-pp__trigger' + (chosen.length ? ' is-on' : '')} onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open} aria-label={`People: ${label}`}>
        <span className="ch-pp__stack">
          {stack.map((p) => (
            <Avatar key={p.id} name={p.name} size={26} />
          ))}
          {count > 4 && <span className="ch-pp__more">+{count - 4}</span>}
        </span>
        <span className="ch-pp__txt">
          <b>{label}</b>
          <span>{detail}</span>
        </span>
        <Icon icon={ChevronsUpDown} size={14} />
      </button>
      {chosen.length > 0 && (
        <Button size="sm" onClick={() => setSel([])}>
          Clear
        </Button>
      )}
      <AnimatePresence>
        {open && (
        <Pop panel={popover} className="ch-pp__pop" label="Choose people" style={placement}>
          <SearchField className="ch-pp__search" value={q} onChange={setQ} placeholder="Find a player" label="Find a player" />
          <button type="button" className="ch-pp__row" aria-pressed={!chosen.length} onClick={() => (haptic('select'), setSel([]))}>
            <span className="ch-pp__all">
              <Icon icon={Users} size={14} />
            </span>
            <span className="ch-pp__name">
              <b>Everyone</b>
              <span>Whole team schedule</span>
            </span>
            {!chosen.length ? <Icon icon={Check} size={15} /> : <span />}
          </button>
          <div className="ch-pp__label">Players · {chosen.length ? `${chosen.length} selected` : 'choose one or more'}</div>
          <div className="ch-pp__list">
            {list.map((p) => {
              const on = sel.includes(p.id);
              return (
                <button key={p.id} type="button" className="ch-pp__row" aria-pressed={on} onClick={() => tog(p.id)}>
                  <Avatar name={p.name} size={28} />
                  <span className="ch-pp__name">
                    <b>{p.name}</b>
                    <span>{p.year ?? 'Player'}</span>
                  </span>
                  <span className={'ch-pp__box' + (on ? ' is-on' : '')}>{on && <Icon icon={Check} size={12} />}</span>
                </button>
              );
            })}
            {!list.length && <div className="ch-pp__empty">No one matches “{q.trim()}”.</div>}
          </div>
          <div className="ch-pp__foot">
            <span>{chosen.length > 1 ? 'Overlaps show where schedules collide' : 'Pick two or more to compare'}</span>
            <Button size="sm" variant="primary" onClick={() => close(true)}>
              Done
            </Button>
          </div>
        </Pop>
        )}
      </AnimatePresence>
    </div>
  );
}

const buildUrl = (view: ChCalView, date: string, today: string, event?: string) => {
  const q = new URLSearchParams();
  if (view !== 'week') q.set('view', view);
  if (date !== today) q.set('date', date);
  if (event) q.set('event', event);
  const s = q.toString();
  return `/golf/dashboard/calendar${s ? `?${s}` : ''}`;
};

/** `frozen` pins the clock to the loaded "now" (the dev preview renders a fixed day). */
export function Calendar({
  data,
  initialEvent,
  initialNew = false,
  initialWith,
  initialType,
  frozen = false,
}: {
  data: ChCalendarData;
  initialEvent?: string;
  initialNew?: boolean;
  /** With `initialNew`: a 1:1 with this player (Roster's Plan 1:1, D-52). */
  initialWith?: string;
  /** With `initialNew`: the new event's type (the phone Home's quick chips). */
  initialType?: ChCalType;
  frozen?: boolean;
}) {
  const preview = frozen;
  const router = useRouter();
  const [pending, start] = useTransition();
  const coach = data.role === 'coach';
  const [view, setView] = useState<ChCalView>(data.view);
  const [anchor, setAnchor] = useState(data.anchor);
  // The player filter comes back with the page; view and date already live in the URL (PAGE_PERFORMANCE.md rule 1).
  const [sel, setSel] = useChSessionState<string[]>('players', []);
  const [insp, setInsp] = useState<ChInsp>(() => {
    const e = initialEvent ? data.events.find((x) => x.id === initialEvent) : undefined;
    return e ? { kind: 'event', id: e.id, date: e.date } : null;
  });
  // `?new=1` (Home's New event) opens the editor once; `&with=<playerId>` (Roster's Plan 1:1) makes it a
  // meeting with only that player invited. The params are dropped so a reload doesn't reopen it.
  const [editor, setEditor] = useState<EditorSeed | null>(() =>
    initialNew && coach ? (initialWith ? { event: null, type: 'meeting', invite: [initialWith] } : { event: null, type: initialType }) : null,
  );
  useEffect(() => {
    if (!initialNew || frozen) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('new');
    url.searchParams.delete('with');
    url.searchParams.delete('type');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [initialNew, frozen]);
  const [cancelling, setCancelling] = useState<ChCalEvent | null>(null);
  const [subs, setSubs] = useState(false);
  const [busyOpen, setBusyOpen] = useState(false);
  const [jump, setJump] = useState(false);
  const jumpBtn = useRef<HTMLButtonElement | null>(null);
  const closeJump = useCallback((returnFocus: boolean) => {
    setJump(false);
    if (returnFocus) jumpBtn.current?.focus();
  }, []);
  const phone = useChPhone();
  const clock = useNow();
  const now = useMemo<ChNow>(() => (clock && !frozen ? zonedNow(data.timezone, clock) : { date: data.today, hour: data.nowHour }), [clock, frozen, data.timezone, data.today, data.nowHour]);

  // The server is the source of truth: when it re-renders (navigation or refresh), follow it.
  // Where a step outside the loaded window is headed while its payload is on the way. The page keeps showing (and
  // labelling) the week it has; a second quick tap steps on from the target instead of asking for the same week again.
  const target = useRef<string | null>(null);
  useEffect(() => {
    setView(data.view);
    setAnchor(data.anchor);
    target.current = null;
  }, [data.view, data.anchor]);

  const people = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  const refreshQuiet = useCallback(() => router.refresh(), [router]);
  const { moves, move } = useHeldMoves(data.timezone, data.events, data.today, refreshQuiet, preview);
  const placed = useMemo(() => (moves.size ? data.events.map((e) => (moves.has(e.id) ? { ...e, ...moves.get(e.id)! } : e)) : data.events), [data.events, moves]);
  const events = useMemo(
    () => (sel.length ? placed.filter((e) => (e.type === 'class' ? e.owner != null && sel.includes(e.owner) : e.people.some((p) => sel.includes(p)))) : placed),
    [placed, sel],
  );
  const overlaps = useMemo(() => (coach ? findOverlaps(data.events.filter((e) => !e.cancelled)) : []), [coach, data.events]);
  const flagged = useMemo(() => new Set(overlaps.map((o) => o.eventId)), [overlaps]);

  const go = useCallback(
    (nextView: ChCalView, nextAnchor: string) => {
      const url = buildUrl(nextView, nextAnchor, data.today);
      chTrail(`calendar ${nextView} ${nextAnchor}`);
      if (nextAnchor >= data.range.from && nextAnchor <= data.range.to && (nextView !== 'month' || monthKey(nextAnchor) === monthKey(data.anchor) || (monthCells(nextAnchor)[0]!.date >= data.range.from && monthCells(nextAnchor).at(-1)!.date <= data.range.to))) {
        target.current = null;
        setView(nextView);
        setAnchor(nextAnchor);
        window.history.replaceState(null, '', url);
        return;
      }
      target.current = nextAnchor;
      start(() => router.push(url, { scroll: false }));
    },
    [data.today, data.range, data.anchor, router],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      // CH-6701: a tick on changing view, week or players, opening an event, a day or a panel item.
      haptic('select');
      const from = target.current ?? anchor;
      if (view === 'day') go(view, addDays(from, dir));
      else if (view === 'week') go(view, addDays(from, 7 * dir));
      else if (view === 'month') go(view, addMonths(from, dir));
    },
    [view, anchor, go],
  );
  const [focusTick, setFocusTick] = useState(1);
  const goToday = useCallback(() => {
    haptic('select');
    setFocusTick((t) => t + 1);
    go(view, now.date);
  }, [go, view, now.date]);

  const refresh = useCallback(() => start(() => router.refresh()), [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A key sent to the document or window has no closest (TypeError on the Simulator, 2026-10-14).
      const t = e.target instanceof Element ? e.target : null;
      // A key a control already used (the View radios' arrows, a popover's Esc) is not also a calendar shortcut (A-09).
      if (e.defaultPrevented) return;
      if (t?.closest('input, textarea, select, [contenteditable="true"], dialog[open]') || e.metaKey || e.ctrlKey || e.altKey || editor || cancelling || subs || busyOpen) return;
      // Arrows inside a widget that moves its own selection, or inside a popover, belong to it; N and T still work there.
      if (e.key.startsWith('Arrow') && t?.closest(COMPOSITE)) return;
      if (e.key === 'n' && coach) {
        e.preventDefault();
        setEditor({ event: null, date: view === 'day' ? anchor : undefined });
      } else if (e.key === 't') goToday();
      else if (e.key === 'ArrowLeft' && view !== 'agenda') step(-1);
      else if (e.key === 'ArrowRight' && view !== 'agenda') step(1);
      else if (e.key === 'Escape' && insp) setInsp(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [coach, editor, cancelling, subs, busyOpen, view, anchor, insp, goToday, step]);

  const dates = view === 'day' ? [anchor] : weekDates(anchor);
  // P006-A1: the global light's sun at the team's place, on the team's clock; one read per day shown.
  const lightPlace = useLightPlace();
  const daylight = useMemo(() => {
    const memo = new Map<string, ChDaylight>();
    return (d: string) => {
      if (!memo.has(d)) memo.set(d, daylightOn(d, lightPlace.place, data.timezone));
      return memo.get(d)!;
    };
  }, [lightPlace.place, data.timezone]);
  const reduced = useChReducedMotion();
  const panel = useRef<HTMLElement | null>(null);
  usePanelSmoothScroll(panel);
  // A-25: was the last press a key that activates a button (Enter or Space), not a pointer?
  const keyed = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const toPanel = useRef(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      keyed.current = e.key === 'Enter' || e.key === ' ';
    };
    const point = () => {
      keyed.current = false;
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', point, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', point, true);
    };
  }, []);
  useEffect(() => {
    if (insp) {
      if (!toPanel.current) return;
      toPanel.current = false;
      panel.current?.querySelector<HTMLElement>('.ch-in__title')?.focus({ preventScroll: true });
      return;
    }
    // Closed (Esc or Back): focus goes back to the event it was opened from, unless it has already moved on elsewhere.
    const el = opener.current;
    opener.current = null;
    if (!el?.isConnected || el.closest('[inert], [aria-hidden="true"]')) return;
    const at = document.activeElement;
    if (at && at !== document.body && !panel.current?.contains(at)) return;
    chFocusQuietly(el);
  }, [insp]);
  useOpenOnNow(focusTick, dates[0]!, !phone && (view === 'week' || view === 'day') && !data.eventsError, focusHour(dates, events, now), reduced);
  // The day, week or month on show. Stepping to another slides the grid the way it went (CH-6605): a later period comes in
  // from the right, an earlier one from the left.
  const periodKey = view === 'week' ? weekDates(anchor)[0]! : view === 'month' ? monthKey(anchor) : view === 'day' ? anchor : 'agenda';
  const [period, setPeriod] = useState<{ key: string; dir: 1 | -1 }>({ key: periodKey, dir: 1 });
  if (period.key !== periodKey) setPeriod({ key: periodKey, dir: periodKey > period.key ? 1 : -1 });
  const title = viewTitle(view === 'agenda' ? 'month' : view, anchor);
  const away = view === 'day' ? anchor !== now.date : view === 'week' ? !weekDates(anchor).includes(now.date) : monthKey(anchor) !== monthKey(now.date);
  const inView = (d: string) => (view === 'day' || view === 'week' ? dates.includes(d) : monthKey(d) === monthKey(anchor));
  const count = new Set(events.filter((e) => e.type !== 'class' && e.type !== 'busy' && !e.cancelled && inView(e.date)).map((e) => e.id)).size;
  const selId = insp && (insp.kind === 'event' || insp.kind === 'attendance') ? insp.id : insp?.kind === 'overlap' ? (overlaps.find((o) => o.id === insp.id)?.eventId ?? null) : null;
  const open = (id: string, date?: string) => {
    const e = data.events.find((x) => x.id === id && (!date || x.date === date)) ?? data.events.find((x) => x.id === id);
    if (!e) return;
    // A-25: an event opened from the keyboard (Enter or Space on its block, bar or agenda row) takes focus into its
    // panel, and closing the panel hands focus back to it. A click leaves focus where the pointer put it.
    const from = document.activeElement;
    const keyboard = keyed.current && !phone && from instanceof HTMLElement && from.matches('.ch-ev, .ch-ev-bar, .ch-ag__row');
    opener.current = keyboard ? from : null;
    toPanel.current = keyboard;
    setInsp({ kind: 'event', id: e.id, date: e.date });
  };

  // More than one read failed: the page says so once with one Try again (the shell's CH-1209), and a part with a place
  // of its own (the grid, the inspector) keeps only its title there (states audit b6, c10). The timezone, roster, busy
  // time and classes have no place but this stack, so they fold into the page's notice instead of repeating it on the
  // next line. One failure keeps its own notice and Try again.
  const failedParts = [
    data.eventsError && 'team events',
    data.settingsError && 'your team’s timezone',
    data.membersError && 'the roster',
    data.busyError && 'your busy time',
    data.classesError && (coach ? 'class schedules' : 'your classes'),
    data.rsvpError && 'replies',
  ].filter((part): part is string => !!part);
  const covered = failedParts.length > 1;

  const ctx: InspCtx = {
    role: data.role,
    viewerPlayerId: data.viewerPlayerId,
    zoneLabel: data.zoneLabel,
    now,
    loadedHour: data.nowHour,
    people,
    events: data.events,
    overlaps,
    rsvpError: data.rsvpError,
    covered,
    preview,
    teamId: data.teamId,
    go: (n) => {
      haptic('select');
      setInsp(n);
    },
    onEdit: (e, proposal) => setEditor({ event: e, proposal }),
    onCancel: (e) => setCancelling(e),
    onDuplicate: (e) => setEditor({ event: null, copyOf: e }),
    onFind: (date, invite) => setEditor({ event: null, date, invite }),
    refresh,
  };

  const moreItems = [
    { label: 'Add to calendar app', icon: Rss, onSelect: () => setSubs(true) },
    // The board's Print week: the browser's print of what is on screen; the print rules (calendar.css, shell.css) drop the chrome.
    { label: `Print ${view}`, icon: Printer, onSelect: () => window.print() },
    ...(coach ? [{ label: 'Add busy time', icon: Lock, onSelect: () => setBusyOpen(true) }] : []),
    ...(coach && overlaps.length ? [{ label: `Overlaps · ${overlaps.length}`, icon: TriangleAlert, onSelect: () => setInsp({ kind: 'overlap' as const, id: overlaps[0]!.id }) }] : []),
  ];

  const notices = (
    <>
      <PageNotice parts={failedParts} onRetry={refresh} retrying={pending} />
      {data.settingsError && !covered && (
        <InlineNotice
          code="CH-6212"
          title="Your team’s timezone didn’t load."
          body={`Times are shown in ${data.zoneLabel} until it does. Try again; the error has been reported.`}
          onRetry={refresh}
        />
      )}
      {data.membersError && !covered && (
        <InlineNotice
          code="CH-6213"
          title="The roster didn’t load."
          body="Events are complete, but players can’t be invited or picked until it does. Try again; the error has been reported."
          onRetry={refresh}
        />
      )}
      {data.busyError && !covered && (
        <InlineNotice code="CH-6202" title="Your busy time didn’t load." body="Team events are complete, but your own blocks aren’t shown. Try again; the error has been reported." onRetry={refresh} />
      )}
      {data.classesError && !covered && (
        <InlineNotice
          code="CH-6203"
          title={coach ? "Class schedules didn’t load." : "Your classes didn’t load."}
          body={coach ? 'Team events are complete, but class overlaps may be missing. Try again; the error has been reported.' : 'Team events are complete. Try again; the error has been reported.'}
          onRetry={refresh}
        />
      )}

    </>
  );
  const dialogs = (
    <>
      {coach && (
        <EventEditor
          seed={editor}
          onClose={() => setEditor(null)}
          onSaved={(d) => {
            setEditor(null);
            setInsp(null);
            if (d < data.range.from || d > data.range.to) go(view, d);
            else refresh();
          }}
          events={data.events}
          people={data.people}
          peopleError={!!data.membersError}
          timezone={data.timezone}
          today={now.date}
          nowHour={now.hour}
        />
      )}
      {coach && (
        <CancelEvent
          event={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setCancelling(null);
            refresh();
          }}
        />
      )}
      <SubscribeSheet open={subs} onClose={() => setSubs(false)} role={data.role} />
      {coach && (
        <BusySheet
          open={busyOpen}
          today={now.date}
          onClose={() => setBusyOpen(false)}
          onSaved={(d) => {
            setBusyOpen(false);
            if (d < data.range.from || d > data.range.to) go(view, d);
            else refresh();
          }}
        />
      )}
    </>
  );

  if (coach && data.firstRun && !data.eventsError) {
    return (
      <>
        <CalendarFirstRun onNew={() => setEditor({ event: null })} />
        {dialogs}
      </>
    );
  }

  if (phone) {
    const sel = insp?.kind === 'event' || insp?.kind === 'attendance' ? data.events.find((x) => x.id === insp.id) : undefined;
    return (
      <>
        <CalendarPhone
          data={data}
          events={events}
          people={people}
          now={now}
          anchor={anchor}
          view={view}
          flagged={flagged}
          selId={selId}
          notices={
            <>
              {notices}
              {data.eventsError && <InlineNotice code="CH-6201" title="The calendar didn’t load." body="Nothing was changed. Try again; the error has been reported." onRetry={refresh} covered={covered} />}
            </>
          }
          onView={go}
          onStep={step}
          onOpen={open}
          onNew={(d) => setEditor({ event: null, date: d })}
          onSubscribe={() => setSubs(true)}
        />
        {/* The desktop's detail panel, as a sheet (board: event detail). */}
        <Modal
          open={!!insp}
          onClose={() => setInsp(null)}
          title={insp?.kind === 'overlap' ? 'Schedule overlap' : insp?.kind === 'attendance' ? 'Attendance' : (sel?.title ?? 'Event')}
        >
          <div className="ch-calm-sheet" data-kind={insp?.kind}>
            <SectionBoundary surface="calendar.panel" label="The detail panel" code="CH-6211">
              {insp?.kind === 'event' && <EventDetail key={`${insp.id}${insp.date}`} ctx={ctx} id={insp.id} date={insp.date} />}
              {insp?.kind === 'attendance' && <Attendance key={insp.id} ctx={ctx} id={insp.id} date={insp.date} />}
              {insp?.kind === 'overlap' && <Overlap key={insp.id} ctx={ctx} id={insp.id} />}
            </SectionBoundary>
          </div>
        </Modal>
        {dialogs}
      </>
    );
  }

  return (
    <main className="ch-cal" data-canopy="" aria-busy={pending} /* CH-6406: busy while a view, week or save is on its way; the page dims */>
      <header className="ch-cal-mast" data-canopy-head="">
        <div className="ch-cal-mast__l">
          <button ref={jumpBtn} type="button" className="ch-cal-title" onClick={() => setJump(!jump)} aria-expanded={jump} aria-haspopup="dialog" aria-label={`${title.main}${title.year ? ` ${title.year}` : ''}. Jump to a date`}>
            <h1>{title.main}</h1>
            {title.year && <span className="ch-cal-title__yr">{title.year}</span>}
            <Icon icon={ChevronDown} size={16} />
          </button>
          <div className="ch-cal-sub">
            {data.eventsError ? "Events didn’t load" : `${count} team ${count === 1 ? 'event' : 'events'}${view === 'week' ? ' this week' : view === 'day' ? '' : ' this month'}`} · {data.zoneLabel}
          </div>
          <AnimatePresence>
            {jump && (
              <JumpPanel
                key="jump"
                anchor={anchor}
                today={now.date}
                view={view}
                trigger={jumpBtn}
                onClose={closeJump}
                onPick={(d) => {
                  closeJump(true);
                  go(view, d);
                }}
              />
            )}
          </AnimatePresence>
        </div>
        <div className="ch-cal-tools">
          {away && (
            <Button size="sm" leftIcon={CalendarCheck} onClick={goToday}>
              Today
            </Button>
          )}
          <Menu
            label="More calendar actions"
            items={moreItems}
            trigger={(p) => (
              <button type="button" className="ch-btn ch-btn--secondary ch-iconbtn" aria-label="More" {...p}>
                <Icon icon={Ellipsis} size={16} />
              </button>
            )}
          />
          {coach && (
            <Button variant="primary" leftIcon={Plus} kbd="N" onClick={() => setEditor({ event: null, date: view === 'day' ? anchor : undefined })}>
              New event
            </Button>
          )}
        </div>
      </header>

      <div className="ch-cal-bar">
        <div className="ch-cal-viewctl">
          {/* P006 D6: Agenda keeps the arrows' place (hidden, out of reach), so the toolbar doesn't shift as views change. */}
          <span className={'ch-cal-step' + (view === 'agenda' ? ' is-off' : '')} inert={view === 'agenda'} aria-hidden={view === 'agenda' || undefined}>
            <IconButton icon={ChevronLeft} label={`Previous ${view === 'agenda' ? 'month' : view}`} onClick={() => step(-1)} />
            <IconButton icon={ChevronRight} label={`Next ${view === 'agenda' ? 'month' : view}`} onClick={() => step(1)} />
          </span>
          <Segmented<ChCalView> redraws
            label="View"
            value={view}
            onChange={(v) => go(v, anchor)}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'agenda', label: 'Agenda' },
            ]}
          />
        </div>
        {coach && data.people.length > 0 && <PeoplePicker people={data.people} sel={sel} setSel={setSel} />}
        <div className="ch-cal-legend" aria-hidden="true">
          <span>
            <i className="ch-dot-practice" />
            Practice
          </span>
          <span>
            <i className="ch-dot-qualifier" />
            Competition
          </span>
          <span>
            <i className="ch-dot-meeting" />
            Meeting
          </span>
          {view !== 'month' && (
            <span>
              <i className="ch-dot-class" />
              Classes
            </span>
          )}
        </div>
      </div>

      {notices}
      {data.eventsError ? (
        <div className="ch-cal-surface">
          <InlineNotice code="CH-6201" title="The calendar didn’t load." body="Nothing was changed. Try again; the error has been reported." onRetry={refresh} covered={covered} />
        </div>
      ) : (
        <div className="ch-cal-body">
          <div style={{ minWidth: 0 }}>
            <SectionBoundary surface={`calendar.${view}`} label="The calendar" code="CH-6210">
              {/* CH-6604: another view settles in (base in, quick out); CH-6605: another day, week or month slides 12px the
                  way it went. Both instant with reduced motion. */}
              <Swap swapKey={view}>
                <Swap swapKey={period.key} kind="slide" dir={period.dir}>
                  {(view === 'week' || view === 'day') && (
                    <TimeGrid dates={dates} events={events} people={people} now={now} selId={selId} flagged={flagged} onSelect={open} onDay={(d) => go('day', d)} onMove={coach ? move : undefined} daylight={daylight} coach={coach} />
                  )}
                  {view === 'month' && (
                    <MonthView
                      anchor={anchor}
                      events={events}
                      now={now}
                      selDate={anchor}
                      onPick={(d) => {
                        setAnchor(d);
                        window.history.replaceState(null, '', buildUrl('month', d, data.today));
                        const firstEv = events.filter((e) => e.date === d && e.type !== 'class').sort((a, b) => (a.start ?? -1) - (b.start ?? -1))[0];
                        if (firstEv) open(firstEv.id, d);
                        else if (monthKey(d) !== monthKey(anchor)) go('month', d);
                      }}
                    />
                  )}
                  {view === 'agenda' &&
                    (events.some((e) => e.date >= now.date) || events.length ? (
                      <AgendaView events={events} people={people} now={now} selId={selId} flagged={flagged} onSelect={open} />
                    ) : (
                      <div className="ch-cal-surface">
                        <EmptyState
                          code="CH-6301"
                          icon={CalendarDays}
                          title={sel.length ? 'Nothing on these players’ schedules in this range.' : 'Nothing on the calendar in this range.'}
                          body={coach ? 'Events you publish show here, with any overlaps and replies.' : 'Events your coach invites you to show here.'}
                        />
                      </div>
                    ))}
                </Swap>
              </Swap>
            </SectionBoundary>
          </div>
          <aside ref={panel} className="ch-in-wrap ch-cal-surface" aria-label="Details" aria-live="polite" /* CH-6802 */>
            <SectionBoundary surface="calendar.panel" label="The detail panel" code="CH-6211">
              {!insp && <Summary ctx={ctx} />}
              {insp?.kind === 'event' && <EventDetail key={`${insp.id}${insp.date}`} ctx={ctx} id={insp.id} date={insp.date} />}
              {insp?.kind === 'attendance' && <Attendance key={insp.id} ctx={ctx} id={insp.id} date={insp.date} />}
              {insp?.kind === 'overlap' && <Overlap key={insp.id} ctx={ctx} id={insp.id} />}
            </SectionBoundary>
          </aside>
        </div>
      )}

      {sel.length > 0 && (
        <span className="ch-sr-only" role="status">
          {/* CH-6803 */}
          Showing {sel.length} {sel.length === 1 ? 'player' : 'players'}
        </span>
      )}

      {dialogs}
    </main>
  );
}
