'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveTournamentReflection } from '@/app/golf/actions/tournaments-player';
import { formatClock } from '../../lib/dates';
import { haptic } from '../../lib/haptics';
import { plural } from '../../lib/plural';
import { useAction } from '../../lib/use-action';
import { useRefresh } from '../../lib/use-refresh';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { FeatureCard, LedgerList, LedgerRow } from '../../ui/Ledger';
import { NoData } from '../../ui/NoData';
import { InlineNotice } from '../../ui/Notices';
import { Section } from '../../ui/Section';
import { SideScroll } from '../../ui/SideScroll';
import { EmptyState, SkelRows, Skeleton } from '../../ui/States';
import { TrustChip } from '../../ui/TrustChip';
import { daysUntil, inDays, teamToday, tourDay, tourDayTime, tourRange } from './format';
import { cardLine, HoleSheet } from './HoleSheet';
import { STATUS_WORDS } from './score-entry';
import { TourChip, TourCrumb, TourFailed, TourHead, TourLoading, TourMain, TourPhoneTop, ToPar, tourGate, useTourPhone } from './parts';
import { useTourPaths } from './paths';
import type { ChTourPlayerData, ChTourPlayerEvent, ChTourReveal, PlayerEventProps } from './types';
import '../../styles/tournaments-player.css';

const TITLE_ID = 'ch-tour-pl-title';
const REFLECTION_MAX = 4000;

/**
 * The player's Tournaments (plan 4.33, 5.11): the list of the season’s events, and one event with the days, tee times and
 * the player's own score for each round, what their coach shared with them, and their reflection. Players only. A player
 * reads their own rows (D-85): teammates’ scores, the team result and the lineup are the coach’s until the reveal opens to
 * players (held file 4, 20261024100300), so they are not drawn here, and the page says so where they would be. The one
 * write is the player's own reflection (`saveTournamentReflection`), which their coach reads in the event's review.
 */
export function PlayerEvent({ data, load, phone: forced }: PlayerEventProps) {
  const phone = useTourPhone(forced);
  const name = data.event ? data.event.event.name : 'Tournaments';
  return tourGate(load, {
    loading: () => (
      <TourLoading view="player" phone={phone} title={name} className="ch-tour-pl">
        {/* The list waits in its two columns (the next event's card, the results beside it); an event in its one. */}
        <div className={'ch-tour-pl-body' + (data.event ? '' : ' ch-tour-pl-body--list is-two')}>
          <Skeleton width="100%" height={phone ? 120 : data.event ? 140 : 196} radius={16} shape="solid" />
          <SkelRows rows={3} lead />
        </div>
      </TourLoading>
    ),
    failed: () => <TourFailed view="player" phone={phone} id={TITLE_ID} eyebrow={data.team.label} title={name} className="ch-tour-pl" />,
    ready: () => (data.event ? <EventPage data={data} ev={data.event} phone={phone} /> : <ListPage data={data} phone={phone} />),
  });
}

type ListRow = ChTourPlayerData['list'][number];

/** A round's first tee as a clock time, or null when none is set (a date-only start is stored as midnight UTC). */
function teeTime(firstTeeAt: string | null, timezone: string): string | null {
  return firstTeeAt && !/T00:00:00(\.000)?(\+00:00|Z)$/.test(firstTeeAt) ? formatClock(firstTeeAt, timezone) : null;
}

