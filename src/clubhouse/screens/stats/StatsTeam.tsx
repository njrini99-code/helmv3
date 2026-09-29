'use client';

import { Download, TrendingDown, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ChLeg, ChTeamStats } from '../../data/stats-team';
import { LEGS_LIST } from './legs';
import type { ChWindow } from '../../data/stats-common';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/Segmented';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { useToast } from '../../ui/Toast';
import { haptic } from '../../lib/haptics';
import { chReport, chTrail } from '../../lib/track';
import { firstValue, gappedPath, lastValue } from '../../lib/chart';
import { formatSigned, NO_DATA } from '../../lib/format';
import { FigureCards, PuttingRings, YardagePage } from './charts';
import { WindowSwitch } from './WindowSwitch';

type Lens = 'sg' | 'score';

export function StatsTeam({ data }: { data: ChTeamStats }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [focus, setFocus] = useState<string | null>(null);
  const [leg, setLeg] = useState<ChLeg>('Approach');
  const go = (w: ChWindow) => start(() => router.push(w === 'last10' ? '/golf/dashboard/stats' : `/golf/dashboard/stats?window=${w}`, { scroll: false }));
  const playerHref = (id: string) => `/golf/dashboard/stats?player=${id}${data.window === 'last10' ? '' : `&window=${data.window}`}`;

  const exportCsv = () => {
    const head = ['Player', 'Rounds', ...LEGS_LIST.map((l) => `SG ${l}`), 'SG total'];
    const lines = data.grid.map((g) => [g.name, g.rounds, ...g.legs.map((v) => v?.toFixed(2) ?? ''), g.total?.toFixed(2) ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
      a.download = `${data.teamName.replace(/\W+/g, '-').toLowerCase()}-stats-${data.window}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      haptic('commit');
      toast({ title: 'Team stats exported' });
    } catch (err) {
      chReport(err, { surface: 'stats.team.export', severity: 'low' });
      haptic('error');
      toast({ tone: 'error', title: "Couldn't export team stats", body: 'Your browser blocked the download. Try a desktop browser.' });
    }
  };

  const f = data.figures;
  const noRounds = !data.roundsError && data.roundCount === 0;

  return (
    <main className="ch-st" aria-busy={pending}>
      <header className="ch-st-head">
        <div className="ch-st-head__row">
          <div>
            <h1 className="ch-display">Team stats</h1>
            <p>
              {data.teamName} &middot; <span className="ch-num">{data.activeCount}</span> active {data.activeCount === 1 ? 'player' : 'players'} &middot; countable rounds only
            </p>
          </div>
          <div className="ch-st-head__act">
            <WindowSwitch value={data.window} onChange={go} />
            {data.grid.length > 0 && (
              <Button variant="ghost" leftIcon={Download} onClick={exportCsv}>
                Export
              </Button>
            )}
          </div>
        </div>
      </header>

      {data.roundsError && (
        <InlineNotice title="Team rounds didn't load." body="Every figure below would be incomplete, so they're hidden. Try again; the error has been reported." onRetry={() => router.refresh()} />
      )}

      {noRounds ? (
        <div className="ch-st-card">
          <EmptyState
            icon={Users}
            title={data.window === 'qualifiers' ? 'No qualifier rounds this season yet.' : 'No 18-hole rounds in this window yet.'}
            body={data.window === 'qualifiers' ? 'Qualifier rounds appear here once they are posted as qualifying.' : 'Team stats fill in as players post countable rounds.'}
            action={
              data.window !== 'season' ? (
                <Button size="sm" onClick={() => go('season')}>
                  Show the season
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        !data.roundsError && (
          <>
            <SectionBoundary surface="stats.team.figures" label="Team figures">
              {data.cacheError && <InlineNotice title="Some team figures didn't load." body="Scoring is correct; greens, putts and scrambling are missing. The error has been reported." onRetry={() => router.refresh()} />}
              <FigureCards
                items={f.map((x) => ({
                  label: x.label,
                  value: x.value == null ? NO_DATA : x.value.toFixed(x.digits),
                  unit: x.unit,
                  delta: x.delta,
                  deltaDigits: x.digits,
                  lowerIsBetter: x.lowerIsBetter,
                  context: x.context,
                }))}
              />
            </SectionBoundary>

            <SectionBoundary surface="stats.team.trend" label="The trend chart">
              <TeamTrend data={data} focus={focus} setFocus={setFocus} />
            </SectionBoundary>

            <SectionBoundary surface="stats.team.legs" label="Strokes gained by leg">
              <section className="ch-sgm-row" aria-label="Strokes gained by leg, team">
                {LEGS_LIST.map((l) => (
                  <LegTrend
                    key={l}
                    leg={l}
                    data={data.legWeeks[l]}
                    selected={leg === l}
                    onSelect={() => {
                      haptic('select');
                      setLeg(l);
                    }}
                  />
                ))}
              </section>
              <LegGrid data={data} leg={leg} focus={focus} setFocus={setFocus} playerHref={playerHref} />
            </SectionBoundary>

            <div className="ch-st-grid2">
              <SectionBoundary surface="stats.team.putting" label="Team putting">
                {data.puttsError ? (
                  <InlineNotice title="Team putting didn't load." body="Try again; the error has been reported." onRetry={() => router.refresh()} />
                ) : data.putting ? (
                  <YardagePage
                    title="Team putting"
                    meta={`Make rate by distance · ${data.putting.putts} putts`}
                    note={puttingNote(data.putting.bands)}
                  >
                    <PuttingRings bands={data.putting.bands} />
                  </YardagePage>
                ) : (
                  <div className="ch-st-card">
                    <EmptyState compact title="No putts logged in this window." body="Putting fills in from rounds posted with putt distances." />
                  </div>
                )}
              </SectionBoundary>
              <SectionBoundary surface="stats.team.bests" label="Season bests">
                <section className="ch-st-card">
                  <div className="ch-st-card__head">
                    <div>
                      <h2>Season bests</h2>
                      <span>Countable rounds since August</span>
                    </div>
                  </div>
                  {data.bests.length === 0 ? (
                    <EmptyState compact title="No season bests yet." />
                  ) : (
                    data.bests.map((b) => (
                      <div key={b.label} className="ch-best__r">
                        <span className="ch-best__k">{b.label}</span>
                        <Link href={playerHref(b.playerId)} className="ch-who" style={{ textDecoration: 'none', color: 'inherit' }}>
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
              </SectionBoundary>
            </div>
          </>
        )
      )}
    </main>
  );
}

function puttingNote(all: NonNullable<ChTeamStats['putting']>['bands']): string {
  // Grade only the bands the rings draw.
  const bands = all.slice(0, 5);
  const graded = bands.filter((b) => b.d1 != null && b.attempts >= 10);
  const below = graded.filter((b) => (b.made / b.attempts) * 100 < b.d1!);
  if (!graded.length) return 'Bands grade against D1 once they have 10 or more putts.';
  if (!below.length) return 'Every graded band is at or above the D1 make rate.';
  if (below.length === 1) return `${below[0]!.label.replace('–', ' to ').replace(' ft', ' feet')} is the only band below the D1 make rate.`;
  return `${below.length} bands are below the D1 make rate: ${below.map((b) => b.label).join(', ')}.`;
}

function TeamTrend({ data, focus, setFocus }: { data: ChTeamStats; focus: string | null; setFocus: (id: string | null) => void }) {
  const [lens, setLens] = useState<Lens>('sg');
  const isSg = lens === 'sg';
  const n = data.weeks.length;
  const team = isSg ? data.team.sg : data.team.score;
  const lines = data.players.map((p) => ({ p, v: isSg ? p.sg : p.score })).filter((l) => l.v.some((x) => x != null));
  const all = [...team, ...lines.flatMap((l) => l.v)].filter((v): v is number => v != null);
  const w = 760;
  const h = 260;
  const padL = 38;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const [lo, hi] = useMemo(() => {
    if (!all.length) return isSg ? [-2, 2] : [70, 78];
    const mn = Math.min(...all, isSg ? 0 : 72);
    const mx = Math.max(...all, isSg ? 0 : 72);
    const pad = isSg ? 0.4 : 0.8;
    return isSg ? [mn - pad, mx + pad] : [mx + pad, mn - pad];
  }, [all, isSg]);
  const x = (i: number) => (n <= 1 ? (padL + w - padR) / 2 : padL + (i * (w - padL - padR)) / (n - 1));
  const y = (v: number) => padT + ((hi - v) / (hi - lo)) * (h - padT - padB);
  const ref = isSg ? 0 : 72;
  const ticks = isSg ? niceTicks(lo, hi) : niceTicks(Math.min(lo, hi), Math.max(lo, hi));
  const good = (v: number) => (isSg ? v >= 0 : v <= 72);
  const fmt = (v: number) => (isSg ? formatSigned(v) : v.toFixed(1));
  const sel = lines.find((l) => l.p.id === focus);
  const tFirst = firstValue(team);
  const tLast = lastValue(team);
  const note = (() => {
    if (sel) {
      const a = firstValue(sel.v);
      const b = lastValue(sel.v);
      if (!a || !b || a.i === b.i) return `${sel.p.first} has one week in this window so far.`;
      const d = b.v - a.v;
      return isSg
        ? `${sel.p.first} has ${d >= 0 ? 'gained' : 'lost'} ${Math.abs(d).toFixed(1)} strokes a round across this window.`
        : `${sel.p.first} is ${d <= 0 ? 'down' : 'up'} ${Math.abs(d).toFixed(1)} strokes across this window, now ${b.v.toFixed(1)}.`;
    }
    if (!tFirst || !tLast || tFirst.i === tLast.i) return 'The trend needs rounds in at least two weeks.';
    const d = tLast.v - tFirst.v;
    return isSg
      ? `The team has ${d >= 0 ? 'gained' : 'lost'} about ${Math.abs(d).toFixed(1)} a round from ${data.weeks[tFirst.i]} to ${data.weeks[tLast.i]}.`
      : `Team scoring is ${d <= 0 ? 'down' : 'up'} ${Math.abs(d).toFixed(1)} from ${data.weeks[tFirst.i]} to ${data.weeks[tLast.i]}, now ${tLast.v.toFixed(1)}.`;
  })();
  const sorted = [...lines].sort((a, b) => {
    const av = lastValue(a.v)?.v ?? (isSg ? -99 : 999);
    const bv = lastValue(b.v)?.v ?? (isSg ? -99 : 999);
    return isSg ? bv - av : av - bv;
  });
  const teamPath = gappedPath(team, x, y);

  return (
    <section className="ch-sgt">
      <div className="ch-sgt__head">
        <div>
          <h2>{isSg ? 'Strokes gained · total' : 'Scoring average'}</h2>
          <span>{isSg ? `Per round, weekly average · dashed line is ${data.sgBaselineNote}` : `Team and players · weekly average · dashed line is par 72`}</span>
        </div>
        <div className="ch-sgt__tools">
          <div className="ch-sgt__legend" aria-hidden="true">
            <span>
              <i />
              Team
            </span>
            {sel && (
              <span>
                <i className="is-sel" />
                {sel.p.first}
              </span>
            )}
            <span>
              <i className="is-other" />
              Players
            </span>
          </div>
          <Segmented<Lens>
            size="sm"
            label="Measure"
            value={lens}
            onChange={setLens}
            options={[
              { value: 'sg', label: 'Strokes gained' },
              { value: 'score', label: 'Scoring' },
            ]}
          />
        </div>
      </div>
      {n === 0 || !all.length ? (
        <EmptyState compact title={isSg ? 'No strokes gained in this window.' : 'No scores in this window.'} body={isSg ? 'Strokes gained appears for rounds posted with shots.' : undefined} />
      ) : (
        <div className="ch-sgt__plot">
          <svg viewBox={`0 0 ${w} ${h}`} className="ch-sgt__svg" role="img" aria-label={`${isSg ? 'Strokes gained' : 'Scoring average'} by week. ${note}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={t === ref ? 'var(--ch-champagne-500)' : 'var(--ch-ivory-200)'} strokeDasharray={t === ref ? '4 4' : undefined} />
                <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="ch-tick">
                  {isSg ? (t > 0 ? `+${t}` : t === 0 ? '0' : `−${Math.abs(t)}`) : t}
                </text>
              </g>
            ))}
            {data.weeks.map((wk, i) => (
              <text key={wk + i} x={x(i)} y={h - 8} textAnchor="middle" className="ch-tick">
                {wk}
              </text>
            ))}
            {lines.map(({ p, v }) => {
              const d = gappedPath(v, x, y);
              const on = p.id === focus;
              return d ? (
                <path
                  key={p.id}
                  d={d}
                  className="ch-sgt__line"
                  stroke={on ? 'var(--ch-green-600)' : 'var(--ch-ink-300)'}
                  strokeOpacity={on ? 1 : 0.45}
                  strokeWidth={on ? 2.25 : 1.25}
                  onClick={() => setFocus(on ? null : p.id)}
                />
              ) : null;
            })}
            {teamPath && <path d={teamPath} fill="none" stroke="var(--ch-green-800)" strokeWidth={3} strokeLinecap="round" />}
            {tLast && <circle cx={x(tLast.i)} cy={y(tLast.v)} r={4.5} fill="var(--ch-ivory-25)" stroke="var(--ch-green-800)" strokeWidth={2.5} />}
            {sel && lastValue(sel.v) && <circle cx={x(lastValue(sel.v)!.i)} cy={y(lastValue(sel.v)!.v)} r={4} fill="var(--ch-ivory-25)" stroke="var(--ch-green-600)" strokeWidth={2} />}
          </svg>
          <div className="ch-sgt__ends">
            <div className="ch-sgt__team">
              <span>Team</span>
              <b className="ch-num">{tLast ? fmt(tLast.v) : NO_DATA}</b>
            </div>
            {sorted.map(({ p, v }) => {
              const lv = lastValue(v);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={'ch-sgt__end' + (p.id === focus ? ' is-sel' : '')}
                  aria-pressed={p.id === focus}
                  onClick={() => {
                    haptic('select');
                    chTrail('stats focus player');
                    setFocus(p.id === focus ? null : p.id);
                  }}
                >
                  <Avatar name={p.name} size={22} />
                  <span>{p.first}</span>
                  <b className={`ch-num ${lv == null ? '' : good(lv.v) ? 'ch-gain' : 'ch-loss'}`}>{lv ? fmt(lv.v) : NO_DATA}</b>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="ch-note">{note}</p>
    </section>
  );
}

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo;
  const step = span > 6 ? 2 : span > 3 ? 1 : 0.5;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t * 10) / 10);
  return out;
}

