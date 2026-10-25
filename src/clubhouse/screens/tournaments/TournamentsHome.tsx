'use client';

import { ArrowRight, CalendarPlus, ChevronDown, ClipboardCheck, GitCompare, Plus, Radio, Send, Trophy, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { todayIsoInZone } from '@/lib/golf/timezone';
import { Icon } from '../../ui/Icon';
import { useArrivals, useSeasonHomeLive } from './live';
import type { ChTourSetupGroup } from './setup-groups';
import { Button } from '../../ui/Button';
import { FeatureCard, LedgerList, LedgerRow } from '../../ui/Ledger';
import { InlineNotice } from '../../ui/Notices';
import { Section } from '../../ui/Section';
import { EmptyState, SkelRows, Skeleton } from '../../ui/States';
import { useRefresh } from '../../lib/use-refresh';
import { countLabel, countsEachRound, holesLabel, inDays, daysUntil, NO_DATA, plural, playLabel, tourDay, tourRange } from './format';
import { SeasonLedger } from './SeasonLedger';
import { TourChip, TourFailed, TourHead, TourLoading, TourMain, TourPhoneTop, TourViewSwitch, tourGate, useTourPhone } from './parts';
import { useTourPaths } from './paths';
import type { ChTourEvent, ChTourHomeData, ChTourNextUp, TournamentsHomeProps } from './types';
import '../../styles/tournaments-home.css';

const TITLE_ID = 'ch-tour-home-title';
const LINE = 'What happened at each event, who counted, and how it compares with qualifying, practice and last season.';

/** The hero's one primary action by state (5.1.1): where it goes and what it says. */
const ACTION: Record<ChTourNextUp['action'], { label: string; icon: LucideIcon; to: 'lineup' | 'desk' | 'live' | 'review' }> = {
  build: { label: 'Build lineup', icon: Users, to: 'lineup' },
  publish: { label: 'Publish lineup', icon: Send, to: 'lineup' },
  open: { label: 'Open event', icon: ArrowRight, to: 'desk' },
  follow: { label: 'Follow live', icon: Radio, to: 'live' },
  review: { label: 'Open review', icon: ClipboardCheck, to: 'review' },
};

/**
 * Season home (board `Home`; phone `MEvents`): the next event as the screen's one green card, the other events on the
 * calendar, then the season ledger. Desktop and phone. The hero's action follows the state of the week (`next.action`);
 * Add event is the head's quiet key, and the page's one primary when there are no events yet.
 */
export function TournamentsHome({ data, load, phone: forced, live = false }: TournamentsHomeProps) {
  const phone = useTourPhone(forced);
  return tourGate(load, {
    loading: () => <HomeLoading phone={phone} />,
    failed: () => <TourFailed view="home" phone={phone} id={TITLE_ID} eyebrow={data.team.label} title="Tournaments" className="ch-tour-home" />,
    ready: () => <HomeReady data={data} phone={phone} live={live} />,
  });
}

function HomeLoading({ phone }: { phone: boolean }) {
  return (
    <TourLoading view="home" phone={phone} title="Tournaments" className="ch-tour-home">
      <Skeleton width="100%" height={phone ? 44 : 40} radius={12} />
      {phone ? (
        <>
          <Skeleton width="100%" height={132} radius={16} shape="solid" />
          <SkelRows rows={4} trail />
        </>
      ) : (
        <>
          <div className="ch-tour-home__up">
            <Skeleton width="100%" height={196} radius={16} shape="solid" />
            <SkelRows rows={3} lead trail />
          </div>
          <SkelRows rows={5} trail />
        </>
      )}
    </TourLoading>
  );
}

function HomeReady({ data, phone, live }: { data: ChTourHomeData; phone: boolean; live: boolean }) {
  const paths = useTourPaths();
  const { refresh, refreshing } = useRefresh();
  const thisSeason = data.events.filter((e) => e.seasonId === data.season.id);
  const empty = !data.errors.events && thisSeason.length === 0;
  const courseName = (id: string | undefined) => (id ? (data.courses[id]?.name ?? NO_DATA) : NO_DATA);
  const upcoming = useMemo(() => data.events.filter((e) => e.status !== 'complete').sort((a, b) => a.startDate.localeCompare(b.startDate)), [data.events]);
  // P-5 4.11.2: the hero looks across the season boundary; the rest of next season folds into its own group.
  const hero = (data.next && upcoming.find((e) => e.id === data.next?.eventId)) ?? upcoming[0] ?? null;
  const later = upcoming.filter((e) => e !== hero && e.seasonId > data.season.id);
  const others = upcoming.filter((e) => e !== hero && !later.includes(e));
  // P-5 8.7 and M9: follows the calendar while open; a tournament that arrives is washed once and said once.
  useSeasonHomeLive(data.team.id, live);
  const { arrived, said } = useArrivals(upcoming);
  const today = todayIsoInZone(data.team.timezone, new Date(data.now));
  const madeToday = (e: ChTourEvent) => !!e.createdAt && todayIsoInZone(data.team.timezone, new Date(e.createdAt)) === today;
  const untracked = data.untracked ?? [];
  const setUp = (untracked.length > 0 || !!data.errors.untracked) && (
    <SetUpFromCalendar groups={untracked} failed={!!data.errors.untracked} onRetry={refresh} retrying={refreshing} />
  );
  // One primary per screen: with no events at all the page's empty state carries Add event, so the head leaves it out.
  const add = !empty && (
    <Button leftIcon={Plus} href={paths.newEvent()}>
      Add event
    </Button>
  );

  return (
    <TourMain view="home" phone={phone} labelledBy={TITLE_ID} className="ch-tour-home">
      <TourPhoneTop phone={phone} title="Tournaments" />
      <TourHead
        id={TITLE_ID}
        phone={phone}
        eyebrow={data.team.label}
        title="Tournaments"
        line={LINE}
        actions={
          <>
            <TourViewSwitch current="home" phone={phone} />
            {add}
          </>
        }
      />
      {data.errors.events ? (
        <InlineNotice code="CH-16210" title="The events didn’t load" body="Nothing has changed. Try again; the error has been reported." onRetry={refresh} retrying={refreshing} />
      ) : empty ? (
        <>
          <FirstRun untracked={untracked.length} newEvent={paths.newEvent()} />
          {setUp}
        </>
      ) : (
        <>
          {phone ? (
            // The phone board (MEvents): the card, then the ledger's own season headings. Other events on the calendar
            // are not on the board; they follow the card so none is unreachable.
            <>
              {hero ? <NextCard event={hero} data={data} phone today={madeToday(hero)} arrived={arrived.has(hero.id)} /> : <EmptyState compact code="CH-16312" title="Nothing on the calendar" body="Add an event and it shows here with its lineup and travel." />}
              {others.length > 0 && (
                <Section id="ch-tour-home-more" title="Coming up">
                  <OtherEvents events={others} data={data} madeToday={madeToday} arrived={arrived} />
                </Section>
              )}
              {setUp}
              <SeasonLedger events={data.events} seasons={data.seasons} players={data.players} courseName={courseName} currentSeasonId={data.season.id} phone />
              <NextSeason events={later} data={data} madeToday={madeToday} arrived={arrived} />
            </>
          ) : (
            <>
              <Section id="ch-tour-home-up" title="Up next" meta={upcoming.length ? `${plural(upcoming.length, 'event')} on the calendar` : undefined}>
                {hero ? (
                  <div className="ch-tour-home__up">
                    <NextCard event={hero} data={data} phone={false} today={madeToday(hero)} arrived={arrived.has(hero.id)} />
                    {others.length > 0 && <OtherEvents events={others} data={data} madeToday={madeToday} arrived={arrived} />}
                  </div>
                ) : (
                  <EmptyState compact code="CH-16312" title="Nothing on the calendar" body="Add an event and it shows here with its lineup and travel." />
                )}
              </Section>
              {setUp}
              <Section id="ch-tour-home-led" title="Season ledger" meta="Official finish and counting totals · open an event for rounds and players">
                <SeasonLedger events={data.events} seasons={data.seasons} players={data.players} courseName={courseName} currentSeasonId={data.season.id} phone={false} />
                <NextSeason events={later} data={data} madeToday={madeToday} arrived={arrived} />
              </Section>
            </>
          )}
        </>
      )}
      {/* CH-16850: a tournament that arrived while the page was open, said once. */}
      <span className="ch-sr-only" role="status" aria-live="polite" data-ch-code="CH-16850">
        {said}
      </span>
    </TourMain>
  );
}

/** The one green card: the next event, what is missing before it, and the one thing to do about it. */
function NextCard({ event: e, data, phone, today = false, arrived = false }: { event: ChTourEvent; data: ChTourHomeData; phone: boolean; today?: boolean; arrived?: boolean }) {
  const paths = useTourPaths();
  const next = data.next?.eventId === e.id ? data.next : null;
  const act = ACTION[next?.action ?? 'open'];
  const href = { lineup: paths.lineup(e.id), desk: paths.desk(e.id), live: paths.live(e.id), review: paths.review(e.id) }[act.to];
  const missing = next?.readiness.find((r) => !r.done);
  const live = e.status === 'live';
  const days = daysUntil(data.now, e.startDate);
  const place = data.courses[e.courseIds[0] ?? '']?.name;
  const summary = `${holesLabel(e)} · ${playLabel(e.format)}${countsEachRound(e.format) ? ` · ${countLabel(e.format)} each round` : ` · ${countLabel(e.format)}`}.`;
  const pickLineup = act.to === 'lineup';
  return (
    <FeatureCard
      className={'ch-tour-home-feat ch-tour-washable' + (arrived ? ' ch-tour-changed' : '')}
      kicker={`${tourRange(e.startDate, e.endDate)}${place ? ` · ${place}` : ''}`}
      chip={live ? 'Live now' : inDays(data.now, e.startDate)}
      soon={live || (days >= 0 && days <= 1)}
      label={`Up next: ${e.name}`}
      title={
        <Link href={paths.desk(e.id)} className="ch-tour-home-feat__t">
          {e.name}
        </Link>
      }
      line={
        <>
          <span className="ch-tour-home-feat__p">
            {summary}
            {e.note ? ` ${e.note}.` : ''}
          </span>
          {missing && <span className="ch-tour-home-feat__ready">{missing.label}</span>}
          {today && <span className="ch-tour-home__today">Set up today</span>}
        </>
      }
      foot={
        <>
          <Button size="sm" variant="primary" leftIcon={act.icon} href={href} className="ch-tour-home-feat__go">
            {act.label}
          </Button>
          {!phone && pickLineup && (
            <Button size="sm" leftIcon={GitCompare} href={paths.compare(e.id)} className="ch-tour-home-feat__alt">
              Compare lineup options
            </Button>
          )}
        </>
      }
    />
  );
}

/** The rest of the calendar: a date, the event and where, each one a link to its desk. */
function OtherEvents({ events, data, madeToday, arrived }: { events: ChTourEvent[]; data: ChTourHomeData; madeToday: (e: ChTourEvent) => boolean; arrived: ReadonlySet<string> }) {
  const paths = useTourPaths();
  return (
    <LedgerList label="Also on the calendar" className="ch-tour-home-others">
      {events.map((e) => (
        <LedgerRow
          key={e.id}
          href={paths.desk(e.id)}
          // P-5 M9 (CH-16650): arrived while the page was open, washed once; on a fresh load the caption says it instead.
          className={'ch-tour-washable' + (arrived.has(e.id) ? ' ch-tour-changed' : '')}
          lead={
            <span className="ch-tour-home-date" aria-hidden="true">
              <b className="ch-num">{tourDay(e.startDate, { day: 'numeric' })}</b>
              <span>{tourDay(e.startDate, { month: 'short' })}</span>
            </span>
          }
          title={e.name}
          trail={
            <>
              {madeToday(e) && <span className="ch-tour-home__today">Set up today</span>}
              <TourChip tone={e.status === 'live' ? 'live' : undefined}>{e.status === 'live' ? 'Live' : 'Upcoming'}</TourChip>
            </>
          }
          meta={[data.courses[e.courseIds[0] ?? '']?.name, holesLabel(e), e.note].filter(Boolean).join(' · ')}
          label={`${e.name}, ${tourRange(e.startDate, e.endDate)}`}
        />
      ))}
    </LedgerList>
  );
}

/**
 * P-5 4.11.1 (CH-16352): the first run. The season starts on the calendar: Add a tournament opens the calendar editor
 * on Tournament; the secondary plans from here, or, when the calendar already has untracked tournaments, points at them.
 */
function FirstRun({ untracked, newEvent }: { untracked: number; newEvent: string }) {
  return (
    <EmptyState
      size="page"
      code="CH-16352"
      icon={Trophy}
      title="Your season starts on the calendar"
      body="Add a tournament on the calendar and it shows up here with its rounds, lineup and results."
      action={
        <>
          <Button variant="primary" leftIcon={CalendarPlus} href="/golf/dashboard/calendar?new=1&type=tournament">
            Add a tournament
          </Button>
          {untracked > 0 ? (
            <Button variant="ghost" href="#ch-tour-home-setup">
              {`Set up from calendar (${untracked})`}
            </Button>
          ) : (
            <Button variant="ghost" href={newEvent}>
              Plan from here instead
            </Button>
          )}
        </>
      }
    />
  );
}

/** "Thu 5 to Sat 7 Nov · 3 calendar entries". */
export function setUpLine(g: ChTourSetupGroup): string {
  const n = g.eventIds.length;
  return `${tourRange(g.first, g.last)} · ${n} calendar ${n === 1 ? 'entry' : 'entries'}`;
}

/**
 * P-5 4.11.3: tournaments on the calendar that aren't tracked yet, newest first, consecutive days of one name as one row.
 * A row opens the calendar editor on its first day with Track on. A failed read says so in place (CH-16253).
 */
function SetUpFromCalendar({ groups, failed, onRetry, retrying }: { groups: ChTourSetupGroup[]; failed: boolean; onRetry: () => void; retrying: boolean }) {
  return (
    <Section id="ch-tour-home-setup" title="Set up from calendar" meta={failed ? undefined : `${plural(groups.length, 'tournament')} not tracked yet`}>
      {failed ? (
        <InlineNotice code="CH-16253" title="Couldn’t load your tournaments." body="The calendar’s untracked tournaments didn’t load. Try again." onRetry={onRetry} retrying={retrying} />
      ) : (
        <LedgerList label="Untracked tournaments on the calendar" className="ch-tour-home-setup">
          {groups.map((g) => (
            <LedgerRow
              key={g.eventIds[0]}
              href={`/golf/dashboard/calendar?event=${g.eventIds[0]}&setup=1`}
              lead={
                <span className="ch-tour-home-setup__plate" aria-hidden="true">
                  <Icon icon={Trophy} size={16} />
                </span>
              }
              title={g.title}
              meta={setUpLine(g)}
              trail={<span className="ch-tour-home-setup__go">Set up</span>}
              label={`Set up ${g.title}, ${setUpLine(g)}`}
            />
          ))}
        </LedgerList>
      )}
    </Section>
  );
}

/** P-5 4.11.2: next season's events, folded at the end of the ledger: "Next season · 2027–28 (2)". */
function NextSeason({ events, data, madeToday, arrived }: { events: ChTourEvent[]; data: ChTourHomeData; madeToday: (e: ChTourEvent) => boolean; arrived: ReadonlySet<string> }) {
  const [open, setOpen] = useState(false);
  if (!events.length) return null;
  const id = events[0]!.seasonId;
  const label = `Next season · ${id.slice(0, 4)}–${id.slice(5)}`;
  return (
    <div className="ch-tour-home-next">
      <button type="button" className="ch-tour-home-next__row" aria-expanded={open} aria-controls="ch-tour-home-next-list" onClick={() => setOpen(!open)}>
        <span>{label}</span>
        <span className="ch-tour-home-next__n ch-num">{`(${events.length})`}</span>
        <Icon icon={ChevronDown} size={16} className="ch-tour-home-next__chev" />
      </button>
      {open && (
        <div id="ch-tour-home-next-list">
          <OtherEvents events={events} data={data} madeToday={madeToday} arrived={arrived} />
        </div>
      )}
    </div>
  );
}
