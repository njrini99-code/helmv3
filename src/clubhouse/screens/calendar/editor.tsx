'use client';

import { plural } from '../../lib/plural';
import { CalendarPlus, Check, Copy, Pencil, RotateCw, Rss, Trash2, TriangleAlert, CircleX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createGolfEvent, deleteGolfEvent, deleteGolfEventPermanently, updateGolfEvent } from '@/app/golf/actions/calendar-events';
import { createTournamentFromCalendar } from '@/app/golf/actions/tournaments-calendar';
import { useRouter } from 'next/navigation';
import { createRecurringEvent, deleteRecurringEvent, editRecurringEvent } from '@/app/golf/actions/recurring-events';
import { createCalendarFeed, deleteCalendarFeed, getCalendarFeeds, regenerateCalendarFeed } from '@/app/golf/actions/calendar-feeds';
import { serializeRecurrenceRule } from '@/lib/golf/recurrence';
import { offsetMinutesFor } from '@/lib/golf/timezone';
import { Avatar } from '../../ui/Avatar';
import { AVAILABILITY_WORD } from '../roster/format';
import { Button } from '../../ui/Button';
import { DateField } from '../../ui/DateField';
import { TimeField } from '../../ui/TimeField';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { InlineNotice } from '../../ui/Notices';
import { Segmented } from '../../ui/Segmented';
import { Skeleton } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { friendlyReason, normalise, useAction } from '../../lib/use-action';
import { newRequestId } from '../../data/recruiting-shape';
import { chReport, chTrail } from '../../lib/track';
import { haptic } from '../../lib/haptics';
import { useChPhone } from '../../lib/use-phone';
import { useChClock } from '../../lib/use-clock';
import { clockAxisLabel } from '../../lib/clock-format';
import { TYPE_LABEL, addDays, busyFor, dayNum, dowOf, fmtHour, monthName, overlaps, seedWindow, type ChCalEvent, type ChCalPerson, type ChCalType } from './model';
import { TYPE_ICON } from './views';
import { tournamentSavedToast, TournamentSaveNotice, TournamentSection, type TrackBlock } from './editor-tournament';
import { LIVE_WRITES, type ChQWrites } from '../qualifiers/writes';
import { initialTourState, receiptSentence, toCreatePayload, validate, type ChTourErrors, type ChTourState } from '../tournaments/fields/rounds-model';
import { refusalNotice, type TournamentRefusal } from '../tournaments/fields/refusals';

const EDIT_TYPES: ChCalType[] = ['practice', 'qualifier', 'tournament', 'meeting', 'travel', 'other'];
const FROM = 7;
const TO = 20;

