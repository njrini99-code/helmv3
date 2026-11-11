'use client';

import { Fragment, useMemo, type MouseEvent } from 'react';
import Link from 'next/link';
import { ChevronRight, Flag, UserPlus, Users } from 'lucide-react';
import { countsTowardAverage } from '../../data/rounds-shape';
import type { ChTeamRound, ChTeamRounds } from '../../data/team-rounds-shape';
import { formatFixed, formatToPar } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import { useChSessionState } from '../../lib/session-state';
import { useLastGood } from '../../lib/use-last-good';
import { useChPhone } from '../../lib/use-phone';
import { useRefresh } from '../../lib/use-refresh';
import { PhoneTop } from '../../shell/phone-chrome';
import { rebuiltHref } from '../../shell/nav';
import { usePressPrefetch } from '../../shell/use-prefetch-tabs';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { FigureRow, LedgerList, LedgerRow } from '../../ui/Ledger';
import { InlineNotice } from '../../ui/Notices';
import { Button } from '../../ui/Button';
import { SearchField } from '../../ui/SearchField';
import { Section } from '../../ui/Section';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { EmptyState } from '../../ui/States';
import { monthLabel, shortDay, TeeSwatch, TypePill } from './parts';
import { noteOpenedFromLibrary } from './return-state';
import { plural, pluralWord } from '../../lib/plural';
import { LargeTitle } from '../../ui/LargeTitle';
import { LiveNowCard } from '../home/LiveNowCard';
import type { LiveSnapshot } from '../../live/model';

type Group = 'month' | 'player';

const ALL_PLAYERS = 'all';

/** Both reads landed: a list worth keeping while a later refresh of it fails (`useLastGood`). */
const landed = (d: ChTeamRounds) => !d.rounds.error && !d.rosterError;

/** A round's review opens only once its screen is rebuilt for the coach (nav.rebuiltHref), so no dead rows. */
export const teamRoundsLinks = {
  review: (id: string) => rebuiltHref(`/golf/dashboard/rounds/${id}`, 'coach'),
  stats: (playerId: string) => rebuiltHref(`/golf/dashboard/stats?player=${playerId}&tab=rounds`, 'coach'),
};

/** Rounds that match the search (player or course) and the player filter, grouped in display order: months newest first, or players A to Z. */
export function groupTeamRounds(list: readonly ChTeamRound[], by: Group, q: string, player: string): Array<{ key: string; title: string; rounds: ChTeamRound[] }> {
  const needle = q.trim().toLowerCase();
  const shown = list.filter((r) => (player === ALL_PLAYERS || r.playerId === player) && (!needle || r.player.toLowerCase().includes(needle) || r.course.toLowerCase().includes(needle)));
  // Players are keyed by id, so two with the same display name stay separate groups; the name is only the heading.
  const groups = new Map<string, { title: string; rounds: ChTeamRound[] }>();
  for (const r of shown) {
    const k = by === 'month' ? monthLabel(r.date) : r.playerId;
    const g = groups.get(k) ?? { title: by === 'month' ? k : r.player, rounds: [] };
    g.rounds.push(r);
    groups.set(k, g);
  }
  const out = [...groups].map(([key, g]) => ({ key, title: g.title, rounds: g.rounds }));
  return by === 'player' ? out.sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key)) : out;
}

/** What opening a round takes, for the phone row and the desktop table row alike. */
function useOpenRound(r: ChTeamRound) {
  const href = teamRoundsLinks.review(r.id);
  // The review is fetched whole as a finger lands on the row (A13), as the player's library does.
  const press = usePressPrefetch();
  return {
    href,
    press: press(href),
    // Opening a round is navigation, so it is silent (D-70, A14).
    onClick: href
      ? (e: MouseEvent<HTMLElement>) => {
          // Only a same-tab open leaves the note (a new-tab click would leave a stale one for a later deep link), as the player library does.
          if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) noteOpenedFromLibrary(r.id);
        }
      : undefined,
    label: `${r.player}, ${shortDay(r.date)}, ${r.course}, ${r.score}${r.toPar != null ? ` (${formatToPar(r.toPar)})` : ''}`,
  };
}

/** The tee a round was played from, or its length when no tee was recorded. */
function TeeCell({ r }: { r: ChTeamRound }) {
  return (
    <span className="ch-trd-meta__tee">
      <TeeSwatch color={r.teeColor} />
      {r.tee ?? `${r.holes} holes`}
    </span>
  );
}

