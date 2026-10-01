'use client';

import { CalendarCheck, CalendarDays, Check, Lock, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Ellipsis, Plus, Printer, Rss, TriangleAlert, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { ChCalendarData } from '../../data/calendar';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import { InlineNotice } from '../../ui/Notices';
import { EmptyState } from '../../ui/States';
import { SearchField } from '../../ui/SearchField';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Segmented } from '../../ui/Segmented';
import { useNow } from '../../lib/use-now';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { addDays, addMonths, dayNum, findOverlaps, monthCells, monthKey, monthName, viewTitle, weekDates, yearOf, type ChCalEvent, type ChCalType, type ChCalView } from './model';
import { AgendaView, MonthView, TimeGrid, type ChNow } from './views';
import { Attendance, EventDetail, Overlap, Summary, type ChInsp, type InspCtx } from './inspector';
import { CancelEvent, EventEditor, SubscribeSheet, type EditorSeed } from './editor';
import { BusySheet } from './extras';
import { CalendarPhone } from './CalendarPhone';
import { Modal } from '../../ui/Modal';
import { useChPhone } from '../../lib/use-phone';
import { CalendarFirstRun } from './CalendarFirstRun';

function zonedNow(timeZone: string, d: Date): ChNow {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d)) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: (Number(p.hour) % 24) + Number(p.minute) / 60 };
}

function JumpPanel({ anchor, today, view, onPick, onClose }: { anchor: string; today: string; view: ChCalView; onPick: (d: string) => void; onClose: () => void }) {
  const [month, setMonth] = useState(`${monthKey(anchor)}-01`);
  const ref = useRef<HTMLDivElement | null>(null);
  const range = view === 'week' ? new Set(weekDates(anchor)) : new Set([anchor]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('.is-range, .ch-cal-jump__d')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="ch-cal-jump" role="dialog" aria-label="Jump to a date" ref={ref}>
      <div className="ch-cal-jump__head">
        <span>
          {monthName(month)} {yearOf(month)}
        </span>
        <span className="ch-cal-jump__nav">
          <IconButton icon={ChevronLeft} label="Previous month" size="sm" onClick={() => setMonth(addMonths(month, -1))} />
          <IconButton icon={ChevronRight} label="Next month" size="sm" onClick={() => setMonth(addMonths(month, 1))} />
          <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
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
    </div>
  );
}

