'use client';

import { Flag, MessageSquare, Navigation, Sunset, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChHomeEvent, ChLatestRound } from '../../data/home';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { formatToPar } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { rebuiltHref } from '../../shell/nav';
import { LinkPending } from '../../shell/LinkPending';
import { TYPE_LABEL } from '../calendar/model';
import { TYPE_ICON } from '../calendar/views';
import { messagesPrefillHref } from '../messages/prefill';
import { sunTimes, type LatLng } from '../../lib/sun';
import { CALENDAR, eventHref, whenLabel } from './HomePhone';

/**
 * The coach's phone Home as one living card (owner-approved phone concept, board 1 "The day, not a dashboard"): the
 * next thing that matters, which changes as the day moves. An event under way or next; once today's events are over
 * and rounds came in today, the day's recap. Desktop keeps its dashboard.
 */
export type ChDayPhase = { kind: 'event'; e: ChHomeEvent; live: boolean } | { kind: 'recap'; rounds: ChLatestRound[] } | null;

const timedLive = (e: ChHomeEvent, t: number) => !e.allDay && Date.parse(e.startIso) <= t && (e.endIso ? Date.parse(e.endIso) : Date.parse(e.startIso)) > t;
const over = (e: ChHomeEvent, t: number) => !e.allDay && (e.endIso ? Date.parse(e.endIso) : Date.parse(e.startIso)) <= t;

/**
 * What the card holds. `today` is the team-local date. Before the clock is known (`now` null), the loader's next event.
 * The recap needs both: nothing left today, and a round played today among the latest rounds.
 */
