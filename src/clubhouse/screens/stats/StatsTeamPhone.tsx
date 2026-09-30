'use client';

import { ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { LEGS, type ChTeamStats } from '../../data/stats-team';
import { Avatar } from '../../ui/Avatar';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Segmented } from '../../ui/Segmented';
import { formatFixed, formatSigned, NO_DATA } from '../../lib/format';
import { teamPlayerHref } from './links';
import { puttingNote } from './notes';
import { RetryNotice, ShowSeason, useGoWindow } from './StatsTeamIslands';
import { WindowSwitch } from './WindowSwitch';

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
  const noRounds = !data.roundsError && data.roundCount === 0;
  return (
    <div className="ch-stm">
      <header className="ch-stm-head">
        <span className="ch-num">
          {data.teamName} · {data.activeCount} active · countable rounds
        </span>
        <h1>Team stats</h1>
      </header>
      <WindowSwitch value={data.window} onChange={go} />
      {data.roundsError && <RetryNotice code="CH-4201" title="Team rounds didn't load." body="Every figure below would be incomplete, so they're hidden. Try again; the error has been reported." />}
      {noRounds ? (
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

/** Scoring, greens, putts, scrambling, each with its change (green better, amber worse; D-42). */
function Figures({ figures }: { figures: ChTeamStats['figures'] }) {
  const short: Record<string, string> = {
    'Scoring average': 'Scoring avg',
    'Greens in regulation': 'GIR',
    'Putts per round': 'Putts',
    Scrambling: 'Scrambling',
  };
  return (
    <dl className="ch-stm-figs">
      {figures.slice(0, 4).map((f) => (
        <div key={f.label}>
          <dt>{short[f.label] ?? f.label}</dt>
          <dd className="ch-num">{f.value == null ? NO_DATA : `${f.value.toFixed(f.digits)}${f.unit}`}</dd>
          <dd className={'ch-num ' + (f.delta == null || f.delta === 0 ? '' : f.delta < 0 === f.lowerIsBetter ? 'ch-gain' : 'ch-loss')}>{f.delta == null ? ' ' : formatSigned(f.delta, f.digits)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The team's weekly scoring average against its mean (a dashed line), with a one-line reading. */
function Trend({ data }: { data: ChTeamStats }) {
  const known = data.team.score.filter((v): v is number => v != null);
  if (known.length < 2) return null;
  const change = known[known.length - 1]! - known[0]!;
  const reading = Math.abs(change) < 0.2 ? 'Flat across the window.' : `${change < 0 ? 'Down' : 'Up'} ${Math.abs(change).toFixed(1)} strokes across the window.`;
  const firstI = data.team.score.findIndex((v) => v != null);
  const lastI = data.team.score.length - 1 - [...data.team.score].reverse().findIndex((v) => v != null);
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-stm-trend">
      <div className="ch-stm-panel__h">
        <h2 id="ch-stm-trend">Scoring trend</h2>
        <span className="ch-num">Team avg · {known.length} weeks</span>
      </div>
      <ScoreLine
        values={data.team.score}
        from={data.weeks[firstI] ?? ''}
        to={data.weeks[lastI] ?? ''}
        label={`Team scoring average by week, from ${formatFixed(known[0]!)} to ${formatFixed(known[known.length - 1]!)}. ${reading}`}
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

/** Strokes gained per round in each leg, a bar either side of zero. */
function Legs({ data }: { data: ChTeamStats }) {
  const max = 1.4;
  const legs = LEGS.map((l, i) => ({ l, v: data.legTotals[i] ?? null }));
  const known = legs.filter((x): x is { l: (typeof LEGS)[number]; v: number } => x.v != null);
  const losing = known.filter((x) => x.v < -0.05);
  if (!known.length)
    return (
      <section className="ch-stm-panel" aria-labelledby="ch-stm-legs">
        <div className="ch-stm-panel__h">
          <h2 id="ch-stm-legs">Strokes gained by leg</h2>
        </div>
        <EmptyState compact code="CH-4303" title="No strokes gained in this window." body="Strokes gained appears for rounds posted with shots." />
      </section>
    );
  const note = !losing.length
    ? `No leg is losing strokes against ${data.sgBaselineNote}.`
    : losing.length === 1
      ? `${losing[0]!.l} is the only leg losing strokes, ${Math.abs(losing[0]!.v).toFixed(1)} a round.`
      : `${losing.length} legs are losing strokes: ${losing.map((x) => x.l).join(', ')}.`;
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-stm-legs">
      <div className="ch-stm-panel__h">
        <h2 id="ch-stm-legs">Strokes gained by leg</h2>
        <span>Per round · vs {data.sgBaselineNote}</span>
      </div>
      <div className="ch-stm-legs">
        {legs.map(({ l, v }) => (
          <div key={l} className="ch-stm-leg">
            <span>{l}</span>
            <span className="ch-stm-leg__bar" aria-hidden="true">
              <i className="ch-stm-leg__z" />
              {v != null && (
                <i
                  className={'ch-stm-leg__v ' + (v >= 0 ? 'is-gain' : 'is-loss')}
                  style={{
                    [v >= 0 ? 'left' : 'right']: '50%',
                    width: `${(Math.min(Math.abs(v), max) / max) * 50}%`,
                  }}
                />
              )}
            </span>
            <b className={'ch-num ' + (v == null ? '' : v >= 0 ? 'ch-gain' : 'ch-loss')}>{v == null ? NO_DATA : formatSigned(v)}</b>
          </div>
        ))}
      </div>
      <p className="ch-stm-note">{note}</p>
    </section>
  );
}

function Players({ data }: { data: ChTeamStats }) {
  const [sort, setSort] = useState<Sort>('avg');
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
              <Link href={teamPlayerHref(p.id, data.window)} className="ch-stm-row">
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Make rate by distance: a bar per band, the D1 rate as a mark, a band under it in amber. */
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
          const low = rate != null && b.d1 != null && b.attempts >= 10 && rate < b.d1;
          return (
            <div key={b.label} className="ch-stm-putt__r">
              <span className="ch-num">{b.label}</span>
              <span className="ch-stm-putt__bar" aria-hidden="true">
                {rate != null && <i className={low ? 'is-low' : ''} style={{ width: `${rate}%` }} />}
                {b.d1 != null && <em style={{ left: `${b.d1}%` }} />}
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
