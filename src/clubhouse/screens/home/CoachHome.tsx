'use client';

import { CalendarPlus, ChevronRight, Flag, UserPlus } from 'lucide-react';
import Link from 'next/link';
import type { ChCoachHome } from '../../data/home';
import { Icon } from '../../ui/Icon';
import { useChPhone } from '../../lib/use-phone';
import { rebuiltHref } from '../../shell/nav';
import { PageRefreshNotice } from '../../ui/RefreshNotice';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { LatestRound } from './LatestRound';
import { HomePhone, WeekStrip } from './HomePhone';
import { coachFailedParts } from './model';
import { CoachQueue } from './CoachQueue';
import { ClassHomeLine } from './ClassHomeLine';
import { LiveNowCard } from './LiveNowCard';
import type { LiveSnapshot } from '../../live/model';
import { HomeActions } from './HomeActions';
import { DeskNext } from './PlayerHome';
import { TeamGame } from './TeamGame';
import { TeamScoring, TeamScoringFailed } from './TeamScoring';
import { Week } from './Week';
import { useHomeDayRollover } from './use-day-rollover';
import { ChangeMarksProvider } from '../../lib/use-change-marks';
import { NoTeam } from '../../ui/NoTeam';
import '../../styles/home.css';

/**
 * Coach Home, drawn as Player Home (lay-01, owner 15 Nov 2026: "I want the coach home page matching the players. Both
 * mobile and desktop."): the framed head on the canopy with Message team and New event, what is waiting on the coach,
 * then one continuous surface (the week beside the latest round, Up next leading it; Team scoring on the shared scoring
 * line under a hairline) and the team's game below it, as the player's own Home lays out the player's. The coach's
 * content stays the coach's: the team's events with their replies, the team's rounds, the team's figures.
 */
export function CoachHome(props: { data: ChCoachHome; /** Preview and tests: a frozen clock (ISO) for the phone's countdown. */ now?: string; live?: LiveSnapshot }) {
  return (
    <ChangeMarksProvider marks={props.data.marks ?? []}>
      <CoachHomeBody {...props} />
    </ChangeMarksProvider>
  );
}

function CoachHomeBody({ data, now, live }: { data: ChCoachHome; now?: string; live?: LiveSnapshot }) {
  const phone = useChPhone();
  // A page left open past the team's midnight reads itself again, so "today" is today (desktop and phone).
  useHomeDayRollover(data.clock, now !== undefined);
  if (isFirstRun(data)) return <HomeFirstRun data={data} phone={phone} now={now} />;
  if (phone) return <HomePhone data={data} now={now} live={live} />;
  // Two or more failed reads are told once under the head, with one Try again; each part keeps its title (CH-1209).
  const failed = coachFailedParts(data, true);
  const covered = failed.length > 1;
  const next = data.phone.next;
  return (
    <main className="ch-h-main ch-h-main--desk" data-canopy="">
      <DeskHead data={data} />
      <CoachQueue queue={data.queue} covered={covered} />
      <PageRefreshNotice parts={failed} />
      {data.teamId && data.clock && <ClassHomeLine teamId={data.teamId} today={data.clock.day} teamTimeZone={data.clock.tz} variant="desktop" />}
      {live && (
        <SectionBoundary surface="home.live" label="Live now">
          <div className="ch-lv-deskwrap">
            <LiveNowCard initial={live} phone={false} frozen={now !== undefined} now={now !== undefined ? Date.parse(now) : undefined} />
          </div>
        </SectionBoundary>
      )}
      {/* One continuous surface, as Player Home's: the week and the latest round, then Team scoring under a hairline. */}
      <div className="ch-h-flow ch-sheet">
        <div className="ch-h-sheet">
          <SectionBoundary surface="home.week" label="This week" code="CH-2205">
            {/* The team's events today carry their replies, for the Next row's reply line and Nudge. */}
            <Week week={data.week} events={data.phone.today} covered={covered} />
          </SectionBoundary>
          <SectionBoundary surface="home.latestRound" label="The latest round" code="CH-2206">
            <LatestRound data={data.latestRounds} lead={next ? <DeskNext e={next} frozen={now} /> : null} covered={covered} />
          </SectionBoundary>
        </div>
        {data.phone.form ? (
          <SectionBoundary surface="home.form" label="Team scoring" code="CH-2212">
            <TeamScoring form={data.phone.form} phone={false} />
          </SectionBoundary>
        ) : data.latestRounds.error ? (
          <TeamScoringFailed phone={false} covered={covered} />
        ) : null}
      </div>
      {data.phone.form && data.legs && (
        <SectionBoundary surface="home.legs" label="The team’s game" code="CH-2221">
          <TeamGame legs={data.legs} phone={false} covered={covered} />
        </SectionBoundary>
      )}
    </main>
  );
}