/** A line of short facts ("Oct 5 – 7 · Oakmont CC") that wraps between facts, never inside one and never onto a stray dot. */
function Bits({ items }: { items: ReadonlyArray<string | null | false | undefined> }) {
  const shown = items.filter((x): x is string => !!x);
  return (
    <span className="ch-tour-pl-bits">
      <span>
        {shown.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </span>
    </span>
  );
}

/**
 * The list, the coach's season home in the player's terms: the next event as the page's one green card (where, when, how
 * far off, each day with its first tee), the rest of the calendar under it, and the events played as the player's own
 * scores round by round. On a desktop the two stand side by side; a phone runs them in one column.
 */
function ListPage({ data, phone }: { data: ChTourPlayerData; phone: boolean }) {
  const paths = useTourPaths();
  const { refresh, refreshing } = useRefresh();
  const upcoming = data.list.filter((x) => x.status !== 'complete');
  const played = data.list.filter((x) => x.status === 'complete');
  const today = teamToday(data.now, data.team.timezone);
  const next = upcoming[0];
  const later = upcoming.slice(1);
  const card = next && <NextCard row={next} today={today} timezone={data.team.timezone} href={paths.player(next.eventId)} />;
  const rest = later.length > 0 && <LaterRows rows={later} today={today} href={paths.player} />;
  return (
    <TourMain view="player" phone={phone} labelledBy={TITLE_ID} className="ch-tour-pl">
      <TourPhoneTop phone={phone} title="Tournaments" />
      {/* No line under the title: each section's caption already says what it holds, in its own place. */}
      <TourHead tightAlways id={TITLE_ID} phone={phone} eyebrow={data.team.label} title="Tournaments" />
      {data.errors.events ? (
        <InlineNotice code="CH-16290" title="The events didn’t load" body="Nothing has changed. Try again." onRetry={refresh} retrying={refreshing} />
      ) : data.list.length === 0 ? (
        <EmptyState size="page" kind="first-run" code="CH-16390" title="No tournaments yet" body="When your coach sets up an event, it shows here with the days and your scores." />
      ) : (
        <div className={'ch-tour-pl-body ch-tour-pl-body--list' + (upcoming.length > 0 && played.length > 0 ? ' is-two' : '')}>
          {phone ? (
            // The phone's order (the coach's phone home): the card on the canvas, then each group in its own card.
            <>
              {card}
              {rest && (
                <Section id="ch-tour-pl-up" title="Coming up" meta={plural(later.length, 'event')}>
                  {rest}
                </Section>
              )}
            </>
          ) : (
            upcoming.length > 0 && (
              <Section id="ch-tour-pl-up" title="Up next" meta={`${plural(upcoming.length, 'event')} on the calendar`}>
                {card}
                {rest}
              </Section>
            )
          )}
          {played.length > 0 && (
            <Section id="ch-tour-pl-played" title="Played" meta={phone ? 'Your total, to par' : 'Your own scores, round by round'}>
              {phone ? <PlayedRows rows={played} href={paths.player} /> : <PlayedTable rows={played} href={paths.player} />}
            </Section>
          )}
        </div>
      )}
    </TourMain>
  );
}

/**
 * The next event (or the one being played): the kit's one green card, the whole of it the link to the event. It carries no
 * label of its own, so a screen reader reads what the card says: where, when, how far off, and each day's first tee.
 */
function NextCard({ row: x, today, timezone, href }: { row: ListRow; today: string; timezone: string; href: string }) {
  const live = x.status === 'live';
  const days = daysUntil(today, x.startDate);
  return (
    <FeatureCard
      className="ch-tour-pl-next"
      href={href}
      kicker={<Bits items={[tourRange(x.startDate, x.endDate), x.courseName]} />}
      chip={live ? 'Live now' : inDays(today, x.startDate)}
      soon={live || (days >= 0 && days <= 1)}
      title={
        <span className="ch-tour-pl-next__t">
          {x.name}
          <Icon icon={ChevronRight} size={18} />
        </span>
      }
      line={
        x.days.length === 0 ? (
          'Your coach hasn’t added the days yet.'
        ) : (
          <span className="ch-tour-pl-next__days">
            {x.days.map((d) => {
              const tee = teeTime(d.firstTeeAt, timezone);
              return (
                <span key={d.number} className="ch-tour-pl-next__day">
                  <b>Round {d.number}</b>
                  <span>{tourDay(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <span className="ch-num">{tee ? `First tee ${tee}` : 'Tee time not set'}</span>
                </span>
              );
            })}
          </span>
        )
      }
    />
  );
}

/** The rest of the calendar: the day over the month, the event, where and how far off; each row a link to its event. */
function LaterRows({ rows, today, href }: { rows: ChTourPlayerData['list']; today: string; href: (id: string) => string }) {
  return (
    <LedgerList label="Also coming up" className="ch-tour-pl-later">
      {rows.map((x) => (
        <LedgerRow
          key={x.eventId}
          href={href(x.eventId)}
          lead={
            <span className="ch-tour-pl-date" aria-hidden="true">
              <b className="ch-num">{tourDay(x.startDate, { day: 'numeric' })}</b>
              <span>{tourDay(x.startDate, { month: 'short' })}</span>
            </span>
          }
          title={x.name}
          meta={<Bits items={[tourRange(x.startDate, x.endDate), x.courseName, x.status === 'upcoming' && inDays(today, x.startDate)]} />}
          trail={x.status === 'live' ? <TrustChip state="live" /> : undefined}
        />
      ))}
    </LedgerList>
  );
}

/** The player's total and what it is against par, the to-par red only under par (D-42); a dash where no round of theirs is scored. */
function MyTotal({ mine }: { mine: ListRow['mine'] }) {
  if (!mine || mine.total == null) return <NoData label="No score" />;
  return (
    <>
      <span className="ch-num">{mine.total}</span> · <ToPar value={mine.toPar} />
    </>
  );
}

/** The events played on a phone (the ledger's phone row): the event and where, the player's total and to-par over their rounds. */
function PlayedRows({ rows, href }: { rows: ChTourPlayerData['list']; href: (id: string) => string }) {
  return (
    <ul className="ch-tour-pl-list">
      {rows.map((x) => (
        <li key={x.eventId}>
          <Link href={href(x.eventId)} className="ch-tour-pl-row">
            <span className="ch-tour-pl-row__t">
              <b>{x.name}</b>
              <Bits items={[tourRange(x.startDate, x.endDate), x.courseName]} />
            </span>
            <span className="ch-tour-pl-row__r">
              <b>
                <MyTotal mine={x.mine} />
              </b>
              {x.mine && <span className="ch-tour-pl-muted ch-num">{plural(x.mine.rounds, 'round')}</span>}
            </span>
            <Icon icon={ChevronRight} size={16} className="ch-tour-pl-row__go" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The events played on a desktop: a table of the player's own numbers on the reading sheet, as Roster's list is, a column
 * a round (as many as the longest event has), then the total and the to-par. The event's name is the row's one link.
 */
function PlayedTable({ rows, href }: { rows: ChTourPlayerData['list']; href: (id: string) => string }) {
  const rounds = Math.max(1, ...rows.map((x) => x.days.length));
  const cols = Array.from({ length: rounds }, (_, i) => i + 1);
  return (
    <SideScroll className="ch-tour-pl-res ch-sheet" role="table" aria-label="Events played" style={{ ['--ch-tour-pl-rounds' as string]: rounds }}>
      <div className="ch-tour-pl-res__row is-head" role="row">
        <span role="columnheader">Event</span>
        {cols.map((n) => (
          <span key={n} role="columnheader" className="is-r ch-num" aria-label={`Round ${n}`}>
            R{n}
          </span>
        ))}
        <span role="columnheader" className="is-r">
          Total
        </span>
        <span role="columnheader" className="is-r">
          To par
        </span>
        <span role="columnheader" className="ch-sr-only">
          Open
        </span>
      </div>
      {rows.map((x) => (
        <div key={x.eventId} className="ch-tour-pl-res__row" role="row">
          <span role="cell" className="ch-tour-pl-res__name">
            <Link href={href(x.eventId)} className="ch-tour-pl-res__open">
              {x.name}
            </Link>
            <Bits items={[tourRange(x.startDate, x.endDate), x.courseName]} />
          </span>
          {cols.map((n) => {
            const score = x.mine?.scores.find((r) => r.number === n)?.total;
            return (
              <span key={n} role="cell" className="is-r ch-num ch-tour-pl-res__n">
                {/* A column past this event's last round is blank; a round of theirs with no score is the dash. */}
                {n > x.days.length ? null : score != null ? score : <NoData label="No score" />}
              </span>
            );
          })}
          <span role="cell" className="is-r ch-num ch-tour-pl-res__tot">
            {x.mine?.total ?? <NoData label="No score" />}
          </span>
          <span role="cell" className="is-r ch-tour-pl-res__tot">
            {x.mine?.toPar != null ? <ToPar value={x.mine.toPar} /> : <NoData label="No score" />}
          </span>
          <span role="cell" className="ch-tour-pl-res__go" aria-hidden="true">
            <Icon icon={ChevronRight} size={15} />
          </span>
        </div>
      ))}
    </SideScroll>
  );
}

function EventPage({ data, ev, phone }: { data: ChTourPlayerData; ev: ChTourPlayerEvent; phone: boolean }) {
  const paths = useTourPaths();
  const e = ev.event;
  const courseNames = [...new Set(data.list.filter((x) => x.eventId === e.id).map((x) => x.courseName).filter(Boolean))];
  const started = e.rounds.some((r) => r.status !== 'upcoming');
  return (
    <TourMain view="player" phone={phone} labelledBy={TITLE_ID} className="ch-tour-pl">
      <TourPhoneTop phone={phone} title={e.short} back={{ label: 'Tournaments', href: paths.player() }} />
      <TourHead
        tightAlways
        id={TITLE_ID}
        phone={phone}
        crumb={phone ? undefined : <TourCrumb href={paths.player()} />}
        eyebrow={data.team.label}
        title={e.name}
        line={[tourRange(e.startDate, e.endDate), ...courseNames].join(' · ')}
        meta={
          <div className="ch-tour-pl-meta">
            <TrustChip state={e.trust === 'live' ? 'live' : e.trust === 'suspended' ? 'suspended' : e.trust === 'final' ? 'final' : e.trust === 'official' ? 'official' : 'upcoming'} />
          </div>
        }
      />
      <div className="ch-tour-pl-body">
        {data.errors.reveal ? <InlineNotice code="CH-16293" title="Your spot didn’t load" body="Nothing has changed. Try again in a moment." /> : <Lineup ev={ev} />}
        <Section id="ch-tour-pl-rounds" title="Your rounds" meta="Days, tee times and your own score">
          {e.rounds.length === 0 ? (
            <EmptyState compact kind="first-run" code="CH-16391" title="No rounds set yet" body="Your coach hasn’t added the days. They show here once they do." />
          ) : (
            <ul className="ch-tour-pl-rounds">
              {e.rounds.map((r) => {
                const mine = e.playerRounds.find((p) => p.roundEventId === r.roundEventId);
                return (
                  <li key={r.roundEventId} className="ch-tour-pl-round" data-ch-round={r.number}>
                    <div className="ch-tour-pl-round__t">
                      <b>Round {r.number}</b>
                      <span className="ch-tour-pl-muted">
                        {tourDay(r.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                        {teeTime(r.firstTeeAt, data.team.timezone) ? ` · first tee ${teeTime(r.firstTeeAt, data.team.timezone)}` : ''}
                      </span>
                    </div>
                    <div className="ch-tour-pl-round__v">
                      {mine && mine.status !== 'ok' ? (
                        <TourChip tone="warn">{STATUS_WORDS[mine.status]}</TourChip>
                      ) : mine?.total != null ? (
                        <span className="ch-num">
                          {mine.total} <ToPar value={mine.toPar} />
                        </span>
                      ) : (
                        <span className="ch-tour-pl-muted">{r.status === 'upcoming' ? 'Not played yet' : 'No score yet'}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
        {ev.card && <MyCard me={data.me} card={ev.card} />}
        {data.errors.notes ? (
          <InlineNotice code="CH-16291" title="Your coach’s notes didn’t load" body="Nothing has changed. Try again." />
        ) : (
          <Section id="ch-tour-pl-notes" title="From your coach" meta="Only what your coach chose to share with you">
            {ev.sharedNotes.length === 0 ? (
              <EmptyState compact kind="first-run" code="CH-16392" title="Nothing shared yet" body="A note your coach shares with you shows here." />
            ) : (
              <ul className="ch-tour-pl-notes">
                {ev.sharedNotes.map((n) => (
                  <li key={n.label} className="ch-tour-pl-note">
                    <b>{n.label}</b>
                    <p>{n.text}</p>
                    <span className="ch-tour-pl-muted">{n.author}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
        <Reflection ev={ev} started={started} error={!!data.errors.reflection} />
        <Section id="ch-tour-pl-results" title="Team results" meta="Where the team finished">
          <p className="ch-tour-pl-quiet" data-ch-code="CH-16393">
            {ev.results.reason === 'not_final' ? 'Team scores show here once every round is final.' : 'Your own scores are above. The team’s result is on your coach’s page for now.'}
          </p>
        </Section>
      </div>
    </TourMain>
  );
}

/** The player's own card for the round in play: hole by hole, on the same rows Fairway's round tracker keeps. */
function MyCard({ me, card }: { me: ChTourPlayerData['me']; card: NonNullable<ChTourPlayerEvent['card']> }) {
  const [open, setOpen] = useState(false);
  const line = cardLine(card.holes);
  return (
    <Section id="ch-tour-pl-card" title="Your card" meta={`Round ${card.roundNumber} is being played`}>
      <div className="ch-tour-pl-card" data-ch-card="">
        <span className="ch-tour-pl-muted">
          {line.thru === 0 ? 'Nothing scored yet.' : <>Through <span className="ch-num">{line.thru}</span> of <span className="ch-num">{card.holes.length}</span>{line.toPar != null && <> · <ToPar value={line.toPar} /></>}</>}
        </span>
        <Button variant="primary" onClick={() => setOpen(true)}>
          {line.thru === 0 ? 'Score your round' : line.thru >= card.holes.length ? 'Check your card' : 'Continue your card'}
        </Button>
      </div>
      {open && <HoleSheet key={card.roundEventId} open onClose={() => setOpen(false)} name={me.first} roundLabel={`round ${card.roundNumber}`} roundEventId={card.roundEventId} playerId={me.id} date={card.date} holes={card.holes} />}
    </Section>
  );
}

const COUNT_WORDS: Record<ChTourReveal['counting'][number]['state'], string> = {
  counted: 'Your score counted',
  dropped: 'Your score did not count',
  tie: 'Tied at the line',
  individual: 'Individual',
  none: 'No score',
  pending: 'Decided when the round is final',
  not_playing: 'Not playing',
};

const REVEAL_WORDS: Record<ChTourReveal['status'], string> = { lineup: 'You’re in the lineup', alternate: 'You’re the alternate', individual: 'You’re playing as an individual', not_travelling: 'You’re not travelling' };

/** Whether this player is playing: their spot when the reveal is open to them, else a plain line that it is not shown here. */
function Lineup({ ev }: { ev: ChTourPlayerEvent }) {
  const r = ev.reveal;
  return (
    <section className="ch-tour-pl-reveal" aria-label="Your spot" data-ch-reveal={r ? r.status : 'closed'}>
      {r ? (
        <>
          <b>{REVEAL_WORDS[r.status]}</b>
          <span className="ch-tour-pl-muted">
            {r.status === 'lineup' && r.slot != null ? `Spot ${r.slot} of ${r.of}` : ''}
            {r.lockedAt ? ` · locked ${tourDayTime(r.lockedAt)}` : ''}
          </span>
          {r.lineup.length > 0 && <span className="ch-tour-pl-muted">{r.lineup.join(', ')}</span>}
          {r.counting.some((c) => c.state !== 'not_playing') && (
            <ul className="ch-tour-pl-count" aria-label="Whether your score counted">
              {r.counting.map((c) => (
                <li key={c.roundNumber} data-ch-count-round={c.roundNumber} data-ch-count-state={c.state}>
                  <span className="ch-tour-pl-muted">Round {c.roundNumber}</span> <TourChip tone={c.state === 'counted' ? 'ok' : undefined}>{COUNT_WORDS[c.state]}</TourChip>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <b>{ev.event.lineup.publishedAt ? 'Your coach has published the lineup' : 'The lineup isn’t published yet'}</b>
          <span className="ch-tour-pl-muted">{ev.event.lineup.publishedAt ? 'Your spot isn’t shown here yet. Your coach will tell you where you play.' : 'Your coach will tell you where you play once it is.'}</span>
        </>
      )}
    </section>
  );
}

/** The player's reflection: one text, saved to the row their coach reads in the review. Writing opens once a round has started. */
function Reflection({ ev, started, error }: { ev: ChTourPlayerEvent; started: boolean; error: boolean }) {
  const router = useRouter();
  const saved = ev.reflection?.body ?? '';
  const [text, setText] = useState(saved);
  const [last, setLast] = useState(saved);
  const dirty = text.trim() !== last.trim();
  const save = useAction<[], unknown>(
    'tournaments.reflection',
    async () => {
      const res = await saveTournamentReflection(ev.event.id, text);
      if (res.success) {
        setLast(text.trim());
        setText(text.trim());
        haptic('success');
        router.refresh();
      }
      return res;
    },
    () => ({ done: 'Reflection saved', failed: 'Couldn’t save your reflection', hint: 'What you wrote is still here. Try again.', code: 'CH-16092' }),
    (result, c) => (result.success ? c : { ...c, hint: result.error ?? c.hint }),
  );
  return (
    <Section id="ch-tour-pl-reflect" title="Your reflection" meta="Your coach reads this in the event’s review">
      {error ? (
        <InlineNotice code="CH-16292" title="Your reflection didn’t load" body="Nothing has changed. Try again in a moment." />
      ) : !started ? (
        <p className="ch-tour-pl-quiet">You can write a reflection once the first round has started.</p>
      ) : (
        <form
          className="ch-tour-pl-reflect"
          noValidate
          onSubmit={(ev2) => {
            ev2.preventDefault();
            if (dirty && text.trim()) void save.run();
          }}
        >
          <label className="ch-field">
            <span className="ch-field__label">What went well, what cost strokes, what you will work on</span>
            <textarea className="ch-input ch-tour-pl-reflect__box" rows={5} maxLength={REFLECTION_MAX} value={text} onChange={(x) => setText(x.target.value)} />
          </label>
          <div className="ch-tour-pl-reflect__a">
            <span className="ch-tour-pl-muted">{ev.reflection?.updatedAt && !dirty ? 'Saved' : dirty ? 'Not saved yet' : ''}</span>
            <Button variant="primary" type="submit" busy={save.pending} disabled={!dirty || !text.trim()}>
              Save reflection
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}