function LegTrend({ leg, data, selected, onSelect }: { leg: ChLeg; data: Array<number | null>; selected: boolean; onSelect: () => void }) {
  const w = 260;
  const h = 92;
  const pad = 10;
  const vals = data.filter((v): v is number => v != null);
  const lo = Math.min(-1, ...vals) - 0.2;
  const hi = Math.max(1, ...vals) + 0.2;
  const x = (i: number) => (data.length <= 1 ? w / 2 : pad + (i * (w - pad * 2)) / (data.length - 1));
  const y = (v: number) => pad + ((hi - v) / (hi - lo)) * (h - pad * 2);
  const a = firstValue(data);
  const b = lastValue(data);
  const tone = b == null ? 'var(--ch-ink-400)' : b.v >= 0 ? 'var(--ch-chart-gain)' : 'var(--ch-chart-loss)';
  const d = gappedPath(data, x, y);
  const ch = a && b && a.i !== b.i ? b.v - a.v : null;
  return (
    <button type="button" className="ch-sgm" aria-pressed={selected} onClick={onSelect}>
      <span className="ch-sgm__top">
        <span className="ch-sgm__l">{leg}</span>
        <span className={`ch-sgm__v ch-num ${b == null ? '' : b.v >= 0 ? 'ch-gain' : 'ch-loss'}`}>{b ? formatSigned(b.v) : NO_DATA}</span>
      </span>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="ch-sgm__svg" aria-hidden="true">
        <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} stroke="var(--ch-champagne-500)" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {d && <path d={`${d}`} fill="none" stroke={tone} strokeWidth={1.75} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {b && <circle cx={x(b.i)} cy={y(b.v)} r={3.5} fill="var(--ch-ivory-25)" stroke={tone} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />}
      </svg>
      <span className="ch-sgm__n">{ch == null ? (b ? 'One week so far' : 'No strokes gained yet') : Math.abs(ch) < 0.15 ? 'Flat across the window' : `${ch > 0 ? 'Up' : 'Down'} ${Math.abs(ch).toFixed(1)} across the window`}</span>
    </button>
  );
}

