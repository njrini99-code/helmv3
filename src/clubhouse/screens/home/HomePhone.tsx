'use client';

import { BarChart3, CalendarDays, CalendarPlus, ChevronRight, MessageSquare, Plus, Sparkles, Sun, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import type { ChCoachHome, ChHomeEvent, ChLatestRound, ChTeamForm } from '../../data/home';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { Nine } from '../../ui/Nine';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { formatFixed, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { useNow } from '../../lib/use-now';
import { rebuiltHref } from '../../shell/nav';
import { usePhoneHero } from '../../shell/phone-chrome';
import { TYPE_LABEL } from '../calendar/model';
import { TYPE_ICON } from '../calendar/views';

export const CALENDAR = '/golf/dashboard/calendar';
export const eventHref = (e: ChHomeEvent) => `${CALENDAR}?date=${e.date}&event=${e.id}`;
const newEventHref = (type?: ChHomeEvent['type']) => `${CALENDAR}?new=1${type ? `&type=${type}` : ''}`;

/**
 * The coach's phone Home (v2, design/handoff/Coach - Home - Mobile.html,
 * m-home.jsx): the green hero with the day, the greeting, the brief and Up
 * next; then Today, the team's form, This week and the latest rounds, each
 * opening its scorecard in a sheet. Same loader and catalog as desktop; the
 * phone's extra figures come from `data.phone`. `now` freezes the clock for
 * the preview and the tests.
 */
export function HomePhone({ data, now: frozen }: { data: ChCoachHome; now?: string }) {
  usePhoneHero(true);
  const ticking = useNow();
  const now = useMemo(() => (frozen ? new Date(frozen) : ticking), [frozen, ticking]);
  const [open, setOpen] = useState<ChLatestRound | null>(null);
  const { phone } = data;
  const nothingAhead = !data.week.error && !phone.next && data.week.days.every((d) => d.eventCount === 0);

  return (
    <main className="ch-hm" aria-label="Home">
      <header className="ch-hm-hero">
        <span className="ch-hm-hero__date">{data.todayLabel}</span>
        <h1>{data.greeting}</h1>
        {data.subline && (
          <p className="ch-hm-hero__brief">
            <Icon icon={Sparkles} size={14} />
            {data.subline}
          </p>
        )}
        <SectionBoundary surface="home.upNext" label="Up next" code="CH-2213">
          {data.week.error ? (
            <div className="ch-hm-next is-static">
              <RefreshNotice code="CH-2201" title="This week's schedule didn't load." body="Your events are safe. This is a display problem, and trying again usually clears it." />
            </div>
          ) : phone.next ? (
            <UpNext e={phone.next} now={now} />
          ) : (
            <NoEvents />
          )}
        </SectionBoundary>
      </header>

      <div className="ch-hm-body">
        <SectionBoundary surface="home.today" label="Today" code="CH-2214">
          <Today list={phone.today} now={now} failed={data.week.error} quiet={nothingAhead} />
        </SectionBoundary>

        {phone.form ? (
          <SectionBoundary surface="home.form" label="Team scoring" code="CH-2212">
            <Form form={phone.form} />
          </SectionBoundary>
        ) : data.latestRounds.error ? (
          <RefreshNotice code="CH-2211" title="Team scoring didn't load." body="Posted rounds are safe. Try again; the error has been reported." />
        ) : null}

        {!data.week.error && !nothingAhead && (
          <SectionBoundary surface="home.week" label="This week" code="CH-2205">
            <WeekStrip days={data.week.days} note={phone.weekNote} />
          </SectionBoundary>
        )}

        <SectionBoundary surface="home.latestRound" label="Latest rounds" code="CH-2206">
          <Rounds data={data.latestRounds} onOpen={setOpen} />
        </SectionBoundary>
      </div>

      <RoundSheet round={open} holesError={data.latestRounds.holesError} onClose={() => setOpen(null)} />
    </main>
  );
}

/** "In 50 min", "Happening now", "Tomorrow · 3:30 PM", "Thu · 8:42 AM". Before the clock is known, the day only. */
export function whenLabel(e: ChHomeEvent, now: Date | null): { text: string; soon: boolean } {
  if (e.allDay) return { text: now && dayDiff(e.date, now) === 0 ? 'Today · all day' : `${weekday(e.date)} · all day`, soon: false };
  if (!now) return { text: e.startLabel, soon: false };
  const mins = Math.round((Date.parse(e.startIso) - now.getTime()) / 60000);
  const days = dayDiff(e.date, now);
  if (days === 0) {
    const end = e.endIso ? Date.parse(e.endIso) : Date.parse(e.startIso);
    if (mins <= 0 && now.getTime() < end) return { text: 'Happening now', soon: true };
    if (mins < 60) return { text: `In ${Math.max(1, mins)} min`, soon: true };
    return { text: `In ${Math.floor(mins / 60)} h ${mins % 60} min`, soon: false };
  }
  return { text: `${days === 1 ? 'Tomorrow' : weekday(e.date)} · ${e.startLabel}`, soon: false };
}

/** Whole days from the viewer's today to a YYYY-MM-DD, on the viewer's clock (the team date is the loader's). */
function dayDiff(date: string, now: Date): number {
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${local}T12:00:00Z`)) / 86400000);
}
const WD = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
const weekday = (date: string) => WD.format(new Date(`${date}T12:00:00Z`));

/** `children`: what closes the card (the player's countdown). */
export function UpNext({ e, now, children }: { e: ChHomeEvent; now: Date | null; children?: ReactNode }) {
  const when = whenLabel(e, now);
  const people = e.invitees ?? [];
  return (
    <Link href={eventHref(e)} className="ch-hm-next" onClick={() => chTrail('home open next event')}>
      <span className="ch-hm-next__k">
        <span className="ch-hm-next__type">
          <Icon icon={TYPE_ICON[e.type]} size={13} />
          {TYPE_LABEL[e.type]}
        </span>
        <span className={'ch-hm-next__when ch-num' + (when.soon ? ' is-soon' : '')}>{when.text}</span>
      </span>
      <h2>{e.title}</h2>
      <p className="ch-num">{[e.rangeLabel, e.location].filter(Boolean).join(' · ')}</p>
      {e.invitees && people.length > 0 && (
        <span className="ch-hm-next__f">
          <span className="ch-hm-stack" aria-hidden="true">
            {people.slice(0, 5).map((n) => (
              <Avatar key={n} name={n} size={24} />
            ))}
          </span>
          <span className="ch-hm-next__rsvp ch-num">
            <b>{e.going}</b> of {people.length} going
          </span>
          <Icon icon={ChevronRight} size={17} />
        </span>
      )}
      {children}
    </Link>
  );
}

const QUICK: Array<ChHomeEvent['type']> = ['practice', 'qualifier', 'tournament', 'meeting'];

/** Nothing ahead: what the card will hold, and the quickest way to add the first event. */
function NoEvents() {
  return (
    <div className="ch-hm-next is-static" data-ch-code="CH-2309">
      <span className="ch-hm-next__k">
        <span className="ch-hm-next__type">
          <Icon icon={CalendarDays} size={13} />
          Up next
        </span>
      </span>
      <div className="ch-hm-none">
        <span className="ch-hm-none__ic">
          <Icon icon={CalendarPlus} size={22} />
        </span>
        <span>
          <h2>No events scheduled</h2>
          <p>Practices, qualifiers and travel show up here with a countdown.</p>
        </span>
      </div>
      <div className="ch-hm-none__q">
        {QUICK.map((t) => (
          <Link key={t} href={newEventHref(t)} className="ch-hm-none__chip" onClick={() => haptic('select')}>
            <Icon icon={TYPE_ICON[t]} size={13} />
            {TYPE_LABEL[t]}
          </Link>
        ))}
      </div>
      <Link href={newEventHref()} className="ch-hm-none__add" onClick={() => haptic('press')}>
        <Icon icon={Plus} size={16} />
        Add event
      </Link>
    </div>
  );
}

/** `canPlan`: a coach gets Plan on an empty day; a player can't add team events. */
export function Today({ list, now, failed, quiet, canPlan = true }: { list: ChHomeEvent[]; now: Date | null; failed: boolean; quiet: boolean; canPlan?: boolean }) {
  if (failed) return null;
  return (
    <section className="ch-hm-sec" aria-labelledby="ch-hm-today">
      <div className="ch-hm-sec__h">
        <h2 id="ch-hm-today">Today</h2>
        {list.length > 0 && (
          <Link href={CALENDAR} className="ch-hm-link">
            Calendar
          </Link>
        )}
      </div>
      {!list.length ? (
        <div className="ch-hm-empty" data-ch-code="CH-2301">
          <Icon icon={Sun} size={18} />
          <span>
            <b>Nothing scheduled</b>
            <span>{canPlan ? 'Players can still post rounds from the course.' : 'A good day to play a round.'}</span>
          </span>
          {canPlan && !quiet && (
            <Button size="sm" leftIcon={Plus} href={newEventHref()}>
              Plan
            </Button>
          )}
        </div>
      ) : (
        <ol className="ch-hm-tl">
          {list.map((e) => {
            const t = now?.getTime();
            const end = e.endIso ? Date.parse(e.endIso) : Date.parse(e.startIso);
            const past = !e.allDay && t != null && end <= t;
            const live = !e.allDay && t != null && Date.parse(e.startIso) <= t && end > t;
            return (
              <li key={e.id} className={'ch-hm-tl__r' + (past ? ' is-past' : '') + (live ? ' is-now' : '')}>
                <Link href={eventHref(e)} className="ch-hm-tl__a">
                  <span className="ch-hm-tl__t ch-num">{e.allDay ? 'All day' : e.startLabel.replace(/\s?[AP]M$/, '')}</span>
                  <span className="ch-hm-tl__rail" aria-hidden="true">
                    <i className={`is-${e.type}`} />
                  </span>
                  <span className="ch-hm-tl__b">
                    <b>{e.title}</b>
                    {e.location && <span>{e.location}</span>}
                  </span>
                  {e.conflict ? (
                    <span className="ch-hm-tl__w" title="Overlaps another event">
                      <Icon icon={TriangleAlert} size={13} />
                      <span className="ch-sr-only">Overlaps another event</span>
                    </span>
                  ) : live ? (
                    <span className="ch-hm-now">Now</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** The team's scoring form: the average, its change, the line, and three figures. Gains green, losses amber (D-42). */
function Form({ form }: { form: ChTeamForm }) {
  const W = 320;
  const H = 64;
  const pts = form.line;
  const lo = Math.min(...pts) - 0.3;
  const hi = Math.max(...pts) + 0.3;
  const x = (i: number) => 4 + (pts.length > 1 ? (i * (W - 8)) / (pts.length - 1) : (W - 8) / 2);
  const y = (v: number) => 6 + ((v - lo) / (hi - lo || 1)) * (H - 12);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  // Lower scores and fewer putts are better; more greens are better.
  const tone = (delta: number | null, lowerIsBetter: boolean) => (delta == null || delta === 0 ? '' : (delta < 0) === lowerIsBetter ? 'is-gain' : 'is-loss');
  return (
    <section className="ch-hm-form" aria-labelledby="ch-hm-form">
      <div className="ch-hm-form__top">
        <span>
          <em id="ch-hm-form">Team scoring average</em>
          <b className="ch-num">{formatFixed(form.avg)}</b>
        </span>
        {form.delta != null && (
          <span className={'ch-hm-delta ch-num ' + tone(form.delta, true)}>
            {formatSigned(form.delta)}
            <em>vs previous 10</em>
          </span>
        )}
      </div>
      {pts.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="ch-hm-form__svg" role="img" aria-label={`Team scoring, a five-round average, from ${formatFixed(pts[0]!)} to ${formatFixed(pts[pts.length - 1]!)}`}>
          <path d={`${d} L${x(pts.length - 1)},${H} L${x(0)},${H} Z`} className="ch-hm-form__fill" />
          <path d={d} className="ch-hm-form__line" />
          <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1]!)} r="3.6" className="ch-hm-form__dot" />
        </svg>
      )}
      <dl className="ch-hm-form__figs">
        <div>
          <dt>Rounds</dt>
          <dd className="ch-num">{form.roundsThisWeek}</dd>
          <dd>this week</dd>
        </div>
        <div>
          <dt>GIR</dt>
          <dd className="ch-num">{form.gir.pct != null ? `${Math.round(form.gir.pct)}%` : NO_DATA}</dd>
          <dd className={'ch-num ' + tone(form.gir.delta, false)}>{form.gir.delta != null ? formatSigned(form.gir.delta, 0) : ' '}</dd>
        </div>
        <div>
          <dt>Putts</dt>
          <dd className="ch-num">{form.putts.avg != null ? formatFixed(form.putts.avg) : NO_DATA}</dd>
          <dd className={'ch-num ' + tone(form.putts.delta, true)}>{form.putts.delta != null ? formatSigned(form.putts.delta) : ' '}</dd>
        </div>
      </dl>
    </section>
  );
}

export function WeekStrip({ days, note }: { days: ChCoachHome['week']['days']; note: ChCoachHome['phone']['weekNote'] }) {
  return (
    <section className="ch-hm-sec" aria-labelledby="ch-hm-week">
      <div className="ch-hm-sec__h">
        <h2 id="ch-hm-week">This week</h2>
      </div>
      <ol className="ch-hm-week">
        {days.map((d) => (
          <li key={d.date} className={(d.isToday ? 'is-today' : '') + (d.hasCompetition ? ' is-major' : '')} aria-current={d.isToday ? 'date' : undefined}>
            <Link href={`${CALENDAR}?view=day&date=${d.date}`} className="ch-hm-week__d">
              <em aria-hidden="true">{d.weekday.slice(0, 1)}</em>
              <b className="ch-num" aria-hidden="true">
                {d.dayOfMonth}
              </b>
              <span aria-hidden="true">{d.hasCompetition ? <Icon icon={TYPE_ICON.tournament} size={11} /> : Array.from({ length: Math.min(3, d.eventCount) }, (_, j) => <i key={j} />)}</span>
              <span className="ch-sr-only">
                {d.weekday} {d.dayOfMonth}
                {d.isToday ? ', today' : ''}
                {d.hasCompetition ? ', competition' : ''}, {d.eventCount} {d.eventCount === 1 ? 'event' : 'events'}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {note && (
        <p className="ch-hm-week__n">
          <b>{note.weekday}</b> {note.title}
        </p>
      )}
    </section>
  );
}

function Rounds({ data, onOpen }: { data: ChCoachHome['latestRounds']; onOpen: (r: ChLatestRound) => void }) {
  return (
    <section className="ch-hm-sec" aria-labelledby="ch-hm-rounds">
      <div className="ch-hm-sec__h">
        <h2 id="ch-hm-rounds">Latest rounds</h2>
      </div>
      {data.error ? (
        <RefreshNotice code="CH-2202" title="Recent rounds didn't load." body="Posted rounds are safe. Try again; the error has been reported." />
      ) : !data.rounds.length ? (
        <EmptyState compact code="CH-2302" icon={BarChart3} title="No rounds posted yet this season." body="The newest 18-hole round appears here as soon as a player posts it." />
      ) : (
        <ul className="ch-hm-list">
          {data.rounds.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="ch-hm-rd"
                onClick={() => {
                  haptic('select');
                  chTrail('home open round');
                  onOpen(r);
                }}
              >
                <Avatar name={r.playerName} size={38} />
                <span className="ch-hm-rd__b">
                  <b>{r.playerName}</b>
                  <span>{r.meta.split(' · ').slice(0, 2).join(' · ')}</span>
                </span>
                <span className={'ch-hm-score ch-num' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>
                  <b>{r.score}</b>
                  <em>{formatToPar(r.toPar)}</em>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A latest round's card (board 05): the figures, then Out and In; Message and the player's stats. */
function RoundSheet({ round, holesError, onClose }: { round: ChLatestRound | null; holesError: boolean; onClose: () => void }) {
  const message = round ? rebuiltHref(`/golf/dashboard/messages?player=${round.playerId}`) : null;
  const stats = round ? rebuiltHref(`/golf/dashboard/stats?player=${round.playerId}`) : null;
  return (
    <Modal
      open={!!round}
      onClose={onClose}
      title={round?.playerName ?? ''}
      description={round?.meta}
      footer={
        (message || stats) && (
          <>
            {message && (
              <Button leftIcon={MessageSquare} href={message}>
                Message
              </Button>
            )}
            {stats && (
              <Button variant="primary" leftIcon={BarChart3} href={stats}>
                Player stats
              </Button>
            )}
          </>
        )
      }
    >
      {round && (
        <div className="ch-hm-sheet">
          <dl className="ch-hm-strip ch-well-soft">
            <div>
              <dt>Score</dt>
              <dd className="ch-num">
                {round.score} <span>{formatToPar(round.toPar)}</span>
              </dd>
            </div>
            <div>
              <dt>GIR</dt>
              <dd className="ch-num">{round.gir ?? NO_DATA}</dd>
            </div>
            <div>
              <dt>Putts</dt>
              <dd className="ch-num">{round.putts ?? NO_DATA}</dd>
            </div>
            <div>
              <dt>SG</dt>
              <dd className="ch-num">{round.sg != null ? formatSigned(round.sg) : NO_DATA}</dd>
            </div>
          </dl>
          {holesError ? (
            <p className="ch-hm-muted" data-ch-code="CH-2203">
              Hole-by-hole scores didn&apos;t load for this round. The total is right.
            </p>
          ) : round.holes ? (
            <>
              <Nine label="Out" holes={round.holes.filter((h) => h.n <= 9)} caption="Front nine" />
              <Nine label="In" holes={round.holes.filter((h) => h.n > 9)} caption="Back nine" />
            </>
          ) : (
            <p className="ch-hm-muted" data-ch-code="CH-2303">
              Posted as a total. Hole-by-hole scores weren&apos;t recorded for this round.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
