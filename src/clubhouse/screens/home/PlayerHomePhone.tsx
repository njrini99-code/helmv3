'use client';

import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Flag, MessageSquare, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import type { ChPlayerHome } from '../../data/player-home';
import type { ChPlayerLive } from '../../data/live-rounds';
import { Button } from '../../ui/Button';
import { FigureRow } from '../../ui/Ledger';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { Nine } from '../../ui/Nine';
import { PageRefreshNotice, RefreshNotice } from '../../ui/RefreshNotice';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { changeTone, formatSigned, formatToPar } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import { haptic } from '../../lib/haptics';
import { useNow } from '../../lib/use-now';
import { usePhoneHero } from '../../shell/phone-chrome';
import { CoachAsks, MineBadge } from './CoachAsks';
import { Today } from './HomePhone';
import { eventHref, nextLine } from './event-links';
import { TYPE_LABEL } from '../calendar/model';
import { Avatar } from '../../ui/Avatar';
import { useChClockText } from '../../lib/use-clock';
import { SinceYouLooked } from './DayCard';
import { noRoundsYet, playerFailedParts } from './model';
import { OwnLiveCard } from './OwnLiveCard';
import { TeammatesLiveCard } from './TeammatesLiveCard';
import { YourGameLead } from './PlayerGame';
import { messageCoachHref, MY_STATS, postRoundHref, roundHref } from './player-links';
import { GirViz, PuttsViz, SgViz } from './RoundViz';

/**
 * The player's phone Home (v2, design/handoff/Player - Home - Mobile.html,
 * m-player-home.jsx), in the Mobile clubhouse pass (owner, 2026-10-08): on the
 * parchment sheet, the day, the greeting, Up next with its countdown as the one
 * green feature card, and Message coach / Start a round, and what the coach is
 * waiting on (CoachAsks); then, flush under
 * engraved rules, the week with today's timeline, the latest round (paged, its
 * scorecard inline), scoring and the parts of the game. Same loader and
 * catalog as desktop.
 */
export function PlayerHomePhone({ data, now: frozen, live, playerId }: { data: ChPlayerHome; now?: string; /** The player's live round and their team's (P-6); omitted, the own card is not drawn. */ live?: ChPlayerLive; playerId?: string }) {
  usePhoneHero(true);
  const ticking = useNow();
  const now = useMemo(() => (frozen ? new Date(frozen) : ticking), [frozen, ticking]);
  const nothingAhead = !data.week.error && !data.next && data.week.days.every((d) => d.eventCount === 0);
  const post = postRoundHref();
  // Two or more failed reads are told once under the greeting, with one Try again; each part keeps its title (CH-1209).
  const failed = playerFailedParts(data);
  const covered = failed.length > 1;

  return (
    <main className="ch-hm ch-hm--player" aria-label="Home" data-ch-hero-flat="" data-ch-crh="on">
      <PlayerHeroTop data={data} now={now} playerId={playerId} />

      <div className="ch-hm-body">
        <PageRefreshNotice parts={failed} />
        {data.week.error && (
          <SectionBoundary surface="home.upNext" label="Up next" code="CH-2213">
            <RefreshNotice code="CH-2201" title="This week’s schedule didn’t load" body="Your events are safe. Try again." covered={covered} />
          </SectionBoundary>
        )}
        {live && playerId && (
          <SectionBoundary surface="home.live" label="Round in progress">
            <OwnLiveCard initial={live.snapshot} playerId={playerId} legs={live.legs} frozen={frozen !== undefined} now={frozen !== undefined ? Date.parse(frozen) : undefined} />
            <TeammatesLiveCard initial={live.snapshot} playerId={playerId} frozen={frozen !== undefined} now={frozen !== undefined ? Date.parse(frozen) : undefined} />
          </SectionBoundary>
        )}
        <SectionBoundary surface="home.game" label="Your game" code="CH-2217">
          <YourGameLead data={data} covered={covered} />
        </SectionBoundary>
        {/* Message coach the quiet key, New round the one primary (both tap lightly, D-70). */}
        <div className="ch-ph-acts">
          <Button size="lg" leftIcon={MessageSquare} href={messageCoachHref(data.coachUserId)} feel="press">
            Message coach
          </Button>
          {post && (
            <Button size="lg" variant="primary" leftIcon={Plus} href={post}>
              New round
            </Button>
          )}
        </div>
        <CoachAsks asks={data.asks} />
        {/* P-14: what the coach changed on the schedule since this device last looked (changes only; a player sees no teammate's rounds here). */}
        <SinceYouLooked rounds={[]} event={null} changes={data.changes ?? []} onOpenRound={() => {}} />
        {/* One schedule answer, never two: today's rows when there are any; nothing at all when something is next but not today
            (the greeting's line says what and when); and one quiet row when there is nothing scheduled. */}
        {!data.week.error && data.today.length > 0 && (
          <SectionBoundary surface="home.today" label="Today" code="CH-2214">
            <Today list={data.today} now={now} failed={false} quiet={nothingAhead} canPlan={false} />
          </SectionBoundary>
        )}
        {!data.week.error && !data.next && data.today.length === 0 && (
          <div className="ch-hm-empty" data-ch-code="CH-2309">
            <Icon icon={CalendarDays} size={20} />
            <span>
              <b>No events scheduled</b>
              <span>Your coach’s practices and events will show here.</span>
            </span>
          </div>
        )}
        {!noRoundsYet(data) && (
          <SectionBoundary surface="home.latestRound" label="Your latest round" code="CH-2206">
            <Latest data={data.latest} covered={covered} />
          </SectionBoundary>
        )}
      </div>
    </main>
  );
}

