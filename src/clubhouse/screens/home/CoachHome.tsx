'use client';

import { DeskNext, DeskRounds } from './HomeDeskCrh';
import { CALENDAR } from './event-links';
import { CalendarPlus, ChevronRight, Flag, Sparkles, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import type { ChCoachHome } from '../../data/home';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { PageRefreshNotice } from '../../ui/RefreshNotice';
import { Icon } from '../../ui/Icon';
import { TeamForm } from './TeamForm';
import { useChPhone } from '../../lib/use-phone';
import { useNow } from '../../lib/use-now';
import { rebuiltHref } from '../../shell/nav';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Week } from './Week';
import { LatestRound } from './LatestRound';
import { Leaderboard } from './Leaderboard';
import { HomeActions } from './HomeActions';
import { CRH_PART_FAILED, CrhFailedCard, Form, HomePhone, Today, WeekStrip } from './HomePhone';
import { coachFailedParts } from './model';
import { CoachQueue } from './CoachQueue';
import { ClassHomeLine } from './ClassHomeLine';
import { LiveNowCard } from './LiveNowCard';
import type { LiveSnapshot } from '../../live/model';
import { TeamLegs, TeamLegsPhone } from './TeamLegs';
import { useHomeDayRollover } from './use-day-rollover';
import { ChangeMarksProvider } from '../../lib/use-change-marks';
import { NoTeam } from '../../ui/NoTeam';
import '../../styles/home.css';

/**
 * Coach Home (handoff: Coach Home v3). The coach's day at a glance: the week
 * and the latest round in one lit sheet, then the season leaderboard. Calm
 * and not card-heavy (the owner rejected card grids and imagery).
 */
export function CoachHome(props: { crh?: boolean; data: ChCoachHome; /** Preview and tests: a frozen clock (ISO) for the phone's countdown. */ now?: string; live?: LiveSnapshot }) {
  return (
    <ChangeMarksProvider marks={props.data.marks ?? []}>
      <CoachHomeBody {...props} />
    </ChangeMarksProvider>
  );
}

