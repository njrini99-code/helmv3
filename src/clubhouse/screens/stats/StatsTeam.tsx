import { Users } from 'lucide-react';
import Link from 'next/link';
import type { ChTeamStats } from '../../data/stats-team';
import { isFiltered, type ChFilter } from '../../data/stats-filter';
import { Avatar } from '../../ui/Avatar';
import { EmptyState } from '../../ui/States';
import { StatsTeamFirstRun } from './StatsTeamFirstRun';
import { nineRoundsInWindow } from '../../data/stats-filter';
import { EarlyRead, NineHint } from './StatsFilter';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { formatSigned, NO_DATA } from '../../lib/format';
import { FigureCards, PuttingRings, YardagePage } from './charts';
import { teamPlayerHref } from './links';
import { puttingNote } from './notes';
import { StatsTeamPhone } from './StatsTeamPhone';
import { RetryNotice, ShowSeason, StatsTeamFrame, TeamCharts, TeamFilter, TeamFilterEmpty, TeamHeadActions } from './StatsTeamIslands';

/**
 * Team stats. Rendered on the server: the figures, putting and season bests
 * are plain HTML, and only the islands in StatsTeamIslands (the window switch,
 * Export, Try again, and the trend, leg cards and grid) ship as client code.
 */
export function StatsTeam({ data }: { data: ChTeamStats }) {
  const noRounds = !data.roundsError && data.roundCount === 0;
  // D-71's first-run page is for no round of either length: a team with only 9-hole rounds gets CH-4301 and the CH-4319 hint instead.
  const nineOnly = noRounds && nineRoundsInWindow(data.filter, data.filterOptions);
  const filtered = isFiltered(data.filter);
  // Nothing to filter before a round exists (the first-run page); a filter already on always shows, so it can be cleared.
  const showFilter = !data.roundsError && (data.filterOptions.total > 0 || filtered);

  return (
    <StatsTeamFrame filter={data.filter} phone={<StatsTeamPhone data={data} />}>
      <header className="ch-st-head">
        <div className="ch-st-head__row">
          <div>
            <h1 className="ch-display">Team stats</h1>
            <p>
              {data.teamName} &middot; <span className="ch-num">{data.activeCount}</span> active {data.activeCount === 1 ? 'player' : 'players'} &middot; countable rounds only
            </p>
          </div>
          {/* Never export a half-loaded window. */}
          <TeamHeadActions filter={data.filter} teamName={data.teamName} grid={data.roundsError ? null : data.grid} />
        </div>
      </header>

      {showFilter && <TeamFilter filter={data.filter} options={data.filterOptions} count={data.roundCount} />}

      {data.roundsError && (
        <RetryNotice code="CH-4201" title="Team rounds didn't load." body="Every figure below would be incomplete, so they're hidden. Try again; the error has been reported." />
      )}

      {filtered && data.roundCount > 0 && data.roundsEffective < 3 && <EarlyRead code="CH-4314" count={data.roundCount} whole={data.roundsEffective} />}
      {noRounds && !filtered && <NineHint code="CH-4319" filter={data.filter} options={data.filterOptions} who="This team has" />}

      {noRounds && filtered ? (
        <TeamFilterEmpty />
      ) : noRounds && data.window === 'season' && !nineOnly ? (
        <StatsTeamFirstRun />
      ) : noRounds ? (
        <div className="ch-st-card">
          <EmptyState
            code={data.window === 'qualifiers' ? 'CH-4302' : 'CH-4301'}
            icon={Users}
            title={data.window === 'qualifiers' ? 'No qualifier rounds this season yet.' : 'No 18-hole rounds in this window yet.'}
            body={data.window === 'qualifiers' ? 'Qualifier rounds appear here once they are posted as qualifying.' : 'Team stats fill in as players post countable rounds.'}
            action={data.window !== 'season' ? <ShowSeason /> : undefined}
          />
        </div>
      ) : (
        !data.roundsError && (
          <>
            <SectionBoundary surface="stats.team.figures" label="Team figures" code="CH-4204">
              <TeamFigures figures={data.figures} cacheError={data.cacheError} />
            </SectionBoundary>

            <TeamCharts
              data={{
                window: data.window,
                filter: data.filter,
                weeks: data.weeks,
                team: data.team,
                players: data.players,
                legWeeks: data.legWeeks,
                grid: data.grid,
                legTotals: data.legTotals,
                tour: data.tour,
                roundCount: data.roundCount,
              }}
            />

            <div className="ch-st-grid2">
              <SectionBoundary surface="stats.team.putting" label="Team putting" code="CH-4207">
                <TeamPutting putting={data.putting} failed={data.puttsError} />
              </SectionBoundary>
              <SectionBoundary surface="stats.team.bests" label="Season bests" code="CH-4208">
                <SeasonBests bests={data.bests} filter={data.filter} />
              </SectionBoundary>
            </div>
          </>
        )
      )}
    </StatsTeamFrame>
  );
}

