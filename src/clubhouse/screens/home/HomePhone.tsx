'use client';

import { RotateCw, ArrowRight, ChartColumn, CalendarDays, CalendarPlus, ChevronRight, MessageSquare, Plus, Sun, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import type { ChCoachHome, ChHomeEvent, ChLatestRound } from '../../data/home';
import { Button } from '../../ui/Button';
import { CrhStateBlock } from '../../ui/CrhStateBlock';
import { useRefresh } from '../../lib/use-refresh';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { PageRefreshNotice, RefreshNotice } from '../../ui/RefreshNotice';
import { coachHelmPlayerHref, type ChPlayerPeek } from '../../ui/PlayerPeek';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { WeekStrip as DayStrip } from '../../ui/WeekStrip';
import { formatSigned, changeInk, formatToPar } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { useChClockText } from '../../lib/use-clock';
import { useNow } from '../../lib/use-now';
import { rebuiltHref } from '../../shell/nav';
import { LinkPending } from '../../shell/LinkPending';
import { usePhoneHero } from '../../shell/phone-chrome';
import { TYPE_LABEL } from '../calendar/model';
import { TYPE_ICON } from '../calendar/views';
import { coachFailedParts } from './model';
import { CoachQueue } from './CoachQueue';
import { LiveNowCard } from './LiveNowCard';
import type { LiveSnapshot } from '../../live/model';
import { roundHref } from './player-links';
import { leaderPeek } from './Leaderboard';
import { MineBadge } from './CoachAsks';
import { SinceYouLooked } from './DayCard';
import { Countdown } from './Countdown';
import { countdownTo } from './event-links';
import { HomeActions } from './HomeActions';
import { CoachLatest } from './CoachLatest';
import { TeamScoring, TeamScoringFailed } from './TeamScoring';
import { TeamGame } from './TeamGame';
import { UpNext } from './UpNext';

export { CALENDAR, eventHref, whenLabel } from './event-links';
export { UpNext } from './UpNext';
import { CALENDAR, eventHref, whenLabel } from './event-links';
import { plural } from '../../lib/plural';
import { ClassHomeLine } from './ClassHomeLine';
import { NextBeyond } from './NextBeyond';
import { NewEventLink } from './NewEventLink';
const newEventHref = (type?: ChHomeEvent['type']) => `${CALENDAR}?new=1${type ? `&type=${type}` : ''}`;

/**
 * The coach's phone Home, drawn as Player Home's phone (lay-01, owner 15 Nov 2026: "I want the coach home page matching
 * the players"): on the ivory sheet, the day, the greeting and the line on who needs a look; Up next as the one green
 * card with its countdown; Message team and New event; what is waiting on the coach. Then, under engraved rules, This
 * week with today's timeline inside it, the team's latest rounds paged with the scorecard inline, Team scoring on the
 * shared scoring line, and the team's game. Same loader and catalog as desktop; `now` freezes the clock for the preview
 * and the tests.
 */
export function HomePhone({ data, now: frozen, live }: { data: ChCoachHome; now?: string; /** Who is on the course now (P-6); omitted, the card is not drawn. */ live?: LiveSnapshot }) {
  usePhoneHero(true);
  const ticking = useNow();
  const now = useMemo(() => (frozen ? new Date(frozen) : ticking), [frozen, ticking]);
  const [open, setOpen] = useState<ChLatestRound | null>(null);
  const { phone } = data;
  // Nothing on this week: no event, and no day on the road (F-0001).
  const nothingAhead = !data.week.error && !phone.next && data.week.days.every((d) => d.eventCount === 0 && !d.trip);
  // Two or more failed reads are told once under the greeting, with one Try again; each part keeps its title (CH-1209).
  const failed = coachFailedParts(data, true);
  const covered = failed.length > 1;
  const until = phone.next ? countdownTo(phone.next) : null;
  // A malformed read is CoachLatest's to contain (CH-2206); what changed since you looked reads no rounds from it.
  const rounds = (data.latestRounds.error ? null : data.latestRounds.rounds) ?? [];

  return (
    <main className="ch-hm ch-hm--coach" aria-label="Home">
      <header className="ch-hm-hero">
        <span className="ch-hm-hero__date">{data.todayLabel}</span>
        <h1>{data.greeting}</h1>
        {/* Who needs a look and what's next, from the rounds: a count, not AI output, so no glyph (HOME-P-02). */}
        {data.subline && <p className="ch-hm-hero__brief">{data.subline}</p>}
        <PageRefreshNotice parts={failed} />
        <SectionBoundary surface="home.upNext" label="Up next" code="CH-2213">
          {data.week.error ? (
            <RefreshNotice code="CH-2201" title="This week’s schedule didn’t load" body="Your events are safe. Try again." covered={covered} />
          ) : phone.next ? (
            <UpNext e={phone.next} now={now} kicker="Up next">
              {/* A trip counts down to when it leaves (F-0001); an all-day event has no time to count to. */}
              {until && <Countdown to={until} frozen={frozen} lead={phone.next.trip ? 'Leaves in' : undefined} />}
            </UpNext>
          ) : phone.after ? (
            // Nothing left this week, but something after it (F-0006): never "No events scheduled".
            <NextBeyond e={phone.after} />
          ) : (
            <NoEvents />
          )}
        </SectionBoundary>
        <HomeActions teamChatId={data.teamChatId} phone />
        <CoachQueue queue={data.queue} covered={covered} phone />
      </header>

      <div className="ch-hm-body">
        {/* P-10: the class line, first in the body. Nothing with the flag off. */}
        {data.teamId && data.clock && <ClassHomeLine teamId={data.teamId} today={data.clock.day} teamTimeZone={data.clock.tz} variant="phone" />}
        {live && (
          <SectionBoundary surface="home.live" label="Live now">
            <LiveNowCard initial={live} phone frozen={frozen !== undefined} now={frozen !== undefined ? Date.parse(frozen) : undefined} />
          </SectionBoundary>
        )}
        {/* P-14: what changed since this device last looked: schedule changes, and today's rounds once the rounds loaded. */}
        <SinceYouLooked rounds={rounds} event={null} changes={data.changes ?? []} onOpenRound={setOpen} />
        {!data.week.error && !nothingAhead ? (
          <SectionBoundary surface="home.week" label="This week" code="CH-2205">
            {/* The player's This week: the days, then today's timeline as a small label inside the section. */}
            <WeekStrip calendar days={data.week.days} note={phone.weekNote} rounds={phone.form?.roundsThisWeek}>
              <SectionBoundary surface="home.today" label="Today" code="CH-2214">
                <Today inline card list={phone.today} now={now} failed={false} quiet={false} />
              </SectionBoundary>
            </WeekStrip>
          </SectionBoundary>
        ) : (
          <SectionBoundary surface="home.today" label="Today" code="CH-2214">
            <Today list={phone.today} now={now} failed={data.week.error} quiet={nothingAhead} />
          </SectionBoundary>
        )}
        <SectionBoundary surface="home.latestRound" label="Latest rounds" code="CH-2206">
          <CoachLatest data={data.latestRounds} covered={covered} years={data.yearById} />
        </SectionBoundary>
        {phone.form ? (
          <SectionBoundary surface="home.form" label="Team scoring" code="CH-2212">
            <TeamScoring form={phone.form} phone />
          </SectionBoundary>
        ) : data.latestRounds.error ? (
          <TeamScoringFailed phone covered={covered} />
        ) : null}
        {phone.form && data.legs && (
          <SectionBoundary surface="home.legs" label="The team’s game" code="CH-2221">
            <TeamGame legs={data.legs} phone covered={covered} />
          </SectionBoundary>
        )}
      </div>

      <RoundSheet round={open} holesError={data.latestRounds.holesError} onClose={() => setOpen(null)} />
    </main>
  );
}

/** Up next as one row (dashboard cuts, 6): the type, the title, when. The event opens on Calendar; Today lists the rest of the day. */
export function UpNextRow({ e, now }: { e: ChHomeEvent; now: Date | null }) {
  const t = useChClockText();
  const when = whenLabel(e, now);
  return (
    <Link href={eventHref(e)} className="ch-hm-nextrow" onClick={() => chTrail('home open next event')}>
      <span className="ch-hm-nextrow__ic" aria-hidden="true">
        <Icon icon={TYPE_ICON[e.type]} size={16} />
      </span>
      <span className="ch-hm-nextrow__b">
        <span className="ch-hm-nextrow__k">
          Up next · {TYPE_LABEL[e.type]}
          <MineBadge mine={e.mine} />
        </span>
        <b>{e.title}</b>
      </span>
      <span className={'ch-hm-nextrow__when ch-num' + (when.soon ? ' is-soon' : '')}>{t(when.text)}</span>
      <Icon icon={ChevronRight} size={17} />
      <LinkPending />
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
          <NewEventLink key={t} href={newEventHref(t)} type={t} className="ch-hm-none__chip">
            <Icon icon={TYPE_ICON[t]} size={13} />
            {TYPE_LABEL[t]}
          </NewEventLink>
        ))}
      </div>
      <NewEventLink href={newEventHref()} className="ch-hm-none__add" onTap={() => haptic('press')}>
        <Icon icon={Plus} size={16} />
        Add event
      </NewEventLink>
    </div>
  );
}

