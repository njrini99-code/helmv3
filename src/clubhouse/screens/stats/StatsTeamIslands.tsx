'use client';

import { useHeroTone } from '../../ui/PageHero';
import { withPointSpan } from '../../ui/point-span';
import { ArrowDownRight, ArrowUpRight, CalendarRange, Download, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { createContext, useContext, useEffect, useId, useMemo, useState, useTransition, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ChLeg, ChTeamStats } from '../../data/stats-team';
import { LEGS_LIST } from './legs';
import type { ChWindow } from '../../data/stats-common';
import { basisWords, clearFilters, filterFor, isFiltered, isWindowChange, hasRange, statsHref, withWindow, type ChFilter } from '../../data/stats-filter';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/Segmented';
import { Swap } from '../../ui/Swap';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { useDelayedToast, useToast } from '../../ui/Toast';
import { useChPhone } from '../../lib/use-phone';
import { usePrinting } from './PrintHead';
import { useChSessionState } from '../../lib/session-state';
import { haptic } from '../../lib/haptics';
import { chReport, chTrail } from '../../lib/track';
import { CH_SLOW_SAVE_AFTER, isOffline } from '../../lib/use-action';
import { firstValue, gappedPath, lastValue } from '../../lib/chart';
import { formatSigned, NO_DATA } from '../../lib/format';
import { deltaTone, deltaWords } from '../../lib/stats-signal';
import { sgBaseline, sgScale } from '../../lib/sg';
import { changeWords, UpdatingNote, WindowSwitch } from './WindowSwitch';
import { FilterEmpty, StatsFilter } from './StatsFilter';
import { gridPeek, teamPlayerHref } from './links';
import { PlayerPeek } from '../../ui/PlayerPeek';
import { LinkPending } from '../../shell/LinkPending';
import { TeamRank } from './TeamRank';

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
export type ChTeamCharts = Pick<ChTeamStats, 'window' | 'filter' | 'weeks' | 'team' | 'players' | 'legWeeks' | 'legTotals' | 'grid' | 'tour' | 'roundCount' | 'figures'>;

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

/**
 * The phone's window switch, reading the frame itself: a tap moves the pill at once and re-renders only this, not the
 * whole page (the page re-rendered every chart in the click, 40ms in the Simulator audit, 2026-10-14).
 */
export function PhoneWindowSwitch({ custom }: { custom: boolean }) {
  const go = useGoWindow();
  return <WindowSwitch value={useShownWindow()} onChange={go} custom={custom} />;
}

/** The page frame: changing the window or the filter dims the page and marks it busy until the new rounds land. */
export function StatsTeamFrame({ filter: current, phone, children }: { filter: ChFilter; phone?: ReactNode; children: ReactNode }) {
  const printing = usePrinting();
  const isPhone = useChPhone() && phone != null && !printing;
  const tone = useHeroTone();
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
      <main className={'ch-st' + (isPhone ? ' is-phone' : '')} aria-busy={pending} data-ch-code={pending ? 'CH-4402' : undefined} data-canopy={isPhone || tone !== 'canopy' ? undefined : ''} data-hero-tone={tone}>
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
      toast({ tone: 'error', title: 'Couldn’t export team stats', body: 'Your browser blocked the download. Try a desktop browser.', code: 'CH-4001' });
    }
  };
  return (
    <div className="ch-st-head__act">
      <WindowSwitch value={useShownWindow()} onChange={go} custom={hasRange(filter)} />
      {/* Never export a half-loaded window: the page passes no grid then. */}
      {grid && grid.length > 0 && (
        <Button variant="ghost" leftIcon={Download} onClick={() => exportCsv(grid)} className="ch-btn--flush-end">
          Export
        </Button>
      )}
    </div>
  );
}