/*
 * Each section below is its own component so that its SectionBoundary
 * contains everything it computes: a crash in one never reaches the page.
 */

function TeamFigures({ figures, cacheError }: { figures: ChTeamStats['figures']; cacheError: boolean }) {
  return (
    <>
      {cacheError && (
        <RetryNotice
          code="CH-4202"
          title="Some team figures didn't load."
          body="Scoring is correct; greens, putts and scrambling are missing. The error has been reported."
        />
      )}
      <FigureCards
        items={figures.map((x) => ({
          label: x.label,
          value: x.value == null ? NO_DATA : x.signed ? formatSigned(x.value, x.digits) : x.value.toFixed(x.digits),
          unit: x.unit,
          delta: x.delta,
          deltaDigits: x.digits,
          lowerIsBetter: x.lowerIsBetter,
          context: x.context,
          note: x.note,
          tone: x.signed && x.value != null ? (x.value >= 0 ? ('gain' as const) : ('loss' as const)) : undefined,
          code: x.state === 'empty' ? 'CH-4311' : x.state === 'no-comparison' ? 'CH-4312' : undefined,
        }))}
      />
    </>
  );
}

function TeamPutting({ putting, failed }: { putting: ChTeamStats['putting']; failed: boolean }) {
  if (failed) return <RetryNotice code="CH-4203" title="Team putting didn't load." body="Try again; the error has been reported." />;
  if (!putting)
    return (
      <div className="ch-st-card">
        <EmptyState code="CH-4306" compact title="No putts logged in this window." body="Putting fills in from rounds posted with putt distances." />
      </div>
    );
  // The count covers only the bands the rings draw.
  const drawn = putting.bands.slice(0, 5).reduce((a, b) => a + b.attempts, 0);
  return (
    <YardagePage title="Team putting" meta={`Make rate by distance · ${drawn} putts`} note={puttingNote(putting.bands)}>
      <PuttingRings bands={putting.bands} />
    </YardagePage>
  );
}

function SeasonBests({ bests, filter }: { bests: ChTeamStats['bests']; filter: ChFilter }) {
  const filtered = isFiltered(filter);
  return (
    <section className="ch-st-card">
      <div className="ch-st-card__head">
        <div>
          <h2>Season bests</h2>
          {/* CH-4317: the bests are the whole season's; they do not follow the filter. */}
          <span data-ch-code={filtered ? 'CH-4317' : undefined}>{filtered ? 'Countable rounds since August · the filter does not apply here' : 'Countable rounds since August'}</span>
        </div>
      </div>
      {bests.length === 0 ? (
        <EmptyState code="CH-4307" compact title="No season bests yet." body="Low round, most birdies and the rest appear once rounds are posted." />
      ) : (
        bests.map((b) => (
          <div key={b.label} className="ch-best__r">
            <span className="ch-best__k">{b.label}</span>
            <Link href={teamPlayerHref(b.playerId, filter)} className="ch-who" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Avatar name={b.name} size={26} />
              <span>
                <b>{b.name}</b>
                <span className="ch-who__m">{b.meta}</span>
              </span>
            </Link>
            <span className={'ch-num ch-best__v' + (b.under ? ' is-under' : '')}>{b.value}</span>
          </div>
        ))
      )}
    </section>
  );
}
