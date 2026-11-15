'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dismissTournamentLink, linkTournamentRound } from '@/app/golf/actions/tournaments';
import { useAction } from '../../lib/use-action';
import { pluralWord } from '../../lib/plural';
import { useRefresh } from '../../lib/use-refresh';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { InlineNotice } from '../../ui/Notices';
import { Section } from '../../ui/Section';
import { Select } from '../../ui/Select';
import { EmptyState, SkelRows, Skeleton } from '../../ui/States';
import { formatToPar, tourDay } from './format';
import { CONFIDENCE_WORDS, openCandidates, roundOption, startingPick } from './link-model';
import { TourChip, TourCrumb, TourFailed, TourHead, TourLoading, TourMain, TourPhoneTop, tourGate, useTourPhone } from './parts';
import { useTourPaths } from './paths';
import type { ChTourLinkCandidate, ChTourLinksData, ChTourPlayer, LinkInboxProps } from './types';
import '../../styles/tournaments-review.css';

const TITLE_ID = 'ch-tour-links-title';
const LINE = 'GolfHelm rounds that look like tournament rounds. Link one and it counts in that event.';
const NONE = '';

/**
 * The round link inbox (plan 4.33, 5.12): GolfHelm rounds logged as tournament rounds, each with the event round it most
 * likely belongs to and how sure that match is, and the lineup players who have no round for a round that has started.
 * Coach only. Link writes `linkTournamentRound` (the same row the desk reads, so Fairway and Clubhouse agree) and "Not a
 * tournament round" writes `dismissTournamentLink`; neither changes the player's round itself (D-82). A row leaves the
 * list the moment its write lands. Bulk linking is not offered: two close matches are the coach's call.
 */
export function LinkInbox({ data, load, phone: forced }: LinkInboxProps) {
  const phone = useTourPhone(forced);
  return tourGate(load, {
    loading: () => (
      <TourLoading view="links" phone={phone} title="Link rounds" className="ch-tour-rev">
        <SkelRows rows={4} lead />
        <Skeleton width="100%" height={phone ? 120 : 96} radius={16} shape="solid" />
      </TourLoading>
    ),
    failed: () => <TourFailed view="links" phone={phone} id={TITLE_ID} eyebrow="Tournaments" title="Link rounds" className="ch-tour-rev" />,
    ready: () => <LinkInboxPage data={data} phone={phone} />,
  });
}

