import { Users } from 'lucide-react';
import type { ChCoachHome } from '../../data/home';
import { EmptyState } from '../../ui/States';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Week } from './Week';
import { LatestRound } from './LatestRound';
import { Leaderboard } from './Leaderboard';
import { HomeActions } from './HomeActions';
import '../../styles/home.css';

/**
 * Coach Home (handoff: Coach Home v3). The coach's day at a glance: the week
 * and the latest round in one lit sheet, then the season leaderboard. Calm
 * and not card-heavy (the owner rejected card grids and imagery).
 */
export function CoachHome({ data }: { data: ChCoachHome }) {
  return (
    <main className="ch-h-main">
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