/**
 * S-HOMEGAME (stats-home 05/06): the flat green top is one row, the player's coin and the greeting over what is next
 * ("Practice at 3:30 PM · Lonnie Poole range"). The date line and the second, oversized greeting are gone; Up next lives in
 * that line, with the player's own reply beside it. Nothing next, or a schedule that didn't load: the greeting alone.
 */
function PlayerHeroTop({ data, now, playerId }: { data: ChPlayerHome; now: Date | null; playerId?: string }) {
  const clock = useChClockText();
  // The coin carries the first name's initial; a greeting with no name (the loader's firstName was empty) falls back to the whole line.
  const first = (data.greeting.includes(', ') ? data.greeting.slice(data.greeting.indexOf(', ') + 2).trim() : '') || data.greeting;
  const line = data.week.error || !data.next ? null : nextLine(data.next, now, TYPE_LABEL[data.next.type], clock);
  return (
    <header className="ch-shs-hero-top">
      <div className="ch-shs-who">
        <Avatar name={first} id={playerId} size="lg" />
        <div className="ch-shs-who__t">
          <h1>{data.greeting}</h1>
          {line && data.next && (
            <Link href={eventHref(data.next)} className="ch-shs-who__line">
              {line}
              <MineBadge mine={data.next.mine} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** The phone's first-run page (home-light-none): the same green top, and one empty card where the figures will be. */
export function PlayerFirstRunPhone({ data, now: frozen, own, children }: { data: ChPlayerHome; now?: string; own?: ReactNode; children: ReactNode }) {
  usePhoneHero(true);
  const ticking = useNow();
  const now = useMemo(() => (frozen ? new Date(frozen) : ticking), [frozen, ticking]);
  return (
    <main className="ch-hm ch-hm--player" aria-label="Home" data-ch-hero-flat="" data-ch-crh="on">
      <PlayerHeroTop data={data} now={now} />
      <div className="ch-hm-body">
        {own}
        {children}
      </div>
    </main>
  );
}

/** `changeTone`'s class as FigureRow's tone: a strokes gained that rounds to zero stays plain. */
const figureTone = (t: string) => (t === 'is-gain' ? 'gain' : t === 'is-loss' ? 'loss' : undefined);

/** Your latest round (board "Latest"): paged through the last three, the scorecard inline. */
function Latest({ data, covered }: { data: ChPlayerHome['latest']; covered: boolean }) {
  const [i, setI] = useState(0);
  const r = data.rounds[i];
  const go = (d: 1 | -1) => {
    haptic('select');
    setI((x) => (x + d + data.rounds.length) % data.rounds.length);
  };
  const [course, ...rest] = (r?.meta ?? '').split(' · ');
  return (
    <section className="ch-hm-sec" aria-labelledby="ch-ph-latest">
      <div className="ch-hm-sec__h ch-ph-sec__h">
        <h2 id="ch-ph-latest">Your latest round</h2>
        {data.rounds.length > 1 && (
          <span className="ch-ph-pg">
            {/* Keys: they shrink when pressed, as every button does (`data-ch-press`, CH-1606), and tint (home.css). */}
            <button type="button" aria-label="Previous round" onClick={() => go(-1)} data-ch-press="">
              <Icon icon={ChevronLeft} size={18} />
            </button>
            <span className="ch-num" aria-live="polite">
              {i + 1} of {data.rounds.length}
            </span>
            <button type="button" aria-label="Next round" onClick={() => go(1)} data-ch-press="">
              <Icon icon={ChevronRight} size={18} />
            </button>
          </span>
        )}
      </div>
      {data.error ? (
        <RefreshNotice code="CH-2202" title="Recent rounds didn’t load" body="Posted rounds are safe. Try again." covered={covered} />
      ) : !r ? (
        <EmptyState code="CH-2302" shape="rows" shapeCount={2} title="No rounds posted yet this season." body="Your newest 18-hole round appears here, hole by hole, as soon as you post it." />
      ) : (
        <div className="ch-ph-card">
          <div className="ch-ph-rd">
            <span className="ch-h-flag" aria-hidden="true">
              <Icon icon={Flag} size={16} />
            </span>
            <span className="ch-ph-rd__b">
              <b>{course}</b>
              <span>{rest.join(' · ')}</span>
            </span>
            <span className={'ch-hm-score ch-num' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>
              <b>{r.score}</b>
              <em>{formatToPar(r.toPar)}</em>
            </span>
          </div>
          {r.holes ? (
            <div className="ch-ph-nines ch-scoreboard">
              <Nine label="Out" holes={r.holes.filter((h) => h.n <= 9)} caption="Front nine" />
              <Nine label="In" holes={r.holes.filter((h) => h.n > 9)} caption="Back nine" />
            </div>
          ) : (
            <p className="ch-hm-muted" data-ch-code={data.holesError ? 'CH-2203' : 'CH-2303'}>
              {data.holesError ? 'Hole-by-hole scores didn’t load for this round. The total is right.' : 'Posted as a total. Hole-by-hole scores weren’t recorded for this round.'}
            </p>
          )}
          {/* The round's three figures between hairlines (the Ledger's FigureRow), each drawn under its value. */}
          <FigureRow
            items={[
              { label: 'GIR', value: r.gir ?? <NoData />, note: <GirViz gir={r.gir} /> },
              { label: 'Putts', value: r.putts ?? <NoData />, note: <PuttsViz putts={r.putts} /> },
              { label: 'SG', value: formatSigned(r.sg), tone: figureTone(changeTone(r.sg, false)), note: <SgViz sg={r.sg} /> },
            ]}
          />
          {/* The board's "Open recap": the round's own review; My stats when it isn't rebuilt. */}
          <Button variant="ghost" rightIcon={ArrowRight} href={roundHref(r.id, 'player') ?? MY_STATS} className="ch-ph-card__more ch-btn--flush-end">
            {roundHref(r.id, 'player') ? 'Open recap' : 'My stats'}
          </Button>
        </div>
      )}
    </section>
  );
}
