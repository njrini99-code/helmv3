'use client';

import { ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import type { ChLeg, ChTeamStats } from '../../data/stats-team';
import { LEGS_LIST } from './legs';
import { Avatar } from '../../ui/Avatar';
import { EmptyState } from '../../ui/States';
import { StatsTeamFirstRun } from './StatsTeamFirstRun';
import { Icon } from '../../ui/Icon';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Segmented } from '../../ui/Segmented';
import { formatFixed, formatSigned, NO_DATA } from '../../lib/format';
import { sgBaseline } from '../../lib/sg';
import { SgBars } from './charts';
import { teamPlayerHref } from './links';
import { LinkPending } from '../../shell/LinkPending';
import { puttingNote } from './notes';
import { RetryNotice, ShowSeason, TeamFilter, TeamFilterEmpty, useGoWindow, useShownWindow } from './StatsTeamIslands';
import { holeCoverage } from '../../data/round-scope';
import { nineRoundsInWindow } from '../../data/stats-filter';
import { EarlyRead, NineHint } from './StatsFilter';
import { hasRange, isFiltered } from '../../data/stats-filter';
import { WindowSwitch } from './WindowSwitch';
import { useChSessionState } from '../../lib/session-state';

type Sort = 'avg' | 'sg';

/**
 * Team stats on the phone (v2, design/handoff/Coach - Stats - Mobile.html,
 * m-stats.jsx, board "Team stats"): the window, four figures, the scoring
 * trend, strokes gained by leg, the players (a row opens their profile) and
 * the team's make rates. Same loader, window change and catalog as desktop;
 * season bests and export stay on desktop. Stats is a coach tab (D-66), so the
 * shell's top bar is the tab root and the page adds nothing to it.
 */
export function StatsTeamPhone({ data }: { data: ChTeamStats }) {
  const go = useGoWindow();
  const shown = useShownWindow();
  const noRounds = !data.roundsError && data.roundCount === 0;
  // D-71's first-run page is for no round of either length: a team with only 9-hole rounds gets CH-4301 and the CH-4319 hint instead.
  const nineOnly = noRounds && nineRoundsInWindow(data.filter, data.filterOptions);
  const filtered = isFiltered(data.filter);
  const showFilter = !data.roundsError && (data.filterOptions.total > 0 || filtered);
  return (
    <div className="ch-stm">
      <header className="ch-stm-head">
        <span className="ch-num">
          {data.teamName} · {data.roundsError ? '' : `${data.activeCount} active · `}countable rounds
        </span>
        <h1>Team stats</h1>
      </header>
      {/* The window and the filter share one row (F-42): the board has no row of its own for the filter. */}
      <div className="ch-stm-controls">
        <WindowSwitch value={shown} onChange={go} custom={hasRange(data.filter)} />
        {showFilter && <TeamFilter filter={data.filter} options={data.filterOptions} count={data.roundCount} phone />}
      </div>
      {data.roundsError && <RetryNotice code="CH-4201" title="Team rounds didn't load." body="Every figure below would be incomplete, so they're hidden. Try again; the error has been reported." />}
      {filtered && data.roundCount > 0 && data.roundsEffective < 3 && <EarlyRead code="CH-4314" count={data.roundCount} whole={data.roundsEffective} />}
      {noRounds && !filtered && <NineHint code="CH-4319" filter={data.filter} options={data.filterOptions} who="This team has" />}
      {noRounds && filtered ? (
        <TeamFilterEmpty />
      ) : noRounds && data.window === 'season' && !nineOnly ? (
        <StatsTeamFirstRun />
      ) : noRounds ? (
        <EmptyState
          code={data.window === 'qualifiers' ? 'CH-4302' : 'CH-4301'}
          icon={Users}
          title={data.window === 'qualifiers' ? 'No qualifier rounds this season yet.' : 'No 18-hole rounds in this window yet.'}
          body={data.window === 'qualifiers' ? 'Qualifier rounds appear here once they are posted as qualifying.' : 'Team stats fill in as players post countable rounds.'}
          action={data.window !== 'season' ? <ShowSeason /> : undefined}
        />
      ) : (
        !data.roundsError && (
          <>
            <SectionBoundary surface="stats.team.figures" label="Team figures" code="CH-4204">
              {data.cacheError && (
                <RetryNotice code="CH-4202" title="Some team figures didn't load." body="Scoring is correct; greens, putts and scrambling are missing. The error has been reported." />
              )}
              <Figures figures={data.figures} />
              {/* The phone's cards draw no caption of their own: greens, putts and scrambling read the rounds with their holes (Q-123), and this says how many. */}
              {(() => {
                const coverage = data.holeRoundCount == null ? null : holeCoverage(data.holeRoundCount, data.roundCount);
                return <p className="ch-stm-cover" aria-hidden={coverage ? undefined : true}>{coverage}</p>;
              })()}
            </SectionBoundary>
            <SectionBoundary surface="stats.team.trend" label="Scoring trend" code="CH-4205">
              <Trend data={data} />
            </SectionBoundary>
            <SectionBoundary surface="stats.team.legs" label="Strokes gained by leg" code="CH-4206">
              <Legs data={data} />
            </SectionBoundary>
            <SectionBoundary surface="stats.team.players" label="Players" code="CH-4206">
              <Players data={data} />
            </SectionBoundary>
            <SectionBoundary surface="stats.team.putting" label="Team putting" code="CH-4207">
              <Putting data={data} />
            </SectionBoundary>
          </>
        )
      )}
    </div>
  );
}