const toHHMM = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const fromHHMM = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
};
const snap = (h: number) => Math.round(h * 4) / 4;
/** A wall-clock date and HH:MM moved by `minutes`, across midnight when it has to be. */
function shiftWall(date: string, time: string, minutes: number): { date: string; time: string } {
  if (!minutes) return { date, time };
  const total = Math.round(fromHHMM(time) * 60) + minutes;
  const days = Math.floor(total / 1440);
  const m = ((total % 1440) + 1440) % 1440;
  return { date: addDays(date, days), time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` };
}
/** Extra days a multi-day all-day event covers after its first: 2 for 16–18 October. */
const spanDays = (e: ChCalEvent | null | undefined) => (e?.span ? Math.round((Date.parse(`${e.span.to}T12:00:00Z`) - Date.parse(`${e.span.from}T12:00:00Z`)) / 86_400_000) : 0);
/** A timed event over several days (the loader gives each day's entry the whole run's start and end): any day's entry edits the run. */
const timedRun = (e: ChCalEvent | null | undefined): e is ChCalEvent & { span: { from: string; to: string; start: number; end: number } } =>
  !!e && !e.allDay && e.span?.start != null && e.span.end != null;
/** What the editor opens on for an event: a timed run starts on its first day at its first day's start and ends on its last day at its end. */
function runOf(e: ChCalEvent): { date: string; win: [number, number]; extra: number } | null {
  if (!timedRun(e)) return null;
  // A run that ends at midnight is held as 24:00 on its last day: the editor writes it as 00:00 the day after.
  const midnight = e.span.end >= 24;
  return { date: e.span.from, win: [e.span.start, midnight ? 0 : e.span.end], extra: spanDays(e) + (midnight ? 1 : 0) };
}

type Repeat = 'none' | 'weekly' | 'weekdays';

/** P-5: a tournament made from the editor, for the calendar's optimistic blocks (4.2). */
export interface ChTournamentSaved {
  tournamentId: string;
  version: number;
  name: string;
  rounds: { roundNumber: number; eventId: string }[];
  state: ChTourState;
  invited: string[];
  rsvp: boolean;
  notes: string | null;
  fromEventId: string | null;
}
type Scope = 'this' | 'thisAndFuture' | 'all';

export interface EditorSeed {
  event: ChCalEvent | null;
  proposal?: [number, number];
  date?: string;
  /** A new event's type and invitees (Roster's Plan 1:1). Ids the Calendar doesn't list are dropped, never widened to the team. */
  type?: ChCalType;
  invite?: string[];
  /** Duplicate (the event's More menu): a new event with this one's title, type, day, time, place, notes and invitees. */
  copyOf?: ChCalEvent;
  /** P-5 E4: the inspector's Set up on an untracked tournament event opens the editor with Track already on. */
  track?: boolean;
  /** Reopened after a publish drawn at once failed (F-0029): the same event keeps its request id, so a Retry can't make it twice. */
  resend?: boolean;
}

function FindTime({
  rows,
  events,
  date,
  win,
  setWin,
  ignoreId,
  people,
}: {
  rows: string[];
  events: ChCalEvent[];
  date: string;
  win: [number, number];
  setWin: (w: [number, number]) => void;
  ignoreId?: string;
  people: Map<string, ChCalPerson>;
}) {
  const clock = useChClock();
  const ref = useRef<HTMLDivElement | null>(null);
  const grab = useRef<number | null>(null);
  // The kind of pointer that last pressed a lane. A finger only moves the time once it lifts without scrolling (a click):
  // moved on the touch, a scroll of the sheet that began on a lane carried the event to wherever the finger landed.
  const laneTouch = useRef(false);
  const len = win[1] - win[0];
  const pct = (h: number) => ((h - FROM) / (TO - FROM)) * 100;
  const toH = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    return snap(FROM + ((x - r.left) / r.width) * (TO - FROM));
  };
  const clamp = (s: number) => Math.min(Math.max(s, FROM), TO - len);
  const move = (s: number) => {
    const c = clamp(s);
    if (c !== win[0]) {
      haptic('select');
      setWin([c, c + len]);
    }
  };
  const onDown = (e: PointerEvent<HTMLSpanElement>) => {
    laneTouch.current = false;
    e.preventDefault();
    e.stopPropagation();
    grab.current = toH(e.clientX) - win[0];
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLSpanElement>) => {
    if (grab.current == null) return;
    move(toH(e.clientX) - grab.current);
  };
  const onKey = (e: KeyboardEvent<HTMLSpanElement>) => {
    const d = e.key === 'ArrowRight' ? 0.25 : e.key === 'ArrowLeft' ? -0.25 : 0;
    if (!d) return;
    e.preventDefault();
    move(win[0] + d * (e.shiftKey ? 4 : 1));
  };
  const ticks: number[] = [];
  for (let h = FROM; h <= TO; h += 2) ticks.push(h);
  const shown = rows.slice(0, 6);
  return (
    <div className="ch-cal-ft">
      <div className="ch-lanes">
        <span />
        <div className="ch-lanes__axis" aria-hidden="true">
          {ticks.map((h) => (
            <span key={h} style={{ left: `${pct(h)}%` }}>
              {clockAxisLabel(h, clock)}
            </span>
          ))}
        </div>
        {shown.map((pid, i) => (
          <div key={pid} style={{ display: 'contents' }}>
            <span className="ch-lanes__who">{people.get(pid)?.name.split(' ')[0] ?? 'Player'}</span>
            {/* A pointer shortcut to place the time; the keyboard moves it with the band, the lane's slider. */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- see above */}
            <div
              className="ch-lane"
              ref={i === 0 ? ref : undefined}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('.ch-cal-ft__band')) return;
                laneTouch.current = e.pointerType === 'touch';
                if (!laneTouch.current) move(toH(e.clientX) - len / 2);
              }}
              onClick={(e) => {
                if (!laneTouch.current || (e.target as HTMLElement).closest('.ch-cal-ft__band')) return;
                laneTouch.current = false;
                move(toH(e.clientX) - len / 2);
              }}
            >
              {busyFor(events, pid, date, ignoreId).map((b) => {
                const hit = overlaps(win, [b.start!, b.end!]);
                return (
                  <span
                    key={b.id}
                    className={`ch-lane__b ${b.type === 'class' ? 'is-busy' : 'is-ev'}${hit ? ' is-clash' : ''}`}
                    style={{ left: `${pct(Math.max(FROM, b.start!))}%`, width: `${pct(Math.min(TO, b.end!)) - pct(Math.max(FROM, b.start!))}%` }}
                  >
                    {b.type === 'class' ? 'Class' : b.title}
                  </span>
                );
              })}
              {i === 0 ? (
                <span
                  className="ch-lane__b is-prop ch-cal-ft__band"
                  style={{ left: `${pct(win[0])}%`, width: `${pct(win[1]) - pct(win[0])}%` }}
                  role="slider"
                  tabIndex={0}
                  aria-label="Event time"
                  aria-valuemin={FROM}
                  aria-valuemax={TO - len}
                  aria-valuenow={win[0]}
                  aria-valuetext={`${fmtHour(win[0], true, clock)} to ${fmtHour(win[1], true, clock)}`}
                  onPointerDown={onDown}
                  // CH-6602: the band follows the finger or pointer as it is dragged.
                  onPointerMove={onMove}
                  onPointerUp={() => (grab.current = null)}
                  onPointerCancel={() => (grab.current = null)}
                  onKeyDown={onKey}
                />
              ) : (
                <span className="ch-lane__b is-prop" style={{ left: `${pct(win[0])}%`, width: `${pct(win[1]) - pct(win[0])}%`, pointerEvents: 'none' }} aria-hidden="true" />
              )}
            </div>
          </div>
        ))}
      </div>
      {rows.length > 6 && <p className="ch-in__quiet" style={{ marginTop: 8 }}>{rows.length - 6} more invitees checked in the line below</p>}
    </div>
  );
}

type EditorValues = { title: string; type: ChCalType; date: string; win: [number, number]; allDay: boolean; repeat: Repeat; loc: string; notes: string; invited: string[]; rsvp: boolean };

/** The editor's values as one comparable string, so edits can be told from a look. */
function snapshot(v: EditorValues): string {
  // A fixed field order, so the same values always make the same string.
  return JSON.stringify([v.title.trim(), v.type, v.date, v.win, v.allDay, v.repeat, v.loc.trim(), v.notes.trim(), [...v.invited].sort(), v.rsvp]);
}

export function EventEditor({
  seed,
  onClose,
  onSaved,
  events,
  people,
  peopleError = false,
  timezone,
  today,
  nowHour,
  tournamentsEnabled = false,
  teamId,
  courseWrites = LIVE_WRITES,
  onTournamentSaved,
  provisional,
}: {
  seed: EditorSeed | null;
  onClose: () => void;
  onSaved: (date: string) => void;
  /**
   * A new single event is drawn the moment it is published (F-0029): `add` puts its block on the calendar and closes the
   * editor, and returns the undo; a failure takes the block back and `reopen` opens the editor on what was typed.
   */
  provisional?: { add: (e: ChCalEvent) => () => void; reopen: (e: ChCalEvent) => void };
  events: ChCalEvent[];
  people: ChCalPerson[];
  /** The roster didn't load: the invite list is unknown, never "no players" (C-21). */
  peopleError?: boolean;
  timezone: string;
  today: string;
  /** The hour now on the team's clock, so a new event today opens after it (P006 D3). */
  nowHour?: number;
  /** P-5: golf_tournaments_v1 is on: choosing Tournament opens the tournament section. Off, the editor is as before. */
  tournamentsEnabled?: boolean;
  /** P-5: the calendar's team, which a tournament is made on (D-81: one tournament per team). */
  teamId?: string;
  /** P-5: the course picker's reads (the qualifiers' live set; the preview and tests pass their own). */
  courseWrites?: Pick<ChQWrites, 'courses' | 'tees'>;
  /** P-5: a tournament landed: its rounds, for the calendar's optimistic blocks. */
  onTournamentSaved?: (saved: ChTournamentSaved) => void;
}) {
  const base = seed?.event ?? null;
  const open = seed != null;
  const phone = useChPhone();
  const clock = useChClock();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ChCalType>('practice');
  const [date, setDate] = useState(today);
  const [win, setWin] = useState<[number, number]>([15.5, 17.5]);
  const [allDay, setAllDay] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [until, setUntil] = useState(addDays(today, 56));
  const [loc, setLoc] = useState('');
  const [notes, setNotes] = useState('');
  const [invited, setInvited] = useState<string[]>([]);
  // Require RSVP: off unless the coach turns it on (owner, 2026-10-08). Off, players get no notification and no reply
  // controls; the event is still on every invitee's calendar.
  const [rsvp, setRsvp] = useState(false);
  const [scope, setScope] = useState<Scope>('this');
  // A multi-day all-day event keeps its length through an edit, a move or a Duplicate (CAL-06).
  const [extraDays, setExtraDays] = useState(0);
  const [touched, setTouched] = useState(false);
  // What the editor opened with, to tell edits from a look (CH-6503).
  const [baseline, setBaseline] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const router = useRouter();
  // P-5: the tournament section. `trackPref` is the coach's own answer; until they give one, Track is on for a new
  // event or a type change and off for a legacy tournament event (4.1.3).
  const [trackPref, setTrackPref] = useState<boolean | null>(null);
  const [tour, setTour] = useState<ChTourState>(() => initialTourState(today));
  const [tourBaseline, setTourBaseline] = useState('');
  const [tourNote, setTourNote] = useState<{ code: string; text: string; refusal: TournamentRefusal; tournamentId?: string } | null>(null);
  const [said, setSaid] = useState('');
  const section = useRef<HTMLElement | null>(null);

  // The editor seeds once per opening. A page re-read that lands while it is open (a slower refresh, a Retry
  // elsewhere) brings the same team in new arrays, and seeding again would wipe what the coach has typed.
  const latest = useRef({ people, today, events, nowHour });
  useEffect(() => {
    latest.current = { people, today, events, nowHour };
  }, [people, today, events, nowHour]);
  useEffect(() => {
    if (!seed) return;
    const { people, today, events, nowHour } = latest.current;
    const e = seed.event;
    const c = seed.copyOf;
    const run = e ? runOf(e) : c ? runOf(c) : null;
    const init = e
      ? {
          title: e.title,
          type: (e.type === 'class' ? 'practice' : e.type) as ChCalType,
          // Each day of a multi-day event is its own entry; the event starts on the span's first day, not the one clicked.
          date: run?.date ?? e.span?.from ?? e.date,
          win: (seed.proposal ?? run?.win ?? [e.start ?? 8, e.end ?? 17]) as [number, number],
          allDay: e.allDay,
          loc: e.location ?? '',
          notes: e.notes ?? '',
          invited: e.people,
          rsvp: e.rsvpRequired,
        }
      : c
        ? {
            title: c.title,
            type: (c.type === 'class' ? 'practice' : c.type) as ChCalType,
            date: seed.date ?? c.span?.from ?? c.date,
            win: (run?.win ?? [c.start ?? 8, c.end ?? 17]) as [number, number],
            allDay: c.allDay,
            loc: c.location ?? '',
            notes: c.notes ?? '',
            // Invitees the Calendar no longer lists (a player who left) are dropped, never widened to the team.
            invited: c.people.filter((id) => people.some((p) => p.id === id)),
            rsvp: c.rsvpRequired,
          }
        : (() => {
            const date = seed.date ?? today;
            const invited = seed.invite ? seed.invite.filter((id) => people.some((p) => p.id === id)) : people.map((p) => p.id);
            return {
              title: '',
              type: seed.type ?? ('practice' as ChCalType),
              date,
              win: seedWindow(events, invited, date, { date: today, hour: nowHour ?? 0 }),
              allDay: false,
              loc: '',
              notes: '',
              invited,
              rsvp: false,
            };
          })();
    setTitle(init.title);
    setType(init.type);
    setDate(init.date);
    setWin(init.win);
    setAllDay(init.allDay);
    setLoc(init.loc);
    setNotes(init.notes);
    setInvited(init.invited);
    setRsvp(init.rsvp);
    // A drag-to-move proposal is already a change worth keeping.
    // A reopened publish (F-0029) is unsaved work: closing it asks first, as before it was sent.
    setBaseline(seed.proposal || seed.resend ? '' : snapshot({ ...init, repeat: 'none' }));
    setDiscarding(false);
    setRepeat('none');
    setUntil(addDays(init.date, 56));
    setScope('this');
    setExtraDays(run?.extra ?? spanDays(e ?? c));
    setTouched(false);
    const first = run?.date ?? (e ?? c)?.span?.from ?? init.date;
    const nextTour = initialTourState(first, addDays(first, run?.extra ?? spanDays(e ?? c)));
    setTour(nextTour);
    setTourBaseline(JSON.stringify(nextTour));
    setTrackPref(seed.track ?? null);
    setTourNote(null);
    setSaid('');
  }, [seed]);

  const moved = !!base && !!seed?.proposal && (seed.proposal[0] !== base.start || seed.proposal[1] !== base.end);
  const series = !!base?.seriesId;
  // An overnight event is loaded ending at 24:00 on its first day. Its stored end is kept unless the coach picks a new one.
  // Its real end isn't loaded, so it can't move with the start: moving the day asks for a new end time instead.
  // A timed run over several days (the loader gives its real end) is not one of these: it keeps its days and its end.
  const isRun = !!(timedRun(base) || timedRun(seed?.copyOf)) && extraDays > 0;
  const overnight = !!base && !isRun && !base.allDay && (base.end ?? 0) >= 24 && !allDay && win[1] >= 24;
  const keepEnd = overnight && date === base!.date;
  const needsEnd = overnight && !keepEnd;
  /** Timed, over several days: its end is a time on a later day, so it may read earlier than the start. */
  const multiTimed = isRun && !allDay;
  const endDate = (allDay || multiTimed) && extraDays ? addDays(date, extraDays) : date;
  // A run edited without touching its days or times keeps its stored end, as an untouched overnight end is kept: the
  // end is sent only when the coach changed when it is.
  const baseRun = base ? runOf(base) : null;
  const runKept = multiTimed && !!baseRun && date === baseRun.date && win[0] === baseRun.win[0] && win[1] === baseRun.win[1] && extraDays === baseRun.extra;
  // A run over several days isn't checked against one day's classes, as an all-day event isn't.
  const clashes = allDay || multiTimed ? [] : invited.filter((pid) => busyFor(events, pid, date, base?.id).some((b) => overlaps(win, [b.start!, b.end!])));
  // P-5: the tournament section (4.1). Track off, or the flag off, leaves every field below as it was.
  const tourOn = tournamentsEnabled && type === 'tournament';
  const legacyTour = !!base && base.type === 'tournament';
  const trackBlock: TrackBlock = base?.seriesId ? 'series' : base?.cancelled ? 'cancelled' : null;
  const tracked = tourOn && !trackBlock && (trackPref ?? !legacyTour);
  const tourState: ChTourState = { ...tour, name: title };
  const tourErrors: ChTourErrors = tracked ? validate(tourState) : {};
  const orphanRound = tracked && legacyTour ? /\s·\sR(\d)$/.exec(base!.title)?.[1] : undefined;
  const primary = tracked ? (base ? 'Set up tournament' : 'Create tournament') : !base ? 'Publish event' : moved ? 'Move event' : 'Save changes';
  const invalidTitle = !tracked && !title.trim();
  const invalidTime = !tracked && ((!allDay && !multiTimed && win[1] <= win[0]) || needsEnd);
  const minutes = Math.round((win[1] - win[0]) * 60);
  const whenLabel = multiTimed
    ? `${dowOf(date)} ${dayNum(date)} ${monthName(date).slice(0, 3)} ${fmtHour(win[0], true, clock)} – ${dowOf(endDate)} ${dayNum(endDate)} ${monthName(endDate).slice(0, 3)} ${fmtHour(win[1], true, clock)}`
    : `${dowOf(date)} ${dayNum(date)} ${monthName(date).slice(0, 3)} · ${allDay ? 'All day' : `${fmtHour(win[0], false, clock)} – ${fmtHour(win[1], true, clock)}`}`;

  // One request id per opening of the editor and set of contents: the same form with the same contents sends the
  // same id, whether the toast's Retry replays it or Publish is pressed again, so a reply that was lost after the
  // server stored the event cannot publish it a second time (and invite and notify everyone twice). Changing the
  // contents is a different event and gets a new id, and so does opening the editor again.
  const attempt = useRef<{ seed: EditorSeed | null; sig: string; id: string } | null>(null);
  const requestIdFor = (payload: unknown) => {
    const sig = JSON.stringify(payload);
    const last = attempt.current;
    if (last && (last.seed === seed || seed?.resend) && last.sig === sig) return last.id;
    const id = newRequestId();
    attempt.current = { seed, sig, id };
    return id;
  };

  /** The write itself: one event, a repeating series, or an edit of either (with the scope a series asks for). */
  const send = async () => {
    if (tracked && teamId) {
      const payload = toCreatePayload(tourState, timezone, { teamId, requestId: '', fromEventId: base?.id ?? null, description: notes, requiresRsvp: rsvp, attendeeIds: invited });
      const { requestId: _unused, ...signature } = payload;
      return createTournamentFromCalendar({ ...payload, requestId: requestIdFor(signature) });
    }
    const startTime = allDay ? undefined : toHHMM(win[0]);
    const endTime = allDay ? undefined : toHHMM(win[1]);
    const tz = offsetMinutesFor(date, startTime ?? '12:00', timezone) ?? undefined;
    // The server builds the end with the start's offset. A run whose end is on the far side of a clock change (Saturday
    // 31 October in daylight time to Monday 2 November in standard time) has its end's wall-clock time moved by the
    // difference, so the stored instant is the time typed on the end's own day.
    const end = endTime && endDate !== date && tz != null ? shiftWall(endDate, endTime, (offsetMinutesFor(endDate, endTime, timezone) ?? tz) - tz) : { date: endDate, time: endTime };
    if (!base) {
      if (repeat !== 'none') {
        const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
        const series = {
          title: title.trim(),
          eventType: type,
          startDate: date,
          startTime,
          endTime,
          allDay,
          location: loc.trim() || undefined,
          description: notes.trim() || undefined,
          recurrenceRule: serializeRecurrenceRule({ frequency: 'weekly', weekdays: repeat === 'weekdays' ? [1, 2, 3, 4, 5] : [weekday], until }),
          attendeeIds: invited.length ? invited : undefined,
          requiresRsvp: rsvp,
          timezoneOffset: tz,
          // Each occurrence takes the zone's offset on its own date, so a series across a clock change keeps its time (CAL-05).
          timeZone: timezone,
        };
        return createRecurringEvent({ ...series, requestId: requestIdFor(series) });
      }
      const single = {
        title: title.trim(),
        eventType: type as never,
        startDate: date,
        endDate: end.date !== date ? end.date : undefined,
        startTime,
        endTime: end.time,
        allDay,
        location: loc.trim() || undefined,
        description: notes.trim() || undefined,
        attendeeIds: invited.length ? invited : undefined,
        requiresRsvp: rsvp,
        timezoneOffset: tz,
      };
      return createGolfEvent({ ...single, requestId: requestIdFor(single) });
    }
    if (series && scope !== 'this') {
      return editRecurringEvent({
        eventId: base.id,
        originalStartDate: base.startIso,
        scope,
        timezoneOffset: tz,
        timeZone: timezone,
        // Notes and place are sent even when emptied, so clearing them clears the series (undefined is "leave as is").
        // Notes and place apply literally to every event in scope, so they go only when the coach changed them (an
        // emptied field goes as '', which clears it); untouched, each event keeps its own.
        updates: {
          title: title.trim(),
          ...(notes.trim() !== (base.notes ?? '').trim() ? { description: notes.trim() } : {}),
          ...(loc.trim() !== (base.location ?? '').trim() ? { location: loc.trim() } : {}),
          // Like notes and place, sent only when the coach changed it, so each event keeps its own otherwise.
          ...(rsvp !== base.rsvpRequired ? { requiresRsvp: rsvp } : {}),
          startDate: date,
          ...(keepEnd || runKept ? {} : { endDate: end.date, endTime: end.time }),
          startTime,
        },
      });
    }
    const add = invited.filter((p) => !base.people.includes(p));
    const remove = base.people.filter((p) => !invited.includes(p));
    return updateGolfEvent(base.id, {
      title: title.trim(),
      eventType: type as never,
      startDate: date,
      ...(keepEnd || runKept ? {} : { endDate: end.date, endTime: end.time }),
      startTime,
      allDay,
      location: loc.trim(),
      description: notes.trim(),
      addAttendeeIds: add.length ? add : undefined,
      removeAttendeeIds: remove.length ? remove : undefined,
      requiresRsvp: rsvp,
      timezoneOffset: tz,
    } as never);
  };

  // What follows a landed save (the editor closes, the panel clears, the page re-reads or moves to the event's
  // day) is part of the action, not of the button that started it, so the toast's Retry finishes the job too.
  // The event is saved but the server could not write its invitations: "players notified" would be false, so the
  // toast says what happened instead (the editor closes, the event is on the calendar).
  const invitationsNote = (res: unknown): string | null => {
    const note = (res as { data?: { invitationsError?: unknown } | null } | null | undefined)?.data?.invitationsError;
    return typeof note === 'string' && note ? note : null;
  };
  const save = useAction<[], unknown>(
    'calendar.saveEvent',
    async () => {
      // A new one-off event goes on the calendar at once; a series, a run of days, an edit or a tournament waits.
      const draft: ChCalEvent | null =
        provisional && !base && !tracked && repeat === 'none' && extraDays === 0
          ? { id: `provisional:${Date.now()}`, type, title: title.trim(), date, start: allDay ? null : win[0], end: allDay ? null : win[1], allDay, location: loc.trim() || null, notes: notes.trim() || null, recurring: null, people: invited, rsvp: {}, rsvpRequired: rsvp, owner: null, busyOnly: false, instructor: null, pattern: null, canEdit: false, cancelled: false, seriesId: null, startIso: `${date}T${allDay ? '00:00' : toHHMM(win[0])}:00`, span: null }
          : null;
      const undo = draft ? provisional!.add(draft) : null;
      let res: Awaited<ReturnType<typeof send>> | undefined;
      try {
        res = await send();
      } finally {
        if (undo && draft && !normalise<unknown>(res).success) {
          undo();
          provisional!.reopen(draft);
        }
      }
      if (tracked) {
        const r = res as { success: boolean; error?: string; code?: TournamentRefusal; data?: { tournamentId: string; version: number; replayed: boolean; rounds: { roundNumber: number; eventId: string }[] } };
        if (r.success && r.data) {
          setTourNote(null);
          const name = title.trim();
          const id = r.data.tournamentId;
          haptic('success');
          const saved = tournamentSavedToast(name, id);
          toast({ title: saved.title, code: saved.code, action: { label: saved.action, run: () => router.push(saved.href) } });
          onTournamentSaved?.({ tournamentId: id, version: r.data.version, name, rounds: r.data.rounds, state: tourState, invited, rsvp, notes: notes.trim() || null, fromEventId: base?.id ?? null });
          onSaved(tourState.firstDay);
        } else {
          const refusal = r.code ?? 'failed';
          const n = refusalNotice(refusal, { save: 'create', name: title.trim() });
          haptic('error');
          setTourNote({ ...n, refusal });
          requestAnimationFrame(() => document.getElementById('ch-tfx-save-error')?.focus());
        }
        return res;
      }
      if (normalise<unknown>(res).success) {
        onSaved(date);
        const note = invitationsNote(res);
        if (note) {
          haptic('warning');
          toast({
            tone: 'error',
            title: `${!base ? 'Published' : 'Saved'} · ${title.trim()} · invitations didn’t go out`,
            body: `${note} Open the event and invite them again.`,
          });
        }
      }
      return res;
    },
    () => ({
      // Only an event that asks for replies notifies anyone (owner, 2026-10-08).
      done: !base ? `Published · ${title.trim()}${invited.length && rsvp ? ' · players notified' : ''}` : moved ? `Moved · ${title.trim()}` : `Saved · ${title.trim()}`,
      failed: !base ? `Couldn’t publish ${title.trim() || 'the event'}` : `Couldn’t save ${title.trim() || 'the event'}`,
      hint: 'Your changes are still in the editor. Try again in a moment.',
      code: 'CH-6001',
    }),
    // A refine function changes which text a failure shows (its hint wins over the server's reason), so a failure
    // keeps the same order it had without one: the server's reason, then this hint. Only a save that landed without
    // its invitations is refined: it is quiet here because the action above already said so.
    // A tournament's outcome is drawn by the section (its toast with Open, or its inline notice), so it is quiet here.
    (result, c) => (tracked ? { ...c, quiet: true } : result.success ? (invitationsNote(result) ? { ...c, quiet: true } : c) : { ...c, hint: friendlyReason(result.error) ?? c.hint }),
  );

  const submit = async () => {
    setTouched(true);
    if (tracked) {
      // Every error shows at once; focus goes to the first (4.1.10).
      const first = tourErrors.name ? 'ch-ed-title' : tourErrors.days ? 'ch-tfx-days' : tourErrors.course ? 'ch-tfx-course' : tourErrors.rounds ? 'ch-tfx-days' : tourErrors.counting ? 'ch-tfx-counting' : tourErrors.resultsUrl ? 'ch-tfx-results' : null;
      if (first) {
        haptic('warning');
        document.getElementById(first)?.focus();
        return;
      }
      if (!teamId) return;
      chTrail(`calendar tournament ${base ? 'convert' : 'create'} submit`);
      await save.run();
      return;
    }
    if (invalidTitle || invalidTime) {
      // CH-6702: the warning pattern for a form with a problem (and when closing with changes, below).
      haptic('warning');
      if (invalidTitle) document.getElementById('ch-ed-title')?.focus();
      return;
    }
    chTrail(`calendar ${base ? 'edit' : 'create'} submit`);
    await save.run();
  };

  const allOn = invited.length === people.length;
  const tourDirty = tracked && JSON.stringify(tour) !== tourBaseline;
  const dirty = open && (snapshot({ title, type, date, win, allDay, repeat, loc, notes, invited, rsvp }) !== baseline || tourDirty);
  // Closing with edits asks first; closing untouched just closes.
  const requestClose = () => {
    // CH-6842: a tournament on its way can't be closed under it; Escape says so instead.
    if (save.pending && tracked) {
      setSaid('Still creating the tournament.');
      return;
    }
    if (dirty && !save.pending) {
      haptic('warning');
      setDiscarding(true);
    } else onClose();
  };
  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        width={1040}
        icon={base ? Pencil : CalendarPlus}
        title={base ? 'Edit event' : 'New event'}
        // A-14: a new event starts on its title, so the coach can type at once. An edit keeps the heading first, and the
        // phone does too, so the sheet doesn't rise with the keyboard over it (as onboarding's autoFocus={!phone}).
        initialFocus={!base && !phone ? '#ch-ed-title' : undefined}
        description={
          // Only an event that asks for replies notifies anyone (owner, 2026-10-08).
          rsvp ? (base ? 'Changes notify everyone invited.' : 'Invited players get a notification and can reply.') : 'Invited players see it on their calendar.'
        }
        footer={
          <>
            <span className="ch-in__quiet" style={{ marginRight: 'auto' }}>
              {invited.length ? (rsvp ? 'Attendees will be notified' : 'No notification sent') : 'No one invited yet'}
            </span>
            <Button variant="ghost" onClick={requestClose}>
              Cancel
            </Button>
            <Button variant="primary" busy={save.pending} onClick={() => void submit()}>
              {save.pending ? (tracked ? (base ? 'Setting up…' : 'Creating…') : base ? 'Saving…' : 'Publishing…') : primary}
            </Button>

    </>
      }
    >
      <form
        className="ch-ed"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="ch-ed__col">
          <div>
            <input
              id="ch-ed-title"
              className="ch-ed__title"
              placeholder={tracked ? 'Pinehurst Invitational' : 'Event title'}
              aria-label={tracked ? 'Tournament name' : 'Event title'}
              value={title}
              aria-invalid={touched && (invalidTitle || (tracked && !!tourErrors.name))}
              aria-describedby={touched && (invalidTitle || (tracked && !!tourErrors.name)) ? 'ch-ed-title-err' : undefined}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={tracked ? 120 : 200}
            />
            {touched && invalidTitle && (
              <p id="ch-ed-title-err" className="ch-field__help is-error" data-ch-code="CH-6101">
                Give the event a title.
              </p>
            )}
            {touched && tracked && tourErrors.name && (
              <p id="ch-ed-title-err" className="ch-field__help is-error" data-ch-code={tourErrors.name.code}>
                {tourErrors.name.text}
              </p>
            )}
            {tracked && title.length >= 100 && <p className="ch-field__help ch-num">{`${title.length} of 120`}</p>}
          </div>
          <div className="ch-ed__types">
            <span className="ch-ed__lbl">Type</span>
            <Segmented<ChCalType>
              size="sm"
              label="Event type"
              value={type}
              onChange={setType}
              options={EDIT_TYPES.map((t) => ({
                value: t,
                label: (
                  <>
                    <Icon icon={TYPE_ICON[t]} size={13} />
                    {TYPE_LABEL[t]}
                  </>
                ),
              }))}
            />
          </div>
          {tourOn && (
            <TournamentSection
              ref={section}
              track={tracked}
              onTrack={(on) => {
                setTrackPref(on);
                setSaid(on ? `Tournament details shown. ${plural(tour.rounds.length, 'round')}.` : 'Tournament details hidden.');
              }}
              legacy={legacyTour}
              block={trackBlock}
              state={tourState}
              onChange={(next) => setTour(next)}
              errors={tourErrors}
              showErrors={touched}
              timezone={timezone}
              courseWrites={courseWrites}
              announce={setSaid}
              orphan={orphanRound ? { round: Number(orphanRound) } : null}
              disabled={save.pending}
            />
          )}
          {tracked && tourNote && (
            <TournamentSaveNotice
              code={tourNote.code}
              text={tourNote.text}
              onReload={tourNote.refusal === 'stale' ? () => router.refresh() : undefined}
            />
          )}
          {!tracked && (
          <div>
            <span className="ch-ed__lbl">When</span>
            <div className="ch-ed__row">
              <DateField label="Date" row value={date} onChange={(v) => v && setDate(v)} />
              <TimeField label="Start time" disabled={allDay} value={toHHMM(win[0])} onChange={(v) => v && setWin([snap(fromHHMM(v)), multiTimed ? win[1] : snap(fromHHMM(v)) + (win[1] - win[0])])} />
              <TimeField label="End time" disabled={allDay} min={!multiTimed && !needsEnd ? toHHMM(win[0] + 0.25) : undefined} value={toHHMM(win[1])} aria-invalid={touched && invalidTime} onChange={(v) => v && setWin([win[0], snap(fromHHMM(v))])} />
            </div>
            {!allDay && (
              <p className={'ch-field__help' + (touched && invalidTime ? ' is-error' : '')} data-ch-code={touched && invalidTime ? 'CH-6102' : undefined}>
                {needsEnd ? 'This event ran past midnight. Pick an end time for the new day.' : invalidTime ? 'End has to be after the start.' : multiTimed ? `Ends ${dowOf(endDate)} ${dayNum(endDate)} ${monthName(endDate).slice(0, 3)}` : `${minutes} min`}
              </p>
            )}
            <div className="ch-ed__opts">
              <label className="ch-switch">
                {/* A series edit carries no All day (editRecurringEvent has none): flipping it there would move every time to midnight. */}
                <input type="checkbox" checked={allDay} disabled={series && scope !== 'this'} onChange={(e) => (haptic('select'), setAllDay(e.target.checked))} />
                <span className="ch-switch__t" aria-hidden="true" />
                All day
              </label>
              {!base && (
                <Segmented<Repeat>
                  label="Repeat"
                  value={repeat}
                  onChange={setRepeat}
                  options={[
                    { value: 'none', label: 'Once' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'weekdays', label: 'Weekdays' },
                  ]}
                />
              )}
              {!base && repeat !== 'none' && (
                <div className="ch-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <span className="ch-field__label">Until</span>
                  <DateField label="Until" value={until} min={date} onChange={(v) => v && setUntil(v)} />
                </div>
              )}
            </div>
            {series && (
              <div style={{ marginTop: 12 }}>
                <span className="ch-ed__lbl">Apply to</span>
                <Segmented<Scope>
                  label="Apply changes to"
                  value={scope}
                  onChange={(s) => {
                    setScope(s);
                    if (s !== 'this' && base) setAllDay(base.allDay);
                  }}
                  options={[
                    { value: 'this', label: 'This event' },
                    { value: 'thisAndFuture', label: 'This and following' },
                    { value: 'all', label: 'All in series' },
                  ]}
                />
                {scope !== 'this' && <p className="ch-field__help">Series changes cover title, time, place and notes. Type, All day and invitees change one event at a time.</p>}
              </div>
            )}
          </div>
          )}
          {!tracked && (
            <label className="ch-field">
              <span className="ch-field__label">Location</span>
              <input className="ch-input" placeholder="Practice green, Finley GC" value={loc} onChange={(e) => setLoc(e.target.value)} maxLength={500} />
            </label>
          )}
          <label className="ch-field">
            <span className="ch-field__label">Notes · optional</span>
            <textarea className="ch-textarea" rows={3} placeholder="What to bring, what you’ll work on" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
          </label>
        </div>

        <div className="ch-ed__col">
          <div>
            <div className="ch-in__sechead" style={{ marginBottom: 6 }}>
              <span className="ch-ed__lbl" style={{ margin: 0 }}>
                {peopleError && !people.length ? 'Invite' : `Invite · ${invited.length} of ${people.length}`}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setInvited(allOn ? [] : people.map((p) => p.id))}>
                {allOn ? 'Clear' : 'Select all'}
              </Button>
            </div>
            {people.length ? (
              <div className="ch-ed__inv">
                {people.map((p) => (
                  <label key={p.id}>
                    <input
                      type="checkbox"
                      checked={invited.includes(p.id)}
                      onChange={() => {
                        haptic('select');
                        setInvited((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]));
                      }}
                    />
                    <Avatar name={p.name} size={22} />
                    <span>
                      {p.name}
                      {clashes.includes(p.id) ? <small>Busy at this time</small> : p.availability && p.availability !== 'available' ? <small>{AVAILABILITY_WORD[p.availability]}</small> : null}
                    </span>
                  </label>
                ))}
              </div>
            ) : peopleError ? (
              <p className="ch-in__quiet" data-ch-code="CH-6213">
                The roster didn’t load, so no one can be invited yet. Close this, try again, then invite players.
              </p>
            ) : (
              <p className="ch-in__quiet">No active players on the roster yet.</p>
            )}
          </div>
          <div>
            <label className="ch-switch">
              <input type="checkbox" checked={rsvp} onChange={(e) => (haptic('select'), setRsvp(e.target.checked))} aria-describedby="ch-ed-rsvp-help" />
              <span className="ch-switch__t" aria-hidden="true" />
              Require RSVP
            </label>
            <p id="ch-ed-rsvp-help" className="ch-field__help">
              {rsvp ? 'Invited players are notified and reply Going, Maybe or Can’t.' : 'Off: no replies asked and no notification. It still shows on their calendars.'}
            </p>
          </div>
          {!tracked && !allDay && !multiTimed && invited.length > 0 && (
            <div>
              <div className="ch-in__sechead" style={{ marginBottom: 8 }}>
                <span className="ch-ed__lbl" style={{ margin: 0 }}>
                  Find a time · {dowOf(date)} {dayNum(date)}
                </span>
                <span>Drag the band, or use the arrow keys</span>
              </div>
              <FindTime rows={invited} events={events} date={date} win={win} setWin={setWin} ignoreId={base?.id} people={byId} />
            </div>
          )}
          {tracked ? (
            <p className="ch-tfx__receipt" role="note">
              {receiptSentence({ state: tourState, convert: !!base, rsvp })}
            </p>
          ) : (
          <>
          <div className={'ch-verify ' + (allDay || multiTimed || !invited.length ? 'is-quiet' : clashes.length ? 'is-warn' : 'is-ok')} role="status">
            <span className="ch-verify__ic">
              <Icon icon={clashes.length ? TriangleAlert : Check} size={14} />
            </span>
            <span>
              {!invited.length
                ? 'Invite players to check their schedules.'
                : allDay
                  ? 'All-day events aren’t checked against classes.'
                  : multiTimed
                    ? 'Events over several days aren’t checked against classes.'
                  : clashes.length
                    ? `${clashes.map((p) => byId.get(p)?.name.split(' ')[0]).join(', ')} ${clashes.length > 1 ? 'are' : 'is'} busy at this time.`
                    : 'Everyone invited is free. Checked against classes and team events.'}
            </span>
          </div>
          <dl className="ch-rcpt">
            <dt>What</dt>
            <dd>
              {title.trim() || '—'} · {TYPE_LABEL[type]}
            </dd>
            <dt>When</dt>
            <dd className="ch-num">
              {whenLabel}
              {moved && base && <span className="ch-rcpt__was"> · was {fmtHour(base.start!, false, clock)} – {fmtHour(base.end!, true, clock)}</span>}
            </dd>
            <dt>Where</dt>
            <dd>{loc.trim() || '—'}</dd>
            <dt>Who</dt>
            <dd>{allOn && people.length ? `Whole team · ${people.length} players` : invited.length ? invited.map((p) => byId.get(p)?.name.split(' ')[0]).join(', ') : '—'}</dd>
            <dt>RSVP</dt>
            <dd>{rsvp ? 'Required' : 'Not asked'}</dd>
            <dt>Repeats</dt>
            <dd>{base ? (base.recurring ?? 'Does not repeat') : repeat === 'none' ? 'Does not repeat' : repeat === 'weekly' ? `Weekly on ${dowOf(date)} until ${dayNum(until)} ${monthName(until).slice(0, 3)}` : `Every weekday until ${dayNum(until)} ${monthName(until).slice(0, 3)}`}</dd>
          </dl>
          </>
          )}
        </div>
        <button type="submit" hidden />
        {/* CH-6840 to CH-6842: the section's polite lines (opened, rounds changed or reordered, Escape while creating). */}
        <span className="ch-sr-only" role="status" aria-live="polite" data-ch-code="CH-6841">
          {said}
        </span>
      </form>
    </Modal>
    <Modal
      code="CH-6503"
      open={open && discarding}
      onClose={() => setDiscarding(false)}
      width={420}
      icon={CircleX}
      title={base ? 'Discard your changes?' : 'Discard this event?'}
      description={`${base ? 'Your edits to this event are lost. The event stays as it was.' : 'Nothing has been published yet. What you entered is lost.'}${tourDirty ? ' The tournament details you entered are lost too.' : ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => setDiscarding(false)}>
            Keep editing
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setDiscarding(false);
              onClose();
            }}
          >
            Discard
          </Button>
        </>
      }
    />
    </>
  );
}

