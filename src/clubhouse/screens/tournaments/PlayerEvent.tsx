'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveTournamentReflection } from '@/app/golf/actions/tournaments-player';
import { formatClock } from '../../lib/dates';
import { haptic } from '../../lib/haptics';
import { useAction } from '../../lib/use-action';
import { useRefresh } from '../../lib/use-refresh';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { Section } from '../../ui/Section';
import { EmptyState, SkelRows, Skeleton } from '../../ui/States';
import { TrustChip } from '../../ui/TrustChip';
import { inDays, tourDay, tourDayTime, tourRange } from './format';
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
        <Skeleton width="100%" height={phone ? 120 : 140} radius={16} shape="solid" />
        <SkelRows rows={3} lead />
      </TourLoading>
    ),
    failed: () => <TourFailed view="player" phone={phone} id={TITLE_ID} eyebrow={data.team.label} title={name} className="ch-tour-pl" />,
    ready: () => (data.event ? <EventPage data={data} ev={data.event} phone={phone} /> : <ListPage data={data} phone={phone} />),
  });
}

function ListPage({ data, phone }: { data: ChTourPlayerData; phone: boolean }) {
  const paths = useTourPaths();
  const { refresh, refreshing } = useRefresh();
  const upcoming = data.list.filter((x) => x.status !== 'complete');
  const played = data.list.filter((x) => x.status === 'complete');
  return (
    <TourMain view="player" phone={phone} labelledBy={TITLE_ID} className="ch-tour-pl">
      <TourPhoneTop phone={phone} title="Tournaments" />
      <TourHead tightAlways id={TITLE_ID} phone={phone} eyebrow={data.team.label} title="Tournaments" line="Your team’s events, with the days, the tee times and your own scores." />
      {data.errors.events ? (
        <InlineNotice code="CH-16290" title="The events didn’t load" body="Nothing has changed. Try again." onRetry={refresh} retrying={refreshing} />
      ) : data.list.length === 0 ? (
        <EmptyState size="page" kind="first-run" code="CH-16390" title="No tournaments yet" body="When your coach sets up an event, it shows here with the days and your scores." />
      ) : (
        <div className="ch-tour-pl-body">
          {upcoming.length > 0 && (
            <Section id="ch-tour-pl-up" title="Coming up" meta={`${upcoming.length} ${upcoming.length === 1 ? 'event' : 'events'}`}>
              <EventRows rows={upcoming} now={data.now} href={paths.player} />
            </Section>
          )}
          {played.length > 0 && (
            <Section id="ch-tour-pl-played" title="Played" meta="Your total over the rounds you played">
              <EventRows rows={played} now={data.now} href={paths.player} />
            </Section>
          )}
        </div>
      )}
    </TourMain>
  );
}

function EventRows({ rows, now, href }: { rows: ChTourPlayerData['list']; now: string; href: (id: string) => string }) {
  return (
    <ul className="ch-tour-pl-list">
      {rows.map((x) => (
        <li key={x.eventId}>
          <Link href={href(x.eventId)} className="ch-tour-pl-row">
            <span className="ch-tour-pl-row__t">
              <b>{x.name}</b>
              <span className="ch-tour-pl-muted">
                {tourRange(x.startDate, x.endDate)}
                {x.courseName ? ` · ${x.courseName}` : ''}
                {x.status === 'upcoming' ? ` · ${inDays(now, x.startDate)}` : ''}
              </span>
            </span>
            <span className="ch-tour-pl-row__r">
              {x.status === 'live' && <TrustChip state="live" />}
              {x.mine ? (
                <span className="ch-num ch-tour-pl-row__v">
                  {x.mine.total} <span className="ch-tour-pl-muted">in {x.mine.rounds} {x.mine.rounds === 1 ? 'round' : 'rounds'}</span>
                </span>
              ) : null}
              <Icon icon={ChevronRight} size={16} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
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
        <Lineup ev={ev} />
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
                        {r.firstTeeAt && !/T00:00:00(\.000)?(\+00:00|Z)$/.test(r.firstTeeAt) ? ` · first tee ${formatClock(r.firstTeeAt, data.team.timezone)}` : ''}
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