/** Scoring, greens, putts, scrambling, each with its change (green better, amber worse; D-42). Strokes gained has its own panel below. */
function Figures({ figures }: { figures: ChTeamStats['figures'] }) {
  const short: Record<string, string> = {
    'Scoring average': 'Scoring avg',
    'Greens in regulation': 'GIR',
    'Putts per round': 'Putts',
    Scrambling: 'Scrambling',
  };
  const shown = figures.filter((f) => !f.signed).slice(0, 4);
  // Keep the comparison row's geometry across windows; absence stays hidden from assistive technology.
  const anyDelta = shown.some((f) => f.delta != null);
  return (
    <dl className="ch-stm-figs">
      {shown.map((f) => (
        <div key={f.label}>
          <dt>{short[f.label] ?? f.label}</dt>
          <dd className="ch-num">{f.value == null ? NO_DATA : `${f.value.toFixed(f.digits)}${f.unit}`}</dd>
          {/* A change that rounds to zero ("0.0") is no change: neutral, not amber (F-54). */}
          <dd aria-hidden={!anyDelta || f.delta == null ? true : undefined} className={'ch-num ' + (f.delta == null || Math.abs(f.delta) < 0.5 * 10 ** -(f.digits ?? 1) ? '' : f.delta < 0 === f.lowerIsBetter ? 'ch-gain' : 'ch-loss')}>{f.delta == null ? null : formatSigned(f.delta, f.digits)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The team's average on each of its last ten round days against their mean (a dashed line), with a one-line reading. */
function Trend({ data }: { data: ChTeamStats }) {
  const days = data.days ?? [];
  const known = days.filter((d): d is { label: string; score: number } => d.score != null);
  const head = (
    <div className="ch-stm-panel__h">
      <h2 id="ch-stm-trend">Scoring trend</h2>
      <span className="ch-num">
        Team avg · {known.length} {known.length === 1 ? 'day' : 'days'}
      </span>
    </div>
  );
  // One round day is a point, not a trend: say so instead of dropping the panel (F-41).
  if (known.length < 2)
    return (
      <section className="ch-stm-panel" aria-labelledby="ch-stm-trend">
        {head}
        {/* The chart's frame and the reading's line stay, so a window without a trend is as tall as one with it. */}
        <div className="ch-stm-chart-hold">
          <p className="ch-stm-note">The trend draws once the team has rounds on a second day.</p>
        </div>
        <p className="ch-stm-note" aria-hidden="true">
          &nbsp;
        </p>
      </section>
    );
  const change = known[known.length - 1]!.score - known[0]!.score;
  const reading = Math.abs(change) < 0.2 ? 'Flat across these rounds.' : `${change < 0 ? 'Down' : 'Up'} ${Math.abs(change).toFixed(1)} strokes since ${known[0]!.label}.`;
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-stm-trend">
      {head}
      <ScoreLine
        values={days.map((d) => d.score)}
        from={known[0]!.label}
        to={known[known.length - 1]!.label}
        label={`Team scoring average by round day, from ${formatFixed(known[0]!.score)} to ${formatFixed(known[known.length - 1]!.score)}. ${reading}`}
      />
      <p className="ch-stm-note">{reading}</p>
    </section>
  );
}

/**
 * The phone's scoring line (m-stats.jsx `Trend`; CH-4805): scores oldest to newest,
 * gaps skipped, the mean dashed, the newest point larger. Lower scores sit
 * higher, so a line that climbs is a player getting better.
 */
export function ScoreLine({ values, from, to, label }: { values: Array<number | null>; from: string; to: string; label: string }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (pts.length < 2) return null;
  const W = 340;
  const H = 120;
  const pad = 14;
  const vals = pts.map((p) => p.v);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const lo = Math.min(...vals) - 0.4;
  const hi = Math.max(...vals) + 0.4;
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, values.length - 1);
  const y = (v: number) => pad + ((v - lo) / (hi - lo)) * (H - pad * 2 - 12);
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ch-stm-chart" role="img" aria-label={label}>
      <line x1={pad} x2={W - pad} y1={y(mean)} y2={y(mean)} className="ch-stm-chart__mean" />
      <text x={W - pad} y={y(mean) - 5} textAnchor="end" className="ch-stm-chart__t">
        Mean {formatFixed(mean)}
      </text>
      <path d={d} className="ch-stm-chart__line" />
      {pts.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={p === last ? 4 : 2.4} className={p === last ? 'ch-stm-chart__dot is-last' : 'ch-stm-chart__dot'} />
      ))}
      <text x={pad} y={H - 2} className="ch-stm-chart__t">
        {from}
      </text>
      <text x={W - pad} y={H - 2} textAnchor="end" className="ch-stm-chart__t">
        {to}
      </text>
    </svg>
  );
}

/** Strokes gained per round in each leg and in total, a bar either side of zero on the data's own scale. */
function Legs({ data }: { data: ChTeamStats }) {
  const baseline = sgBaseline(data.tour);
  const legs = LEGS_LIST.map((l, i) => ({ l, v: data.legTotals[i] ?? null }));
  const known = legs.filter((x): x is { l: ChLeg; v: number } => x.v != null);
  const losing = known.filter((x) => x.v < -0.05);
  if (!known.length)
    return (
      <section className="ch-stm-panel ch-stm-panel--bars" aria-labelledby="ch-stm-legs">
        <div className="ch-stm-panel__h">
          <h2 id="ch-stm-legs">Strokes gained by leg</h2>
        </div>
        <EmptyState compact code="CH-4303" title="No strokes gained in this window." body="Strokes gained appears for rounds posted with shots." />
      </section>
    );
  const note = !losing.length
    ? `No leg is losing strokes against ${baseline.noun}.`
    : losing.length === 1
      ? `${losing[0]!.l} is the only leg losing strokes, ${Math.abs(losing[0]!.v).toFixed(1)} a round.`
      : `${losing.length} legs are losing strokes: ${losing.map((x) => x.l).join(', ')}.`;
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-stm-legs">
      <div className="ch-stm-panel__h">
        <h2 id="ch-stm-legs">Strokes gained by leg</h2>
        <span>Per round · {baseline.vs}</span>
      </div>
      <SgBars rows={[...legs.map(({ l, v }) => ({ label: l as string, value: v })), { label: 'Team total', value: data.team.sgMean, total: true }]} />
      <p className="ch-stm-note">{note}</p>
    </section>
  );
}