export function dayPhase(next: ChHomeEvent | null, todays: ChHomeEvent[], rounds: ChLatestRound[], now: Date | null, today: string | null): ChDayPhase {
  const t = now?.getTime();
  if (t != null) {
    const live = todays.find((e) => timedLive(e, t));
    if (live) return { kind: 'event', e: live, live: true };
    const leftToday = todays.some((e) => !e.allDay && !over(e, t));
    const posted = today ? rounds.filter((r) => r.date === today) : [];
    if (!leftToday && posted.length && (!next || next.date !== today)) return { kind: 'recap', rounds: posted };
  }
  return next ? { kind: 'event', e: next, live: t != null && timedLive(next, t) } : null;
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' });
const firstName = (name: string) => name.split(' ')[0] ?? name;

/** The nudge's draft: what it's about and when, in the coach's voice. The coach reads it and presses Send. */
export function nudgeDraft(e: ChHomeEvent, today: string | null): string {
  const day = e.date === today ? 'today' : WEEKDAY.format(new Date(`${e.date}T12:00:00Z`));
  const at = e.allDay ? day : `${day} at ${e.startLabel}`;
  return `Can you let me know if you’re coming to ${e.title} (${at})? You can reply on the event in Calendar.`;
}

/** Off-site events only: "Practice green" is not a place a maps app can find. A plain link, no maps API (D1-2). */
const DIRECTIONS = new Set<ChHomeEvent['type']>(['qualifier', 'tournament', 'travel']);
export const directionsHref = (e: ChHomeEvent) => (e.location && DIRECTIONS.has(e.type) ? `https://maps.apple.com/?q=${encodeURIComponent(e.location)}` : null);

export function DayCard({ phase, now, today, onOpenRound }: { phase: Exclude<ChDayPhase, null>; now: Date | null; today: string | null; onOpenRound: (r: ChLatestRound) => void }) {
  return phase.kind === 'recap' ? <Recap rounds={phase.rounds} onOpen={onOpenRound} /> : <EventCard e={phase.e} live={phase.live} now={now} today={today} />;
}

function EventCard({ e, live, now, today }: { e: ChHomeEvent; live: boolean; now: Date | null; today: string | null }) {
  const when = whenLabel(e, now);
  const people = e.invitees ?? [];
  const awaiting = e.awaiting ?? [];
  const end = e.rangeLabel.split(' – ')[1];
  const kicker = e.allDay ? `${e.date === today ? 'Today' : WEEKDAY.format(new Date(`${e.date}T12:00:00Z`))} · all day` : live ? `Now${end ? ` · until ${end}` : ''}` : `Next up · ${e.startLabel}`;
  const nudge = awaiting.length
    ? rebuiltHref(messagesPrefillHref({ players: awaiting.map((p) => p.id), draft: nudgeDraft(e, today), title: e.title }))
    : null;
  const message = !nudge && e.inviteeIds?.length ? rebuiltHref(messagesPrefillHref({ players: e.inviteeIds, draft: '', title: e.title })) : null;
  const directions = directionsHref(e);
  return (
    <section className={'ch-hm-next ch-hm-day' + (live ? ' is-live' : '')} aria-labelledby="ch-hm-day-t">
      <span className="ch-hm-next__k">
        <span className="ch-hm-next__type">
          <Icon icon={TYPE_ICON[e.type]} size={13} />
          {kicker}
        </span>
        <span className={'ch-hm-next__when ch-num' + (when.soon ? ' is-soon' : '')}>{when.text}</span>
      </span>
      <h2 id="ch-hm-day-t">
        {/* The title opens the event; its press area covers the card, under the actions. */}
        <Link href={eventHref(e)} className="ch-hm-day__open" onClick={() => chTrail('home open next event')}>
          {e.title}
        </Link>
      </h2>
      <p className="ch-num">{[live || e.allDay ? null : e.rangeLabel, e.location ?? TYPE_LABEL[e.type]].filter(Boolean).join(' · ')}</p>
      {e.invitees && people.length > 0 && (
        <span className="ch-hm-next__f ch-hm-day__people">
          <span className="ch-hm-stack ch-hm-day__stack" aria-hidden="true">
            {people.slice(0, 4).map((n) => (
              <Avatar key={n} name={n} size={28} />
            ))}
          </span>
          <span className="ch-hm-next__rsvp ch-num">
            {e.going != null ? (
              <>
                <b>{e.going}</b> of {people.length} going
              </>
            ) : (
              `${people.length} invited`
            )}
            {awaiting.length === 1 && ` · ${firstName(awaiting[0]!.name)} hasn’t replied`}
            {awaiting.length > 1 && ` · ${awaiting.length} haven’t replied`}
          </span>
        </span>
      )}
      {(nudge || message || directions) && (
        <span className="ch-hm-day__acts">
          {nudge && (
            <Link href={nudge} className="ch-hm-day__act is-primary" data-ch-press="" onClick={() => (haptic('select'), chTrail('home nudge'))}>
              <Icon icon={MessageSquare} size={16} />
              {awaiting.length === 1 ? `Nudge ${firstName(awaiting[0]!.name)}` : `Nudge ${awaiting.length}`}
            </Link>
          )}
          {message && (
            <Link href={message} className="ch-hm-day__act is-primary" data-ch-press="" onClick={() => (haptic('select'), chTrail('home message invitees'))}>
              <Icon icon={MessageSquare} size={16} />
              Message
            </Link>
          )}
          {directions && (
            <a href={directions} className="ch-hm-day__act" target="_blank" rel="noopener noreferrer" data-ch-press="" onClick={() => haptic('select')}>
              <Icon icon={Navigation} size={16} />
              Directions
            </a>
          )}
        </span>
      )}
      <LinkPending />
    </section>
  );
}

function Recap({ rounds, onOpen }: { rounds: ChLatestRound[]; onOpen: (r: ChLatestRound) => void }) {
  return (
    <section className="ch-hm-next ch-hm-day is-recap" aria-labelledby="ch-hm-day-t">
      <span className="ch-hm-next__k">
        <span className="ch-hm-next__type">
          <Icon icon={Flag} size={13} />
          Today · the day’s rounds
        </span>
        <span className="ch-hm-next__when ch-num">{rounds.length} posted</span>
      </span>
      <h2 id="ch-hm-day-t">{rounds.length === 1 ? `${firstName(rounds[0]!.playerName)} posted a round` : `${rounds.length} rounds came in today`}</h2>
      <ul className="ch-hm-day__rounds">
        {rounds.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => (haptic('select'), chTrail('home open round'), onOpen(r))}>
              <span>{r.playerName}</span>
              <b className="ch-num">
                {r.score} <em>{formatToPar(r.toPar)}</em>
              </b>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One row of the time rail that isn't a team event today: the sunset, a competition later in the week. */
export interface ChRailExtra {
  key: string;
  /** Sort position: minutes after today's midnight; later days sort after today. */
  at: number;
  time: string;
  title: string;
  sub?: string | null;
  mark: 'sun' | 'competition';
  href?: string;
}

/**
 * "Later today": the day after the card, on Today's rail. Events under way or ahead (the card's own is left out), then
 * `extras` in time order (the sunset from the global light once it lands; a competition later this week).
 */
export function LaterToday({ todays, cardId, now, extras }: { todays: ChHomeEvent[]; cardId: string | null; now: Date | null; extras: ChRailExtra[] }) {
  const t = now?.getTime();
  const rows: Array<{ key: string; at: number; node: ReactNode }> = todays
    .filter((e) => e.id !== cardId && (t == null || !over(e, t)))
    .map((e) => ({
      key: e.id,
      at: e.allDay ? -1 : minutesOf(e.startIso, e.timezone),
      node: (
        <Link href={eventHref(e)} className="ch-hm-tl__a">
          <span className="ch-hm-tl__t ch-num">{e.allDay ? 'All day' : e.startLabel.replace(/\s?[AP]M$/, '')}</span>
          <span className="ch-hm-tl__rail" aria-hidden="true">
            <i className={`is-${e.type}`} />
          </span>
          <span className="ch-hm-tl__b">
            <b>{e.title}</b>
            {e.location && <span>{e.location}</span>}
          </span>
          {e.conflict && (
            <span className="ch-hm-tl__w" title="Overlaps another event">
              <Icon icon={TriangleAlert} size={13} />
              <span className="ch-sr-only">Overlaps another event</span>
            </span>
          )}
        </Link>
      ),
    }));
  for (const x of extras) {
    const body = (
      <>
        <span className="ch-hm-tl__t ch-num">{x.time}</span>
        <span className="ch-hm-tl__rail" aria-hidden="true">
          <i className={x.mark === 'sun' ? 'is-sun' : 'is-qualifier'} />
        </span>
        <span className="ch-hm-tl__b">
          <b>{x.title}</b>
          {x.sub && <span>{x.sub}</span>}
        </span>
        {x.mark === 'sun' && (
          <span className="ch-hm-tl__w is-sun" aria-hidden="true">
            <Icon icon={Sunset} size={14} />
          </span>
        )}
      </>
    );
    rows.push({
      key: x.key,
      at: x.at,
      node: x.href ? (
        <Link href={x.href} className="ch-hm-tl__a">
          {body}
        </Link>
      ) : (
        <span className="ch-hm-tl__a">{body}</span>
      ),
    });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.at - b.at);
  const todayRows = rows.some((r) => r.at < 24 * 60);
  return (
    <section className="ch-hm-sec ch-hm-later" aria-labelledby="ch-hm-later">
      <div className="ch-hm-sec__h">
        <h2 id="ch-hm-later">{todayRows ? 'Later today' : 'Coming up'}</h2>
        <Link href={CALENDAR} className="ch-hm-link">
          Calendar
        </Link>
      </div>
      <ol className="ch-hm-tl">
        {rows.map((r) => (
          <li key={r.key} className="ch-hm-tl__r">
            {r.node}
          </li>
        ))}
      </ol>
    </section>
  );
}

function minutesOf(iso: string, timeZone?: string): number {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: timeZone || 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso))) p[x.type] = x.value;
  return Number(p.hour) * 60 + Number(p.minute);
}

