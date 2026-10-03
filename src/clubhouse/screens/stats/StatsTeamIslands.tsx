'use client';

import { Download, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { createContext, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ChLeg, ChTeamStats } from '../../data/stats-team';
import { LEGS_LIST } from './legs';
import type { ChWindow } from '../../data/stats-common';
import { basisWords, clearFilters, filterFor, isFiltered, isWindowChange, hasRange, statsHref, withWindow, type ChFilter } from '../../data/stats-filter';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/Segmented';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { useDelayedToast, useToast } from '../../ui/Toast';
import { useChPhone } from '../../lib/use-phone';
import { useChSessionState } from '../../lib/session-state';
import { haptic } from '../../lib/haptics';
import { chReport, chTrail } from '../../lib/track';
import { CH_SLOW_SAVE_AFTER, isOffline } from '../../lib/use-action';
import { firstValue, gappedPath, lastValue } from '../../lib/chart';
import { formatSigned, NO_DATA } from '../../lib/format';
import { sgBaseline, sgScale, sgTint } from '../../lib/sg';
import { changeWords, UpdatingNote, WindowSwitch } from './WindowSwitch';
import { FilterEmpty, StatsFilter } from './StatsFilter';
import { teamPlayerHref } from './links';
import { LinkPending } from '../../shell/LinkPending';

/*
 * Team stats' client islands. The page itself (StatsTeam) renders on the
 * server; only what the coach interacts with ships as client code: the
 * window switch and its busy state, Export, Try again, and the trend, leg
 * cards and grid, which share the focused player and the chosen leg.
 */

type Lens = 'sg' | 'score';

/** A spreadsheet reads a cell that starts with = + - @ (or a tab or a return) as a formula. Players type their own names, so the export writes them as text (40501). */
const asText = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

/** What the trend, the leg cards and the grid read; the rest of the page stays on the server. */
export type ChTeamCharts = Pick<ChTeamStats, 'window' | 'filter' | 'weeks' | 'team' | 'players' | 'legWeeks' | 'legTotals' | 'grid' | 'tour' | 'roundCount'>;

/** The filter in force and the one way to change it: the frame's offline refusal and slow notice, then the new address. */
const GoFilter = createContext<{ filter: ChFilter; go: (next: ChFilter) => void; shown: ChWindow }>({ filter: filterFor(), go: () => {}, shown: 'last10' });

/** The frame's window change (offline refusal, slow notice, then the new window), for the phone view. */
export function useGoWindow() {
  const { filter, go } = useContext(GoFilter);
  return (w: ChWindow) => go(withWindow(filter, w));
}

/** The window the switch shows: the one being loaded, from the tap, not from when its figures land (F-55). */
export function useShownWindow(): ChWindow {
  return useContext(GoFilter).shown;
}

/** The page frame: changing the window or the filter dims the page and marks it busy until the new rounds land. */
export function StatsTeamFrame({ filter: current, phone, children }: { filter: ChFilter; phone?: ReactNode; children: ReactNode }) {
  const isPhone = useChPhone() && phone != null;
  const router = useRouter();
  const toast = useToast();
  const delayedToast = useDelayedToast();
  const [pending, start] = useTransition();
  const here = statsHref('/golf/dashboard/stats', current);
  // The filter being loaded; cleared when the server answers with a new address.
  const [loading, setLoading] = useState<ChFilter | null>(null);
  useEffect(() => setLoading(null), [here]);
  // A choice back to what is already on screen (a quick Season, Qualifiers, Season) has nothing left to wait for: its slow notice ends with the tap.
  useEffect(() => {
    if (loading && statsHref('/golf/dashboard/stats', loading) === here) setLoading(null);
  }, [loading, here]);
  useEffect(() => {
    if (!loading) return;
    // CH-4902: a slow window or filter change says so once instead of dimming forever.
    const words = changeWords(current, loading);
    return delayedToast({ title: words.slow, body: `This is taking longer than usual. ${words.still}`, code: 'CH-4902' }, CH_SLOW_SAVE_AFTER);
  }, [loading, current, delayedToast]);
  const go = (next: ChFilter) => {
    if (isOffline()) {
      // CH-4901: nothing is requested while offline, and the control stays where it is.
      const words = changeWords(current, next);
      haptic('error');
      toast({ tone: 'error', title: words.offline, body: `Reconnect, then try again. ${words.still}`, code: 'CH-4901' });
      return;
    }
    chTrail(isWindowChange(current, next) ? `stats window ${next.window}` : 'stats filter');
    setLoading(next);
    start(() => router.push(statsHref('/golf/dashboard/stats', next), { scroll: false }));
  };
  return (
    <GoFilter.Provider value={{ filter: current, go, shown: (loading ?? current).window }}>
      <main className={'ch-st' + (isPhone ? ' is-phone' : '')} aria-busy={pending} data-ch-code={pending ? 'CH-4402' : undefined}>
        {/* The server renders desktop; at phone width it stays hidden until the phone view takes over at hydration. */}
        {isPhone ? phone : <div className="ch-st-desk">{children}</div>}
      </main>
      {/* CH-4903: the figures on screen are dimmed until the new ones land; this says which ones they are. */}
      <UpdatingNote from={current} to={loading} code="CH-4903" />
    </GoFilter.Provider>
  );
}

/** The header's window switch and Export. */
export function TeamHeadActions({ filter, teamName, grid }: { filter: ChFilter; teamName: string; grid: ChTeamStats['grid'] | null }) {
  const go = useGoWindow();
  const toast = useToast();
  const exportCsv = (rows: ChTeamStats['grid']) => {
    const head = ['Player', 'Rounds', ...LEGS_LIST.map((l) => `SG ${l}`), 'SG total'];
    const lines = rows.map((g) => [asText(g.name), g.rounds, ...g.legs.map((v) => v?.toFixed(2) ?? ''), g.total?.toFixed(2) ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
      a.download = `${teamName.replace(/\W+/g, '-').toLowerCase()}-stats-${filter.window}${isFiltered(filter) ? '-filtered' : ''}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      haptic('success');
      toast({ title: 'Team stats exported' });
    } catch (err) {
      chReport(err, { surface: 'stats.team.export', severity: 'low' });
      haptic('error');
      toast({ tone: 'error', title: "Couldn't export team stats", body: 'Your browser blocked the download. Try a desktop browser.', code: 'CH-4001' });
    }
  };
  return (
    <div className="ch-st-head__act">
      <WindowSwitch value={useShownWindow()} onChange={go} custom={hasRange(filter)} />
      {/* Never export a half-loaded window: the page passes no grid then. */}
      {grid && grid.length > 0 && (
        <Button variant="ghost" leftIcon={Download} onClick={() => exportCsv(grid)}>
          Export
        </Button>
      )}
    </div>
  );
}

/** The empty window's way out. */
export function ShowSeason() {
  const go = useGoWindow();
  return (
    <Button size="sm" onClick={() => go('season')}>
      Show the season
    </Button>
  );
}

/** The round filter (Filter button, chips, count line and sheet), changing the team page's address through the frame. */
export function TeamFilter({ filter, options, count, phone = false }: { filter: ChFilter; options: ChTeamStats['filterOptions']; count: number; phone?: boolean }) {
  const { go } = useContext(GoFilter);
  return <StatsFilter filter={filter} options={options} count={count} onChange={go} phone={phone} team codes={{ empty: 'CH-4313', pickEmpty: 'CH-4315', pickCap: 'CH-4316', range: 'CH-4101', holes: 'CH-4318' }} />;
}

/** The filter leaves no round: CH-4313, and Clear filters is the way back. */
export function TeamFilterEmpty() {
  const { filter, go } = useContext(GoFilter);
  return <FilterEmpty code="CH-4313" onClear={() => go(clearFilters(filter))} />;
}

/** A failed read's notice; Try again re-runs the server render. */
export function RetryNotice({ code, title, body }: { code: string; title: string; body: string }) {
  const router = useRouter();
  return <InlineNotice code={code} title={title} body={body} onRetry={() => router.refresh()} />;
}

/** The trend, the leg cards and the grid: one island, because they share the focused player and the chosen leg. */
export function TeamCharts({ data }: { data: ChTeamCharts }) {
  const [focus, setFocus] = useState<string | null>(null);
  // The chosen leg and lens come back when the coach returns to the page (PAGE_PERFORMANCE.md rule 1).
  const [leg, setLeg] = useChSessionState<ChLeg>('team-leg', 'Approach');
  return (
    <>
      <SectionBoundary surface="stats.team.trend" label="The trend chart" code="CH-4205">
        <TeamTrend data={data} focus={focus} setFocus={setFocus} />
      </SectionBoundary>

      <SectionBoundary surface="stats.team.legs" label="Strokes gained by leg" code="CH-4206">
        <LegTrends legWeeks={data.legWeeks} legTotals={data.legTotals} leg={leg} setLeg={setLeg} />
        <LegGrid data={data} leg={leg} focus={focus} setFocus={setFocus} />
      </SectionBoundary>
    </>
  );
}

function LegTrends({ legWeeks, legTotals, leg, setLeg }: { legWeeks: ChTeamStats['legWeeks']; legTotals: ChTeamStats['legTotals']; leg: ChLeg; setLeg: (l: ChLeg) => void }) {
  return (
    <section className="ch-sgm-row" aria-label="Strokes gained by leg, team">
      {LEGS_LIST.map((l, i) => (
        <LegTrend
          key={l}
          leg={l}
          data={legWeeks[l]}
          mean={legTotals[i] ?? null}
          selected={leg === l}
          onSelect={() => {
            haptic('select');
            setLeg(l);
          }}
        />
      ))}
    </section>
  );
}

function TeamTrend({ data, focus, setFocus }: { data: ChTeamCharts; focus: string | null; setFocus: (id: string | null) => void }) {
  const [lens, setLens] = useChSessionState<Lens>('team-lens', 'sg');
  const isSg = lens === 'sg';
  const n = data.weeks.length;
  const team = isSg ? data.team.sg : data.team.score;
  // `m` is the window's own mean: what the list beside the chart shows and is sorted by (never the last week's value).
  const lines = data.players.map((p) => ({ p, v: isSg ? p.sg : p.score, m: isSg ? p.sgMean : p.scoreMean })).filter((l) => l.v.some((x) => x != null));
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
  // Players' scores read in whole strokes, as in the handoff; the team keeps its decimal.
  const fmtEnd = (v: number) => (isSg ? formatSigned(v) : v.toFixed(0));
  const sel = lines.find((l) => l.p.id === focus);
  const tFirst = firstValue(team);
  const tLast = lastValue(team);
  const tMean = isSg ? data.team.sgMean : data.team.scoreMean;
  // A change reads as a change ("up about 1.0 a round since Aug 30"), never as a level the team has "gained".
  const sgChangeNote = (who: string, from: number, to: number, since: string) => {
    const d = to - from;
    return Math.abs(d) < 0.15
      ? `${who} strokes gained are flat since ${since}.`
      : `${who} strokes gained are ${d > 0 ? 'up' : 'down'} about ${Math.abs(d).toFixed(1)} a round since ${since}, a weekly average from ${formatSigned(from)} to ${formatSigned(to)}.`;
  };
  const note = (() => {
    if (sel) {
      const a = firstValue(sel.v);
      const b = lastValue(sel.v);
      if (!a || !b || a.i === b.i) return `${sel.p.first} has one week in this window so far.`;
      const d = b.v - a.v;
      return isSg
        ? sgChangeNote(`${sel.p.first}'s`, a.v, b.v, data.weeks[a.i]!)
        : `${sel.p.first} is ${d <= 0 ? 'down' : 'up'} ${Math.abs(d).toFixed(1)} strokes across this window, now ${fmtEnd(b.v)}.`;
    }
    if (!tFirst || !tLast || tFirst.i === tLast.i) return 'The trend needs rounds in at least two weeks.';
    const d = tLast.v - tFirst.v;
    return isSg
      ? sgChangeNote("The team's", tFirst.v, tLast.v, data.weeks[tFirst.i]!)
      : `Team scoring is ${d <= 0 ? 'down' : 'up'} ${Math.abs(d).toFixed(1)} from ${data.weeks[tFirst.i]} to ${data.weeks[tLast.i]}, now ${tLast.v.toFixed(1)}.`;
  })();
  const sorted = [...lines].sort((a, b) => {
    const av = a.m ?? (isSg ? -99 : 999);
    const bv = b.m ?? (isSg ? -99 : 999);
    return isSg ? bv - av : av - bv;
  });
  const teamPath = gappedPath(team, x, y);
  const baseline = sgBaseline(data.tour);

  return (
    <section className="ch-sgt">
      <div className="ch-sgt__head">
        <div>
          <h2>{isSg ? 'Strokes gained · total' : 'Scoring average'}</h2>
          <span>
            {isSg
              ? `Per round, weekly average · dashed line is ${baseline.noun} · names show the window average`
              : `Team and players · par 72 · ${data.roundCount} ${data.roundCount === 1 ? 'round' : 'rounds'} · dashed line is par · names show the window average`}
          </span>
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
        // The empty window keeps the plot's height (the team's players set it), so the page below stays where it was.
        <div className="ch-sgt__hold" style={{ ['--ch-ends' as string]: data.players.length }}>
          <EmptyState code={isSg ? 'CH-4303' : 'CH-4304'} compact title={isSg ? 'No strokes gained in this window.' : 'No scores in this window.'} body={isSg ? 'Strokes gained appears for rounds posted with shots.' : undefined} />
        </div>
      ) : (
        <div className="ch-sgt__plot" style={{ ['--ch-ends' as string]: data.players.length }}>
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
              <b className="ch-num">{tMean != null ? fmt(tMean) : NO_DATA}</b>
            </div>
            {sorted.map(({ p, m }) => {
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
                  <b className={`ch-num ${m == null ? '' : good(m) ? 'ch-gain' : 'ch-loss'}`}>{m != null ? fmtEnd(m) : NO_DATA}</b>
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

function LegTrend({ leg, data, mean, selected, onSelect }: { leg: ChLeg; data: Array<number | null>; mean: number | null; selected: boolean; onSelect: () => void }) {
  const w = 260;
  const h = 92;
  const pad = 10;
  const vals = data.filter((v): v is number => v != null);
  // The handoff's range (−1.5 to +1), widened only when a week falls outside it.
  const lo = Math.min(-1.5, Math.min(...vals) - 0.2);
  const hi = Math.max(1, Math.max(...vals) + 0.2);
  const x = (i: number) => (data.length <= 1 ? w / 2 : pad + (i * (w - pad * 2)) / (data.length - 1));
  const y = (v: number) => pad + ((hi - v) / (hi - lo)) * (h - pad * 2);
  const a = firstValue(data);
  const b = lastValue(data);
  // The headline is the window's mean per round, not the latest week's value; the line and its dot still end on the latest week.
  const tone = mean == null ? 'var(--ch-ink-400)' : mean >= 0 ? 'var(--ch-chart-gain)' : 'var(--ch-chart-loss)';
  const d = gappedPath(data, x, y);
  const ch = a && b && a.i !== b.i ? b.v - a.v : null;
  return (
    <button type="button" className="ch-sgm" aria-pressed={selected} onClick={onSelect}>
      <span className="ch-sgm__top">
        <span className="ch-sgm__l">{leg}</span>
        <span className={`ch-sgm__v ch-num ${mean == null ? '' : mean >= 0 ? 'ch-gain' : 'ch-loss'}`}>{mean != null ? formatSigned(mean) : NO_DATA}</span>
      </span>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="ch-sgm__svg" aria-hidden="true">
        <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} stroke="var(--ch-champagne-500)" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {/* The area to the baseline spans the weeks that have a value, never the empty edges. */}
        {d && a && b && <path d={`${d} L${x(b.i)},${y(0)} L${x(a.i)},${y(0)} Z`} fill={tone} opacity={0.08} />}
        {d && <path d={`${d}`} fill="none" stroke={tone} strokeWidth={1.75} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {b && <circle cx={x(b.i)} cy={y(b.v)} r={3.5} fill="var(--ch-ivory-25)" stroke={tone} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />}
      </svg>
      <span className="ch-sgm__n">{ch == null ? (b ? 'One week so far' : 'No strokes gained yet') : Math.abs(ch) < 0.15 ? 'Flat across the window' : `${ch > 0 ? 'Up' : 'Down'} ${Math.abs(ch).toFixed(1)} across the window`}</span>
    </button>
  );
}

/** Which rounds the grid reads, in a clause: the window's own words, or what the filter selects. */
function gridBasis(filter: ChFilter): string {
  const b = basisWords(filter);
  return b.charAt(0).toLowerCase() + b.slice(1);
}

function LegGrid({
  data,
  leg,
  focus,
  setFocus,
}: {
  data: ChTeamCharts;
  leg: ChLeg;
  focus: string | null;
  setFocus: (id: string | null) => void;
}) {
  const playerHref = (id: string) => teamPlayerHref(id, data.filter);
  const li = LEGS_LIST.indexOf(leg);
  const rows = [...data.grid].sort((a, b) => (b.legs[li] ?? -99) - (a.legs[li] ?? -99));
  // The tint scales to the largest cell in the grid (rounded up, at least 1), not to a fixed 1.2.
  const scale = sgScale(data.grid.flatMap((g) => g.legs));
  const fill = (v: number | null) => sgTint(v, scale);
  return (
    <section className="ch-lg">
      <div className="ch-sgt__head">
        <div>
          <h2>Where each player gains and loses</h2>
          <span>
            Strokes gained per round by leg &middot; {gridBasis(data.filter)} &middot; needs three rounds &middot; sorted by {leg.toLowerCase()}
          </span>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState code="CH-4305" compact title="No player rounds in this window." />
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
              <span
                role="cell"
                data-ch-code={g.total == null ? 'CH-4308' : undefined}
                className={'r ch-num ch-lg__tot ' + (g.total == null ? '' : g.total >= 0 ? 'ch-gain' : 'ch-loss')}
              >
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
              <LinkPending />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