function PeoplePicker({ people, sel, setSel }: { people: ChCalendarData['people']; sel: string[]; setSel: (s: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
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
      <button type="button" className={'ch-pp__trigger' + (chosen.length ? ' is-on' : '')} onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open} aria-label={`People: ${label}`}>
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
      {open && (
        <div className="ch-pp__pop" role="dialog" aria-label="Choose people">
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
            <Button size="sm" variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
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
  const [sel, setSel] = useState<string[]>([]);
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
  const phone = useChPhone();
  const clock = useNow();
  const now = useMemo<ChNow>(() => (clock && !frozen ? zonedNow(data.timezone, clock) : { date: data.today, hour: data.nowHour }), [clock, frozen, data.timezone, data.today, data.nowHour]);

  // The server is the source of truth: when it re-renders (navigation or refresh), follow it.
  useEffect(() => {
    setView(data.view);
    setAnchor(data.anchor);
  }, [data.view, data.anchor]);

  const people = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  const events = useMemo(
    () => (sel.length ? data.events.filter((e) => (e.type === 'class' ? e.owner != null && sel.includes(e.owner) : e.people.some((p) => sel.includes(p)))) : data.events),
    [data.events, sel],
  );
  const overlaps = useMemo(() => (coach ? findOverlaps(data.events.filter((e) => !e.cancelled)) : []), [coach, data.events]);
  const flagged = useMemo(() => new Set(overlaps.map((o) => o.eventId)), [overlaps]);

  const go = useCallback(
    (nextView: ChCalView, nextAnchor: string) => {
      const url = buildUrl(nextView, nextAnchor, data.today);
      chTrail(`calendar ${nextView} ${nextAnchor}`);
      if (nextAnchor >= data.range.from && nextAnchor <= data.range.to && (nextView !== 'month' || monthKey(nextAnchor) === monthKey(data.anchor) || (monthCells(nextAnchor)[0]!.date >= data.range.from && monthCells(nextAnchor).at(-1)!.date <= data.range.to))) {
        setView(nextView);
        setAnchor(nextAnchor);
        window.history.replaceState(null, '', url);
        return;
      }
      start(() => router.push(url, { scroll: false }));
    },
    [data.today, data.range, data.anchor, router],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      haptic('select');
      if (view === 'day') go(view, addDays(anchor, dir));
      else if (view === 'week') go(view, addDays(anchor, 7 * dir));
      else if (view === 'month') go(view, addMonths(anchor, dir));
    },
    [view, anchor, go],
  );
  const goToday = useCallback(() => {
    haptic('select');
    go(view, now.date);
  }, [go, view, now.date]);

  const refresh = useCallback(() => start(() => router.refresh()), [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"], dialog[open]') || e.metaKey || e.ctrlKey || e.altKey || editor || cancelling || subs || busyOpen) return;
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
  const title = viewTitle(view === 'agenda' ? 'month' : view, anchor);
  const away = view === 'day' ? anchor !== now.date : view === 'week' ? !weekDates(anchor).includes(now.date) : monthKey(anchor) !== monthKey(now.date);
  const inView = (d: string) => (view === 'day' || view === 'week' ? dates.includes(d) : monthKey(d) === monthKey(anchor));
  const count = new Set(events.filter((e) => e.type !== 'class' && e.type !== 'busy' && !e.cancelled && inView(e.date)).map((e) => e.id)).size;
  const selId = insp && (insp.kind === 'event' || insp.kind === 'attendance') ? insp.id : insp?.kind === 'overlap' ? (overlaps.find((o) => o.id === insp.id)?.eventId ?? null) : null;
  const open = (id: string, date?: string) => {
    const e = data.events.find((x) => x.id === id && (!date || x.date === date)) ?? data.events.find((x) => x.id === id);
    if (e) setInsp({ kind: 'event', id: e.id, date: e.date });
  };

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
      {data.settingsError && (
        <InlineNotice
          code="CH-6212"
          title="Your team's timezone didn't load."
          body={`Times are shown in ${data.zoneLabel} until it does. Try again; the error has been reported.`}
          onRetry={refresh}
        />
      )}
      {data.membersError && (
        <InlineNotice
          code="CH-6213"
          title="The roster didn't load."
          body="Events are complete, but players can't be invited or picked until it does. Try again; the error has been reported."
          onRetry={refresh}
        />
      )}
      {data.busyError && (
        <InlineNotice code="CH-6202" title="Your busy time didn't load." body="Team events are complete, but your own blocks aren't shown. Try again; the error has been reported." onRetry={refresh} />
      )}
      {data.classesError && (
        <InlineNotice
          code="CH-6203"
          title={coach ? "Class schedules didn't load." : "Your classes didn't load."}
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
              {data.eventsError && <InlineNotice code="CH-6201" title="The calendar didn't load." body="Nothing was changed. Try again; the error has been reported." onRetry={refresh} />}
            </>
          }
          onView={go}
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
    <main className="ch-cal" aria-busy={pending}>
      <header className="ch-cal-mast">
        <div className="ch-cal-mast__l">
          <button type="button" className="ch-cal-title" onClick={() => setJump(!jump)} aria-expanded={jump} aria-haspopup="dialog" aria-label={`${title.main}${title.year ? ` ${title.year}` : ''}. Jump to a date`}>
            <h1>{title.main}</h1>
            {title.year && <span className="ch-cal-title__yr">{title.year}</span>}
            <Icon icon={ChevronDown} size={16} />
          </button>
          <div className="ch-cal-sub">
            {data.eventsError ? "Events didn't load" : `${count} team ${count === 1 ? 'event' : 'events'}${view === 'week' ? ' this week' : view === 'day' ? '' : ' this month'}`} · {data.zoneLabel}
          </div>
          {jump && (
            <JumpPanel
              anchor={anchor}
              today={now.date}
              view={view}
              onClose={() => setJump(false)}
              onPick={(d) => {
                setJump(false);
                go(view, d);
              }}
            />
          )}
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
          {view !== 'agenda' && (
            <span className="ch-cal-step">
              <IconButton icon={ChevronLeft} label={`Previous ${view}`} onClick={() => step(-1)} />
              <IconButton icon={ChevronRight} label={`Next ${view}`} onClick={() => step(1)} />
            </span>
          )}
          <Segmented<ChCalView>
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
              Class · busy
            </span>
          )}
        </div>
      </div>

      {notices}
      {data.eventsError ? (
        <div className="ch-cal-surface" style={{ padding: 20 }}>
          <InlineNotice code="CH-6201" title="The calendar didn't load." body="Nothing was changed. Try again; the error has been reported." onRetry={refresh} />
        </div>
      ) : (
        <div className="ch-cal-body">
          <div style={{ minWidth: 0 }}>
            <SectionBoundary surface={`calendar.${view}`} label="The calendar" code="CH-6210">
              {(view === 'week' || view === 'day') && (
                <TimeGrid dates={dates} events={events} people={people} now={now} selId={selId} flagged={flagged} onSelect={open} onDay={(d) => go('day', d)} />
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
                      body={coach ? 'Events you publish show here, with replies and overlaps.' : 'Events your coach invites you to show here.'}
                    />
                  </div>
                ))}
            </SectionBoundary>
          </div>
          <aside className="ch-in-wrap ch-cal-surface" aria-label="Details" aria-live="polite">
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
          Showing {sel.length} {sel.length === 1 ? 'player' : 'players'}
        </span>
      )}

      {dialogs}
    </main>
  );
}