/** The phone row: one structure for every round (name, the course, then the tee and what kind of round it was). */
function TeamRoundRow({ r, by }: { r: ChTeamRound; by: Group }) {
  const open = useOpenRound(r);
  const under = r.toPar != null && r.toPar < 0;
  return (
    <LedgerRow
      lead={shortDay(r.date)}
      title={by === 'month' ? r.player : r.course}
      meta={
        <span className="ch-trd-meta">
          {by === 'month' && <span className="ch-trd-meta__course">{r.course}</span>}
          <span className="ch-trd-meta__kind">
            <TeeCell r={r} />
            {r.tee && r.holes === 9 && <span className="ch-rd-pill is-nine">9 holes</span>}
            <TypePill type={r.type} />
            {!r.countable && <span className="ch-rd-pill is-nc">Not counted</span>}
          </span>
        </span>
      }
      trail={
        <span className={'ch-trd-score' + (under ? ' is-under' : '')}>
          <b>{r.toPar == null ? <NoData /> : formatToPar(r.toPar)}</b>
          <em>{r.score}</em>
        </span>
      }
      href={open.href ?? undefined}
      {...open.press}
      onClick={open.onClick}
      label={open.label}
    />
  );
}

type RoundGroup = ReturnType<typeof groupTeamRounds>[number];

/** A group's count and its average, as its heading's caption: the 18-hole countable rounds, practice left out, as the season's figures. */
function groupMeta(g: RoundGroup) {
  const full = g.rounds.filter((r) => r.holes === 18 && r.countable && countsTowardAverage(r));
  const avg = full.length ? full.reduce((a, r) => a + r.score, 0) / full.length : null;
  return (
    <span className="ch-num">
      {g.rounds.length} {pluralWord(g.rounds.length, 'round')}
      {avg != null && ` · avg ${formatFixed(avg, 1)}`}
    </span>
  );
}

const groupId = (g: RoundGroup) => `ch-trd-${g.key.replace(/\W+/g, '-').toLowerCase()}`;

/** The figures are this season's and the list runs further back, so the page says where the season ends: at the first month before it. */
const EARLIER = 'Before this season, not in the figures above';
function earlierStartsAt(groups: readonly RoundGroup[], by: Group, seasonStart: string): number {
  // Months run newest first, so the first one before the season is where the line goes; by player there is no such place.
  return by === 'month' ? groups.findIndex((g) => g.rounds[0] != null && g.rounds[0].date < seasonStart) : -1;
}

/** One round in the desktop table. The round's name cell holds the link, which covers the row. */
function TeamRoundTableRow({ r, by }: { r: ChTeamRound; by: Group }) {
  const open = useOpenRound(r);
  const under = r.toPar != null && r.toPar < 0;
  const name = by === 'month' ? r.player : r.course;
  const opener = open.href ? (
    <Link href={open.href} className="ch-trd-open" aria-label={open.label} onClick={open.onClick} {...open.press}>
      {name}
    </Link>
  ) : (
    <span className="ch-trd-open">{name}</span>
  );
  return (
    <div className={'ch-trd-tr' + (open.href ? ' is-link' : '')} role="row">
      <span role="cell" className="ch-trd-td--date ch-num">
        {shortDay(r.date)}
      </span>
      {by === 'month' ? (
        <span role="cell" className="ch-trd-td--who">
          <Avatar name={r.player} id={r.playerId} size="sm" />
          {opener}
        </span>
      ) : null}
      <span role="cell" className="ch-trd-td--course">
        {by === 'month' ? r.course : opener}
      </span>
      <span role="cell" className="ch-trd-td--tee">
        <TeeCell r={r} />
        {r.tee && r.holes === 9 && <span className="ch-rd-pill is-nine">9 holes</span>}
      </span>
      <span role="cell" className="ch-trd-td--type">
        {r.type ? <TypePill type={r.type} /> : <NoData />}
        {!r.countable && <span className="ch-rd-pill is-nc">Not counted</span>}
      </span>
      <span role="cell" className="r ch-num ch-trd-td--score">
        {r.score}
      </span>
      <span role="cell" className={'r ch-num ch-trd-td--par' + (under ? ' is-under' : '')}>
        {r.toPar == null ? <NoData /> : formatToPar(r.toPar)}
      </span>
      <span className="ch-trd-td--go" aria-hidden="true">
        {open.href && <Icon icon={ChevronRight} size={16} />}
      </span>
    </div>
  );
}

/**
 * The desktop book (design review, 10 Nov 2026: the phone's list stretched across the page left 700px of nothing
 * between a name and its score). One table in the pattern of the Roster table: a quiet label row, a band for each
 * month or player, and a row a round with every value in a cell under its header.
 */