/** The empty window's way out. */
export function ShowSeason() {
  const go = useGoWindow();
  // The page empty's one primary action (CH-4301, CH-4302).
  return (
    <Button variant="primary" leftIcon={CalendarRange} onClick={() => go('season')}>
      Show the season
    </Button>
  );
}

/** The round filter (Filter button, chips, count line and sheet), changing the team page's address through the frame. */
export function TeamFilter({ filter, options, count, phone = false }: { filter: ChFilter; options: ChTeamStats['filterOptions']; count: number; phone?: boolean }) {
  const { go } = useContext(GoFilter);
  return <StatsFilter filter={filter} options={options} count={count} onChange={go} phone={phone} team codes={{ empty: 'CH-4313', pickEmpty: 'CH-4315', pickCap: 'CH-4316', range: 'CH-4101', holes: 'CH-4318' }} />;
}

/** The filter leaves no round: CH-4313, the whole page body, so the page's empty state; Clear filters is the way back. */
export function TeamFilterEmpty() {
  const { filter, go } = useContext(GoFilter);
  return <FilterEmpty page code="CH-4313" onClear={() => go(clearFilters(filter))} />;
}

/**
 * A failed read's notice; Try again re-runs the server render and says so while it runs. `covered`: the page's notice
 * (CH-1209) carries the one Try again, so this keeps only its title.
 */
export function RetryNotice({ code, title, body, covered = false }: { code: string; title: string; body: string; covered?: boolean }) {
  return <RefreshNotice code={code} title={title} body={body} covered={covered} />;
}

