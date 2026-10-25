'use client';

import {
  ArrowRight,
  CalendarCheck,
  ChevronRight,
  CircleX,
  ClipboardCheck,
  Clock,
  Copy,
  Ellipsis,
  Link2,
  Lock,
  MailQuestion,
  MapPin,
  Pencil,
  Repeat,
  RotateCcw,
  Text,
  Trash2,
  TriangleAlert,
  UserRound,
  Users,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getAttendanceReport, markAttendance, type AttendanceMark } from '@/app/golf/actions/attendance';
import { respondToEvent } from '@/app/golf/actions/calendar-events';
import { readRsvpLockCode, rsvpLockMessage } from '@/hooks/useRSVP';
import { Avatar } from '../../ui/Avatar';
import { AVAILABILITY_WORD } from '../roster/format';
import { PlayerPeek } from '../../ui/PlayerPeek';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import { InlineNotice } from '../../ui/Notices';
import { PillGroup, Segmented, type SegOption } from '../../ui/Segmented';
import { Skeleton } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { normalise, useAction } from '../../lib/use-action';
import { chReport, chTrail } from '../../lib/track';
import { haptic } from '../../lib/haptics';
import { useChClock } from '../../lib/use-clock';
import { restyleClock } from '../../lib/clock-format';
import type { ChClock } from '../../lib/clock-cookie';
import {
  TYPE_LABEL,
  dayLabel,
  dayNum,
  dowOf,
  fmtHour,
  isMajor,
  openTimes,
  rangeLabel,
  replyLock,
  rsvpCounts,
  type ChCalEvent,
  type ChCalOverlap,
  type ChCalPerson,
  type ChCalType,
  type ChRsvp,
} from './model';
import type { ChNow } from './views';
import { messageCoachHref } from '../home/player-links';
import { BusyDetail, EventFiles, LinkedTrip } from './extras';
import { courseParts } from './class-group';
import { BackLink } from '../../ui/Section';
import { plural, pluralWord } from '../../lib/plural';

export type ChInsp =
  | { kind: 'event'; id: string; date: string }
  | { kind: 'attendance'; id: string; date: string }
  | { kind: 'overlap'; id: string }
  | null;

export interface InspCtx {
  role: 'coach' | 'player';
  viewerPlayerId: string | null;
  zoneLabel: string;
  now: ChNow;
  /** The team-zone hour the server read this data: "Checked 2:40 PM". */
  loadedHour: number;
  people: Map<string, ChCalPerson>;
  events: ChCalEvent[];
  overlaps: ChCalOverlap[];
  rsvpError: boolean;
  /** The page's notice carries the one Try again (CH-1209): a failed part keeps only its title here. */
  covered?: boolean;
  /** Dev preview: no session, so attendance starts unmarked instead of calling the server. */
  preview?: boolean;
  teamId: string;
  go: (next: ChInsp) => void;
  onEdit: (e: ChCalEvent, proposal?: [number, number]) => void;
  onCancel: (e: ChCalEvent) => void;
  /** A cancelled event, coach: Restore event (back to confirmed) and Delete permanently, as Fairway's event menu offers. */
  onRestore?: (e: ChCalEvent) => void;
  onDelete?: (e: ChCalEvent) => void;
  /** Duplicate: New event seeded from this one (coach). Absent where the editor isn't offered. */
  onDuplicate?: (e: ChCalEvent) => void;
  /** Compare schedules (a class, coach): New event on that day with the class's player invited, so Find a time shows them side by side. */
  onFind?: (date: string, invite: string[]) => void;
  refresh: () => void;
}

const first = (name: string | undefined) => (name ?? '').split(' ')[0] ?? '';

function Fact({ icon, tone, children }: { icon: LucideIcon; tone?: 'team' | 'class' | 'own'; children: ReactNode }) {
  return (
    <div className={'ch-in__fact' + (tone ? ` is-${tone}` : '')}>
      <Icon icon={icon} size={15} />
      <div>{children}</div>
    </div>
  );
}

/** The panel plate's tone for an event type: the colour its block has on the grid, deepened for ivory ink. */
const plateTone = (t: ChCalType) => (t === 'practice' ? 'green' : isMajor(t) ? 'forest' : t === 'travel' || t === 'class' ? 'slate' : t === 'busy' ? 'champagne' : 'ink');

function Back({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <BackLink className="ch-in__up" onClick={onClick}>
      {label}
    </BackLink>
  );
}

function Warn({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="ch-cal-warn" role="status">
      <Icon icon={TriangleAlert} size={15} />
      <div>
        <b>{title}</b>
        <p>{children}</p>
      </div>
      {action}
    </div>
  );
}

const find = (events: ChCalEvent[], id: string, date?: string) => events.find((e) => e.id === id && (!date || e.date === date)) ?? events.find((e) => e.id === id);