function TeamRoundsTable({ groups, by, earlierAt }: { groups: RoundGroup[]; by: Group; earlierAt: number }) {
  return (
    <div className={'ch-trd-tbl' + (by === 'player' ? ' is-by-player' : '')} role="table" aria-label="Team rounds">
      <div role="rowgroup">
        <div className="ch-trd-tr ch-trd-tr--head" role="row">
          <span role="columnheader">Date</span>
          {by === 'month' && <span role="columnheader">Player</span>}
          <span role="columnheader">Course</span>
          <span role="columnheader" className="ch-trd-td--tee">
            Tees
          </span>
          <span role="columnheader">Type</span>
          <span role="columnheader" className="r">
            Score
          </span>
          <span role="columnheader" className="r">
            To par
          </span>
          <span aria-hidden="true" />
        </div>
      </div>
      {groups.map((g, i) => (
        <div key={g.key} role="rowgroup" aria-labelledby={`${groupId(g)}-t`}>
          {i === earlierAt && (
            <div className="ch-trd-earlier" role="row">
              <span role="cell" aria-colspan={by === 'month' ? 7 : 6}>
                {EARLIER}
              </span>
            </div>
          )}
          <div className="ch-trd-grp" role="row">
            <div role="cell" aria-colspan={by === 'month' ? 7 : 6} className="ch-trd-grp__c">
              {by === 'player' && g.rounds[0] && <Avatar name={g.title} id={g.rounds[0].playerId} size="sm" />}
              <h2 id={`${groupId(g)}-t`} className="ch-trd-grp__t">
                {g.title}
              </h2>
              <span className="ch-trd-grp__m">{groupMeta(g)}</span>
            </div>
          </div>
          {g.rounds.map((r) => (
            <TeamRoundTableRow key={r.id} r={r} by={by} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Team rounds (P011): the coach's list of every round the team has posted (Fairway's coach Rounds page; the v2 boards drew
 * a library for the player only, so this follows the Ledger kit and the player library's rules, not a board). Season
 * figures on top, then the rounds by month or by player, each opening its review. Search by player or course, or pick a
 * player.
 */
const inviteHref = rebuiltHref('/golf/dashboard/roster?invite=1');
const rosterHref = rebuiltHref('/golf/dashboard/roster');

export function TeamRounds({ data: fresh, teamId, live, liveNow }: { data: ChTeamRounds; teamId: string; live?: LiveSnapshot; liveNow?: number }) {
  const phone = useChPhone();
  const { refresh, refreshing } = useRefresh();
  // A refresh that fails keeps the list the coach was reading and says it may be out of date; a first load that fails is the error as it came.
  const { value: data, stale } = useLastGood(teamId, fresh, landed);
  // The search, the player and the grouping come back with the page when the coach returns from a round (shell session state).
  const [q, setQ] = useChSessionState('q', '');
  const [player, setPlayer] = useChSessionState<string>('player', ALL_PLAYERS);
  const [group, setGroup] = useChSessionState<Group>('group', 'month');

  const list = data.rounds.list;
  // A kept filter for a player who has left the team shows everyone rather than an empty list with no way to see why.
  const playerId = data.players.some((p) => p.id === player) ? player : ALL_PLAYERS;
  const groups = useMemo(() => groupTeamRounds(list, group, q, playerId), [list, group, q, playerId]);
  const earlierAt = earlierStartsAt(groups, group, data.seasonStart);
  const s = data.season;
  const unscored = data.rounds.error ? 0 : (data.rounds.unscored ?? 0);
  const noRoster = !data.rosterError && data.players.length === 0;
  const nothing = !noRoster && !data.rosterError && !data.rounds.error && list.length === 0 && unscored === 0;
  const best = s.best;
  const book = !data.rosterError && !data.rounds.error && !noRoster && !nothing;
  // The season's figures: under the title on the phone, beside it on desktop (design review, 10 Nov 2026: a strip as
  // wide as the page held four small figures in wide cells, under an empty band between two rules).
  const season = book && (
    <SectionBoundary surface="rounds.team.season" label="This season" code="CH-11203">
      <FigureRow
        label="The team this season"
        code="CH-11319"
        items={[
          // Practice is listed and counted, and left out of the three figures beside it, as Stats leaves it out; the captions say so.
          // A quarter of a phone holds one short caption a figure (the four share 358px on one line), so there the average alone says it.
          { label: 'Rounds', value: s.rounds ? s.rounds : <NoData />, note: s.players ? `${plural(s.players, 'player')}${s.practice && !phone ? ` · ${s.practice} practice` : ''}` : undefined },
          { label: 'Average', value: s.avg == null ? <NoData /> : formatFixed(s.avg, 1), note: s.avg == null ? undefined : !s.practice ? '18 holes' : phone ? 'no practice' : '18 holes, no practice' },
          { label: 'Under par', value: s.scored ? s.underPar : <NoData />, tone: s.underPar ? 'under' : undefined, note: s.scored ? `of ${s.scored}` : undefined },
          { label: 'Low round', value: best ? best.score : <NoData />, note: best ? `${best.player.split(' ')[0]} · ${best.toPar == null ? shortDay(best.date) : formatToPar(best.toPar)}` : undefined },
        ]}
      />
    </SectionBoundary>
  );

  return (
    <main className={'ch-rd ch-trd' + (phone ? ' is-phone' : '')} aria-labelledby="ch-trd-title" aria-busy={refreshing || undefined} data-canopy={phone ? undefined : ''}>
      {phone && <PhoneTop start heading={false} title="Rounds" />}
      <header className="ch-rd-h" data-canopy-head={phone ? undefined : 'tight'}>
        <div>
          <span className="ch-rd-k">
            {data.teamName ? `${data.teamName} · ` : ''}
            {s.scored ? `Since August 1 · ${s.scored} counted ${pluralWord(s.scored, 'round')}` : 'Since August 1'}
          </span>
          <span className="ch-rd-upd" role="status" data-ch-code={refreshing ? 'CH-11412' : undefined}>
            {refreshing ? 'Updating…' : ''}
          </span>
          <LargeTitle id="ch-trd-title">Team rounds</LargeTitle>
        </div>
        {!phone && season}
      </header>

      {stale && <InlineNotice code="CH-11219" title="The team’s rounds may be out of date" body="We couldn’t refresh them just now. This is what loaded last time." onRetry={refresh} retrying={refreshing} />}

      {/* "Live now" (P-6, CH-16630): who is out, above the book. It is its own read, so a failed one leaves the band out and the page whole. */}
      {live && (
        <SectionBoundary surface="rounds.team.live" label="Live now" code="CH-16630">
          <LiveNowCard variant="band" initial={live} phone={phone} now={liveNow} frozen={liveNow != null} />
        </SectionBoundary>
      )}

      {data.rosterError ? (
        <InlineNotice code="CH-11220" title="Your roster didn’t load" body="Nothing is lost. The team’s rounds are still saved; try again in a moment." onRetry={refresh} retrying={refreshing} />
      ) : data.rounds.error ? (
        <InlineNotice code="CH-11221" title="The team’s rounds didn’t load" body="Nothing is lost. Posted rounds are still saved; try again in a moment." onRetry={refresh} retrying={refreshing} />
      ) : noRoster ? (
        <EmptyState
          size="page"
          code="CH-11317"
          icon={Users}
          title="No players on the team yet"
          body="Rounds your players post show up here once they join the roster."
          // The next step, as Home's empty team offers (F-0030).
          action={
            inviteHref ? (
              <Button variant="primary" leftIcon={UserPlus} href={inviteHref}>
                Invite players
              </Button>
            ) : undefined
          }
        />
      ) : nothing ? (
        <EmptyState
          size="page"
          code="CH-11320"
          icon={Flag}
          title="No rounds yet"
          body="Every round your players post shows up here, newest first."
          action={
            rosterHref ? (
              <Button variant="secondary" href={rosterHref}>
                Open roster
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {phone && season}

          <SectionBoundary surface="rounds.team.book" label="Team rounds" code="CH-11203">
            <div className="ch-rd-tools">
              <SearchField value={q} onChange={setQ} placeholder="Search player or course…" label="Search rounds by player or course" />
              <Select<string>
                label="Show rounds for"
                value={playerId}
                onChange={setPlayer}
                options={[{ value: ALL_PLAYERS, label: 'All players' }, ...data.players.map((p) => ({ value: p.id, label: p.name }))]}
              />
              <Segmented
                redraws
                label="Group rounds"
                size="sm"
                value={group}
                onChange={setGroup}
                options={[
                  { value: 'month', label: 'By month' },
                  { value: 'player', label: 'By player' },
                ]}
              />
            </div>
            {groups.length === 0 ? (
              <EmptyState code="CH-11321" compact title={q.trim() ? `No rounds for “${q.trim()}”` : 'No rounds for this player'} body={q.trim() ? 'Check the spelling, or search part of a name or course.' : 'They haven’t posted a round yet.'} />
            ) : phone ? (
              groups.map((g, i) => (
                <Fragment key={g.key}>
                  {i === earlierAt && <p className="ch-trd-earlier">{EARLIER}</p>}
                  <Section id={groupId(g)} title={g.title} meta={groupMeta(g)}>
                    <LedgerList label={`${g.title}, ${g.rounds.length} rounds`}>
                      {g.rounds.map((r) => (
                        <TeamRoundRow key={r.id} r={r} by={group} />
                      ))}
                    </LedgerList>
                  </Section>
                </Fragment>
              ))
            ) : (
              <TeamRoundsTable groups={groups} by={group} earlierAt={earlierAt} />
            )}
          </SectionBoundary>

          {unscored > 0 && (
            <p className="ch-rd-unscored" data-ch-code="CH-11322">
              {unscored === 1 ? '1 posted round has no score recorded, so it isn’t listed here.' : `${unscored} posted rounds have no score recorded, so they aren’t listed here.`}
            </p>
          )}
        </>
      )}
    </main>
  );
}