function Players({ data }: { data: ChTeamStats }) {
  // The sort comes back when the coach returns to the page (PAGE_PERFORMANCE.md rule 1).
  const [sort, setSort] = useChSessionState<Sort>('team-players-sort', 'avg');
  const rows = useMemo(
    () => [...data.grid].sort((a, b) => (sort === 'sg' ? (b.total ?? -99) - (a.total ?? -99) || a.name.localeCompare(b.name) : (a.avg ?? 999) - (b.avg ?? 999) || a.name.localeCompare(b.name))),
    [data.grid, sort],
  );
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-stm-players">
      <div className="ch-stm-panel__h">
        <h2 id="ch-stm-players">Players</h2>
        {/* CH-4703: Segmented ticks on a change only. */}
        <Segmented<Sort>
          size="sm"
          label="Sort players"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'avg', label: 'Avg', aria: 'Avg, scoring average' },
            { value: 'sg', label: 'SG', aria: 'SG, strokes gained' },
          ]}
        />
      </div>
      {!rows.length ? (
        <EmptyState compact code="CH-4305" icon={Users} title="No player rounds in this window." body="Players appear here as they post countable rounds." />
      ) : (
        <ul className="ch-stm-list">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={teamPlayerHref(p.id, data.filter)} className="ch-stm-row">
                <Avatar name={p.name} size={36} />
                <span className="ch-stm-row__b">
                  <b>{p.name}</b>
                  <span className="ch-num">
                    {p.rounds} {p.rounds === 1 ? 'round' : 'rounds'}
                  </span>
                </span>
                <span className="ch-stm-row__v ch-num">
                  <b>{p.avg == null ? NO_DATA : formatFixed(p.avg)}</b>
                  <span className={p.total == null ? '' : p.total >= 0 ? 'ch-gain' : 'ch-loss'}>{p.total == null ? 'Early read' : `${formatSigned(p.total)} SG`}</span>
                </span>
                <Icon icon={ChevronRight} size={16} className="ch-stm-row__chev" />
                <LinkPending />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Make rate by distance: a bar per band, the Tour rate as a mark, a band under it in amber. */
function Putting({ data }: { data: ChTeamStats }) {
  if (data.puttsError) return <RetryNotice code="CH-4203" title="Team putting didn't load." body="Try again; the error has been reported." />;
  if (!data.putting) return <EmptyState compact code="CH-4306" title="No putts logged in this window." body="Putting fills in from rounds posted with putt distances." />;
  const bands = data.putting.bands.slice(0, 5);
  const drawn = bands.reduce((a, b) => a + b.attempts, 0);
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-stm-putt">
      <div className="ch-stm-panel__h">
        <h2 id="ch-stm-putt">Team putting</h2>
        <span className="ch-num">Make rate · {drawn} putts</span>
      </div>
      <div className="ch-stm-putt">
        {bands.map((b) => {
          const rate = b.attempts ? (b.made / b.attempts) * 100 : null;
          const low = rate != null && b.bench != null && b.attempts >= 10 && rate < b.bench;
          return (
            <div key={b.label} className="ch-stm-putt__r">
              <span className="ch-num">{b.label}</span>
              <span className="ch-stm-putt__bar" aria-hidden="true">
                {rate != null && <i className={low ? 'is-low' : ''} style={{ width: `${rate}%` }} />}
                {b.bench != null && <em style={{ left: `${b.bench}%` }} />}
              </span>
              <b className={'ch-num' + (low ? ' ch-loss' : '')}>{rate == null ? NO_DATA : `${Math.round(rate)}%`}</b>
            </div>
          );
        })}
      </div>
      <p className="ch-stm-note">{puttingNote(data.putting.bands)}</p>
    </section>
  );
}
