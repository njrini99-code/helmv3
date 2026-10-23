'use client';

import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plane, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { ChHubAnnouncement, ChHubFile, ChHubLedgerRow, ChHubRsvp, ChHubTask, ChHubTrip, ChRsvp, ChTeamHub } from '../../data/hub';
import type { ChHubTab } from '../../lib/hub-tabs';
import { initials } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import type { ServerResult } from '../../lib/use-action';
import { useChClockText } from '../../lib/use-clock';
import { useChPhone } from '../../lib/use-phone';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { WeekStrip } from '../../ui/WeekStrip';
import { EmptyState } from '../../ui/States';
import { firstBusyDay, ledgerSorted, owedBy, type LedgerKey, type QueueItem, type TaskFigures } from './hub-summary';
import { Acknowledgement, ReplyChoices, repliesLine, useTaskSave } from './parts';

/*
 * Team Hub's Home, as widgets (owner, 2026-10-21: "don't center around RSVPs … more like widgets or cool interactive
 * components"). Each tile answers one question and does one thing in place: the next trip, this week, who owes what,
 * the latest post, the tasks. A reply lives on its event in the week; a player's asks are one queue. Every figure is
 * read from what the page already loaded, and a read that failed says so in its tile, never as a zero.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Tile({ id, title, aside, span, dark, className, children }: {
  id: string;
  title: string;
  aside?: ReactNode;
  /** Columns of the desktop's twelve. */
  span: number;
  dark?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={['ch-hw', dark && 'ch-hw--dark', className].filter(Boolean).join(' ')}
      style={{ '--ch-hw-span': span } as CSSProperties}
      aria-labelledby={id}
    >
      <div className="ch-hw__h">
        <h2 id={id}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A tile's way on: a quiet text button with an arrow, never a second primary. */
