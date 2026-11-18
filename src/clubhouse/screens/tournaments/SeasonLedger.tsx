'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Icon } from '../../ui/Icon';
import { EmptyState } from '../../ui/States';
import { SideScroll } from '../../ui/SideScroll';
import { NoData } from '../../ui/NoData';
import { countShort, firstNames, holesLabel, tourDay, tourRange } from './format';
import { Coverage, ToPar } from './parts';
import { useTourPaths } from './paths';
import type { ChTourEvent, ChTourPlayer, ChTourSeason } from './types';

/**
 * The season ledger (board `Ledger`, shared by Home and History): the finished events of each season, newest first,
 * with the official finish, the counting total and how much shot data the event has. Desktop is flush rows on the
 * canvas under a header, the whole row one link to the event's desk; the phone is the board's grouped list. Numbers
 * arrive computed (`event.team.result`, `event.finish`); nothing here sums a score.
 */
export function SeasonLedger({
  events,
  seasons,
  players,
  courseName,
  currentSeasonId,
  phone,
}: {
  events: readonly ChTourEvent[];
  seasons: readonly ChTourSeason[];
  players: readonly ChTourPlayer[];
  /** A course's name by id (the event's first course). */
  courseName: (id: string | undefined) => string | null;
  currentSeasonId: string;
  phone: boolean;
}) {
  const groups = seasons
    .map((s) => ({ season: s, events: events.filter((e) => e.seasonId === s.id && e.status === 'complete').sort((a, b) => b.startDate.localeCompare(a.startDate)) }))
    // A past season with nothing finished is left out; the current one says so (CH-16311).
    .filter((g) => g.events.length > 0 || g.season.id === currentSeasonId);
  const label = (s: ChTourSeason) => (s.id === currentSeasonId ? `This season · ${s.label}` : `Last season · ${s.label}`);
  return phone ? (
    <div className="ch-tour-led is-phone">
      {groups.map((g) => (
        <section key={g.season.id} aria-label={label(g.season)}>
          <h3 className="ch-tour-led__season">{label(g.season)}</h3>
          {g.events.length === 0 ? <NoneYet /> : (
            <ul className="ch-tour-led__list">
              {g.events.map((e) => (
                <PhoneRow key={e.id} event={e} course={courseName(e.courseIds[0])} past={g.season.id !== currentSeasonId} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  ) : (
    <SideScroll className="ch-tour-led" role="table" aria-label="Season ledger">
      <div className="ch-tour-led__row is-head" role="row">
        <span role="columnheader">Event</span>
        <span role="columnheader">Dates</span>
        <span role="columnheader">Format</span>
        <span role="columnheader" className="is-r">
          Team
        </span>
        <span role="columnheader" className="is-r">
          Finish
        </span>
        <span role="columnheader">Shot data</span>
        <span role="columnheader" className="ch-sr-only">
          Open
        </span>
      </div>
      {groups.map((g) => (
        <div key={g.season.id} role="rowgroup" aria-label={label(g.season)}>
          <div className="ch-tour-led__season" role="row">
            <span role="rowheader" aria-colspan={7}>
              {label(g.season)}
            </span>
          </div>
          {g.events.length === 0 ? (
            <div role="row">
              <span role="cell" aria-colspan={7}>
                <NoneYet />
              </span>
            </div>
          ) : (
            g.events.map((e) => <DeskRow key={e.id} event={e} course={courseName(e.courseIds[0])} players={players} />)
          )}
        </div>
      ))}
    </SideScroll>
  );
}

function NoneYet() {
  return <EmptyState compact kind="first-run" code="CH-16311" title="No finished events yet" body="Results show here once an event is complete." />;
}

/** One finished event as a desktop row: every cell under its header, the name the one link. */
function DeskRow({ event: e, course, players }: { event: ChTourEvent; course: string | null; players: readonly ChTourPlayer[] }) {
  const paths = useTourPaths();
  const r = e.team.result;
  const lineup = e.entries.filter((x) => x.role === 'lineup').map((x) => x.playerId);
  return (
    <div className="ch-tour-led__row" role="row">
      <span role="cell" className="ch-tour-led__name">
        <Link href={paths.desk(e.id)} className="ch-tour-led__open">
          {e.name}
        </Link>
        <span className="ch-tour-led__t2">
          {course ?? <NoData label="No course" />} · {firstNames(lineup, players)}
        </span>
      </span>
      <span role="cell" className="ch-tour-led__t2">
        {tourRange(e.startDate, e.endDate)}
      </span>
      <span role="cell" className="ch-tour-led__t2">
        {holesLabel(e)} · {countShort(e.format)}
      </span>
      <span role="cell" className="is-r ch-tour-led__fin">
        {r?.total != null ? (
          <>
            <span className="ch-num">{r.total}</span> <ToPar value={r.toPar} />
          </>
        ) : (
          <NoData />
        )}
      </span>
      <span role="cell" className="is-r ch-tour-led__fin">
        {e.finish ? (
          <>
            <span className="ch-num">{e.finish.place}</span>
            <em> of {e.finish.of}</em>
          </>
        ) : (
          <NoData />
        )}
      </span>
      <span role="cell">
        <Coverage withShots={e.coverage.withShots} of={e.coverage.scorecards} />
      </span>
      <span role="cell" className="ch-tour-led__go" aria-hidden="true">
        <Icon icon={ChevronRight} size={15} />
      </span>
    </div>
  );
}

/** One finished event as a phone row (board `tm-row`): name and date over the finish and the team's score. */
function PhoneRow({ event: e, course, past }: { event: ChTourEvent; course: string | null; past: boolean }) {
  const paths = useTourPaths();
  const r = e.team.result;
  const cardsOnly = e.coverage.withShots === 0;
  return (
    <li>
      <Link href={paths.desk(e.id)} className="ch-tour-led__m">
        <span className="ch-tour-led__mt">
          <b>{e.name}</b>
          <em>
            {past ? (
              tourDay(e.startDate, { month: 'short', year: 'numeric' })
            ) : (
              <>
                {tourDay(e.startDate)} · {course ?? <NoData label="No course" />}
              </>
            )}
            {past && cardsOnly ? ' · scorecards only' : ''}
          </em>
        </span>
        <span className="ch-tour-led__mv">
          <b className="ch-num">
            {e.finish ? e.finish.place : <NoData />}
            {e.finish && <small> of {e.finish.of}</small>}
          </b>
          <em className="ch-num">
            {past || r?.total == null ? '' : `${r.total} · `}
            {r?.toPar != null ? <ToPar value={r.toPar} /> : <NoData />}
          </em>
        </span>
        <Icon icon={ChevronRight} size={15} className="ch-tour-led__go" />
      </Link>
    </li>
  );
}
