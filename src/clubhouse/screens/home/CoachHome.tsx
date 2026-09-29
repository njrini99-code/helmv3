import { Users } from 'lucide-react';
import type { ChCoachHome } from '../../data/home';
import { EmptyState } from '../../ui/States';
import { Week } from './Week';
import { LatestRound } from './LatestRound';
import { Leaderboard } from './Leaderboard';
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
      </header>
      <div className="ch-h-sheet ch-sheet">
        <Week week={data.week} />
        <LatestRound data={data.latestRounds} />
      </div>
      <Leaderboard data={data.leaderboard} />
    </main>
  );
}

/** A coach with no active team: nothing to summarise yet, and one clear next step. */
export function CoachHomeNoTeam() {
  return (
    <main className="ch-h-main">
      <div className="ch-h-lb ch-sheet">
        <EmptyState
          icon={Users}
          title="You aren't on a team yet."
          body="Once your head coach adds you to the program, or you finish setting up your team, Home shows your week, rounds and leaderboard."
        />
      </div>
    </main>
  );
}