export function CancelEvent({ event, onClose, onDone }: { event: ChCalEvent | null; onClose: () => void; onDone: () => void }) {
  const [scope, setScope] = useState<Scope>('this');
  useEffect(() => setScope('this'), [event]);
  // The close and the re-read that follow a landed cancel are part of the action, so the toast's Retry does them too.
  const cancel = useAction(
    'calendar.cancelEvent',
    async () => {
      if (!event) return { success: false, error: 'No event' };
      const res = event.seriesId && scope !== 'this' ? await deleteRecurringEvent(event.id, event.startIso, scope) : await deleteGolfEvent(event.id);
      if (normalise(res).success) onDone();
      return res;
    },
    () => ({ done: `Cancelled · ${event?.title ?? 'event'}${event?.rsvpRequired ? ' · attendees notified' : ''}`, failed: `Couldn’t cancel ${event?.title ?? 'the event'}`, code: 'CH-6002' }),
  );
  return (
    <Modal
      code="CH-6501"
      open={event != null}
      onClose={onClose}
      icon={CircleX}
      title={`Cancel ${event?.title ?? 'event'}?`}
      description={
        // One event is a soft cancel. The series scopes go through deleteRecurringEvent, which deletes the rows, so
        // the copy must not promise what only the soft cancel does (61101).
        // Only an event that asks for replies notifies anyone of its cancellation (owner, 2026-10-08).
        event?.rsvpRequired
          ? event.seriesId && scope !== 'this'
            ? 'Everyone invited is notified. These events are removed from the calendar, and their replies and attendance with them.'
            : 'Everyone invited is notified. Replies and attendance are kept, and the event stays on the calendar marked cancelled.'
          : event?.seriesId && scope !== 'this'
            ? 'No one is notified, since these events don’t ask for replies. They are removed from the calendar, and their attendance with them.'
            : 'No one is notified, since this event doesn’t ask for replies. Attendance is kept, and the event stays on the calendar marked cancelled.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep event
          </Button>
          <Button
            variant="danger"
            feel="warning"
            busy={cancel.pending}
            onClick={() => void cancel.run()}
          >
            {cancel.pending ? 'Cancelling…' : 'Cancel event'}
          </Button>
        </>
      }
    >
      {event?.seriesId && (
        <Segmented<Scope>
          label="Cancel which events"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'this', label: 'This event' },
            { value: 'thisAndFuture', label: 'This and following' },
            { value: 'all', label: 'All in series' },
          ]}
        />
      )}
    </Modal>
  );
}

