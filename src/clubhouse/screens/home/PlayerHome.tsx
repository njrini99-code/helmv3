'use client';

import { GraduationCap, MessageSquare, Play, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import type { ChHomeEvent } from '../../data/home';
import type { ChPlayerHome } from '../../data/player-home';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { useChPhone } from '../../lib/use-phone';
import { useNow } from '../../lib/use-now';
import { rebuiltHref } from '../../shell/nav';
import { LinkPending } from '../../shell/LinkPending';
import { TYPE_LABEL } from '../calendar/model';
import { TYPE_ICON } from '../calendar/views';
import { Countdown } from './Countdown';
import { eventHref, whenLabel } from './HomePhone';
import { LatestRound } from './LatestRound';
import { PlayerGame } from './PlayerGame';
import { PlayerHomePhone } from './PlayerHomePhone';
import { Week } from './Week';
import { messageCoachHref, postRoundHref } from './player-links';
import '../../styles/home.css';

/**
 * Player Home (design/handoff/Player - Home.html): the day, a sentence from
 * the player's own rounds, Message coach and Post a round; the week with Up
 * next and its countdown beside the latest round; then the player's scoring
 * and the four parts of the game. The phone is PlayerHomePhone (v2 board).
 */
export function PlayerHome({ data, now }: { data: ChPlayerHome; /** Preview and tests: a frozen clock (ISO). */ now?: string }) {
  const phone = useChPhone();
  if (isPlayerFirstRun(data)) return <PlayerFirstRun data={data} />;
  if (phone) return <PlayerHomePhone data={data} now={now} />;
  const post = postRoundHref();
  return (
    <main className="ch-h-main ch-h-main--desk">
      <header className="ch-h-head">
        <span className="ch-h-head__date">{data.todayLabel}</span>
        <h1 className="ch-display">{data.greeting}</h1>
        {data.brief && <p className="ch-h-head__sub">{data.brief}</p>}
        <div className="ch-h-head__actions">
          <Button leftIcon={MessageSquare} href={messageCoachHref(data.coachUserId)}>
            Message coach
          </Button>
          {post && (
            <Button variant="primary" leftIcon={Plus} href={post}>
              Post a round
            </Button>
          )}
        </div>
      </header>
      <div className="ch-h-sheet ch-sheet">
        <SectionBoundary surface="home.week" label="This week" code="CH-2205">
          <Week week={data.week} between={data.next ? <DeskNext e={data.next} frozen={now} /> : null} />
        </SectionBoundary>
        <SectionBoundary surface="home.latestRound" label="Your latest round" code="CH-2206">
          <LatestRound data={data.latest} mine />
        </SectionBoundary>
      </div>
      <SectionBoundary surface="home.game" label="Your scoring" code="CH-2217">
        <PlayerGame data={data} />
      </SectionBoundary>
    </main>
  );
}

/** Up next inside the week (Player - Home.html `pv-next`): type, when, where, and the countdown. */
function DeskNext({ e, frozen }: { e: ChHomeEvent; frozen?: string }) {
  const ticking = useNow();
  const now = frozen ? new Date(frozen) : ticking;
  const when = whenLabel(e, now);
  return (
    <Link href={eventHref(e)} className="ch-ph-next">
      <span className="ch-ph-next__k">
        <span>
          <Icon icon={TYPE_ICON[e.type]} size={13} />
          Up next · {TYPE_LABEL[e.type]}
        </span>
        <span className={'ch-num' + (when.soon ? ' is-soon' : '')}>{when.text}</span>
      </span>
      <span className="ch-ph-next__t">{e.title}</span>
      <span className="ch-ph-next__m ch-num">{[e.rangeLabel, e.location].filter(Boolean).join(' · ')}</span>
      {!e.allDay && <Countdown to={e.startIso} frozen={frozen} />}
      <LinkPending />
    </Link>
  );
}

/** A player with nothing yet: no rounds, nothing on the calendar, and every read answered. */
export function isPlayerFirstRun(data: ChPlayerHome): boolean {
  return !data.week.error && !data.latest.error && !data.next && data.scoring.points.length === 0 && data.week.days.every((d) => d.eventCount === 0);
}

/** The v2 first-run page empty state (gh-states.jsx, EMPTY.home.player; D-71). */
function PlayerFirstRun({ data }: { data: ChPlayerHome }) {
  const start = postRoundHref();
  const classes = rebuiltHref('/golf/dashboard/classes', 'player');
  return (
    <main className="ch-h-main">
      <header className="ch-h-head">
        <span className="ch-h-head__date">{data.todayLabel}</span>
        <h1 className="ch-display">{data.greeting}</h1>
      </header>
      <EmptyState
        size="page"
        code="CH-2312"
        icon={Play}
        title="Welcome to the team"
        body="Post your first round to start your stats. Team updates and your schedule show up here too."
        action={
          start ? (
            <Button variant="primary" leftIcon={Play} href={start}>
              Start a round
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
  return (
    <main className="ch-h-main">
      <EmptyState
        size="page"
        code="CH-2313"
        icon={Users}
        title="You aren't on a team yet"
        body="Ask your coach for your team's code or an invite. Once you join, Home shows your week, your rounds and your stats."
      />
    </main>
  );
}