function More({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const body = (
    <>
      {children}
      <Icon icon={ArrowRight} size={13} />
    </>
  );
  return href ? (
    <Link className="ch-hw-more" href={href}>
      {body}
    </Link>
  ) : (
    <button type="button" className="ch-hw-more" onClick={onClick}>
      {body}
    </button>
  );
}

const countLabel = (days: number) => (days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : null);

// ── The trip ────────────────────────────────────────────────────────────────

/**
 * The page's one dark tile. The next trip counts down, with its plan as a rail (leaves, stays, home) and who is going;
 * a second trip is a page away. With no trip ahead it counts down to the week's next event instead, and with nothing at
 * all it says so and offers a coach the way to plan one.
 */
/**
 * A date or a time never breaks inside itself on a phone (A24): "Mon 3 Nov" and "12:00 PM" keep their spaces as
 * U+00A0, and a line may break only at the " · " or " – " between them.
 */
export const keepTokens = (text: string) =>
  text
    .split(/( · | – )/)
    .map((part, i) => (i % 2 ? part : part.replace(/ /g, '\u00a0')))
    .join('');

export function TripTile({ trips, role, days, error, covered, onEdit, onPlan, onOpenTravel }: {
  /** Trips still to come, soonest first. */
  trips: ChHubTrip[];
  role: ChTeamHub['role'];
  days: ChTeamHub['week']['days'];
  error: boolean;
  covered: boolean;
  onEdit?: (t: ChHubTrip) => void;
  onPlan?: () => void;
  onOpenTravel: () => void;
}) {
  const [at, setAt] = useState(0);
  const clk = useChClockText();
  const coach = role === 'coach';
  if (error) {
    return (
      <Tile id="ch-hw-trip" title="Next trip" span={7}>
        <RefreshNotice code="CH-10207" title="Travel didn’t load." body="Trips are safe. Try again." covered={covered} />
      </Tile>
    );
  }
  const i = Math.min(at, Math.max(0, trips.length - 1));
  const t = trips[i];
  const page = (to: number) => {
    haptic('select');
    setAt(to);
  };
  if (t) {
    const word = t.inDays != null ? countLabel(t.inDays) : null;
    const stops = [
      { k: 'Leaves', v: keepTokens(clk(t.depart ?? t.dates)), s: t.from },
      { k: 'Stays', v: t.hotel ?? 'Hotel not set', s: t.destination },
      { k: 'Home', v: keepTokens(clk(t.back ?? 'Not set')), s: null },
    ];
    const names = t.travelers ?? [];
    return (
      <Tile
        id="ch-hw-trip"
        title={i === 0 ? 'Next trip' : 'Later trip'}
        span={7}
        dark
        aside={
          trips.length > 1 ? (
            <span className="ch-hw-pager">
              <button type="button" aria-label="Previous trip" disabled={i === 0} onClick={() => page(i - 1)}>
                <Icon icon={ChevronLeft} size={15} />
              </button>
              <span className="ch-num" aria-live="polite">
                {i + 1} of {trips.length}
              </span>
              <button type="button" aria-label="Next trip" disabled={i === trips.length - 1} onClick={() => page(i + 1)}>
                <Icon icon={ChevronRight} size={15} />
              </button>
            </span>
          ) : undefined
        }
      >
        <div className="ch-hw-count">
          {t.inDays != null && (
            <span className={'ch-hw-count__n' + (word ? ' is-word' : '')}>
              <b className={word ? undefined : 'ch-num'}>{word ?? t.inDays}</b>
              {!word && <small>days to go</small>}
            </span>
          )}
          <div className="ch-hw-count__t">
            <h3>{t.name}</h3>
            {t.destination && <p className="ch-hw-count__where">{t.destination}</p>}
            <p className="ch-hw-count__when ch-num">{keepTokens(t.dates)}</p>
          </div>
        </div>
        <ol className="ch-hw-rail" aria-label="The plan">
          {stops.map((s) => (
            <li key={s.k}>
              <span>{s.k}</span>
              <b className="ch-num">{s.v}</b>
              {s.s && <em>{s.s}</em>}
            </li>
          ))}
        </ol>
        <div className="ch-hw-trip__f">
          {coach ? (
            <span className="ch-hw-stack">
              {names.slice(0, 5).map((n) => (
                <i key={n} aria-hidden="true">
                  {initials(n)}
                </i>
              ))}
              <em className="ch-num">
                {t.travelerCount == null ? 'Travelers not known yet' : t.travelerCount === 0 ? 'No travelers yet' : `${plural(t.travelerCount, 'player')} traveling`}
              </em>
            </span>
          ) : t.mine == null ? (
            <span />
          ) : (
            <span className="ch-hw-you">
              {t.mine && <Icon icon={Check} size={14} />}
              {t.mine ? 'You’re traveling' : 'You’re not on this trip'}
            </span>
          )}
          <span className="ch-hw-trip__a">
            <More onClick={onOpenTravel}>Itinerary</More>
            {coach && onEdit && (
              <Button size="sm" variant="primary" leftIcon={Pencil} onClick={() => onEdit(t)}>
                Edit trip
              </Button>
            )}
          </span>
        </div>
      </Tile>
    );
  }
  // No trip ahead: the week's next event takes the tile.
  const d = days.findIndex((x) => x.events.length > 0);
  const day = d >= 0 ? days[d]! : null;
  const ev = day?.events[0] ?? null;
  return (
    <Tile id="ch-hw-trip" title="Next up" span={7} dark>
      <div className="ch-hw-count">
        {ev && (
          <span className={'ch-hw-count__n' + (countLabel(d) ? ' is-word' : '')}>
            <b className={countLabel(d) ? undefined : 'ch-num'}>{countLabel(d) ?? d}</b>
            {!countLabel(d) && <small>days to go</small>}
          </span>
        )}
        <div className="ch-hw-count__t">
          <h3>{ev ? ev.title : coach ? 'No trips planned' : 'Nothing planned yet'}</h3>
          <p className="ch-num">
            {ev && day
              ? [`${day.weekday} ${day.day}`, ev.time, ev.place].filter(Boolean).join(' · ')
              : coach
                ? 'Plan a trip and the team sees the itinerary, the bus time and the hotel here.'
                : 'Trips and events from your coaches show here as soon as they are planned.'}
          </p>
        </div>
      </div>
      <div className="ch-hw-trip__f">
        <span className="ch-hw-you">{ev ? 'No trips planned' : ''}</span>
        <span className="ch-hw-trip__a">
          {ev && day && <More href={`/golf/dashboard/calendar?date=${day.date}&event=${ev.id}`}>Open event</More>}
          {coach && onPlan && (
            <Button size="sm" variant="primary" leftIcon={Plane} onClick={onPlan}>
              Plan a trip
            </Button>
          )}
        </span>
      </div>
    </Tile>
  );
}

// ── This week ───────────────────────────────────────────────────────────────

/**
 * Seven days you can step through. A dot is an event, gold is a day on the road. The day you pick lists its events;
 * an event that takes replies shows who has replied (coach) or your answer, which you can change in place (player).
 */
export function WeekTile({ week, role, rsvps, replies, isPending, onReply, covered, span = 5 }: {
  week: ChTeamHub['week'];
  role: ChTeamHub['role'];
  rsvps: ChTeamHub['rsvps'];
  replies: Map<string, ChRsvp>;
  isPending: (r: ChHubRsvp) => boolean;
  onReply: (r: ChHubRsvp, status: Exclude<ChRsvp, 'pending'>) => Promise<ServerResult>;
  covered: boolean;
  span?: number;
}) {
  const clk = useChClockText();
  const coach = role === 'coach';
  const days = week.days;
  const [sel, setSel] = useState(() => firstBusyDay(days));
  const pick = (i: number) => {
    if (i < 0 || i >= days.length) return;
    if (i !== sel) haptic('select');
    setSel(i);
  };
  const quiet = days.every((d) => !d.events.length && !d.trip);
  const day = days[Math.min(sel, days.length - 1)];
  // What comes after the chosen day, a few events deep: a press opens that day.
  const later = days
    .flatMap((d, i) => (i > sel ? d.events.map((e) => ({ e, d, i })) : []))
    .slice(0, 3);
  const rsvpFor = (id: string) => (rsvps.error ? null : (rsvps.rows.find((r) => r.eventId === id) ?? null));
  return (
    <Tile id="ch-hw-week" title="This week" span={span} aside={!week.error && <More href="/golf/dashboard/calendar">Calendar</More>}>
      {week.error ? (
        <RefreshNotice code="CH-10201" title="This week didn’t load." body="Nothing was lost. Try again." covered={covered} />
      ) : quiet || !day ? (
        <EmptyState
          compact
          code="CH-10301"
          title="Nothing on the calendar this week"
          body={coach ? 'Events you add show here, with who has replied.' : 'Team events show here as your coaches add them.'}
          action={
            coach ? (
              <Button size="sm" leftIcon={Plus} href="/golf/dashboard/calendar?new=1">
                Create event
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <WeekStrip
            label="Days this week"
            days={days.map((d, i) => ({
              date: d.date,
              top: i === 0 ? 'Today' : d.weekday,
              num: d.day,
              isToday: i === 0,
              dots: d.events.length,
              flag: d.trip ? 'trip' : undefined,
              label: `${i === 0 ? 'Today, ' : ''}${d.weekday} ${d.day}: ${d.events.length ? plural(d.events.length, 'event') : 'nothing on'}${d.trip ? `, on the road (${d.trip})` : ''}`,
            }))}
            selected={day.date}
            onSelect={(date) => pick(days.findIndex((d) => d.date === date))}
          />
          <div className="ch-hw-agenda" aria-live="polite">
            {day.trip && (
              <p className="ch-hw-agenda__trip">
                <Icon icon={Plane} size={13} />
                On the road · {day.trip}
              </p>
            )}
            {!day.events.length ? (
              <p className="ch-hw-agenda__none">
                Nothing on {day.weekday} {day.day}.
              </p>
            ) : (
              <ol>
                {day.events.map((e) => {
                  const r = rsvpFor(e.id);
                  return (
                    <li key={e.id} className={!coach && r ? 'has-reply' : undefined}>
                      <time className="ch-num">{clk(e.time)}</time>
                      <Link href={`/golf/dashboard/calendar?date=${day.date}&event=${e.id}`}>
                        <b>
                          {e.title}
                          {r?.mandatory && <span className="ch-hb-req">Required</span>}
                        </b>
                        {e.place && <span>{e.place}</span>}
                      </Link>
                      {r &&
                        (coach ? (
                          r.counts ? (
                            <ReplyMeter c={r.counts} />
                          ) : (
                            <span className="ch-hw-meter__k">Replies didn’t load</span>
                          )
                        ) : (
                          <ReplyChoices r={r} mine={replies.get(r.eventId) ?? r.mine ?? 'pending'} pending={isPending(r)} onReply={onReply} />
                        ))}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          {later.length > 0 && (
            <div className="ch-hw-later">
              <span>Later this week</span>
              <ol>
                {later.map(({ e, d, i }) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => pick(i)}>
                      <time className="ch-num">
                        {d.weekday} {d.day}
                      </time>
                      <b>{e.title}</b>
                      <em className="ch-num">{clk(e.time)}</em>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </Tile>
  );
}

function ReplyMeter({ c }: { c: { going: number; maybe: number; no: number; none: number } }) {
  const all = c.going + c.maybe + c.no + c.none;
  const said = all - c.none;
  return (
    <span className="ch-hw-meter" title={repliesLine(c, false)}>
      {all > 0 && (
        <span className="ch-hw-meter__t" aria-hidden="true">
          {(['going', 'maybe', 'no'] as const).map((k) => (c[k] ? <i key={k} className={`is-${k}`} style={{ flex: c[k] }} /> : null))}
          {c.none > 0 && <i className="is-none" style={{ flex: c.none }} />}
        </span>
      )}
      <span className={'ch-hw-meter__k ch-num' + (c.none > 0 ? ' is-warn' : '')}>
        {all === 0 ? 'No one invited' : c.none === 0 ? `All ${all} replied` : `${said} of ${all} replied`}
        <span className="ch-sr-only">: {repliesLine(c, false)}</span>
      </span>
    </span>
  );
}

// ── Waiting on (coach) ──────────────────────────────────────────────────────

const COLUMNS: Array<[Exclude<LedgerKey, 'owed'>, string]> = [
  ['name', 'Player'],
  ['replies', 'Replies'],
  ['posts', 'Posts'],
  ['tasks', 'Tasks'],
  ['rounds', 'Rounds'],
];

function Figure({ items, late = 0 }: { items: unknown[] | null; late?: number }) {
  if (items == null)
    return (
      <span className="ch-hw-led__x" title="Didn’t load">
        —<span className="ch-sr-only">didn’t load</span>
      </span>
    );
  if (!items.length) return <span className="ch-hw-led__0 ch-num">0</span>;
  return (
    <span className="ch-hw-led__n">
      <b className="ch-num">{items.length}</b>
      {late > 0 && <em className="ch-num">{late} late</em>}
    </span>
  );
}

function Rounds({ r }: { r: ChHubLedgerRow['rounds'] }) {
  if (!r) return <Figure items={null} />;
  return (
    <span className="ch-hw-led__n">
      <b className={'ch-num' + (r.n === 0 ? ' is-zero' : '')}>{r.n}</b>
      {!r.recent && <em>none in 14 days</em>}
    </span>
  );
}

function Owed({ row, onOpen }: { row: ChHubLedgerRow; onOpen: (tab: ChHubTab) => void }) {
  const groups: Array<[string, Array<{ id: string; title: string; late?: boolean }> | null, ChHubTab | null]> = [
    ['Replies owed', row.replies, null],
    ['To acknowledge', row.posts, 'ann'],
    ['Open tasks', row.tasks, 'tasks'],
  ];
  const shown = groups.filter(([, items]) => items && items.length);
  if (!shown.length) return <p className="ch-hw-owed__none">{row.name.split(' ')[0]} is all square.</p>;
  return (
    <div className="ch-hw-owed">
      {shown.map(([label, items, tab]) => (
        <div key={label}>
          <span>{label}</span>
          <ul>
            {items!.map((x) => (
              <li key={x.id} className={x.late ? 'is-late' : undefined}>
                {x.title}
                {x.late && <em> · late</em>}
              </li>
            ))}
          </ul>
          {tab && <More onClick={() => onOpen(tab)}>{tab === 'ann' ? 'Announcements' : 'Tasks'}</More>}
        </div>
      ))}
    </div>
  );
}

/**
 * Who owes what, one row a player: replies this week, posts not acknowledged, open tasks (late in amber) and rounds in
 * 30 days. It opens on whoever owes the most; a column heading sorts by it (again to turn it round), and a name opens
 * what they owe by title.
 */
export function WaitingOn({ rows, pulse, playersError, onOpen }: {
  rows: ChHubLedgerRow[];
  pulse: ChTeamHub['pulse'];
  playersError: boolean;
  onOpen: (tab: ChHubTab) => void;
}) {
  const phone = useChPhone();
  const [sort, setSort] = useState<{ key: LedgerKey; flipped: boolean }>({ key: 'owed', flipped: false });
  const [open, setOpen] = useState<string | null>(null);
  const owing = rows.filter((r) => owedBy(r) > 0).length;
  const sorted = ledgerSorted(rows, sort.key, sort.flipped);
  const by = (key: LedgerKey) => {
    haptic('select');
    setSort((s) => (s.key === key ? { key, flipped: !s.flipped } : { key, flipped: false }));
  };
  const toggle = (id: string) => {
    haptic('select');
    setOpen((o) => (o === id ? null : id));
  };
  const ariaSort = (key: LedgerKey): 'ascending' | 'descending' | undefined => {
    if (sort.key !== key) return undefined;
    const most = key === 'rounds' ? sort.flipped : !sort.flipped;
    return key === 'name' ? (sort.flipped ? 'descending' : 'ascending') : most ? 'descending' : 'ascending';
  };
  const late = (r: ChHubLedgerRow) => r.tasks?.filter((t) => t.late).length ?? 0;
  return (
    <Tile
      id="ch-hw-owe"
      title="Waiting on"
      span={8}
      className="ch-hw--ledger"
      aside={!playersError && rows.length > 0 && <span className="ch-hw__k ch-num">{owing === 0 ? 'Nobody owes anything' : `${owing} of ${rows.length} owe something`}</span>}
    >
      {playersError ? (
        // The page's own notice (CH-10208, or CH-1209 with another failure) carries Try again: no second one here.
        <p className="ch-hw-agenda__none">Who owes what shows once the team list loads.</p>
      ) : !rows.length ? (
        <EmptyState compact code="CH-10310" title="No players on the roster yet" body="Add them in Roster and what each one owes shows here." />
      ) : phone ? (
        <ul className="ch-hw-ledm">
          {sorted.map((r) => {
            const parts = [
              r.replies?.length ? plural(r.replies.length, 'reply', 'replies') : null,
              r.posts?.length ? plural(r.posts.length, 'post') : null,
              r.tasks?.length ? plural(r.tasks.length, 'task') : null,
            ].filter(Boolean);
            return (
              <li key={r.id} className={open === r.id ? 'is-open' : undefined}>
                <button type="button" aria-expanded={open === r.id} aria-controls={`ch-hw-owe-${r.id}`} onClick={() => toggle(r.id)}>
                  <b>{r.name}</b>
                  <span className={'ch-num' + (late(r) ? ' is-warn' : '')}>
                    {parts.length ? parts.join(' · ') : 'All square'}
                    {late(r) > 0 && `, ${late(r)} late`}
                  </span>
                  <em className="ch-num">{r.rounds ? plural(r.rounds.n, 'round') : '—'}</em>
                  <Icon icon={ChevronDown} size={15} />
                </button>
                {open === r.id && (
                  <div id={`ch-hw-owe-${r.id}`}>
                    <Owed row={r} onOpen={onOpen} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <table className="ch-hw-led">
          <caption className="ch-sr-only">
            What each player owes. {sort.key === 'owed' ? 'Most owed first.' : `Sorted by ${sort.key}.`} Choose a heading to sort, a name to see the items.
          </caption>
          <thead>
            <tr>
              {COLUMNS.map(([k, label]) => (
                <th key={k} scope="col" aria-sort={ariaSort(k)}>
                  <button type="button" className={sort.key === k ? 'is-on' : undefined} onClick={() => by(k)}>
                    {label}
                    {k === 'rounds' && <small> 30 d</small>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <LedgerRow key={r.id} r={r} open={open === r.id} onToggle={() => toggle(r.id)} late={late(r)} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      )}
      {pulse && pulse.players > 0 && !playersError && rows.length > 0 && (
        <p className="ch-hw-foot ch-num">
          {plural(pulse.rounds30, 'round')} in 30 days · {pulse.active14} of {pulse.players} played in the last 14
        </p>
      )}
    </Tile>
  );
}

function LedgerRow({ r, open, onToggle, late, onOpen }: { r: ChHubLedgerRow; open: boolean; onToggle: () => void; late: number; onOpen: (tab: ChHubTab) => void }) {
  return (
    <>
      <tr className={open ? 'is-open' : undefined}>
        <th scope="row">
          <button type="button" aria-expanded={open} aria-controls={`ch-hw-owe-${r.id}`} onClick={onToggle}>
            <Icon icon={ChevronDown} size={14} />
            {r.name}
          </button>
        </th>
        <td>
          <Figure items={r.replies} />
        </td>
        <td>
          <Figure items={r.posts} />
        </td>
        <td>
          <Figure items={r.tasks} late={late} />
        </td>
        <td>
          <Rounds r={r.rounds} />
        </td>
      </tr>
      {open && (
        <tr className="ch-hw-led__more" id={`ch-hw-owe-${r.id}`}>
          <td colSpan={5}>
            <Owed row={r} onOpen={onOpen} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── The latest post ─────────────────────────────────────────────────────────

/**
 * The newest post. A coach sees how many have acknowledged it and a disc for each who hasn't (pick one to name them);
 * a player reads it and says Got it here.
 */
export function PostTile({ a, role, error, covered, acked, pending, onAck, onOpenPosts }: {
  a: ChHubAnnouncement | null;
  role: ChTeamHub['role'];
  error: boolean;
  covered: boolean;
  acked: boolean;
  pending: boolean;
  onAck: (a: ChHubAnnouncement) => Promise<ServerResult>;
  onOpenPosts: () => void;
}) {
  const clk = useChClockText();
  const coach = role === 'coach';
  const [who, setWho] = useState<string | null>(null);
  const span = coach ? 4 : 5;
  if (error) {
    return (
      <Tile id="ch-hw-post" title="Latest post" span={span}>
        <RefreshNotice code="CH-10206" title="Announcements didn’t load." body="Nothing was lost. Try again." covered={covered} />
      </Tile>
    );
  }
  if (!a) {
    return (
      <Tile id="ch-hw-post" title="Latest post" span={span}>
        <EmptyState compact code="CH-10307" title="No announcements yet" body={coach ? 'Post one and see who has read it.' : 'Posts from your coaches show here.'} />
      </Tile>
    );
  }
  const verb = a.needAck ? 'acknowledged' : 'read';
  const left = Math.max(0, a.recipients - a.ackCount);
  const names = a.notAcked ?? null;
  return (
    <Tile id="ch-hw-post" title="Latest post" span={span} aside={<span className="ch-hw__k ch-num">{clk(a.when)}</span>}>
      <div className="ch-hw-post">
        <b className="ch-hw-post__t">{a.title}</b>
        <span className="ch-hw-post__by">
          {a.by}
          {a.byRole ? ` · ${a.byRole}` : ''}
        </span>
        <p className={'ch-hw-post__b' + (coach ? ' is-short' : '')}>{a.body}</p>
      </div>
      {coach ? (
        <>
          <div className="ch-hw-reads">
            <b className="ch-num">{a.ackCount}</b>
            <span className="ch-num">
              of {a.recipients} {verb}
            </span>
          </div>
          <span className="ch-hw-track" aria-hidden="true">
            <i style={{ '--ch-hw-p': a.recipients ? a.ackCount / a.recipients : 0 } as CSSProperties} />
          </span>
          {names && names.length > 0 ? (
            <div className="ch-hw-discs">
              <span className="ch-hw-discs__k">Not yet</span>
              <div role="group" aria-label={`Who hasn’t ${verb} it`}>
                {names.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={who === n}
                    aria-label={n}
                    onClick={() => {
                      haptic('select');
                      setWho((w) => (w === n ? null : n));
                    }}
                  >
                    {initials(n)}
                  </button>
                ))}
              </div>
              <p className="ch-hw-discs__line" aria-live="polite">
                {who ? `${who} hasn’t ${verb} it yet.` : `${plural(names.length, 'player')} still to go.`}
              </p>
            </div>
          ) : (
            <p className="ch-hw-discs__line">{a.recipients > 0 && left === 0 ? `Everyone has ${verb} it.` : names == null ? '' : 'No one is waiting on it.'}</p>
          )}
        </>
      ) : null}
      <div className="ch-hw-post__f">
        {!coach && a.needAck && <Acknowledgement a={a} acked={acked} pending={pending} onAck={onAck} />}
        <More onClick={onOpenPosts}>{coach ? 'Open post' : 'All announcements'}</More>
      </div>
    </Tile>
  );
}

// ── Tasks (coach) ───────────────────────────────────────────────────────────

/** The team's tasks: done, left and late across every assignment, and the three soonest open ones (each opens on Tasks). */
export function TasksTile({ data, figures, isDone, covered, onAssign, onFocus, onOpenTasks }: {
  data: ChTeamHub['tasks'];
  figures: TaskFigures | null;
  isDone: (t: ChHubTask) => boolean;
  covered: boolean;
  onAssign: () => void;
  onFocus: (t: ChHubTask) => void;
  onOpenTasks: () => void;
}) {
  const open = data.rows.filter((t) => !isDone(t));
  const soon = [...open].sort((a, b) => (a.status === 'overdue' ? 0 : 1) - (b.status === 'overdue' ? 0 : 1) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')).slice(0, 3);
  const total = figures ? figures.done + figures.left : 0;
  return (
    <Tile id="ch-hw-tasks" title="Tasks" span={5} aside={!data.error && data.rows.length > 0 && <More onClick={onOpenTasks}>All tasks</More>}>
      {data.error ? (
        <RefreshNotice code="CH-10203" title="Tasks didn’t load." body="Nothing was lost. Try again." covered={covered} />
      ) : !data.rows.length ? (
        <EmptyState
          compact
          code="CH-10303"
          title="No tasks assigned"
          body="Assign a task and see who has done it."
          action={
            <Button size="sm" leftIcon={Plus} onClick={onAssign}>
              Assign a task
            </Button>
          }
        />
      ) : (
        <>
          {figures && (
            <>
              <dl className="ch-hw-figs">
                <div>
                  <dt>done</dt>
                  <dd className="ch-num">{figures.done}</dd>
                </div>
                <div>
                  <dt>left</dt>
                  <dd className="ch-num">{figures.left}</dd>
                </div>
                <div className={figures.overdue > 0 ? 'is-warn' : undefined}>
                  <dt>overdue</dt>
                  <dd className="ch-num">{figures.overdue}</dd>
                </div>
              </dl>
              <span className="ch-hw-track" role="img" aria-label={`${figures.done} of ${total} done`}>
                <i style={{ '--ch-hw-p': total ? figures.done / total : 0 } as CSSProperties} />
              </span>
            </>
          )}
          {soon.length === 0 ? (
            <p className="ch-hw-agenda__none">Every task is done.</p>
          ) : (
            <ol className="ch-hw-tlist">
              {soon.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => onFocus(t)}>
                    <span>
                      <b>{t.title}</b>
                      <em className={'ch-num' + (t.status === 'overdue' ? ' is-warn' : '')}>{t.status === 'overdue' ? `Overdue · ${t.due}` : (t.due ?? 'No date')}</em>
                    </span>
                    {t.done && (
                      <span role="img" className="ch-hw-mini" aria-label={`${t.done[0]} of ${t.done[1]} done`}>
                        <b className="ch-num">
                          {t.done[0]}/{t.done[1]}
                        </b>
                        <i style={{ '--ch-hw-p': t.done[1] ? t.done[0] / t.done[1] : 0 } as CSSProperties} aria-hidden="true" />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </Tile>
  );
}

// ── Your queue (player) ─────────────────────────────────────────────────────

function QueueTask({ t, d, pending, onToggle }: { t: ChHubTask; d: boolean; pending: boolean; onToggle: (t: ChHubTask, nextDone: boolean) => Promise<ServerResult> }) {
  const save = useTaskSave(d, onToggle);
  return (
    <button type="button" className="ch-hb-check" aria-pressed={d} aria-label={`${t.title}${d ? ', done' : ''}`} disabled={pending} aria-busy={pending} onClick={() => void save.run(t, !d)}>
      {d && <Icon icon={Check} size={13} />}
    </button>
  );
}

/** The queue shows this many until asked for the rest, so it never outgrows the trip beside it. */
const QUEUE_SHOWN = 4;

/**
 * Everything asked of the player in one list: replies (answer in place), posts (Got it) and tasks (tick). An answered
 * row stays, showing its answer, so nothing moves under the pointer; the count says what is left.
 */
export function QueueTile({ items, left, failed, covered, replies, isPending, onReply, isAcked, ackPending, onAck, isDone, taskPending, onToggle }: {
  items: QueueItem[];
  left: number;
  /** The parts of the queue whose read failed: replies, posts, tasks. */
  failed: { replies: boolean; posts: boolean; tasks: boolean };
  covered: boolean;
  replies: Map<string, ChRsvp>;
  isPending: (r: ChHubRsvp) => boolean;
  onReply: (r: ChHubRsvp, status: Exclude<ChRsvp, 'pending'>) => Promise<ServerResult>;
  isAcked: (a: ChHubAnnouncement) => boolean;
  ackPending: (a: ChHubAnnouncement) => boolean;
  onAck: (a: ChHubAnnouncement) => Promise<ServerResult>;
  isDone: (t: ChHubTask) => boolean;
  taskPending: (t: ChHubTask) => boolean;
  onToggle: (t: ChHubTask, nextDone: boolean) => Promise<ServerResult>;
}) {
  const [all, setAll] = useState(false);
  const clk = useChClockText();
  // A failed part says so in its own words; a failed announcements read is the post tile's to say.
  const down = failed.replies || failed.tasks;
  return (
    <Tile id="ch-hw-queue" title="Your queue" span={5} aside={!down && items.length > 0 && <span className={'ch-hw__k ch-num' + (left ? ' is-on' : '')}>{left === 0 ? 'All done' : `${left} to do`}</span>}>
      {failed.replies && <RefreshNotice code="CH-10201" title="Your events didn’t load." body="Nothing was lost. Try again." covered={covered} />}
      {failed.tasks && <RefreshNotice code="CH-10203" title="Your tasks didn’t load." body="Nothing was lost. Try again." covered={covered} />}
      {!items.length && !down ? (
        <EmptyState compact code="CH-10303" title="Nothing is asked of you" body="Replies, posts to acknowledge and tasks from your coaches land here." />
      ) : items.length > 0 && (
        <ol className="ch-hw-q">
          {(all ? items : items.slice(0, QUEUE_SHOWN)).map((q) => {
            if (q.kind === 'reply') {
              const mine = replies.get(q.r.eventId) ?? q.r.mine ?? 'pending';
              return (
                <li key={q.key} className={mine !== 'pending' ? 'is-done' : undefined}>
                  <span className="ch-hw-q__b">
                    <span className="ch-hw-q__k ch-num">
                      Reply · {q.r.weekday} {q.r.day}
                    </span>
                    <b>
                      {q.r.title}
                      {q.r.mandatory && <span className="ch-hb-req">Required</span>}
                    </b>
                    <span className="ch-num">{clk(q.r.meta)}</span>
                  </span>
                  <ReplyChoices r={q.r} mine={mine} pending={isPending(q.r)} onReply={onReply} />
                </li>
              );
            }
            if (q.kind === 'post') {
              const done = isAcked(q.a);
              return (
                <li key={q.key} className={done ? 'is-done' : undefined}>
                  <span className="ch-hw-q__b">
                    <span className="ch-hw-q__k">Acknowledge · {clk(q.a.when)}</span>
                    <b>{q.a.title}</b>
                    <span>{q.a.by}</span>
                  </span>
                  <Acknowledgement a={q.a} acked={done} pending={ackPending(q.a)} onAck={onAck} />
                </li>
              );
            }
            const d = isDone(q.t);
            const late = q.t.status === 'overdue' && !d;
            return (
              <li key={q.key} className={'is-task' + (d ? ' is-done' : '')}>
                <QueueTask t={q.t} d={d} pending={taskPending(q.t)} onToggle={onToggle} />
                <span className="ch-hw-q__b">
                  <span className="ch-hw-q__k">Task</span>
                  <b>{q.t.title}</b>
                  <span
                    className={'ch-num' + (late ? ' is-warn' : '')}
                    role={taskPending(q.t) ? 'status' : undefined}
                    data-ch-code={taskPending(q.t) ? 'CH-10410' : undefined}
                    aria-label={taskPending(q.t) ? `Saving ${q.t.title}` : undefined}
                  >
                    {taskPending(q.t) ? 'Saving…' : d ? 'Done' : late ? `Overdue · ${q.t.due}` : (q.t.due ?? 'No date')}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {items.length > QUEUE_SHOWN && (
        <button type="button" className="ch-hw-more ch-hw-q__all" aria-expanded={all} onClick={() => setAll((x) => !x)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
          <Icon icon={ChevronDown} size={13} />
        </button>
      )}
    </Tile>
  );
}

// ── Files (player) ──────────────────────────────────────────────────────────

/** The team's newest files, each opened with a tap, and the way to the rest. */
export function FilesTile({ data, opening, covered, onOpen, onOpenDocs }: {
  data: ChTeamHub['documents'];
  opening: string | null;
  covered: boolean;
  onOpen: (f: ChHubFile) => void;
  onOpenDocs: () => void;
}) {
  const files = data.folders.flatMap((f) => f.files.map((x) => ({ ...x, folder: f.name })));
  return (
    <Tile id="ch-hw-files" title="Files" span={5} aside={!data.error && files.length > 4 && <More onClick={onOpenDocs}>{`All ${files.length}`}</More>}>
      {data.error ? (
        <RefreshNotice code="CH-10204" title="Documents didn’t load." body="Your files are safe. Try again." covered={covered} />
      ) : !files.length ? (
        <EmptyState compact code="CH-10304" title="No documents yet" body="Files your coaches share show here." />
      ) : (
        <ul className="ch-hw-files">
          {files.slice(0, 4).map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => onOpen(f)} aria-busy={opening === f.id}>
                <span className="ch-hw-files__ty" aria-hidden="true">
                  {f.type}
                </span>
                <span className="ch-hw-files__b">
                  <b>{f.title}</b>
                  <span className="ch-num">{[f.folder, f.size].filter(Boolean).join(' · ')}</span>
                </span>
                <em className="ch-num">{opening === f.id ? 'Opening…' : f.date}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
