'use client';

import { ArrowRight, ClipboardCheck, GitCompare, Plus, Radio, Send, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
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
export function TournamentsHome({ data, load, phone: forced }: TournamentsHomeProps) {
  const phone = useTourPhone(forced);
  return tourGate(load, {
    loading: () => <HomeLoading phone={phone} />,
    failed: () => <TourFailed view="home" phone={phone} id={TITLE_ID} eyebrow={data.team.label} title="Tournaments" className="ch-tour-home" />,
    ready: () => <HomeReady data={data} phone={phone} />,
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

function HomeReady({ data, phone }: { data: ChTourHomeData; phone: boolean }) {
  const paths = useTourPaths();
  const { refresh, refreshing } = useRefresh();
  const thisSeason = data.events.filter((e) => e.seasonId === data.season.id);
  const empty = !data.errors.events && thisSeason.length === 0;
  const courseName = (id: string | undefined) => (id ? (data.courses[id]?.name ?? NO_DATA) : NO_DATA);
  const upcoming = useMemo(() => data.events.filter((e) => e.status !== 'complete').sort((a, b) => a.startDate.localeCompare(b.startDate)), [data.events]);
  const hero = (data.next && upcoming.find((e) => e.id === data.next?.eventId)) ?? upcoming[0] ?? null;
  const others = upcoming.filter((e) => e !== hero);
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
        <EmptyState
          size="page"
          code="CH-16310"
          icon={Plus}
          title="No tournaments yet"
          body="Add your first event to see who counted, how the team finished and how it compares with qualifying and last season."
          action={
            <Button variant="primary" leftIcon={Plus} href={paths.newEvent()}>
              Add event
            </Button>
          }
        />
      ) : (
        <>
          {phone ? (
            // The phone board (MEvents): the card, then the ledger's own season headings. Other events on the calendar
            // are not on the board; they follow the card so none is unreachable.
            <>
              {hero ? <NextCard event={hero} data={data} phone /> : <EmptyState compact code="CH-16312" title="Nothing on the calendar" body="Add an event and it shows here with its lineup and travel." />}
              {others.length > 0 && (
                <Section id="ch-tour-home-more" title="Coming up">
                  <OtherEvents events={others} data={data} />
                </Section>
              )}
              <SeasonLedger events={data.events} seasons={data.seasons} players={data.players} courseName={courseName} currentSeasonId={data.season.id} phone />
            </>
          ) : (
            <>
              <Section id="ch-tour-home-up" title="Up next" meta={upcoming.length ? `${plural(upcoming.length, 'event')} on the calendar` : undefined}>
                {hero ? (
                  <div className="ch-tour-home__up">
                    <NextCard event={hero} data={data} phone={false} />
                    {others.length > 0 && <OtherEvents events={others} data={data} />}
                  </div>
                ) : (
                  <EmptyState compact code="CH-16312" title="Nothing on the calendar" body="Add an event and it shows here with its lineup and travel." />
                )}
              </Section>
              <Section id="ch-tour-home-led" title="Season ledger" meta="Official finish and counting totals · open an event for rounds and players">
                <SeasonLedger events={data.events} seasons={data.seasons} players={data.players} courseName={courseName} currentSeasonId={data.season.id} phone={false} />
              </Section>
            </>
          )}
        </>
      )}
    </TourMain>
  );
}

/** The one green card: the next event, what is missing before it, and the one thing to do about it. */
function NextCard({ event: e, data, phone }: { event: ChTourEvent; data: ChTourHomeData; phone: boolean }) {
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
      className="ch-tour-home-feat"
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
function OtherEvents({ events, data }: { events: ChTourEvent[]; data: ChTourHomeData }) {
  const paths = useTourPaths();
  return (
    <LedgerList label="Also on the calendar" className="ch-tour-home-others">
      {events.map((e) => (
        <LedgerRow
          key={e.id}
          href={paths.desk(e.id)}
          lead={
            <span className="ch-tour-home-date" aria-hidden="true">
              <b className="ch-num">{tourDay(e.startDate, { day: 'numeric' })}</b>
              <span>{tourDay(e.startDate, { month: 'short' })}</span>
            </span>
          }
          title={e.name}
          trail={<TourChip tone={e.status === 'live' ? 'live' : undefined}>{e.status === 'live' ? 'Live' : 'Upcoming'}</TourChip>}
          meta={[data.courses[e.courseIds[0] ?? '']?.name, holesLabel(e), e.note].filter(Boolean).join(' · ')}
          label={`${e.name}, ${tourRange(e.startDate, e.endDate)}`}
        />
      ))}
    </LedgerList>
  );
}