/**
 * `canPlan`: a coach gets Plan on an empty day; a player can't add team events.
 * `inline`: the player's phone (Player - Home - Mobile.html `mp-lab`): a small "Today" label and the timeline inside
 * This week's section, with no section of its own and no Calendar link (the week's days open it). The row under way
 * reads "Now"; with none under way, the next one reads "Next". A row that has passed keeps its ink: only its time
 * steps back, so it never looks disabled.
 */
export function Today({ list, now, failed, quiet, canPlan = true, inline = false, card = false }: { /** The coach's card, with the lane's flag: an Overlap chip in words. Player Home's calls never pass it. */ card?: boolean; list: ChHomeEvent[]; now: Date | null; failed: boolean; quiet: boolean; canPlan?: boolean; inline?: boolean }) {
  const t12 = useChClockText();
  if (failed) return null;
  const t = now?.getTime();
  const rows = list.map((e) => {
    const end = e.endIso ? Date.parse(e.endIso) : Date.parse(e.startIso);
    return { e, past: !e.allDay && t != null && end <= t, live: !e.allDay && t != null && Date.parse(e.startIso) <= t && end > t };
  });
  const next = (inline || card) && t != null && !rows.some((r) => r.live) ? rows.find((r) => !r.past && !r.e.allDay)?.e.id : undefined;
  const body = !list.length ? (
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
    <ol className={'ch-hm-tl' + (inline ? ' is-player' : '')} aria-labelledby={inline ? 'ch-hm-today' : undefined}>
      {rows.map(({ e, past, live }) => {
        const mark = live || e.id === next;
        return (
          <li key={e.id} className={'ch-hm-tl__r' + (past ? ' is-past' : '') + (mark ? ' is-now' : '')}>
            <Link href={eventHref(e)} className="ch-hm-tl__a">
              <span className="ch-hm-tl__t ch-num">{e.allDay ? 'All day' : t12(e.startLabel).replace(/\s?[AP]M$/, '')}</span>
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
                  <span>Overlap</span>
                </span>
              ) : mark ? (
                <span className="ch-hm-now">{live ? 'Now' : 'Next'}</span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ol>
  );
  if (inline) {
    return (
      <>
        <h2 id="ch-hm-today" className="ch-hm-lab">
          Today
        </h2>
        {body}
      </>
    );
  }
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
      {body}
    </section>
  );
}

export { figureMissing, formSpan } from './TeamScoring';

/**
 * `children`: what follows the week inside its section (the player's Today). A competition day carries its type's mark, the one the
 * calendar draws. `rounds`: the team's countable rounds this week, a count on the week's own basis, so it sits here and not in Team
 * scoring's last-10 row (prod audit 2026-11-15, HOME-P-14).
 */
export function WeekStrip({ days, note, children, calendar = false, rounds }: { calendar?: boolean; days: ChCoachHome['week']['days']; note: ChCoachHome['phone']['weekNote']; children?: ReactNode; rounds?: number }) {
  return (
    <section className="ch-hm-sec" aria-labelledby="ch-hm-week">
      <div className="ch-hm-sec__h">
        <h2 id="ch-hm-week">This week</h2>
        {calendar && (
          <Link className="ch-hm-link" href={CALENDAR}>
            Calendar
          </Link>
        )}
      </div>
      <WeekDays days={days} note={note} />
      {rounds != null && <p className="ch-hm-week__n ch-num">{rounds ? `${plural(rounds, 'round')} posted this week` : 'No rounds posted this week yet'}</p>}
      {children}
    </section>
  );
}

/** The week's seven days and the line under them, without a card: the phone's This week card and the desktop's Today card both hold it. */
export function WeekDays({ days, note }: { days: ChCoachHome['week']['days']; note: ChCoachHome['phone']['weekNote'] }) {
  return (
    <>
      <DayStrip
        label="This week"
        className="ch-hm-week"
        days={days.map((d) => ({
          date: d.date,
          top: d.weekday.slice(0, 1),
          num: d.dayOfMonth,
          isToday: d.isToday,
          dots: d.eventCount,
          // A day on the road wears Team Hub's gold travel dot (F-0001), and says so in words.
          flag: d.trip ? 'trip' : undefined,
          mark: d.hasCompetition ? TYPE_ICON[d.competitionType ?? 'tournament'] : undefined,
          label: `${d.weekday} ${d.dayOfMonth}${d.isToday ? ', today' : ''}${d.hasCompetition ? ', competition' : ''}, ${plural(d.eventCount, 'event')}${d.trip ? `, on the road (${d.trip})` : ''}`,
          href: `${CALENDAR}?view=day&date=${d.date}`,
        }))}
      />
      {note && (
        <p className="ch-hm-week__n">
          <b>{note.weekday}</b> {note.title}
        </p>
      )}
    </>
  );
}

/**
 * `trends`: the leaderboard's rows, for each player's last rounds as a word-sized line beside the score (P002-C2): who
 * is slipping, read without a leaderboard on the phone. Null when that read failed: the rows keep their scores.
 */
/**
 * P002 D5: a part that didn't load keeps the section it would have been, with the same head (title over the rule) as
 * Latest rounds, so a page with several failures reads as one list of sections at one rhythm.
 */
/** The drawn failed state (06 §11.3): the page says so under the greeting, each card keeps its head and offers its own Try again. */
export const CRH_PART_FAILED = 'Some of today didn’t load. What did is below.';
export function CrhFailedCard({ id, title, href, link, code, what, body }: { id: string; title: string; href?: string | null; link: string; code: string; what: string; body: string }) {
  const { refresh, refreshing } = useRefresh();
  return (
    <section className="ch-hm-sec ch-dh-failed" aria-labelledby={id}>
      <div className="ch-hm-sec__h">
        <h2 id={id}>{title}</h2>
        {href && (
          <Link href={href} className="ch-hm-link">
            {link}
          </Link>
        )}
      </div>
      <CrhStateBlock kind="failed" code={code} title={what} body={body}>
        <Button leftIcon={RotateCw} busy={refreshing} onClick={refresh}>
          Try again
        </Button>
      </CrhStateBlock>
    </section>
  );
}

/** The player peek for a latest round's row: the board's row when the player has one, else what the round says. */
export function roundPeek(r: ChLatestRound, rows: ChCoachHome['leaderboard']['rows'] | null, rounds: ChLatestRound[]): ChPlayerPeek {
  const row = rows?.find((p) => p.playerId === r.playerId);
  if (row) return leaderPeek(row, rounds);
  return { id: r.playerId, name: r.playerName, lastRound: { score: r.score, toPar: r.toPar, label: r.meta.split(' · ').slice(0, 2).join(' · ') } };
}

/** A latest round's card (board 05): the figures, then Out and In; Message and the player's stats. */
/** The sheet's scorecard (06 12): holes, par and score for each nine, marks on the score by its distance from par. */
function CrhScorecard({ holes }: { holes: NonNullable<ChLatestRound['holes']> }) {
  const nines = [
    { label: 'Out', list: holes.filter((h) => h.n <= 9) },
    { label: 'In', list: holes.filter((h) => h.n > 9) },
  ].filter((n) => n.list.length > 0);
  const total = (list: typeof holes, of: (h: (typeof holes)[number]) => number | null | undefined) => list.reduce((sum, h) => sum + (of(h) ?? 0), 0);
  const mark = (score: number | null | undefined, par: number | null | undefined) => {
    if (score == null || par == null) return '';
    const d = score - par;
    return d <= -1 ? ' is-birdie' : d === 1 ? ' is-bogey' : d >= 2 ? ' is-double' : '';
  };
  return (
    <div className="ch-hm-card">
      {nines.map((nine) => (
        <div className="ch-hm-card__g" role="table" aria-label={nine.label === 'Out' ? 'Front nine' : 'Back nine'} key={nine.label}>
          <div className="ch-hm-card__r is-holes" role="row">
            <span role="columnheader">Hole</span>
            {nine.list.map((h) => (
              <span role="columnheader" key={h.n}>
                {h.n}
              </span>
            ))}
            <span role="columnheader">{nine.label}</span>
          </div>
          <div className="ch-hm-card__r" role="row">
            <b role="rowheader">Par</b>
            {nine.list.map((h) => (
              <span role="cell" key={h.n}>
                {h.par ?? <NoData />}
              </span>
            ))}
            <b role="cell">{total(nine.list, (h) => h.par)}</b>
          </div>
          <div className="ch-hm-card__r" role="row">
            <b role="rowheader">Score</b>
            {nine.list.map((h) => (
              <span role="cell" key={h.n} className={'ch-hm-card__s' + mark(h.score, h.par)}>
                {h.score ?? <NoData />}
              </span>
            ))}
            <b role="cell">{total(nine.list, (h) => h.score)}</b>
          </div>
        </div>
      ))}
    </div>
  );
}

function RoundSheet({ round, holesError, onClose }: { round: ChLatestRound | null; holesError: boolean; onClose: () => void }) {
  const message = round ? rebuiltHref(`/golf/dashboard/messages?player=${round.playerId}`) : null;
  const recap = round ? roundHref(round.id, 'coach') : null;
  const stats = round ? rebuiltHref(`/golf/dashboard/stats?player=${round.playerId}`) : null;
  // The player peek's CoachHelm action, after Player stats (spec B §3).
  const helm = round ? coachHelmPlayerHref(round.playerId) : null;
  return (
    <Modal
      open={!!round}
      onClose={onClose}
      detent={0.74}
      title={round?.playerName ?? ''}
      description={round?.meta}
      footer={
        (message || recap || stats || helm) && (
          <>
            {message && (
              <Button leftIcon={MessageSquare} href={message}>
                Message
              </Button>
            )}
            {/* The board's "Round recap": the round's own review; the player's stats when it isn't rebuilt. */}
            {recap ? (
              <Button variant="primary" rightIcon={ArrowRight} href={recap}>
                Round recap
              </Button>
            ) : (
              stats && (
                <Button variant="primary" leftIcon={ChartColumn} href={stats}>
                  Player stats
                </Button>
              )
            )}
          </>
        )
      }
    >
      {round && (
        <div className={'ch-hm-sheet' + ' is-crh'}>
          <dl className="ch-hm-strip ch-well-soft">
            <div>
              <dt>Score</dt>
              <dd className="ch-num">
                {round.score} <span className={(round.toPar ?? 0) < 0 ? 'is-under' : undefined}>{formatToPar(round.toPar)}</span>
              </dd>
            </div>
            <div>
              <dt>GIR</dt>
              <dd className="ch-num">{round.gir ?? <NoData />}</dd>
            </div>
            <div>
              <dt>Putts</dt>
              <dd className="ch-num">{round.putts ?? <NoData />}</dd>
            </div>
            <div>
              <dt>SG</dt>
              <dd className={'ch-num' + (round.sg != null ? ` ${changeInk(round.sg)}` : '')}>{round.sg != null ? formatSigned(round.sg) : <NoData />}</dd>
            </div>
          </dl>
          {holesError ? (
            <p className="ch-hm-muted" data-ch-code="CH-2203">
              Hole-by-hole scores didn’t load for this round. The total is right.
            </p>
          ) : round.holes ? (
            <CrhScorecard holes={round.holes} />
          ) : (
            <p className="ch-hm-muted" data-ch-code="CH-2303">
              Posted as a total. Hole-by-hole scores weren’t recorded for this round.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
