'use client';

import { GraduationCap, MessageSquare, Plus } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { ChPlayerHome } from '../../data/player-home';
import type { ChPlayerLive } from '../../data/live-rounds';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { PageRefreshNotice, RefreshNotice } from '../../ui/RefreshNotice';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { useChPhone } from '../../lib/use-phone';
import { useNow } from '../../lib/use-now';
import { rebuiltHref } from '../../shell/nav';
import { CoachAsks } from './CoachAsks';
import { UpNextRow } from './HomePhone';
import { LatestRound } from './LatestRound';
import { noRoundsYet, playerFailedParts } from './model';
import { OwnLiveCard } from './OwnLiveCard';
import { TeammatesLiveCard } from './TeammatesLiveCard';
import { YourGameLead } from './PlayerGame';
import { PlayerHomePhone } from './PlayerHomePhone';
import { DeskToday } from './HomeDeskCrh';
import { messageCoachHref, postRoundHref } from './player-links';
import { useHomeDayRollover } from './use-day-rollover';
import { ChangeMarksProvider } from '../../lib/use-change-marks';
import { NoTeam } from '../../ui/NoTeam';
import '../../styles/home.css';

/**
 * Player Home (design/handoff/Player - Home.html): the day, a sentence from
 * the player's own rounds, Message coach and Start a round, and what the coach
 * is waiting on (CoachAsks); the week with Up
 * next and its countdown beside the latest round; then the player's scoring
 * and the four parts of the game. The phone is PlayerHomePhone (v2 board).
 */
export function PlayerHome(props: { data: ChPlayerHome; /** Preview and tests: a frozen clock (ISO). */ now?: string; /** The player's live round and their team's (P-6); omitted, the own card is not drawn. */ live?: ChPlayerLive; playerId?: string }) {
  return (
    <ChangeMarksProvider marks={props.data.marks ?? []}>
      <PlayerHomeBody {...props} />
    </ChangeMarksProvider>
  );
}

function PlayerHomeBody({ data, now, live, playerId }: { data: ChPlayerHome; now?: string; live?: ChPlayerLive; playerId?: string }) {
  const phone = useChPhone();
  const clockNow = useNow();
  const ticking = useMemo(() => (now ? new Date(now) : clockNow), [now, clockNow]);
  // A page left open past the team's midnight reads itself again, so "today" is today (desktop and phone).
  useHomeDayRollover(data.clock, now !== undefined);
  const own =
    live && playerId ? (
      <SectionBoundary surface="home.live" label="Round in progress">
        <div className="ch-lv-deskwrap">
          <OwnLiveCard initial={live.snapshot} playerId={playerId} legs={live.legs} frozen={now !== undefined} now={now !== undefined ? Date.parse(now) : undefined} />
          <TeammatesLiveCard initial={live.snapshot} playerId={playerId} frozen={now !== undefined} now={now !== undefined ? Date.parse(now) : undefined} />
        </div>
      </SectionBoundary>
    ) : null;
  if (isPlayerFirstRun(data)) return <PlayerFirstRun data={data} own={own} />;
  if (phone) return <PlayerHomePhone data={data} now={now} live={live} playerId={playerId} />;
  const post = postRoundHref();
  // Two or more failed reads are told once under the head, with one Try again; each part keeps its title (CH-1209).
  const failed = playerFailedParts(data);
  const covered = failed.length > 1;
  const todayRest = data.today.filter((e) => e.id !== data.next?.id);
  return (
    <main className="ch-h-main ch-h-main--desk" data-canopy="">
      <DeskHead data={data} post={post} />
      <CoachAsks asks={data.asks} />
      <PageRefreshNotice parts={failed} />
      {own}
      <div className="ch-ph-desk">
        <SectionBoundary surface="home.game" label="Your game" code="CH-2217">
          <YourGameLead data={data} covered={covered} />
        </SectionBoundary>
        <div className="ch-ph-desk__side">
          {data.next && (
            <SectionBoundary surface="home.upNext" label="Up next" code="CH-2213">
              <UpNextRow e={data.next} now={ticking} />
            </SectionBoundary>
          )}
          {data.week.error ? (
            // A failed schedule read says so, never "Nothing scheduled" (the phone and coach Home do the same).
            <RefreshNotice code="CH-2201" title="This week’s schedule didn’t load" body="Your events are safe. Try again." covered={covered} />
          ) : (
            todayRest.length > 0 && (
              <SectionBoundary surface="home.today" label="Today" code="CH-2214">
                <DeskToday events={todayRest} now={ticking} />
              </SectionBoundary>
            )
          )}
          <SectionBoundary surface="home.latestRound" label="Your latest round" code="CH-2206">
            <LatestRound data={data.latest} mine covered={covered} />
          </SectionBoundary>
        </div>
      </div>
    </main>
  );
}

/** The framed head: the day, the greeting, Message coach and Start a round. */
function DeskHead({ data, post }: { data: ChPlayerHome; post: string | null }) {
  return (
    <header className="ch-h-head" data-canopy-head="">
      <span className="ch-h-head__date">{data.todayLabel}</span>
      <h1 className="ch-display">{data.greeting}</h1>
      <div className="ch-h-head__actions">
        <Button leftIcon={MessageSquare} href={messageCoachHref(data.coachUserId)}>
          Message coach
        </Button>
        {post && (
          <Button variant="primary" leftIcon={Plus} href={post}>
            New round
          </Button>
        )}
      </div>
    </header>
  );
}

/**
 * A player with no round posted yet and every read answered gets the first-run page (the redesign's empty state), whether or not the
 * team has events: the week layout is for a player with rounds. A failed read is never taken for "new" (noRoundsYet, CH-2312).
 */
export function isPlayerFirstRun(data: ChPlayerHome): boolean {
  return noRoundsYet(data) && !data.week.error;
}

/** The v2 first-run page empty state (gh-states.jsx, EMPTY.home.player; D-71). */
function PlayerFirstRun({ data, own }: { data: ChPlayerHome; own?: ReactNode }) {
  const start = postRoundHref();
  const classes = rebuiltHref('/golf/dashboard/classes', 'player');
  return (
    // `--first`: the framed head on desktop, as the loaded page has (states audit, 2026-10-08), and the Ledger's page
    // intro on the phone (home.css "Player Home on the phone").
    <main className="ch-h-main ch-h-main--first" data-canopy="">
      <header className="ch-h-head" data-canopy-head="">
        <span className="ch-h-head__date">{data.todayLabel}</span>
        <h1 className="ch-display">{data.greeting}</h1>
      </header>
      {own}
      <EmptyState
        size="page"
        code="CH-2312"
        shape="rows"
        title="Welcome to the team"
        body="Your stats start with the first round you post. Your coach’s team updates and your schedule show up here too."
        action={
          start ? (
            <Button variant="primary" leftIcon={Plus} href={start}>
              New round
            </Button>
          ) : undefined
        }
        secondaryAction={
          classes ? (
            <Button leftIcon={GraduationCap} href={classes}>
              Add classes
            </Button>
          ) : undefined
        }
      />
    </main>
  );
}

/** A player on no active team: nothing to show yet, and how that changes. */
export function PlayerHomeNoTeam() {
  // Joining a team lives in Settings' Golf profile (CH-8302).
  return (
    <main className="ch-h-main">
      <NoTeam code="CH-2313" coach={false} body="Ask your coach for your team’s code or an invite. Once you join, Home shows your week, your rounds and your stats." />
    </main>
  );
}