function LegGrid({
  data,
  leg,
  focus,
  setFocus,
  playerHref,
}: {
  data: ChTeamStats;
  leg: ChLeg;
  focus: string | null;
  setFocus: (id: string | null) => void;
  playerHref: (id: string) => string;
}) {
  const li = LEGS_LIST.indexOf(leg);
  const rows = [...data.grid].sort((a, b) => (b.legs[li] ?? -99) - (a.legs[li] ?? -99));
  const fill = (v: number | null) => {
    if (v == null) return 'var(--ch-ivory-100)';
    const a = Math.min(1, Math.abs(v) / 1.2);
    return v >= 0 ? `rgb(21 90 57 / ${0.06 + a * 0.3})` : `rgb(154 101 18 / ${0.06 + a * 0.3})`;
  };
  return (
    <section className="ch-lg">
      <div className="ch-sgt__head">
        <div>
          <h2>Where each player gains and loses</h2>
          <span>Strokes gained per round by leg &middot; needs three rounds &middot; sorted by {leg.toLowerCase()}</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState compact title="No player rounds in this window." />
      ) : (
        <div className="ch-lg__tbl" role="table" aria-label="Strokes gained by leg per player">
          <div className="ch-lg__r ch-lg__r--h" role="row">
            <span role="columnheader">Player</span>
            {LEGS_LIST.map((l) => (
              <span key={l} role="columnheader" className={'c' + (l === leg ? ' is-col' : '')}>
                {l}
              </span>
            ))}
            <span role="columnheader" className="r">Total</span>
            <span role="columnheader" className="r">Trend</span>
          </div>
          {rows.map((g) => (
            <Link
              key={g.id}
              href={playerHref(g.id)}
              role="row"
              className={'ch-lg__r' + (g.id === focus ? ' is-sel' : '')}
              onMouseEnter={() => setFocus(g.id)}
              onFocus={() => setFocus(g.id)}
            >
              <span role="cell" className="ch-who">
                <Avatar name={g.name} size={30} />
                <span>
                  <b>{g.name}</b>
                  <span className="ch-who__m ch-num">
                    {g.rounds} {g.rounds === 1 ? 'round' : 'rounds'}
                  </span>
                </span>
              </span>
              {g.legs.map((v, i) => (
                <span key={i} role="cell" className={'ch-lg__cell ch-num' + (i === li ? ' is-col' : '')} style={{ background: fill(v) }}>
                  <span className={v == null ? '' : v >= 0 ? 'ch-gain' : 'ch-loss'}>{v == null ? NO_DATA : formatSigned(v)}</span>
                </span>
              ))}
              <span role="cell" className={'r ch-num ch-lg__tot ' + (g.total == null ? '' : g.total >= 0 ? 'ch-gain' : 'ch-loss')}>
                {g.total == null ? 'Early read' : formatSigned(g.total)}
              </span>
              <span role="cell" className={'r ch-num ch-lg__ch ' + (g.change == null ? '' : g.change >= 0 ? 'ch-gain' : 'ch-loss')}>
                {g.change == null ? (
                  NO_DATA
                ) : (
                  <>
                    <Icon icon={g.change >= 0 ? TrendingUp : TrendingDown} size={14} />
                    {formatSigned(g.change)}
                  </>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