/**
 * The sunset row (concept board 1): today's sunset at the team's place (the global light's sun, lib/sun.ts sunTimes),
 * while it is still ahead; its line says when the light turns golden. Nothing after sunset, or where the sun doesn't set.
 */
export function sunsetExtra(today: string | null, now: Date | null, place: { place: LatLng; timeZone: string }): ChRailExtra[] {
  if (!today || !now) return [];
  const { sunset, goldenStart } = sunTimes(today, place.place, place.timeZone);
  if (sunset === null || sunset <= now.getTime()) return [];
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: place.timeZone, hour: 'numeric', minute: '2-digit' });
  const short = (ms: number) => clock.format(ms).replace(/\s?[AP]M$/, '');
  return [
    {
      key: 'sunset',
      at: minutesOf(new Date(sunset).toISOString(), place.timeZone),
      time: short(sunset),
      title: 'Sunset',
      sub: goldenStart && goldenStart > now.getTime() ? `Golden hour from ${short(goldenStart)}` : 'Last light on the range',
      mark: 'sun',
    },
  ];
}

/** A competition later this week, for the rail: after today, so it sorts below today's rows. */
export function competitionExtra(row: { id: string; timeLabel: string; title: string; detail: string | null } | undefined): ChRailExtra[] {
  if (!row) return [];
  return [{ key: `comp-${row.id}`, at: 24 * 60 + 1, time: row.timeLabel, title: row.title, sub: row.detail, mark: 'competition', href: `${CALENDAR}?event=${row.id}` }];
}