/** The trend, the leg cards and the grid: one island, because they share the focused player and the chosen leg. */
export function TeamCharts({ data, tape }: { data: ChTeamCharts; tape?: ReactNode }) {
  const [focus, setFocus] = useState<string | null>(null);
  // The chosen leg and lens come back when the coach returns to the page (PAGE_PERFORMANCE.md rule 1).
  const [leg, setLeg] = useChSessionState<ChLeg>('team-leg', 'Approach');
  return (
    <>
      <SectionBoundary surface="stats.team.trend" label="The trend chart" code="CH-4205">
        <TeamTrend data={data} focus={focus} setFocus={setFocus} />
      </SectionBoundary>

      {/* The other figures sit under the trend as one open tape (server-rendered, passed in so the island keeps its focus state). */}
      {tape}

      {/* Who gains and who loses (spec 4.5): after the figures and the trend, before the legs and the grid, its table view. */}
      <SectionBoundary surface="stats.team.rank" label="Who gains and loses" code="CH-4206">
        <TeamRank data={data} />
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
  const w = 900;
  const h = 300;
  // Room for a tick such as −1.5, and for half the last week's date, at the chart's tick size (stats.css `.ch-sgt__svg .ch-tick`).
  const padL = 46;
  const padR = 28;
  const padT = 16;
  const padB = 28;
  // Par is what the window's rounds were played against (the average score less the average to par), not a number written here.
  const scoreFig = data.figures.find((f) => f.key === 'score');
  const toPar = scoreFig?.gauge?.kind === 'par' ? scoreFig.gauge.toPar : null;
  const par = data.team.scoreMean != null && toPar != null ? data.team.scoreMean - toPar : null;
  const ref: number | null = isSg ? 0 : par;
  const [lo, hi] = useMemo(() => {
    if (!all.length) return isSg ? [-2, 2] : [par != null ? par - 2 : 0, par != null ? par + 6 : 8];
    const mn = Math.min(...all, ...(ref != null ? [ref] : []));
    const mx = Math.max(...all, ...(ref != null ? [ref] : []));
    const pad = isSg ? 0.4 : 0.8;
    return isSg ? [mn - pad, mx + pad] : [mx + pad, mn - pad];
  }, [all, isSg, par, ref]);
  const x = (i: number) => (n <= 1 ? (padL + w - padR) / 2 : padL + (i * (w - padL - padR)) / (n - 1));
  const y = (v: number) => padT + ((hi - v) / (hi - lo)) * (h - padT - padB);
  const ticks = isSg ? niceTicks(lo, hi) : niceTicks(Math.min(lo, hi), Math.max(lo, hi));
  const good = (v: number) => (isSg ? v >= 0 : par != null && v <= par);
  const fmt = (v: number) => (isSg ? formatSigned(v) : v.toFixed(1));
  // Players' scores read in whole strokes, as in the handoff; the team keeps its decimal.
  const fmtEnd = (v: number) => (isSg ? formatSigned(v) : v.toFixed(0));
  const sel = lines.find((l) => l.p.id === focus);
  // CH-4601: the player the pointer or the keyboard rests on comes forward without being chosen; a press chooses them
  // (focus, which the note, the legend and the grid follow). Their line turns green and is drawn again over the others,
  // which fade back, all over quick.
  const [peek, setPeek] = useState<string | null>(null);
  const litId = peek ?? focus;
  const lit = lines.find((l) => l.p.id === litId);
  const litPath = lit ? gappedPath(lit.v, x, y) : null;
  const litEnd = lit ? lastValue(lit.v) : null;
  const point = (id: string) => (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch') setPeek(id);
  };
  const tFirst = firstValue(team);
  const tLast = lastValue(team);
  const tMean = isSg ? data.team.sgMean : data.team.scoreMean;
  // A change reads as a change ("up about 1.0 a round since Aug 30"), never as a level the team has "gained".
  // What the weeks say, from the weekly line itself: the best week, the latest, and how many of them beat the reference.
  const known = team.flatMap((v, i) => (v == null ? [] : [{ v, i }]));
  const best = known.length ? known.reduce((a, b) => ((isSg ? b.v > a.v : b.v < a.v) ? b : a)) : null;
  const beats = (v: number) => ref != null && (isSg ? v >= ref : v <= ref);
  const ahead = ref != null ? known.filter((t) => beats(t.v)).length : null;
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
        ? sgChangeNote(`${sel.p.first}’s`, a.v, b.v, data.weeks[a.i]!)
        : `${sel.p.first} is ${d <= 0 ? 'down' : 'up'} ${Math.abs(d).toFixed(1)} strokes across this window, now ${fmtEnd(b.v)}.`;
    }
    if (!tFirst || !tLast || tFirst.i === tLast.i) return 'The trend needs rounds in at least two weeks.';
    const d = tLast.v - tFirst.v;
    return isSg
      ? sgChangeNote('The team’s', tFirst.v, tLast.v, data.weeks[tFirst.i]!)
      : `Team scoring is ${d <= 0 ? 'down' : 'up'} ${Math.abs(d).toFixed(1)} from ${data.weeks[tFirst.i]} to ${data.weeks[tLast.i]}, now ${tLast.v.toFixed(1)}.`;
  })();
  const sorted = [...lines].sort((a, b) => {
    const av = a.m ?? (isSg ? -99 : 999);
    const bv = b.m ?? (isSg ? -99 : 999);
    return isSg ? bv - av : av - bv;
  });
  const teamPath = gappedPath(team, x, y);
  const baseline = sgBaseline(data.tour);
  // Each player's window average as a bar from the reference, all on one scale (the widest gap), gold or mint by which side it is on.
  const gapOf = (m: number | null) => (m == null ? null : m - (ref ?? 0));
  const widest = Math.max(0, ...sorted.map((r) => Math.abs(gapOf(r.m) ?? 0)));
  // The headline: the window's own figure (strokes gained or scoring average) and how it moved against the previous window.
  const lead = data.figures.find((x) => x.key === (isSg ? 'sg' : 'score'));
  const leadValue = lead?.value ?? null;
  const leadText = leadValue == null ? NO_DATA : isSg ? formatSigned(leadValue, lead!.digits) : leadValue.toFixed(lead!.digits);
  // Coloured only when the change clears its standard error (Q4); otherwise neutral ink and "No clear change", the number kept.
  const leadTone = lead ? deltaTone(lead.delta, lead.se, lead.lowerIsBetter) : '';
  const uid = useId().replace(/:/g, '');
  // The scrubber: a pointer on the plot reads the week under it (mouse and pen; a finger scrolls the page).
  const [scrub, setScrub] = useState<number | null>(null);
  const onScrub = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * w;
    const at = n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - padL) / (w - padL - padR)) * (n - 1))));
    // The nearest week that has a team value (a week with no rounds is skipped, so the newest week always reads once it has one).
    let best: number | null = null;
    team.forEach((v, i) => {
      if (v != null && (best == null || Math.abs(i - at) < Math.abs(best - at))) best = i;
    });
    setScrub(best);
  };
  const yRef = ref != null ? y(ref) : null;
  // A team ending on the reference puts its end figure where the reference's label sits: the label moves to the left end.
  const refLabelLeft = yRef != null && tLast != null && Math.abs(y(tLast.v) - yRef) < 16;
  // The wash reaches full strength at the team's furthest week from the reference, so it reads at any scale.
  const reach = (side: 'up' | 'down') => {
    const ys = team.flatMap((v) => (v == null ? [] : [y(v)]));
    if (yRef == null || !ys.length) return yRef ?? 0;
    return side === 'up' ? Math.min(yRef - 1, ...ys) : Math.max(yRef + 1, ...ys);
  };

  return (
    <section className="ch-sgt">
      <div className="ch-sgt__hero" data-ch-code={lead?.state === 'empty' ? 'CH-4311' : lead?.state === 'no-comparison' ? 'CH-4312' : undefined}>
        <div className="ch-sgt__big">
          <h2 className="ch-sgt__k">{isSg ? 'Team strokes gained per round' : 'Team scoring average'}</h2>
          <span className="ch-sgt__row">
            <b className={'ch-sgt__n ch-num' + (!isSg || leadValue == null ? '' : leadValue >= 0 ? ' ch-gain' : ' ch-loss')}>
              <Swap swapKey={`${lens}${leadText}`} inline>
                {withPointSpan(leadText)}
              </Swap>
            </b>
            {lead?.delta == null && lead?.context && (
              <span className="ch-sgt__chg is-flat">
                <em>{lead.context}</em>
              </span>
            )}
            {lead?.delta != null && (
              <span className={`ch-sgt__chg ch-num ${leadTone === 'is-gain' ? 'is-good' : leadTone === 'is-loss' ? 'is-bad' : 'is-flat'}`}>
                <Icon icon={leadTone === '' ? Minus : lead.delta > 0 ? ArrowUpRight : ArrowDownRight} size={16} />
                {formatSigned(lead.delta, lead.digits)}
                <em>{deltaWords(lead.delta, leadTone, lead.context || 'vs previous 10')}</em>
              </span>
            )}
          </span>
          <span className="ch-sgt__vs">
            {isSg
              ? `Per round, weekly average · dashed line is ${baseline.noun} · names show the window average`
              : `Against par · ${data.roundCount} ${data.roundCount === 1 ? 'round' : 'rounds'} · lower is better · names show the window average`}
          </span>
          {best && (
            <dl className="ch-sgt__facts">
              <div>
                <dt>Best week</dt>
                <dd className="ch-num">
                  {fmt(best.v)}
                  <em>{data.weeks[best.i]}</em>
                </dd>
              </div>
              {tLast && (
                <div>
                  <dt>Latest week</dt>
                  <dd className="ch-num">
                    {fmt(tLast.v)}
                    <em>{data.weeks[tLast.i]}</em>
                  </dd>
                </div>
              )}
              {ahead != null && (
                <div>
                  <dt>{isSg ? 'Weeks ahead of the baseline' : 'Weeks at or under par'}</dt>
                  <dd className="ch-num">
                    {ahead}
                    <em>of {known.length}</em>
                    <span className="ch-sgt__pips" aria-hidden="true">
                      {known.map((t) => (
                        <i key={t.i} className={beats(t.v) ? 'is-up' : undefined} />
                      ))}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          )}
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
      {/* Strokes gained and Scoring crossfade (CH-4603). */}
      <Swap swapKey={lens}>
        {n === 0 || !all.length ? (
          // The empty window keeps the plot's height (the team's players set it), so the page below stays where it was.
          <div className="ch-sgt__hold" style={{ ['--ch-ends' as string]: data.players.length }}>
            <EmptyState code={isSg ? 'CH-4303' : 'CH-4304'} compact title={isSg ? 'No strokes gained in this window.' : 'No scores in this window.'} body={isSg ? 'Strokes gained appears for rounds posted with shots.' : undefined} />
          </div>
        ) : (
          <div className="ch-sgt__plot" style={{ ['--ch-ends' as string]: data.players.length }}>
            <svg
              viewBox={`0 0 ${w} ${h}`}
              className="ch-sgt__svg"
              role="img"
              aria-label={`${isSg ? 'Strokes gained' : 'Scoring average'} by week. ${note}`}
              onPointerMove={onScrub}
              onPointerLeave={() => setScrub(null)}
            >
              <defs>
                {yRef != null && (
                  <>
                    {/* The wash is strongest at the line and fades into the baseline: mint where the team is ahead of it, gold where behind. */}
                    <linearGradient id={`${uid}-gu`} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={yRef} y2={reach('up')}>
                      <stop offset="0" stopColor="var(--ch-stage-up)" stopOpacity={0.04} />
                      <stop offset="1" stopColor="var(--ch-stage-up)" stopOpacity={0.62} />
                    </linearGradient>
                    <linearGradient id={`${uid}-gd`} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={yRef} y2={reach('down')}>
                      <stop offset="0" stopColor="var(--ch-stage-down)" stopOpacity={0.04} />
                      <stop offset="1" stopColor="var(--ch-stage-down)" stopOpacity={0.58} />
                    </linearGradient>
                  </>
                )}
                <clipPath id={`${uid}-up`}>
                  <rect x={0} y={0} width={w} height={yRef ?? 0} />
                </clipPath>
                <clipPath id={`${uid}-down`}>
                  <rect x={0} y={yRef ?? 0} width={w} height={h - (yRef ?? 0)} />
                </clipPath>
              </defs>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--ch-ivory-200)" strokeOpacity={0.7} />
                  <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="ch-tick">
                    {isSg ? formatSigned(t, Number.isInteger(t) ? 0 : 1) : t}
                  </text>
                </g>
              ))}
              {data.weeks.map((wk, i) => (
                <text key={wk + i} x={x(i)} y={h - 8} textAnchor="middle" className="ch-tick">
                  {wk}
                </text>
              ))}
              {/* The team's line holds a wash to the reference: green where it sits above it (better), amber below. */}
              {teamPath && tFirst && tLast && yRef != null && (
                <g aria-hidden="true">
                  <path d={`${teamPath} L${x(tLast.i)},${yRef} L${x(tFirst.i)},${yRef} Z`} className="ch-sgt__wash is-up" fill={`url(#${uid}-gu)`} clipPath={`url(#${uid}-up)`} />
                  <path d={`${teamPath} L${x(tLast.i)},${yRef} L${x(tFirst.i)},${yRef} Z`} className="ch-sgt__wash is-down" fill={`url(#${uid}-gd)`} clipPath={`url(#${uid}-down)`} />
                </g>
              )}
              {yRef != null && (
                <g aria-hidden="true">
                  <line x1={padL} x2={w - padR} y1={yRef} y2={yRef} stroke="var(--ch-champagne-500)" strokeDasharray="4 4" />
                  <text x={refLabelLeft ? padL : w - padR} y={yRef - 7} textAnchor={refLabelLeft ? 'start' : 'end'} className="ch-tick ch-sgt__reflab">
                    {isSg ? baseline.noun.charAt(0).toUpperCase() + baseline.noun.slice(1) : 'Par'}
                  </text>
                </g>
              )}
              {lines.map(({ p, v }) => {
                const d = gappedPath(v, x, y);
                const on = p.id === litId;
                return d ? (
                  <path
                    key={p.id}
                    d={d}
                    className={'ch-sgt__line' + (on ? ' is-on' : '')}
                    stroke={on ? 'var(--ch-green-600)' : 'var(--ch-st-other-line)'}
                    strokeOpacity={on ? 1 : litId ? 0.12 : 0.28}
                    strokeWidth={on ? 2.25 : 1.25}
                  />
                ) : null;
              })}
              {/* The player in front, drawn again over the other lines; the team's line stays on top. */}
              {litPath && (
                <path key={`front-${litId}`} d={litPath} className="ch-sgt__front" fill="none" stroke="var(--ch-green-600)" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {teamPath && <path d={teamPath} className="ch-sgt__team" fill="none" stroke="var(--ch-st-team-line)" strokeWidth={3} strokeLinecap="round" />}
              {tLast && <circle className="ch-sgt__tdot" cx={x(tLast.i)} cy={y(tLast.v)} r={4.5} fill="var(--ch-ivory-25)" stroke="var(--ch-st-team-line)" strokeWidth={2.5} />}
              {scrub == null && tLast && (
                <text x={x(tLast.i) - 12} y={y(tLast.v) - 13} textAnchor="end" className="ch-sgt__callout">
                  {fmt(tLast.v)}
                </text>
              )}
              {best && tLast && best.i !== tLast.i && known.length > 2 && (
                <g aria-hidden="true" className="ch-sgt__best">
                  <circle cx={x(best.i)} cy={y(best.v)} r={4} />
                  <text x={x(best.i)} y={y(best.v) - 11} textAnchor="middle">
                    Best
                  </text>
                </g>
              )}
              {litEnd && <circle key={`end-${litId}`} className="ch-sgt__front" cx={x(litEnd.i)} cy={y(litEnd.v)} r={4} fill="var(--ch-ivory-25)" stroke="var(--ch-green-600)" strokeWidth={2} />}
              {scrub != null && team[scrub] != null && (
                <g aria-hidden="true" className="ch-sgt__scrub">
                  <line x1={x(scrub)} x2={x(scrub)} y1={padT} y2={h - padB} />
                  <circle cx={x(scrub)} cy={y(team[scrub]!)} r={5} />
                  <text x={Math.min(Math.max(x(scrub), padL + 54), w - padR - 54)} y={padT - 3} textAnchor="middle">
                    {data.weeks[scrub]} · {fmt(team[scrub]!)}
                  </text>
                </g>
              )}
              {/* A line is 1.25px: each takes the pointer along a wider invisible band, over everything drawn. */}
              {lines.map(({ p, v }) => {
                const d = gappedPath(v, x, y);
                return d ? (
                  <path
                    key={`hit-${p.id}`}
                    d={d}
                    className="ch-sgt__hit"
                    onPointerEnter={point(p.id)}
                    onPointerLeave={() => setPeek(null)}
                    onClick={() => setFocus(p.id === focus ? null : p.id)}
                  />
                ) : null;
              })}
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
                    onPointerEnter={point(p.id)}
                    onPointerLeave={() => setPeek(null)}
                    onFocus={(e) => {
                      if (focusVisible(e.currentTarget)) setPeek(p.id);
                    }}
                    onBlur={() => setPeek(null)}
                    onClick={() => {
                      haptic('select');
                      chTrail('stats focus player');
                      setFocus(p.id === focus ? null : p.id);
                    }}
                  >
                    <Avatar name={p.name} size={22} />
                    <span>{p.first}</span>
                    <i
                      className={'ch-sgt__bar' + (m != null && good(m) ? ' is-up' : '')}
                      style={{ ['--ch-bar' as string]: `${widest > 0 ? (Math.abs(gapOf(m) ?? 0) / widest) * 100 : 0}%` }}
                      aria-hidden="true"
                    />
                    <b className={`ch-num ${m == null ? '' : good(m) ? 'ch-gain' : 'ch-loss'}`}>{m != null ? fmtEnd(m) : NO_DATA}</b>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Swap>
      <p className="ch-note">{note}</p>
    </section>
  );
}

/** Focus from the keyboard (a Tab), not the focus a click leaves behind. */
function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
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

/** The middle of a leg's known values (the team's benchmark tick on the grid), or null with none. */
function median(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/** The leg a player loses most in, when they lose strokes in any; null otherwise. */
export function worstLeg(legs: Array<number | null>): number | null {
  let worst: number | null = null;
  legs.forEach((v, i) => {
    if (v != null && v < 0 && (worst == null || v < legs[worst]!)) worst = i;
  });
  return worst;
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
  // P004-A1: a ruled ledger, not 28 tinted boxes. Each cell is its signed number over a hairline track scaled to the
  // grid's largest cell (rounded up, at least 1), with one short tick at the team's median for that leg and a dot at
  // the player's value. Only the worst losing leg in a row keeps a wash, so "who loses most" still shows.
  const scale = sgScale(data.grid.flatMap((g) => g.legs));
  const medians = LEGS_LIST.map((_, i) => median(data.grid.map((g) => g.legs[i] ?? null)));
  const at = (v: number) => `${Math.max(0, Math.min(100, 50 + (v / scale) * 50)).toFixed(1)}%`;
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
        // CH-4602: choosing a leg re-sorts the grid, so the table settles in with the leg's column ringed (base in,
        // quick out) instead of its rows jumping; the whole table swaps, so its rows stay inside role=table.
        <Swap swapKey={leg}>
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
            {rows.map((g) => {
              const worst = worstLeg(g.legs);
              return (
              // P004-D4: the row is a div (role=row is not allowed on a link); the name is the link, and its hit area
              // covers the row, so the whole row still opens the player.
              <div
                key={g.id}
                role="row"
                className={'ch-lg__r' + (g.id === focus ? ' is-sel' : '')}
              >
                <span role="cell" className="ch-who">
                  <Avatar name={g.name} size={30} />
                  <span>
                    {/* P003-C1: resting on the name shows the player's card; the row still opens their stats. */}
                    <PlayerPeek player={gridPeek(g)}>
                      <Link href={playerHref(g.id)} className="ch-lg__a" onFocus={() => setFocus(g.id)} onMouseEnter={() => setFocus(g.id)}>
                        <b>{g.name}</b>
                        <LinkPending />
                      </Link>
                    </PlayerPeek>
                    <span className="ch-who__m ch-num">
                      {g.rounds} {g.rounds === 1 ? 'round' : 'rounds'}
                    </span>
                  </span>
                </span>
                {g.legs.map((v, i) => {
                  const med = medians[i];
                  return (
                    <span key={i} role="cell" className={'ch-lg__cell' + (i === li ? ' is-col' : '') + (i === worst ? ' is-worst' : '')}>
                      <span className={'ch-num ' + (v == null ? '' : v >= 0 ? 'ch-gain' : 'ch-loss')}>{v == null ? NO_DATA : formatSigned(v)}</span>
                      <span className="ch-lg__track" aria-hidden="true">
                        {med != null && <i className="ch-lg__med" style={{ left: at(med) }} />}
                        {v != null && <i className={'ch-lg__dot ' + (v >= 0 ? 'is-gain' : 'is-loss')} style={{ left: at(v) }} />}
                      </span>
                    </span>
                  );
                })}
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
              </div>
              );
            })}
          </div>
        </Swap>
      )}
    </section>
  );
}