function CoachHomeBody({ data, now, live, crh = false }: { data: ChCoachHome; now?: string; live?: LiveSnapshot; crh?: boolean }) {
  const phone = useChPhone();
  const clockNow = useNow();
  const ticking = useMemo(() => (now ? new Date(now) : clockNow), [now, clockNow]);
  // A page left open past the team's midnight reads itself again, so "today" is today (desktop and phone).
  useHomeDayRollover(data.clock, now !== undefined);
  if (isFirstRun(data)) return <HomeFirstRun data={data} phone={phone} crh={crh} />;
  if (phone) return <HomePhone data={data} now={now} live={live} crh={crh} />;
  // Two or more failed reads are told once under the head, with one Try again; each part keeps its title (CH-1209).
  const failed = coachFailedParts(data, crh);
  const covered = failed.length > 1;
  // Up next is the hero's; Today lists the rest of the day, so one event isn't drawn twice.
  const todayRest = data.phone.today.filter((e) => e.id !== data.phone.next?.id);
  // Players but no round yet: the leaderboard's line says so (CH-2305), so the latest round's pane steps aside. A
  // malformed read is left to its section's boundary (CH-2206), so this never throws above it.
  const noRounds = !data.latestRounds.error && Array.isArray(data.latestRounds.rounds) && data.latestRounds.rounds.length === 0 && !data.leaderboard.error && data.leaderboard.rosterSize > 0;
  if (crh)
    return (
      <main className="ch-h-main ch-h-main--desk" data-ch-crh="on">
        <header className="ch-h-herocard">
          <div>
            <span className="ch-h-head__date">{data.todayLabel}</span>
            <h1 className="ch-display">{data.greeting}</h1>
            {(data.subline || failed.length > 0) && (
              <p className="ch-h-head__sub ch-dh-brief">
                <Icon icon={Sparkles} size={14} />
                {failed.length > 0 ? CRH_PART_FAILED : data.subline}
              </p>
            )}
            {data.teamId && data.clock && <ClassHomeLine teamId={data.teamId} today={data.clock.day} teamTimeZone={data.clock.tz} variant="desktop" />}
            <CoachQueue queue={data.queue} covered={covered} phone />
          </div>
          {data.phone.next && <DeskNext e={data.phone.next} now={now ? new Date(now) : null} />}
        </header>
        {live && (
          <SectionBoundary surface="home.live" label="Live now">
            <div className="ch-lv-deskwrap">
              <LiveNowCard initial={live} phone={false} frozen={now !== undefined} now={now !== undefined ? Date.parse(now) : undefined} />
            </div>
          </SectionBoundary>
        )}
        {/* The phone's design laid out wider: the day, then the team, then the rounds. Leaderboards live on Roster and Stats, the week on Calendar. */}
        <div className="ch-h-grid">
          {(data.week.error || todayRest.length > 0 || !data.phone.next) && (
            <SectionBoundary surface="home.today" label="Today" code="CH-2214">
              {data.week.error ? (
                <CrhFailedCard id="ch-dh-today-failed" title="Today" href={CALENDAR} link="Calendar" code="CH-2201" what="Today didn’t load" body="Your events are safe. Try again." />
              ) : (
                <Today card list={todayRest} now={ticking} failed={false} quiet={false} />
              )}
            </SectionBoundary>
          )}
          {data.phone.form ? (
            <SectionBoundary surface="home.form" label="Team scoring" code="CH-2212">
              <Form form={data.phone.form} crh />
            </SectionBoundary>
          ) : data.latestRounds.error ? (
            <CrhFailedCard id="ch-dh-form-failed" title="Team scoring" href={rebuiltHref('/golf/dashboard/stats') ?? '#'} link="Team stats" code="CH-2211" what="Scoring didn’t load" body="Your rounds are safe. Try again in a moment." />
          ) : null}
        </div>
        <div className="ch-h-grid">
          {data.phone.form && data.legs && !noRounds && (
            <SectionBoundary surface="home.legs" label="The team’s game" code="CH-2221">
              <TeamLegsPhone legs={data.legs} covered={covered} crh />
            </SectionBoundary>
          )}
          {!noRounds && !data.latestRounds.error && (
            <SectionBoundary surface="home.latestRound" label="The latest round" code="CH-2206">
              {data.latestRounds.rounds.length === 0 ? <LatestRound data={data.latestRounds} covered={covered} /> : <DeskRounds rounds={data.latestRounds.rounds} />}
            </SectionBoundary>
          )}
        </div>
      </main>
    );
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
      {live && (
        <SectionBoundary surface="home.live" label="Live now">
          <div className="ch-lv-deskwrap">
            <LiveNowCard initial={live} phone={false} frozen={now !== undefined} now={now !== undefined ? Date.parse(now) : undefined} />
          </div>
        </SectionBoundary>
      )}
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
function HomeFirstRun({ data, phone, crh = false }: { data: ChCoachHome; phone: boolean; crh?: boolean }) {
  // Opens Roster's invite sheet, not only the page (Roster reads `?invite=1` once).
  const roster = rebuiltHref('/golf/dashboard/roster?invite=1');
  const events = data.week.days.some((d) => d.eventCount > 0);
  if (phone && crh)
    return (
      <main className="ch-hm" aria-label="Home" data-ch-crh="on">
        <header className="ch-hm-hero">
          <span className="ch-hm-hero__date">{data.todayLabel}</span>
          <h1>Welcome to Clubhouse</h1>
          <p className="ch-hm-hero__brief">
            <Icon icon={Sparkles} size={14} />
            Set up your team and your first week shows here.
          </p>
        </header>
        <div className="ch-hm-body">
          <CoachQueue queue={data.queue} phone />
          {events && <WeekStrip days={data.week.days} note={data.phone.weekNote} />}
          <section className="ch-hm-setup" aria-labelledby="ch-hm-setup-t" data-ch-code="CH-2308">
            <h2 id="ch-hm-setup-t">Get your team set up</h2>
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
          </section>
        </div>
      </main>
    );
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