/**
 * Delete permanently (a cancelled event's menu, coach), as Fairway's EventActionsMenu offers it: `deleteGolfEventPermanently`,
 * which the server allows only for a cancelled event (or one with no attendance rows), and which erases its replies and
 * attendance. Asked first (CH-6506), with the warning haptic on the red button (D-70), as Cancel event is.
 */
export function DeleteEvent({ event, onClose, onDone }: { event: ChCalEvent | null; onClose: () => void; onDone: () => void }) {
  // The close and the re-read that follow a landed delete are part of the action, so the toast's Retry does them too.
  const remove = useAction(
    'calendar.deleteEvent',
    async () => {
      if (!event) return { success: false, error: 'No event' };
      const res = await deleteGolfEventPermanently(event.id);
      if (normalise(res).success) onDone();
      return res;
    },
    () => ({ done: `Deleted · ${event?.title ?? 'event'}`, failed: `Couldn’t delete ${event?.title ?? 'the event'}`, code: 'CH-6017' }),
  );
  return (
    <Modal
      code="CH-6506"
      open={event != null}
      onClose={onClose}
      icon={Trash2}
      title={`Delete ${event?.title ?? 'this event'} permanently?`}
      description="Every reply and attendance record for it is erased. This can’t be undone."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep event
          </Button>
          <Button variant="danger" feel="warning" busy={remove.pending} onClick={() => void remove.run()}>
            {remove.pending ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </>
      }
    />
  );
}

