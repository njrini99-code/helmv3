'use client';

import { CalendarPlus, Flag, UserPlus, Users } from 'lucide-react';
import type { ChCoachHome } from '../../data/home';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { useChPhone } from '../../lib/use-phone';
import { rebuiltHref } from '../../shell/nav';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Week } from './Week';
import { LatestRound } from './LatestRound';
import { Leaderboard } from './Leaderboard';
import { HomeActions } from './HomeActions';
import { HomePhone } from './HomePhone';
import '../../styles/home.css';

/**
 * Coach Home (handoff: Coach Home v3). The coach's day at a glance: the week
 * and the latest round in one lit sheet, then the season leaderboard. Calm
 * and not card-heavy (the owner rejected card grids and imagery).
 */
export function CoachHome({ data, now }: { data: ChCoachHome; /** Preview and tests: a frozen clock (ISO) for the phone's countdown. */ now?: string }) {
  const phone = useChPhone();
  if (isFirstRun(data)) return <HomeFirstRun data={data} />;
  if (phone) return <HomePhone data={data} now={now} />;
  return (
    <main className="ch-h-main ch-h-main--desk">
      <header className="ch-h-head">
        <span className="ch-h-head__date">{data.todayLabel}</span>
        <h1 className="ch-display">{data.greeting}</h1>
        {data.subline && <p className="ch-h-head__sub">{data.subline}</p>}
        <HomeActions teamChatId={data.teamChatId} />
      </header>
      <div className="ch-h-sheet ch-sheet">
        <SectionBoundary surface="home.week" label="This week" code="CH-2205">
          <Week week={data.week} />
        </SectionBoundary>
        <SectionBoundary surface="home.latestRound" label="The latest round" code="CH-2206">
          <LatestRound data={data.latestRounds} />
        </SectionBoundary>
      </div>
      <SectionBoundary surface="home.leaderboard" label="The leaderboard" code="CH-2207">
        <Leaderboard data={data.leaderboard} />
      </SectionBoundary>
    </main>
  );
}

/**
 * A team with nothing yet: no players, no events this week, no rounds, and
 * every read answered (a failed read is never taken for "nothing yet").
 */
export function isFirstRun(data: ChCoachHome): boolean {
  return (
    !data.week.error &&
    !data.latestRounds.error &&
    !data.leaderboard.error &&
    data.leaderboard.rosterSize === 0 &&
    data.latestRounds.rounds.length === 0 &&
    data.week.days.every((d) => d.eventCount === 0) &&
    !data.phone.next
  );
}

/** The v2 first-run page empty state (gh-states.jsx, EMPTY.home.coach; D-71): the two first steps. */
function HomeFirstRun({ data }: { data: ChCoachHome }) {
  const roster = rebuiltHref('/golf/dashboard/roster');
  return (
    <main className="ch-h-main">
      <header className="ch-h-head">
        <span className="ch-h-head__date">{data.todayLabel}</span>
        <h1 className="ch-display">{data.greeting}</h1>
      </header>
      <EmptyState
        size="page"
        code="CH-2308"
        icon={Flag}
        title="Your season starts here"
        body="Add your players and your first event. Home fills in with replies, recent rounds and the leaderboard as the team plays."
        action={
          roster ? (
            <Button variant="primary" leftIcon={UserPlus} href={roster}>
              Invite players
            </Button>
          ) : undefined
        }
        secondaryAction={
          <Button leftIcon={CalendarPlus} href="/golf/dashboard/calendar?new=1">
            Add an event
          </Button>
        }
      />
    </main>
  );
}

/** A coach with no active team: nothing to summarise yet, and one clear next step. */
export function CoachHomeNoTeam() {
  return (
    <main className="ch-h-main">
      <EmptyState
        size="page"
        code="CH-2307"
        icon={Users}
        title="You aren't on a team yet"
        body="Once your head coach adds you to the program, or you finish setting up your team, Home shows your week, rounds and leaderboard."
      />
    </main>
  );
}