/** The framed head, as Player Home's: the day, the greeting, who needs a look, Message team and New event. */
function DeskHead({ data, title }: { data: ChCoachHome; title?: string }) {
  return (
    <header className="ch-h-head" data-canopy-head="">
      <span className="ch-h-head__date">{data.todayLabel}</span>
      <h1 className="ch-display">{title ?? data.greeting}</h1>
      {/* A count from the rounds, not AI output: no glyph (HOME-P-02). */}
      {!title && data.subline && <p className="ch-h-head__sub">{data.subline}</p>}
      <HomeActions teamChatId={data.teamChatId} />
    </header>
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

/** The three first steps, as the phone board and the desk's card both list them (06 11.2). */
function SetupRows({ roster }: { roster: string | null }) {
  return (
    <>
      {[
        { icon: UserPlus, title: 'Invite players', sub: 'They join with a link', href: roster ?? '/golf/dashboard/roster' },
        { icon: CalendarPlus, title: 'Add your season', sub: 'Practices, qualifiers and tournaments', href: '/golf/dashboard/calendar?new=1' },
        { icon: Flag, title: 'Post the first round', sub: 'Stats fill in from there', href: '/golf/dashboard/rounds' },
      ].map((r) => (
        <Link key={r.title} href={r.href} className="ch-hm-setup__r" data-ch-press="">
          <span className="ch-hm-setup__ic">
            <Icon icon={r.icon} size={18} />
          </span>
          <span>
            <b>{r.title}</b>
            <span>{r.sub}</span>
          </span>
          <Icon icon={ChevronRight} size={16} />
        </Link>
      ))}
    </>
  );
}

/**
 * The first run (gh-states.jsx, EMPTY.home.coach; D-71): the three first steps under the loaded page's own head, so a new
 * team's Home is the same page with less on it, drawn as Player Home is (lay-01). Once the calendar has something this
 * week it shows as it does on the loaded page: the week, and Up next leading it on a desk.
 */
function HomeFirstRun({ data, phone, now }: { data: ChCoachHome; phone: boolean; /** Preview and tests: the frozen clock (ISO). */ now?: string }) {
  // Opens Roster's invite sheet, not only the page (Roster reads `?invite=1` once).
  const roster = rebuiltHref('/golf/dashboard/roster?invite=1');
  const events = data.week.days.some((d) => d.eventCount > 0);
  const brief = events ? 'Add your players and this week fills in with who’s going.' : 'Set up your team and your first week shows here.';
  const setup = (
    <section className="ch-hm-setup" aria-labelledby="ch-hm-setup-t" data-ch-code="CH-2308">
      <h2 id="ch-hm-setup-t">Get your team set up</h2>
      <SetupRows roster={roster} />
    </section>
  );
  if (phone)
    return (
      <main className="ch-hm ch-hm--coach" aria-label="Home">
        <header className="ch-hm-hero">
          <span className="ch-hm-hero__date">{data.todayLabel}</span>
          <h1>Welcome to Clubhouse</h1>
          <p className="ch-hm-hero__brief">{brief}</p>
          <CoachQueue queue={data.queue} phone />
        </header>
        <div className="ch-hm-body">
          {events && <WeekStrip calendar days={data.week.days} note={data.phone.weekNote} />}
          {setup}
        </div>
      </main>
    );
  return (
    <main className="ch-h-main ch-h-main--desk ch-h-main--setup" data-canopy="">
      <header className="ch-h-head" data-canopy-head="">
        <span className="ch-h-head__date">{data.todayLabel}</span>
        <h1 className="ch-display">Welcome to Clubhouse</h1>
        <p className="ch-h-head__sub">{brief}</p>
      </header>
      {/* What is waiting on the coach (join requests above all) shows on the first run too. */}
      <CoachQueue queue={data.queue} />
      {events && (
        <div className="ch-h-sheet ch-sheet is-solo">
          <SectionBoundary surface="home.week" label="This week" code="CH-2205">
            <Week week={data.week} between={data.phone.next ? <DeskNext e={data.phone.next} frozen={now} /> : null} events={data.phone.today} />
          </SectionBoundary>
        </div>
      )}
      {setup}
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
