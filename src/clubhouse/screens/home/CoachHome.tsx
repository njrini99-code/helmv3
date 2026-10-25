'use client';

import { CalendarPlus, UserPlus } from 'lucide-react';
import type { ChCoachHome } from '../../data/home';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { PageRefreshNotice } from '../../ui/RefreshNotice';
import { TeamForm } from './TeamForm';
import { useChPhone } from '../../lib/use-phone';
import { rebuiltHref } from '../../shell/nav';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Week } from './Week';
import { LatestRound } from './LatestRound';
import { Leaderboard } from './Leaderboard';
import { HomeActions } from './HomeActions';
import { HomePhone, WeekStrip } from './HomePhone';
import { coachFailedParts } from './model';
import { CoachQueue } from './CoachQueue';
import { ClassHomeLine } from './ClassHomeLine';
import { TeamLegs } from './TeamLegs';
import { useHomeDayRollover } from './use-day-rollover';
import { NoTeam } from '../../ui/NoTeam';
import '../../styles/home.css';

/**
 * Coach Home (handoff: Coach Home v3). The coach's day at a glance: the week
 * and the latest round in one lit sheet, then the season leaderboard. Calm
 * and not card-heavy (the owner rejected card grids and imagery).
 */
export function CoachHome({ data, now }: { data: ChCoachHome; /** Preview and tests: a frozen clock (ISO) for the phone's countdown. */ now?: string }) {
  const phone = useChPhone();
  // A page left open past the team's midnight reads itself again, so "today" is today (desktop and phone).
  useHomeDayRollover(data.clock, now !== undefined);
  if (isFirstRun(data)) return <HomeFirstRun data={data} phone={phone} />;
  if (phone) return <HomePhone data={data} now={now} />;
  // Two or more failed reads are told once under the head, with one Try again; each part keeps its title (CH-1209).
  const failed = coachFailedParts(data, false);
  const covered = failed.length > 1;
  // Players but no round yet: the leaderboard's line says so (CH-2305), so the latest round's pane steps aside. A
  // malformed read is left to its section's boundary (CH-2206), so this never throws above it.
  const noRounds = !data.latestRounds.error && Array.isArray(data.latestRounds.rounds) && data.latestRounds.rounds.length === 0 && !data.leaderboard.error && data.leaderboard.rosterSize > 0;
  return (
    <main className="ch-h-main ch-h-main--desk" data-canopy="">
      <header className="ch-h-head" data-canopy-head="">
        <span className="ch-h-head__date">{data.todayLabel}</span>
        <h1 className="ch-display">{data.greeting}</h1>
        {data.subline && <p className="ch-h-head__sub">{data.subline}</p>}
        {/* P-10: the class line, after the greeting and before the actions in the tab order. Nothing with the flag off. */}
        {data.teamId && data.clock && <ClassHomeLine teamId={data.teamId} today={data.clock.day} teamTimeZone={data.clock.tz} variant="desktop" />}
        <HomeActions teamChatId={data.teamChatId} />
      </header>
      <PageRefreshNotice parts={failed} />
      <CoachQueue queue={data.queue} covered={covered} />
      {/* Row 79: the day comes first. The week, with today's events, and the latest round sit under Waiting on you, above
          the two cards of figures; the team's game stays under the team's form (20105). */}
      <div className={'ch-h-sheet ch-sheet' + (noRounds ? ' is-solo' : '')}>
        <SectionBoundary surface="home.week" label="This week" code="CH-2205">
          <Week week={data.week} covered={covered} events={data.phone.today} />
        </SectionBoundary>
        {!noRounds && (
          <SectionBoundary surface="home.latestRound" label="The latest round" code="CH-2206">
            <LatestRound data={data.latestRounds} covered={covered} />
          </SectionBoundary>
        )}
      </div>
      {data.phone.form && <TeamForm form={data.phone.form} />}
      {data.phone.form && data.legs && !noRounds && (
        <SectionBoundary surface="home.legs" label="The team’s game" code="CH-2221">
          <TeamLegs legs={data.legs} covered={covered} />
        </SectionBoundary>
      )}
      <SectionBoundary surface="home.leaderboard" label="The leaderboard" code="CH-2207">
        <Leaderboard data={data.leaderboard} covered={covered} rounds={data.latestRounds.rounds} />
      </SectionBoundary>
    </main>
  );
}

/**
 * A team with nobody on it yet: no players, no rounds, and every read answered (a failed read is never taken for
 * "nothing yet"). It rests on the people, not the calendar, so adding the first event keeps Invite players in view.
 */
export function isFirstRun(data: ChCoachHome): boolean {
  return (
    !data.week.error &&
    !data.latestRounds.error &&
    !data.leaderboard.error &&
    data.leaderboard.rosterSize === 0 &&
    data.latestRounds.rounds.length === 0
  );
}

/**
 * The v2 first-run page empty state (gh-states.jsx, EMPTY.home.coach; D-71): the two first steps, under the same framed
 * head as the loaded page on desktop (states audit, 2026-10-08) and the Ledger's page intro on the phone (`--first`).
 * Once the calendar has something this week, the week sits above them.
 */
function HomeFirstRun({ data, phone }: { data: ChCoachHome; phone: boolean }) {
  // Opens Roster's invite sheet, not only the page (Roster reads `?invite=1` once).
  const roster = rebuiltHref('/golf/dashboard/roster?invite=1');
  const events = data.week.days.some((d) => d.eventCount > 0);
  return (
    <main className="ch-h-main ch-h-main--first" data-canopy="">
      <header className="ch-h-head" data-canopy-head="">
        <span className="ch-h-head__date">{data.todayLabel}</span>
        <h1 className="ch-display">{data.greeting}</h1>
      </header>
      {/* What is waiting on the coach (join requests above all) shows on the first run too. */}
      <CoachQueue queue={data.queue} phone={phone} />
      {events &&
        (phone ? (
          <WeekStrip days={data.week.days} note={data.phone.weekNote} />
        ) : (
          <div className="ch-h-sheet ch-sheet is-solo">
            <Week week={data.week} />
          </div>
        ))}
      <EmptyState
        size="page"
        code="CH-2308"
        shape="time"
        title="Your season starts here"
        body={`Add your players${events ? '' : ' and your first event'}. Home then fills itself in with replies, the rounds your players post and the leaderboard.`}
        action={
          roster ? (
            <Button variant="primary" leftIcon={UserPlus} href={roster}>
              Invite players
            </Button>
          ) : undefined
        }
        secondaryAction={
          <Button leftIcon={CalendarPlus} href="/golf/dashboard/calendar?new=1">
            New event
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
      <NoTeam code="CH-2307" coach body="Once your head coach adds you to the program, or you finish setting up your team, Home shows your week, rounds and leaderboard." />
    </main>
  );
}