/**
 * "Since you last looked": what changed in data Home already loads, since this device last showed Home. Rounds posted
 * that weren't among the latest last time, and replies to the card's event. Kept on this device only (a convenience,
 * not a record). Nothing on the first visit, nothing on the server, and nothing when nothing changed.
 */
const SEEN_KEY = 'ch.home.seen.v1';
interface Seen {
  rounds: string[];
  event: { id: string; going: number } | null;
}
export interface ChSinceChip {
  key: string;
  big: string;
  /** The figure's under-par part, shown in the under-par red (D-42). */
  toPar?: { text: string; under: boolean };
  label: string;
  round?: ChLatestRound;
  href?: string;
}

/** Pure: the chips between what was seen and what is here now. */
export function sinceChips(prev: Seen | null, rounds: ChLatestRound[], event: ChHomeEvent | null): ChSinceChip[] {
  if (!prev) return [];
  const chips: ChSinceChip[] = rounds
    .filter((r) => !prev.rounds.includes(r.id))
    .map((r) => ({ key: `r-${r.id}`, big: String(r.score), toPar: r.toPar != null ? { text: formatToPar(r.toPar), under: r.toPar < 0 } : undefined, label: `${firstName(r.playerName)} posted`, round: r }));
  if (event && event.going != null && prev.event?.id === event.id && event.going > prev.event.going) {
    const more = event.going - prev.event.going;
    chips.push({ key: `e-${event.id}`, big: `+${more}`, label: `${more === 1 ? 'Reply' : 'Replies'} · ${event.title}`, href: eventHref(event) });
  }
  return chips;
}

function readSeen(): Seen | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' && Array.isArray((v as Seen).rounds) ? (v as Seen) : null;
  } catch {
    return null;
  }
}

export function SinceYouLooked({ rounds, event, onOpenRound }: { rounds: ChLatestRound[]; event: ChHomeEvent | null; onOpenRound: (r: ChLatestRound) => void }) {
  // Read once, after mount; the snapshot survives StrictMode's second effect, which would otherwise read the write.
  const prev = useRef<Seen | null | undefined>(undefined);
  const [chips, setChips] = useState<ChSinceChip[]>([]);
  useEffect(() => {
    if (prev.current === undefined) prev.current = readSeen();
    setChips(sinceChips(prev.current, rounds, event));
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify({ rounds: rounds.map((r) => r.id), event: event && event.going != null ? { id: event.id, going: event.going } : null } satisfies Seen));
    } catch {
      // Private mode or full storage: the chips just don't appear next time.
    }
  }, [rounds, event]);
  if (!chips.length) return null;
  return (
    <section className="ch-hm-sec ch-hm-since" aria-labelledby="ch-hm-since">
      <div className="ch-hm-sec__h">
        <h2 id="ch-hm-since">Since you last looked</h2>
      </div>
      <ul className="ch-hm-since__l">
        {chips.map((c) => {
          const body = (
            <>
              <b className="ch-num">
                {c.big}
                {c.toPar && <em className={c.toPar.under ? 'is-under' : undefined}> {c.toPar.text}</em>}
              </b>
              <span>{c.label}</span>
            </>
          );
          return (
            <li key={c.key}>
              {c.round ? (
                <button type="button" className="ch-hm-since__c" data-ch-press="" onClick={() => (haptic('select'), onOpenRound(c.round!))}>
                  {body}
                </button>
              ) : (
                <Link href={c.href ?? CALENDAR} className="ch-hm-since__c" data-ch-press="" onClick={() => haptic('select')}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