function LinkInboxPage({ data, phone }: { data: ChTourLinksData; phone: boolean }) {
  const paths = useTourPaths();
  const { refresh, refreshing } = useRefresh();
  // Rows that left in this session (linked or dismissed); the server re-read follows each write.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const leave = (roundId: string) => setGone((g) => new Set(g).add(roundId));
  const rows = useMemo(() => openCandidates(data.candidates, gone), [data.candidates, gone]);
  const player = (id: string) => data.players.find((p) => p.id === id);
  const eventName = (id: string) => data.events.find((e) => e.id === id)?.name ?? 'an event';

  return (
    <TourMain view="links" phone={phone} labelledBy={TITLE_ID} className={'ch-tour-rev ch-tour-links'}>
      <TourPhoneTop phone={phone} title="Link rounds" back={{ label: 'Tournaments', href: paths.home() }} />
      {/* The phone's back label already says Tournaments, as on New event (F-0054). */}
      <TourHead tightAlways id={TITLE_ID} phone={phone} crumb={phone ? undefined : <TourCrumb href={paths.home()} />} eyebrow={phone ? undefined : 'Tournaments'} title="Link rounds" line={LINE} />
      <div className="ch-tour-links-body">
        <Section id="ch-tour-links-rounds" title="Rounds to link" meta={data.errors.candidates ? undefined : `${rows.length} ${pluralWord(rows.length, 'round')}${data.dismissed ? ` · ${data.dismissed} dismissed` : ''}`}>
          {data.errors.candidates ? (
            <InlineNotice code="CH-16238" title="The rounds didn’t load" body="Nothing has changed. Try again." onRetry={refresh} retrying={refreshing} />
          ) : rows.length === 0 ? (
            <EmptyState compact kind="first-run" code="CH-16338" title="No rounds to link" body="A GolfHelm round logged as a tournament round shows here with the event it probably belongs to." />
          ) : (
            <ul className="ch-tour-links-list">
              {rows.map((c) => (
                <LinkRow key={c.roundId} candidate={c} player={player(c.playerId)} events={data.events} phone={phone} eventName={eventName} onDone={() => leave(c.roundId)} />
              ))}
            </ul>
          )}
        </Section>
        {data.missing.length > 0 && (
          <Section id="ch-tour-links-missing" title="Lineup players with no round" meta="A round has started and they have no score yet">
            <ul className="ch-tour-links-miss">
              {data.missing.map((m) => (
                <li key={`${m.eventId}:${m.roundNumber}:${m.playerId}`} className="ch-tour-links-miss__row">
                  <span>
                    {player(m.playerId)?.name ?? 'A player'} <span className="ch-tour-links-muted">· {eventName(m.eventId)} · R{m.roundNumber}</span>
                  </span>
                  <Button size="sm" href={paths.live(m.eventId)}>
                    Enter a score
                  </Button>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </TourMain>
  );
}

function LinkRow({
  candidate: c,
  player,
  events,
  phone,
  eventName,
  onDone,
}: {
  candidate: ChTourLinkCandidate;
  player: ChTourPlayer | undefined;
  events: ChTourLinksData['events'];
  phone: boolean;
  eventName: (id: string) => string;
  onDone: () => void;
}) {
  const router = useRouter();
  const start = startingPick(c, events);
  const [eventId, setEventId] = useState(start?.eventId ?? NONE);
  const [roundEventId, setRoundEventId] = useState(start?.roundEventId ?? NONE);
  const event = events.find((e) => e.id === eventId);
  const name = player?.first ?? 'the player';
  const conf = c.suggestion ? CONFIDENCE_WORDS[c.suggestion.confidence] : null;

  const link = useAction<[], null>(
    'tournaments.link',
    async () => {
      const res = await linkTournamentRound(roundEventId, c.playerId, c.roundId);
      if (res.success) {
        onDone();
        router.refresh();
      }
      return res;
    },
    () => ({ done: `Linked ${name}’s round to ${eventName(eventId)}`, failed: `Couldn’t link ${name}’s round`, hint: 'Nothing was changed. Try again.', code: 'CH-16038' }),
    (result, copy) => (result.success ? copy : { ...copy, hint: result.error ?? copy.hint }),
  );
  const dismiss = useAction<[], null>(
    'tournaments.dismissLink',
    async () => {
      const res = await dismissTournamentLink(c.roundId);
      if (res.success) {
        onDone();
        router.refresh();
      }
      return res;
    },
    () => ({ done: `${name}’s round won’t be suggested again`, failed: `Couldn’t dismiss ${name}’s round`, hint: 'Nothing was changed. Try again.', code: 'CH-16039' }),
    (result, copy) => (result.success ? copy : { ...copy, hint: result.error ?? copy.hint }),
  );
  const busy = link.pending || dismiss.pending;

  return (
    <li className={'ch-tour-links-row' + (phone ? ' is-phone' : '')} data-ch-link-round={c.roundId}>
      <div className="ch-tour-links-row__who">
        {!phone && <Avatar name={player?.name ?? 'Player'} size="sm" />}
        <div>
          <div className="ch-tour-links-row__n">{player?.name ?? 'A player'}</div>
          <div className="ch-tour-links-muted">
            {tourDay(c.date)}
            {c.courseName ? ` · ${c.courseName}` : ''} · <span className="ch-num">{c.score}</span> (<span className="ch-num">{formatToPar(c.toPar)}</span>)
          </div>
        </div>
      </div>
      <div className="ch-tour-links-row__pick">
        {conf && c.suggestion && (
          <div className="ch-tour-links-row__sug">
            <TourChip tone={c.suggestion.confidence === 'high' ? 'ok' : undefined}>{conf.label} match</TourChip>
            <span className="ch-tour-links-muted">{conf.why}</span>
          </div>
        )}
        <div className="ch-tour-links-row__sel">
          <Select
            label={`Event for ${name}’s round`}
            value={eventId}
            disabled={busy}
            onChange={(v) => {
              setEventId(v);
              setRoundEventId(NONE);
            }}
            options={[{ value: NONE, label: 'Pick an event' }, ...events.map((e) => ({ value: e.id, label: e.name }))]}
          />
          <Select
            label={`Round for ${name}’s round`}
            value={roundEventId}
            disabled={busy || !event}
            onChange={setRoundEventId}
            options={[{ value: NONE, label: event ? 'Pick a round' : 'Pick an event first' }, ...(event?.rounds ?? []).map((r) => ({ value: r.roundEventId, label: roundOption(r, (d) => tourDay(d)) }))]}
          />
        </div>
      </div>
      <div className="ch-tour-links-row__act">
        <Button variant="secondary" size="sm" busy={link.pending} disabled={!roundEventId || dismiss.pending} onClick={() => void link.run()}>
          Link round
        </Button>
        <Button variant="ghost" size="sm" busy={dismiss.pending} disabled={link.pending} onClick={() => void dismiss.run()}>
          Not a tournament round
        </Button>
      </div>
    </li>
  );
}
