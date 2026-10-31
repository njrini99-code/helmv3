'use client';

import { useMemo } from 'react';
import { Flag, UserPlus, Users } from 'lucide-react';
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

function dayLead(iso: string) {
  return shortDay(iso);
}

function TeamRoundRow({ r, by }: { r: ChTeamRound; by: Group }) {
  const href = teamRoundsLinks.review(r.id);
  // The review is fetched whole as a finger lands on the row (A13), as the player's library does.
  const press = usePressPrefetch();
  const under = r.toPar != null && r.toPar < 0;
  const meta = (
    <>
      {by === 'month' && <span>{r.course}</span>}
      <span className="ch-trd-meta__tee">
        <TeeSwatch color={r.teeColor} />
        {r.tee ?? `${r.holes} holes`}
      </span>
      {r.tee && r.holes === 9 && <span className="ch-rd-pill is-nine">9 holes</span>}
      <TypePill type={r.type} />
      {!r.countable && <span className="ch-rd-pill is-nc">Not counted</span>}
    </>
  );
  return (
    <LedgerRow
      lead={dayLead(r.date)}
      title={by === 'month' ? r.player : r.course}
      meta={<span className="ch-trd-meta">{meta}</span>}
      trail={
        <span className={'ch-trd-score' + (under ? ' is-under' : '')}>
          <b>{r.toPar == null ? <NoData /> : formatToPar(r.toPar)}</b>
          <em>{r.score}</em>
        </span>
      }
      href={href ?? undefined}
      {...press(href)}
      // Opening a round is navigation, so it is silent (D-70, A14).
      onClick={href ? (e) => {
        // Only a same-tab open leaves the note (a new-tab click would leave a stale one for a later deep link), as the player library does.
        if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) noteOpenedFromLibrary(r.id);
      } : undefined}
      label={`${r.player}, ${shortDay(r.date)}, ${r.course}, ${r.score}${r.toPar != null ? ` (${formatToPar(r.toPar)})` : ''}`}
    />
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
  const s = data.season;
  const unscored = data.rounds.error ? 0 : (data.rounds.unscored ?? 0);
  const noRoster = !data.rosterError && data.players.length === 0;
  const nothing = !noRoster && !data.rosterError && !data.rounds.error && list.length === 0 && unscored === 0;
  const best = s.best;

  return (
    <main className={'ch-rd ch-trd' + (phone ? ' is-phone' : '')} aria-labelledby="ch-trd-title" aria-busy={refreshing || undefined} data-canopy={phone ? undefined : ''}>
      {phone && <PhoneTop start heading={false} title="Rounds" />}
      <header className="ch-rd-h" data-canopy-head={phone ? undefined : ''}>
        <div>
          <span className="ch-rd-k">
            {data.teamName ? `${data.teamName} · ` : ''}
            {s.rounds ? `Since August 1 · ${s.rounds} counted ${pluralWord(s.rounds, 'round')}` : 'Since August 1'}
          </span>
          <span className="ch-rd-upd" role="status" data-ch-code={refreshing ? 'CH-11412' : undefined}>
            {refreshing ? 'Updating…' : ''}
          </span>
          <LargeTitle id="ch-trd-title">Team rounds</LargeTitle>
        </div>
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
          <SectionBoundary surface="rounds.team.season" label="This season" code="CH-11203">
            <FigureRow
              label="The team this season"
              code="CH-11319"
              items={[
                { label: 'Rounds', value: s.rounds ? s.rounds : <NoData />, note: s.players ? `${plural(s.players, 'player')}` : undefined },
                { label: 'Average', value: s.avg == null ? <NoData /> : formatFixed(s.avg, 1), note: s.avg == null ? undefined : '18 holes' },
                { label: 'Under par', value: s.rounds ? s.underPar : <NoData />, tone: s.underPar ? 'under' : undefined, note: s.rounds ? `of ${s.rounds}` : undefined },
                { label: 'Low round', value: best ? best.score : <NoData />, note: best ? `${best.player.split(' ')[0]} · ${best.toPar == null ? shortDay(best.date) : formatToPar(best.toPar)}` : undefined },
              ]}
            />
          </SectionBoundary>

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
            ) : (
              groups.map((g) => {
                const full = g.rounds.filter((r) => r.holes === 18 && r.countable);
                const avg = full.length ? full.reduce((a, r) => a + r.score, 0) / full.length : null;
                const meta = (
                  <span className="ch-num">
                    {g.rounds.length} {pluralWord(g.rounds.length, 'round')}
                    {avg != null && ` · avg ${formatFixed(avg, 1)}`}
                  </span>
                );
                return (
                  <Section key={g.key} id={`ch-trd-${g.key.replace(/\W+/g, '-').toLowerCase()}`} title={g.title} meta={meta}>
                    <LedgerList label={`${g.title}, ${g.rounds.length} rounds`}>
                      {g.rounds.map((r) => (
                        <TeamRoundRow key={r.id} r={r} by={group} />
                      ))}
                    </LedgerList>
                  </Section>
                );
              })
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