/** A player's own clash, in their words: "Overlaps your ECON 101 class 3:00–4:00 PM" (or another event they're on). */
function playerOverlapLine(events: ChCalEvent[], o: ChCalOverlap, clock: ChClock): string {
  const w = find(events, o.withId);
  const what = !w ? 'another of your events' : w.type === 'class' ? `your ${w.title} class` : w.title;
  return `Overlaps ${what} ${fmtHour(o.from, false, clock)}–${fmtHour(o.to, true, clock)}`;
}

/* Nothing selected: today, what needs attention, where the data comes from. */
export function Summary({ ctx }: { ctx: InspCtx }) {
  const { now, events, overlaps, people, role } = ctx;
  const clock = useChClock();
  const today = events.filter((e) => e.date === now.date && e.type !== 'class' && e.type !== 'busy' && !e.cancelled).sort((a, b) => (a.start ?? -1) - (b.start ?? -1));
  const next = today.find((e) => !e.allDay && (e.start ?? 0) > now.hour);
  const mins = next ? Math.round(((next.start ?? 0) - now.hour) * 60) : 0;
  const until = mins < 60 ? `in ${mins} min` : `in ${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ''}`.trim();
  const weekEnd = dayAfter(now.date, 7);
  const upcoming = events.filter((e) => e.type !== 'class' && e.type !== 'busy' && !e.cancelled && e.date >= now.date && e.date < weekEnd);
  const seen = new Set<string>();
  const pendingRows = upcoming
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    // Only events that ask for replies have replies waiting (owner, 2026-10-08).
    .filter((e) => e.rsvpRequired)
    // An event open to the team (the coach invited no one) waits on a player who hasn't replied yet, as one they are invited to does.
    .map((e) => ({ e, pending: [...e.people, ...(role === 'player' && e.openReply && ctx.viewerPlayerId && !e.people.includes(ctx.viewerPlayerId) ? [ctx.viewerPlayerId] : [])].filter((p) => (e.rsvp[p] ?? 'pending') === 'pending') }))
    // A player is asked only for a reply the server would still take (`replyLock`, as on the event itself).
    .filter((r) => (role === 'coach' ? r.pending.length > 0 : ctx.viewerPlayerId != null && r.pending.includes(ctx.viewerPlayerId) && !replyLock(r.e, now)))
    .sort((a, b) => (a.e.date + String(a.e.start ?? 0).padStart(5, '0')).localeCompare(b.e.date + String(b.e.start ?? 0).padStart(5, '0')));
  const weekOverlaps = overlaps.filter((o) => {
    const e = find(events, o.eventId);
    return e && e.date >= now.date && e.date < weekEnd;
  });
  const classOwners = new Set(events.filter((e) => e.type === 'class' && e.owner).map((e) => e.owner));

  return (
    <div className="ch-in">
      {/* Owner, 2026-10-08: the day is a lit green plate at the head of the panel, not ink on parchment. */}
      <div className="ch-in__today">
        <div className="ch-in__kick">
          <span>
            Today · {dowOf(now.date)} {dayNum(now.date)}
          </span>
          <span className="ch-num">{fmtHour(now.hour, true, clock)}</span>
        </div>
        <h2 className="ch-in__title">
        {today.length === 0 ? <span data-ch-code="CH-6302">Nothing on the team calendar today</span> : `${today.length} team ${pluralWord(today.length, 'event')} today`}
      </h2>
      {next && (
        <button
          type="button"
          className="ch-in__next"
          onClick={() => {
            haptic('select');
            ctx.go({ kind: 'event', id: next.id, date: next.date });
          }}
        >
          <span className="ch-in__at">{fmtHour(next.start!, false, clock)}</span>
          <span style={{ minWidth: 0 }}>
            <span className="ch-in__na">{next.title}</span>
            <span className="ch-in__nb">
              {next.location ? `${next.location} · ` : ''}
              {until}
            </span>
          </span>
          <Icon icon={ArrowRight} size={15} />
        </button>
      )}
      </div>

      <div className="ch-in__sec">
        <div className="ch-in__sechead">
          <b>{role === 'coach' ? 'Needs attention' : weekOverlaps.length ? 'Needs your attention' : 'Needs your reply'}</b>
          <span>Next 7 days</span>
        </div>
        {ctx.rsvpError && (
          <InlineNotice code="CH-6204" title="Replies didn’t load." body="Pending replies aren’t counted until they do." onRetry={ctx.refresh} covered={ctx.covered} />
        )}
        {weekOverlaps.length + pendingRows.length === 0 && !ctx.rsvpError ? (
          <p className="ch-in__quiet" data-ch-code="CH-6306">
            {role === 'coach' ? 'No overlaps and no replies waiting.' : 'You’re all caught up.'}
          </p>
        ) : (
          <div>
            {role === 'coach' &&
              weekOverlaps.map((o) => {
                const e = find(events, o.eventId)!;
                return (
                  <button key={o.id} type="button" className="ch-in__need" onClick={() => ctx.go({ kind: 'overlap', id: o.id })}>
                    <span className="ch-in__ic">
                      <Icon icon={TriangleAlert} size={14} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b>{e.title}</b>
                      <span>
                        {first(people.get(o.who)?.name)} overlaps · {dowOf(e.date)} {fmtHour(o.from, false, clock)}–{fmtHour(o.to, true, clock)}
                      </span>
                    </span>
                    <Icon icon={ChevronRight} size={14} />
                  </button>
                );
              })}
            {/* A player's own clash opens the event, where it says what to do (message the coach); it has no Overlap panel. */}
            {role === 'player' &&
              weekOverlaps.map((o) => {
                const e = find(events, o.eventId)!;
                return (
                  <button key={o.id} type="button" className="ch-in__need" onClick={() => ctx.go({ kind: 'event', id: e.id, date: e.date })}>
                    <span className="ch-in__ic">
                      <Icon icon={TriangleAlert} size={14} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b>{e.title}</b>
                      <span>
                        {playerOverlapLine(events, o, clock)} · {dowOf(e.date)}
                      </span>
                    </span>
                    <Icon icon={ChevronRight} size={14} />
                  </button>
                );
              })}
            {pendingRows.slice(0, 3).map(({ e, pending }) => (
              <button key={`${e.id}-p`} type="button" className="ch-in__need" onClick={() => ctx.go({ kind: 'event', id: e.id, date: e.date })}>
                <span className="ch-in__ic is-ok">
                  <Icon icon={MailQuestion} size={14} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <b>{role === 'coach' ? `${plural(pending.length, 'reply', 'replies')} pending` : e.title}</b>
                  <span>
                    {role === 'coach' ? `${e.title} · ${pending.length <= 2 ? pending.map((p) => first(people.get(p)?.name)).join(', ') : `${dowOf(e.date)} ${dayNum(e.date)}`}` : `${dowOf(e.date)} ${dayNum(e.date)} · ${rangeLabel(e, clock)}`}
                  </span>
                </span>
                <Icon icon={ChevronRight} size={14} />
              </button>
            ))}
            {pendingRows.length > 3 && (
              <p className="ch-in__quiet" style={{ paddingTop: 8 }}>
                {pendingRows.length - 3} more {pendingRows.length - 3 === 1 ? 'event is' : 'events are'} waiting on replies this week.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="ch-in__sec">
        <div className="ch-in__sechead">
          <b>Sources</b>
          <span className="ch-num">Checked {fmtHour(ctx.loadedHour, true, clock)}</span>
        </div>
        <div className="ch-in__facts">
          <Fact icon={CalendarCheck} tone="team">Team events from Helm</Fact>
          {role === 'coach' ? (
            <>
              <Fact icon={BookOpen} tone="class">
                Class schedules for {classOwners.size} {pluralWord(classOwners.size, 'player')}
              </Fact>
              <Fact icon={Lock} tone="own">Your busy time · only you see it</Fact>
            </>
          ) : (
            <Fact icon={Lock} tone="class">Your classes · only you and your coaches see them</Fact>
          )}
        </div>
      </div>
    </div>
  );
}

function dayAfter(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const RSVP_LABEL: Record<ChRsvp, [string, BadgeTone]> = {
  accepted: ['Going', 'accent'],
  maybe: ['Maybe', 'warning'],
  declined: ['Can’t make it', 'neutral'],
  pending: ['No reply', 'neutral'],
};

function Responses({ e }: { e: ChCalEvent }) {
  const c = rsvpCounts(e);
  const cells: Array<[string, number]> = [
    ['Going', c.accepted],
    ['Maybe', c.maybe],
    ['Can’t', c.declined],
    ['No reply', c.pending],
  ];
  return (
    <dl className="ch-in__resp">
      {cells.map(([l, v], i) => (
        <div key={l} className={i === 0 && v > 0 ? 'is-lead' : ''}>
          <dt>{l}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function PlayerReply({ e, playerId, now, onDone }: { e: ChCalEvent; playerId: string; now: ChNow; onDone: () => void }) {
  const current = e.rsvp[playerId] ?? 'pending';
  const [value, setValue] = useState<ChRsvp>(current);
  // The reply the server last confirmed. The toast's Retry runs an earlier render's action, so the way back after a
  // refusal is read from here and never from that render's closure.
  const confirmed = useRef<ChRsvp>(current);
  // The choice shows at once (optimistic), goes back if the server refuses, and the page re-reads when it lands. All
  // three live in the action, so the toast's Retry that lands also shows the choice and re-reads.
  const reply = useAction(
    'calendar.rsvp',
    async (status: 'accepted' | 'tentative' | 'declined') => {
      const chosen: ChRsvp = status === 'accepted' ? 'accepted' : status === 'tentative' ? 'maybe' : 'declined';
      setValue(chosen);
      let r: Awaited<ReturnType<typeof respondToEvent>>;
      try {
        r = await respondToEvent(e.id, status);
      } catch (err) {
        // A reply that never reached the server (a dropped connection) goes back too, never left showing as sent.
        setValue(confirmed.current);
        throw err;
      }
      // Lock reasons (deadline, started, cancelled) come back as codes; say which one.
      const res = r.success ? r : { success: false, error: rsvpLockMessage(readRsvpLockCode(r), r.error).replace(' — ', '. ').replace(/^RSVPs/, 'Replies') };
      if (normalise(res).success) {
        confirmed.current = chosen;
        onDone();
      } else setValue(confirmed.current);
      return res;
    },
    (status) => ({
      done: status === 'accepted' ? `You’re going to ${e.title}` : status === 'tentative' ? `Marked maybe for ${e.title}` : `Coach knows you can’t make ${e.title}`,
      failed: `Couldn’t send your reply for ${e.title}`,
      hint: 'Replies lock at the deadline or once the event starts.',
      code: 'CH-6010',
    }),
  );
  const pick = (v: ChRsvp) => {
    if (v === 'pending' || v === value) return;
    void reply.run(v === 'accepted' ? 'accepted' : v === 'maybe' ? 'tentative' : 'declined');
  };
  // Locked when the server locks it (`replyLock`): at the start, a day after an all-day event's, or past the deadline.
  const lock = replyLock(e, now);
  const closed = lock === 'deadline';
  if (e.cancelled) return null;
  if (lock) {
    return (
      <div className="ch-in__sec">
        <div className="ch-in__sechead">
          <b>Your reply</b>
          <span>{current === 'pending' ? 'No reply sent' : RSVP_LABEL[current][0]}</span>
        </div>
        <p className="ch-in__quiet">{closed ? 'Replies closed at the deadline the coach set.' : 'Replies close once an event starts.'}</p>
      </div>
    );
  }
  return (
    <div className="ch-in__sec">
      <div className="ch-in__sechead">
        <b>Your reply</b>
        <span>{current === 'pending' ? (e.openReply && !e.people.includes(playerId) ? 'Open to the whole team' : 'Coach is waiting on you') : 'You can change it'}</span>
      </div>
      <Segmented<ChRsvp>
        label="Your reply"
        value={value}
        onChange={pick}
        options={[
          { value: 'accepted', label: 'Going' },
          { value: 'maybe', label: 'Maybe' },
          { value: 'declined', label: 'Can’t make it' },
        ]}
      />
    </div>
  );
}

export function EventDetail({ ctx, id, date }: { ctx: InspCtx; id: string; date: string }) {
  const e = find(ctx.events, id, date);
  const toast = useToast();
  const clock = useChClock();
  if (!e) {
    return (
      <div className="ch-in">
        <Back label="Today" onClick={() => ctx.go(null)} />
        <p className="ch-in__quiet" data-ch-code="CH-6305">
          This event isn’t in the loaded range anymore. It may have moved or been cancelled.
        </p>
      </div>
    );
  }
  if (e.type === 'class') return <ClassDetail ctx={ctx} e={e} />;
  if (e.type === 'busy') return <BusyDetail e={e} now={ctx.now} zoneLabel={ctx.zoneLabel} onBack={() => ctx.go(null)} onDeleted={() => (ctx.go(null), ctx.refresh())} />;
  const overlap = ctx.overlaps.find((o) => o.eventId === e.id);
  const coach = ctx.role === 'coach';
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/golf/dashboard/calendar?event=${e.id}&date=${e.date}`);
      // CH-6703: a copied link lands with the success pattern.
      haptic('success');
      toast({ title: 'Link copied' });
    } catch (err) {
      chReport(err, { surface: 'calendar.detail', severity: 'low' });
      haptic('error');
      toast({ tone: 'error', title: "Couldn’t copy the link", body: 'Your browser blocked the clipboard.', code: 'CH-6012' });
    }
  };

  return (
    <div className="ch-in">
      <Back label="Today" onClick={() => ctx.go(null)} />
      <div className="ch-in__plate" data-tone={plateTone(e.type)}>
<div className="ch-in__kick">
        <Badge tone={isMajor(e.type) ? 'info' : 'accent'}>{TYPE_LABEL[e.type]}</Badge>
        {e.cancelled && <Badge tone="warning">Cancelled</Badge>}
        <Menu
          label="Event actions"
          items={[
            { label: 'Copy link', icon: Link2, onSelect: () => void copyLink() },
            ...(coach && ctx.onDuplicate ? [{ label: 'Duplicate', icon: Copy, onSelect: () => ctx.onDuplicate!(e) }] : []),
            ...(coach && e.canEdit && !e.cancelled
              ? ([{ kind: 'separator' }, { label: 'Cancel event', icon: CircleX, danger: true, onSelect: () => ctx.onCancel(e) }] as const)
              : []),
            ...(coach && e.canEdit && e.cancelled && ctx.onRestore ? [{ label: 'Restore event', icon: RotateCcw, onSelect: () => ctx.onRestore!(e) }] : []),
            ...(coach && e.canEdit && e.cancelled && ctx.onDelete
              ? ([{ kind: 'separator' }, { label: 'Delete permanently', icon: Trash2, danger: true, onSelect: () => ctx.onDelete!(e) }] as const)
              : []),
          ]}
          trigger={(p) => <IconButton icon={Ellipsis} size="sm" label="More actions" menu={p} />}
        />
      </div>
      <h2 className="ch-in__title" tabIndex={-1} style={e.cancelled ? { textDecoration: 'line-through' } : undefined}>
        {e.title}
      </h2>
      </div>
      <div className="ch-in__facts">
        <Fact icon={Clock}>
          {e.span ? `${dowOf(e.span.from)} ${dayNum(e.span.from)} – ${dowOf(e.span.to)} ${dayNum(e.span.to)}` : dayLabel(e.date, ctx.now.date)}
          <br />
          {/* A timed run over several days: when it starts on its first day and ends on its last, not this day's part of it. */}
          <span className="ch-num">{!e.allDay && e.span?.start != null && e.span.end != null ? `Starts ${fmtHour(e.span.start, true, clock)} · ends ${fmtHour(e.span.end, true, clock)}` : rangeLabel(e, clock)}</span>
          {!e.allDay && ` · ${ctx.zoneLabel}`}
        </Fact>
        {e.location && <Fact icon={MapPin}>{e.location}</Fact>}
        <LinkedTrip eventId={e.id} preview={ctx.preview} />
        {e.recurring && <Fact icon={Repeat}>{e.recurring}</Fact>}
        {e.notes && <Fact icon={Text}>{e.notes}</Fact>}
      </div>
      {coach && overlap && (
        <Warn
          title="Schedule overlap"
          action={
            <Button size="sm" variant="ghost" onClick={() => ctx.go({ kind: 'overlap', id: overlap.id })}>
              Review
            </Button>
          }
        >
          {first(ctx.people.get(overlap.who)?.name)} is busy {fmtHour(overlap.from, false, clock)}–{fmtHour(overlap.to, true, clock)}.
        </Warn>
      )}
      {/* A player's own clash: told plainly, with the way to raise it. Moving or keeping the event is the coach's. */}
      {!coach && overlap && (
        <Warn
          title="Schedule overlap"
          action={
            <Button size="sm" variant="ghost" href={messageCoachHref(null)}>
              Message coach
            </Button>
          }
        >
          {playerOverlapLine(ctx.events, overlap, clock)}.
        </Warn>
      )}
      {/* Owner, 2026-10-08: a player answers only an event that asks for replies; any other shows no reply control. */}
      {!coach && e.rsvpRequired && ctx.viewerPlayerId && (e.people.includes(ctx.viewerPlayerId) || e.openReply) && <PlayerReply e={e} playerId={ctx.viewerPlayerId} now={ctx.now} onDone={ctx.refresh} />}
      {coach && e.people.length > 0 && (
        <div className="ch-in__sec">
          <div className="ch-in__sechead">
            {/* Replies are counted only when the coach asked for them; otherwise this is the invite list (owner, 2026-10-08). */}
            <b>{e.rsvpRequired ? 'Responses' : 'Invited'}</b>
            <span>{e.rsvpRequired ? `${e.people.length} invited` : `${plural(e.people.length, 'player')}`}</span>
          </div>
          {ctx.rsvpError ? (
            <InlineNotice
              code="CH-6205"
              title={e.rsvpRequired ? 'Replies didn’t load.' : 'The invite list didn’t load.'}
              body={e.rsvpRequired ? 'Try again to see who’s going.' : 'Try again to see who’s invited.'}
              onRetry={ctx.refresh}
              covered={ctx.covered}
            />
          ) : (
            <>
              {e.rsvpRequired && <Responses e={e} />}
              <div>
                {[...e.people]
                  .sort((a, b) => (ctx.people.get(a)?.name ?? '').localeCompare(ctx.people.get(b)?.name ?? ''))
                  .map((pid) => {
                    const [l, t] = RSVP_LABEL[e.rsvp[pid] ?? 'pending'];
                    const person = ctx.people.get(pid);
                    const name = person?.name ?? 'Former player';
                    const row = (
                      <div key={pid} className="ch-in__person">
                        <Avatar name={name} size={26} />
                        <span>
                          {name}
                          {person?.availability && person.availability !== 'available' && <span className="ch-in__out"> &middot; {AVAILABILITY_WORD[person.availability]}</span>}
                        </span>
                        {e.rsvpRequired && (
                          <Badge tone={t} dot>
                            {l}
                          </Badge>
                        )}
                      </div>
                    );
                    // P003-C1: for the coach, a player on the roster peeks (a hold on the phone, a rest of the pointer on desktop).
                    return coach && person ? (
                      <PlayerPeek key={pid} player={{ id: pid, name, sub: person.year }}>
                        {row}
                      </PlayerPeek>
                    ) : (
                      row
                    );
                  })}
              </div>
            </>
          )}
        </div>
      )}
      {/* The invite list comes from the replies read: when that failed, an empty list is unknown, not "no one" (CAL-09). */}
      {coach && e.people.length === 0 && (
        <div className="ch-in__sec">
          {ctx.rsvpError ? (
            <InlineNotice code="CH-6205" title="The invite list didn’t load." body="Try again to see who’s invited." onRetry={ctx.refresh} covered={ctx.covered} />
          ) : (
            <p className="ch-in__quiet">{e.rsvpRequired ? 'No players invited. Invite players to collect replies and take attendance.' : 'No players invited. Invite players to take attendance.'}</p>
          )}
        </div>
      )}
      <EventFiles eventId={e.id} teamId={ctx.teamId} canEdit={coach && e.canEdit && !e.cancelled} preview={ctx.preview} />
      {coach && e.canEdit && !e.cancelled && (
        <div className="ch-in__sec ch-in__foot">
          <Button variant="primary" leftIcon={Pencil} onClick={() => ctx.onEdit(e)}>
            Edit event
          </Button>
          {e.people.length > 0 && (
            <Button leftIcon={ClipboardCheck} onClick={() => ctx.go({ kind: 'attendance', id: e.id, date: e.date })}>
              Attendance
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ClassDetail({ ctx, e }: { ctx: InspCtx; e: ChCalEvent }) {
  const clock = useChClock();
  const owner = e.owner ? ctx.people.get(e.owner) : undefined;
  const mine = ctx.role === 'player';
  const [code, course] = courseParts(e.title);
  return (
    <div className="ch-in">
      <Back label="Today" onClick={() => ctx.go(null)} />
      {/* Owner, 2026-10-08: a class is a slate plate (who, the course code, the course), not ink on parchment. */}
      <div className="ch-in__plate ch-in__class" data-tone="slate">
        <div className="ch-in__kick">
          <span className="ch-in__chip">Class</span>
          <span>{mine ? 'Your class list' : owner ? `${first(owner.name)}’s class list` : 'Owner unknown'}</span>
        </div>
        <h2 className="ch-in__title" tabIndex={-1}>{course}</h2>
        <div className="ch-in__by">
          {owner && !mine && <Avatar name={owner.name} size={26} />}
          <span>
            {owner && !mine ? owner.name : null}
            {owner && !mine && owner.year ? ` · ${owner.year}` : ''}
            {code && (owner && !mine ? ' · ' : '')}
            {code && <b>{code}</b>}
          </span>
        </div>
      </div>
      <div className="ch-in__facts">
        <Fact icon={Clock} tone="class">
          {dayLabel(e.date, ctx.now.date)}
          <br />
          <span className="ch-num">{rangeLabel(e, clock)}</span> · {ctx.zoneLabel}
        </Fact>
        {e.location && (
          <Fact icon={MapPin} tone="team">
            {e.location}
          </Fact>
        )}
        {e.instructor && (
          <Fact icon={UserRound} tone="own">
            {e.instructor}
          </Fact>
        )}
        {e.pattern && (
          <Fact icon={Repeat} tone="class">
            Meets {e.pattern}
          </Fact>
        )}
      </div>
      <p className="ch-in__note">
        <Icon icon={Lock} size={14} />
        <span>{mine ? 'Teammates never see your classes. Coaches see them so practice avoids them.' : 'Only coaches see class details. Teammates never see another player’s classes.'}</span>
      </p>
      {!mine && owner && ctx.onFind && (
        <Button leftIcon={Users} onClick={() => ctx.onFind!(e.date, [owner.id])}>
          Compare schedules
        </Button>
      )}
    </div>
  );
}

const MARKS: Array<SegOption<AttendanceMark | 'none'>> = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late', className: 'is-late' },
  { value: 'no_show', label: 'No-show', className: 'is-absent' },
];

export function Attendance({ ctx, id, date }: { ctx: InspCtx; id: string; date: string }) {
  const e = find(ctx.events, id, date);
  const clock = useChClock();
  const [saved, setSaved] = useState<Record<string, AttendanceMark | null> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoadError(false);
    if (ctx.preview) {
      setSaved({});
      return;
    }
    getAttendanceReport(id)
      .then((res) => {
        if (!live) return;
        if (!res.success || !res.data) {
          chReport(new Error(res.error || 'attendance report failed'), { surface: 'calendar.attendance', severity: 'low' });
          setLoadError(true);
          return;
        }
        const s: Record<string, AttendanceMark | null> = {};
        for (const r of res.data.attendance) s[r.player_id] = r.attendance_status;
        setSaved(s);
      })
      .catch((err) => {
        if (!live) return;
        chReport(err, { surface: 'calendar.attendance' });
        setLoadError(true);
      });
    return () => {
      live = false;
    };
  }, [id, attempt, ctx.preview]);

  const changed = useMemo(() => Object.entries(marks).filter(([p, m]) => saved?.[p] !== m), [marks, saved]);
  // The toast's Retry runs the action from the render that failed: it reads what is still unsaved now, so marks that
  // landed the first time are never sent again (CAL-24).
  const unsaved = useRef(changed);
  useEffect(() => {
    unsaved.current = changed;
  }, [changed]);
  const save = useAction(
    'calendar.attendance',
    async () => {
      const results = await Promise.all(unsaved.current.map(([p, m]) => markAttendance(id, p, m).then((r) => ({ p, m, ok: r.success, error: r.error }))));
      const failed = results.filter((r) => !r.ok);
      const landed = Object.fromEntries(results.filter((r) => r.ok).map((r) => [r.p, r.m]));
      setSaved((s) => ({ ...s, ...landed }));
      unsaved.current = unsaved.current.filter(([p]) => !(p in landed));
      return failed.length ? { success: false, error: failed.length === results.length ? failed[0]?.error : `${failed.length} of ${results.length} marks didn’t save` } : { success: true };
    },
    () => ({
      done: `${unsaved.current.length} attendance ${pluralWord(unsaved.current.length, 'mark')} saved`,
      failed: "Couldn’t save attendance",
      hint: 'The marks that saved are kept. Try again for the rest.',
      code: 'CH-6011',
    }),
  );

  if (!e) return null;
  const present = e.people.filter((p) => (marks[p] ?? saved?.[p]) === 'present' || (marks[p] ?? saved?.[p]) === 'late').length;

  return (
    <div className="ch-in">
      <Back label={e.title} onClick={() => ctx.go({ kind: 'event', id, date })} />
      <div>
        <h2 className="ch-in__title" tabIndex={-1}>Attendance</h2>
        <div className="ch-cal-sub">
          {dowOf(e.date)} {dayNum(e.date)} · {rangeLabel(e, clock)}
        </div>
      </div>
      {loadError ? (
        <InlineNotice code="CH-6209" title="Attendance didn’t load." body="Marks already saved are safe. Try again." onRetry={() => setAttempt((a) => a + 1)} />
      ) : !saved ? (
        <div className="ch-in__facts" aria-busy="true" data-ch-code="CH-6405">
          {e.people.slice(0, 5).map((p) => (
            <Skeleton key={p} height={30} />
          ))}
        </div>
      ) : (
        <>
          <div className="ch-in__sechead">
            <span className="ch-num">
              {e.people.length} invited · {present} here
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                haptic('select');
                // Only players with no mark yet: a saved or chosen Late or No-show is the coach's call and stays (CAL-23).
                setMarks((s) => ({ ...Object.fromEntries(e.people.filter((p) => !saved[p]).map((p) => [p, 'present' as const])), ...s }));
              }}
            >
              Mark all present
            </Button>
          </div>
          <div>
            {e.people.map((pid) => {
              const name = ctx.people.get(pid)?.name ?? 'Former player';
              const v = marks[pid] ?? saved[pid] ?? null;
              const dirty = marks[pid] != null && marks[pid] !== saved[pid];
              return (
                <div key={pid} className="ch-in__att">
                  <span className="ch-in__who">
                    <Avatar name={name} size={26} />
                    <span>
                      {first(name)}
                      {/* Attendance stands on its own: the reply shows beside it only on an event that asked for replies. */}
                      <small>{dirty ? 'Unsaved' : saved[pid] ? 'Saved' : e.rsvpRequired ? RSVP_LABEL[e.rsvp[pid] ?? 'pending'][0] : 'Not marked'}</small>
                    </span>
                  </span>
                  <AttendanceSeg name={name} value={v} onChange={(m) => setMarks((s) => ({ ...s, [pid]: m }))} />
                </div>
              );
            })}
          </div>
          <div className="ch-in__sec ch-in__foot">
            <Button
              variant="primary"
              busy={save.pending}
              disabled={!changed.length}
              onClick={() => {
                chTrail('calendar attendance save');
                void save.run();
              }}
            >
              {save.pending ? 'Saving…' : changed.length ? `Save attendance · ${changed.length}` : 'All saved'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function AttendanceSeg({ name, value, onChange }: { name: string; value: AttendanceMark | null; onChange: (m: AttendanceMark) => void }) {
  return <Segmented<AttendanceMark | 'none'> size="sm" label={`Attendance for ${name}`} value={value ?? 'none'} options={MARKS} onChange={(m) => onChange(m as AttendanceMark)} />;
}

export function Lanes({ rows, from, to, prop }: { rows: Array<{ who: string; blocks: Array<{ kind: string; s: number; e: number; label: string }> }>; from: number; to: number; prop?: [number, number] }) {
  const pct = (h: number) => ((h - from) / (to - from)) * 100;
  const ticks: number[] = [];
  for (let h = Math.ceil(from); h <= to; h++) ticks.push(h);
  return (
    <div className="ch-lanes">
      <span />
      <div className="ch-lanes__axis" aria-hidden="true">
        {ticks.map((h) => (
          <span key={h} style={{ left: `${pct(h)}%` }}>
            {((h + 11) % 12) + 1}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.who} style={{ display: 'contents' }}>
          <span className="ch-lanes__who">{r.who}</span>
          <div className="ch-lane">
            {r.blocks.map((b, i) => (
              <span key={i} className={`ch-lane__b ${b.kind}`} style={{ left: `${pct(Math.max(from, b.s))}%`, width: `${pct(Math.min(to, b.e)) - pct(Math.max(from, b.s))}%` }}>
                {b.label}
              </span>
            ))}
            {prop && <span className="ch-lane__b is-prop" style={{ left: `${pct(prop[0])}%`, width: `${pct(prop[1]) - pct(prop[0])}%` }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Overlap({ ctx, id }: { ctx: InspCtx; id: string }) {
  const toast = useToast();
  const clock = useChClock();
  const o = ctx.overlaps.find((x) => x.id === id);
  const e = o ? find(ctx.events, o.eventId) : undefined;
  const w = o ? find(ctx.events, o.withId) : undefined;
  const len = e && e.start != null && e.end != null ? e.end - e.start : 1;
  const sugg = useMemo(() => (e ? openTimes(ctx.events, e.people, e.date, len, e.id, e.start ?? 15) : []), [ctx.events, e, len]);
  const [pick, setPick] = useState(0);
  if (!o || !e || !w) {
    return (
      <div className="ch-in">
        <Back label="Today" onClick={() => ctx.go(null)} />
        <p className="ch-in__quiet">This overlap is resolved.</p>
      </div>
    );
  }
  const who = first(ctx.people.get(o.who)?.name) || 'A player';
  const prop = sugg[pick];
  const from = Math.max(6, Math.floor(Math.min(e.start!, w.start!, prop?.[0] ?? 24)) - 1);
  const to = Math.min(22, Math.ceil(Math.max(e.end!, w.end!, prop?.[1] ?? 0)) + 1);
  const withLabel = w.type === 'class' ? 'Class' : w.title;
  return (
    <div className="ch-in">
      <Back label="Today" onClick={() => ctx.go(null)} />
      <div className="ch-in__plate" data-tone="amber">
        <div className="ch-in__kick">
          <Badge tone="warning" dot>
            Overlap
          </Badge>
        </div>
        <h2 className="ch-in__title" tabIndex={-1}>{e.title}</h2>
        <div className="ch-cal-sub">
          {dowOf(e.date)} {dayNum(e.date)} · {rangeLabel(e, clock)}
        </div>
      </div>
      <p className="ch-in__note">
        {who} {w.type === 'class' ? `has ${w.title} until ${fmtHour(w.end!, true, clock)}` : `is invited to ${w.title}, which runs until ${fmtHour(w.end!, true, clock)}`}.{' '}
        {who} would miss {Math.round((o.to - o.from) * 60)} minutes.
      </p>
      <div className="ch-in__sec">
        <div className="ch-in__sechead">
          <b>{who}’s day</b>
          <span>Current time and proposal</span>
        </div>
        <Lanes
          from={from}
          to={to}
          prop={prop}
          rows={[
            { who: 'Current', blocks: [{ kind: 'is-ev', s: e.start!, e: e.end!, label: e.title }] },
            { who: withLabel, blocks: [{ kind: w.type === 'class' ? 'is-busy' : 'is-ev', s: w.start!, e: w.end!, label: w.type === 'class' ? w.title : '' }, { kind: 'is-overlap', s: o.from, e: o.to, label: '' }] },
          ]}
        />
      </div>
      <div className="ch-in__sec">
        <div className="ch-in__sechead">
          <b>Open times</b>
          <span>Everyone invited is free</span>
        </div>
        {sugg.length ? (
          <PillGroup<string>
            label="Open times"
            value={String(pick)}
            onChange={(v) => setPick(Number(v))}
            options={sugg.map((s, i) => ({ value: String(i), label: rangeLabel({ allDay: false, start: s[0], end: s[1] }, clock) }))}
          />
        ) : (
          <p className="ch-in__quiet">{restyleClock('No open window of the same length between 7 AM and 8 PM. Try another day in the editor.', clock)}</p>
        )}
      </div>
      <div className="ch-in__sec ch-in__foot">
        <Button variant="primary" disabled={!e.canEdit} onClick={() => ctx.onEdit(e, prop)}>
          Review new time
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            haptic('select');
            chTrail('calendar overlap kept');
            toast({ title: 'Kept as is', body: `${who} still overlaps. Nothing was changed or sent.` });
            ctx.go(null);
          }}
        >
          Keep as is
        </Button>
      </div>
    </div>
  );
}
