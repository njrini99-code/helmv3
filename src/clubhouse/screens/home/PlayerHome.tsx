'use client';

import { GraduationCap, MessageSquare, Plus } from 'lucide-react';
import Link from 'next/link';
import type { ChHomeEvent } from '../../data/home';
import type { ChPlayerHome } from '../../data/player-home';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { PageRefreshNotice } from '../../ui/RefreshNotice';
import { Icon } from '../../ui/Icon';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { useChPhone } from '../../lib/use-phone';
import { useChClock, useChClockText } from '../../lib/use-clock';
import { useNow } from '../../lib/use-now';
import { rebuiltHref } from '../../shell/nav';
import { LinkPending } from '../../shell/LinkPending';
import { TYPE_LABEL } from '../calendar/model';
import { TYPE_ICON } from '../calendar/views';
import { CoachAsks, MineBadge } from './CoachAsks';
import { Countdown } from './Countdown';
import { eventHref, whenLabel } from './HomePhone';
import { LatestRound } from './LatestRound';
import { noRoundsYet, playerFailedParts } from './model';
import { PlayerGame } from './PlayerGame';
import { NoRoundsYet, PlayerHomePhone } from './PlayerHomePhone';
import { Week } from './Week';
import { messageCoachHref, postRoundHref } from './player-links';
import { useHomeDayRollover } from './use-day-rollover';
import { ChangeMarksProvider } from '../../lib/use-change-marks';
import { MarkBadge, markSub, useRowMark } from '../calendar/change-note';
import { NoTeam } from '../../ui/NoTeam';
import '../../styles/home.css';

/**
 * Player Home (design/handoff/Player - Home.html): the day, a sentence from
 * the player's own rounds, Message coach and Start a round, and what the coach
 * is waiting on (CoachAsks); the week with Up
 * next and its countdown beside the latest round; then the player's scoring
 * and the four parts of the game. The phone is PlayerHomePhone (v2 board).
 */
export function PlayerHome(props: { data: ChPlayerHome; /** Preview and tests: a frozen clock (ISO). */ now?: string }) {
  return (
    <ChangeMarksProvider marks={props.data.marks ?? []}>
      <PlayerHomeBody {...props} />
    </ChangeMarksProvider>
  );
}

function PlayerHomeBody({ data, now }: { data: ChPlayerHome; now?: string }) {
  const phone = useChPhone();
  // A page left open past the team's midnight reads itself again, so "today" is today (desktop and phone).
  useHomeDayRollover(data.clock, now !== undefined);
  if (isPlayerFirstRun(data)) return <PlayerFirstRun data={data} />;
  if (phone) return <PlayerHomePhone data={data} now={now} />;
  const post = postRoundHref();
  // Two or more failed reads are told once under the head, with one Try again; each part keeps its title (CH-1209).
  const failed = playerFailedParts(data);
  const covered = failed.length > 1;
  if (noRoundsYet(data)) {
    // Events but no round yet: the week (Up next inside it) stays, and the welcome stands in for three empty blocks.
    return (
      <main className="ch-h-main ch-h-main--desk" data-canopy="">
        <DeskHead data={data} post={post} />
        <CoachAsks asks={data.asks} />
        <PageRefreshNotice parts={failed} />
        <div className="ch-h-sheet ch-sheet is-solo">
          <SectionBoundary surface="home.week" label="This week" code="CH-2205">
            <Week week={data.week} between={data.next ? <DeskNext e={data.next} frozen={now} /> : null} covered={covered} />
          </SectionBoundary>
        </div>
        <NoRoundsYet />
      </main>
    );
  }
  return (
    <main className="ch-h-main ch-h-main--desk" data-canopy="">
      <DeskHead data={data} post={post} />
      <CoachAsks asks={data.asks} />
      <PageRefreshNotice parts={failed} />
      {/* One continuous surface (owner, 2026-10-06): the week and the latest round, then Scoring under a hairline. */}
      <div className="ch-h-flow ch-sheet">
        <div className="ch-h-sheet">
          <SectionBoundary surface="home.week" label="This week" code="CH-2205">
            <Week week={data.week} covered={covered} />
          </SectionBoundary>
          <SectionBoundary surface="home.latestRound" label="Your latest round" code="CH-2206">
            <LatestRound data={data.latest} mine lead={data.next ? <DeskNext e={data.next} frozen={now} /> : null} covered={covered} />
          </SectionBoundary>
        </div>
        <SectionBoundary surface="home.game" label="Your scoring" code="CH-2217">
          <PlayerGame data={data} part="scoring" covered={covered} />
        </SectionBoundary>
      </div>
      <SectionBoundary surface="home.game" label="Your game" code="CH-2217">
        <PlayerGame data={data} part="legs" covered={covered} />
      </SectionBoundary>
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

/** Up next inside the week (Player - Home.html `pv-next`): type, when, where, and the countdown. */
function DeskNext({ e, frozen }: { e: ChHomeEvent; frozen?: string }) {
  const t = useChClockText();
  const clock = useChClock();
  // P-14: a changed event wears a badge in the kicker and its old value struck under the range, until Got it.
  const mark = useRowMark()(e);
  const was = mark && !mark.change.partial ? markSub(e.location, mark.change, clock, false) : null;
  const ticking = useNow();
  const now = frozen ? new Date(frozen) : ticking;
  const when = whenLabel(e, now);
  return (
    <Link href={eventHref(e)} className="ch-ph-next">
      <span className="ch-ph-next__k">
        <span>
          <Icon icon={TYPE_ICON[e.type]} size={13} />
          Up next · {TYPE_LABEL[e.type]}
          {mark && <MarkBadge change={mark.change} />}
        </span>
        <span className={'ch-num' + (when.soon ? ' is-soon' : '')}>{t(when.text)}</span>
      </span>
      <span className="ch-ph-next__t">{e.title}</span>
      <span className="ch-ph-next__m ch-num">{[t(e.rangeLabel), e.location].filter(Boolean).join(' · ')}</span>
      {was && <span className="ch-ph-next__m ch-num">{was}</span>}
      <MineBadge mine={e.mine} />
      {!e.allDay && <Countdown to={e.startIso} frozen={frozen} />}
      <LinkPending />
    </Link>
  );
}

/**
 * A player with nothing yet: no rounds, nothing on the calendar, and every read answered. With events and no round,
 * the loaded page keeps the week and shows the welcome in place of the rounds (NoRoundsYet).
 */
export function isPlayerFirstRun(data: ChPlayerHome): boolean {
  return noRoundsYet(data) && !data.week.error && !data.next && data.week.days.every((d) => d.eventCount === 0);
}

/** The v2 first-run page empty state (gh-states.jsx, EMPTY.home.player; D-71). */
function PlayerFirstRun({ data }: { data: ChPlayerHome }) {
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