type Feed = { id: string; name: string; type: 'team' | 'personal'; url: string };
type FeedKind = Feed['type'];

const FEED_NAME: Record<FeedKind, string> = { team: 'Team schedule', personal: 'My schedule' };

/** What the person is asked before a link is replaced or removed: either one ends the link they may have already shared. */
const FEED_ASK = {
  new: {
    title: (name: string) => `Make a new ${name} link?`,
    body: 'The current link stops working right away. Anyone who added it to a calendar app stops getting updates until they add the new link.',
    go: 'Make a new link',
    code: 'CH-6504',
  },
  remove: {
    title: (name: string) => `Remove the ${name} link?`,
    body: 'The link stops working right away, so calendar apps that use it stop getting updates. You can create a new link any time.',
    go: 'Remove link',
    code: 'CH-6505',
  },
} as const;

export function SubscribeSheet({ open, onClose, role }: { open: boolean; onClose: () => void; role: 'coach' | 'player' }) {
  const toast = useToast();
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The link being asked about, and what would happen to it (New link, Remove): nothing is sent until it is confirmed.
  const [asking, setAsking] = useState<{ type: FeedKind; kind: keyof typeof FEED_ASK } | null>(null);
  const askRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) setAsking(null);
  }, [open]);
  useEffect(() => {
    if (!asking) return;
    haptic('warning');
    // Focus starts on Keep link, so Enter never confirms by accident.
    askRef.current?.querySelector('button')?.focus();
  }, [asking]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setFailed(false);
    getCalendarFeeds()
      .then((r) => {
        if (!live) return;
        if (!r.success) {
          chReport(new Error(r.error || 'feeds read failed'), { surface: 'calendar.subscribe', severity: 'low' });
          setFailed(true);
          return;
        }
        setFeeds((r.data ?? []) as Feed[]);
      })
      .catch((err) => {
        if (!live) return;
        chReport(err, { surface: 'calendar.subscribe' });
        setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [open, attempt]);

  // Reading the links again (so the new one shows in place of Create link) is part of the action, so the toast's Retry does it too.
  const create = useAction(
    'calendar.createFeed',
    async (type: FeedKind) => {
      const res = await createCalendarFeed(type);
      if (normalise(res).success) setAttempt((a) => a + 1);
      return res;
    },
    (type) => ({
      done: type === 'team' ? 'Team schedule link ready' : 'Your schedule link ready',
      failed: "Couldn’t create the calendar link",
      code: 'CH-6003',
    }),
  );

  // The server deletes the old link before it makes the new one, so a failure can leave either state: the links are
  // read again, and there is no Retry (it would ask to replace a link that may be gone); the row shows what exists.
  const regenerate = useAction(
    'calendar.regenerateFeed',
    async (type: FeedKind) => {
      let res: Awaited<ReturnType<typeof regenerateCalendarFeed>>;
      try {
        res = await regenerateCalendarFeed(type);
      } catch (err) {
        setAttempt((a) => a + 1);
        throw err;
      }
      const landed = normalise(res);
      if (landed.success && landed.data) {
        const next = landed.data as Feed;
        setFeeds((cur) => cur && cur.map((f) => (f.type === type ? next : f)));
      } else {
        setAttempt((a) => a + 1);
      }
      return res;
    },
    (type) => ({ done: `New ${FEED_NAME[type]} link ready`, failed: `Couldn’t make a new ${FEED_NAME[type]} link`, hint: 'The links below show which one works now.', retry: false, code: 'CH-6013' }),
  );

  const remove = useAction(
    'calendar.removeFeed',
    async (type: FeedKind) => {
      const res = await deleteCalendarFeed(type);
      if (normalise(res).success) setFeeds((cur) => cur && cur.filter((f) => f.type !== type));
      return res;
    },
    (type) => ({ done: `${FEED_NAME[type]} link removed`, failed: `Couldn’t remove the ${FEED_NAME[type]} link`, hint: 'The link is unchanged. Try again.', code: 'CH-6014' }),
  );
  const busy = create.pending || regenerate.pending || remove.pending;

  const confirm = (type: FeedKind, kind: keyof typeof FEED_ASK) => {
    setAsking(null);
    void (kind === 'new' ? regenerate : remove).run(type);
  };

  const copy = async (f: Feed) => {
    try {
      await navigator.clipboard.writeText(f.url.replace(/^https?:/, 'webcal:'));
      haptic('success');
      toast({ title: `Link copied · ${f.type === 'team' ? 'Team schedule' : 'My schedule'}` });
    } catch (err) {
      chReport(err, { surface: 'calendar.subscribe', severity: 'low' });
      haptic('error');
      toast({ tone: 'error', title: "Couldn’t copy the link", body: 'Your browser blocked the clipboard. Select the link and copy it.', code: 'CH-6004' });
    }
  };

  // The team link is a coach's: createCalendarFeed refuses it for a player, so a player is never offered it (60804).
  const rows: Array<{ type: 'team' | 'personal'; name: string; desc: string }> = [
    ...(role === 'coach' ? [{ type: 'team' as const, name: 'Team schedule', desc: 'Every team event. Classes are never included.' }] : []),
    { type: 'personal', name: 'My schedule', desc: role === 'coach' ? 'Events you run and your busy time' : 'Events you’re invited to and your classes' },
  ];
  return (
    <Modal open={open} onClose={onClose} width={560} icon={Rss} title="Add to your calendar app" description="One-way: changes in Helm appear in Apple, Google or Outlook within an hour. Edits made there don’t come back." footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      {failed ? (
        <InlineNotice code="CH-6206" title="Your calendar links didn’t load." body="Try again." onRetry={() => setAttempt((a) => a + 1)} />
      ) : !feeds ? (
        <div style={{ display: 'grid', gap: 12 }} aria-busy="true" data-ch-code="CH-6402">
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : (
        <div>
          {rows.map((r) => {
            const f = feeds.find((x) => x.type === r.type);
            const ask = f && asking?.type === r.type ? FEED_ASK[asking.kind] : null;
            return (
              <div key={r.type} className="ch-feed">
                <div className="ch-feed__t" style={{ minWidth: 0 }}>
                  <b>{r.name}</b>
                  <span>{r.desc}</span>
                  {f && <code>{f.url.replace(/^https?:/, 'webcal:')}</code>}
                </div>
                {f ? (
                  <Button size="sm" leftIcon={Copy} onClick={() => void copy(f)}>
                    Copy link
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void create.run(r.type)}
                  >
                    Create link
                  </Button>
                )}
                {f && asking && ask ? (
                  <div ref={askRef} className="ch-feed__ask" role="group" aria-label={ask.title(r.name)} data-ch-code={ask.code}>
                    <b>{ask.title(r.name)}</b>
                    <p>{ask.body}</p>
                    <div className="ch-feed__acts">
                      <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
                        Keep link
                      </Button>
                      <Button size="sm" variant={asking.kind === 'remove' ? 'danger' : 'primary'} busy={busy} onClick={() => confirm(r.type, asking.kind)}>
                        {ask.go}
                      </Button>
                    </div>
                  </div>
                ) : (
                  f && (
                    <div className="ch-feed__acts">
                      <Button size="sm" variant="ghost" leftIcon={RotateCw} disabled={busy} onClick={() => setAsking({ type: r.type, kind: 'new' })}>
                        New link
                      </Button>
                      <Button size="sm" variant="ghost" leftIcon={Trash2} disabled={busy} onClick={() => setAsking({ type: r.type, kind: 'remove' })}>
                        Remove
                      </Button>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
