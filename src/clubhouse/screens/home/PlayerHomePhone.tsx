'use client';

import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Flag, GraduationCap, MessageSquare, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { rebuiltHref } from '../../shell/nav';
import { CoachAsks } from './CoachAsks';
import { Countdown } from './Countdown';
import { Today, UpNext, WeekStrip } from './HomePhone';
import { SinceYouLooked } from './DayCard';
import { noRoundsYet, playerFailedParts } from './model';
import { OwnLiveCard } from './OwnLiveCard';
import { TeammatesLiveCard } from './TeammatesLiveCard';
import { PlayerGame } from './PlayerGame';
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
    <main className="ch-hm ch-hm--player" aria-label="Home">
      {/* Owner, 2026-10-06: the CoachHelm brief no longer sits between the greeting and Up next on the player's phone. */}
      <header className="ch-hm-hero is-player">
        <span className="ch-hm-hero__date">{data.todayLabel}</span>
        <h1>{data.greeting}</h1>
        <PageRefreshNotice parts={failed} />
        <SectionBoundary surface="home.upNext" label="Up next" code="CH-2213">
          {data.week.error ? (
            // On the sheet, not in the green card: inside it the notice took the card's ivory ink and its words vanished.
            <RefreshNotice code="CH-2201" title="This week’s schedule didn’t load" body="Your events are safe. Try again." covered={covered} />
          ) : data.next ? (
            <UpNext e={data.next} now={now} kicker="Up next">
              {!data.next.allDay && <Countdown to={data.next.startIso} frozen={frozen} />}
            </UpNext>
          ) : (
            <div className="ch-hm-next is-static" data-ch-code="CH-2309">
              <span className="ch-hm-next__k">
                <span className="ch-hm-next__type">
                  <Icon icon={CalendarDays} size={13} />
                  Up next
                </span>
              </span>
              <div className="ch-hm-none">
                <span className="ch-hm-none__ic">
                  <Icon icon={CalendarDays} size={22} />
                </span>
                <span>
                  <h2>No events scheduled</h2>
                  <p>Your coach’s practices and events will show here with a countdown.</p>
                </span>
              </div>
            </div>
          )}
        </SectionBoundary>
        {/* On the parchment the hero's two keys are the shared buttons: Start a round the one primary, Message coach
            the quiet one beside it (both tap lightly, D-70). */}
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
      </header>

      <div className="ch-hm-body">
        {live && playerId && (
          <SectionBoundary surface="home.live" label="Round in progress">
            <OwnLiveCard initial={live.snapshot} playerId={playerId} legs={live.legs} frozen={frozen !== undefined} now={frozen !== undefined ? Date.parse(frozen) : undefined} />
            <TeammatesLiveCard initial={live.snapshot} playerId={playerId} frozen={frozen !== undefined} now={frozen !== undefined ? Date.parse(frozen) : undefined} />
          </SectionBoundary>
        )}
        {/* P-14: what the coach changed on the schedule since this device last looked (changes only; a player sees no teammate's rounds here). */}
        <SinceYouLooked rounds={[]} event={null} changes={data.changes ?? []} onOpenRound={() => {}} />
        {!data.week.error && !nothingAhead ? (
          <SectionBoundary surface="home.week" label="This week" code="CH-2205">
            {/* The board's Today is a small label inside This week, not a section of its own. */}
            <WeekStrip days={data.week.days} note={data.weekNote}>
              <SectionBoundary surface="home.today" label="Today" code="CH-2214">
                <Today inline list={data.today} now={now} failed={false} quiet={false} canPlan={false} />
              </SectionBoundary>
            </WeekStrip>
          </SectionBoundary>
        ) : (
          <SectionBoundary surface="home.today" label="Today" code="CH-2214">
            <Today list={data.today} now={now} failed={data.week.error} quiet={nothingAhead} canPlan={false} />
          </SectionBoundary>
        )}
        {noRoundsYet(data) ? (
          <NoRoundsYet />
        ) : (
          <>
            <SectionBoundary surface="home.latestRound" label="Your latest round" code="CH-2206">
              <Latest data={data.latest} covered={covered} />
            </SectionBoundary>
            <SectionBoundary surface="home.game" label="Your scoring" code="CH-2217">
              <PlayerGame data={data} phone covered={covered} />
            </SectionBoundary>
          </>
        )}
      </div>
    </main>
  );
}

/**
 * CH-2312 inside the loaded page (desktop and phone): the team has events but the player has no round yet, so one
 * welcome stands in for the latest round, scoring and the game. Start a round is the head's; Add classes stays.
 */
export function NoRoundsYet() {
  const classes = rebuiltHref('/golf/dashboard/classes', 'player');
  return (
    <EmptyState
      size="page"
      code="CH-2312"
      shape="rows"
      title="Welcome to the team"
      body="Your stats start with the first round you post. Your latest round, scoring line and game fill in here."
      secondaryAction={
        classes ? (
          <Button leftIcon={GraduationCap} href={classes}>
            Add classes
          </Button>
        ) : undefined
      }
    />
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
