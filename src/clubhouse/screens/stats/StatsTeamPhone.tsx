'use client';

import { Tabs } from '@base-ui/react/tabs';
import NumberFlow from '@number-flow/react';
import { ChartColumn, ChevronRight, Medal, Users } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, type CSSProperties } from 'react';
import type { ChFigure, ChLeg, ChTeamStats } from '../../data/stats-team';
import { LEGS_LIST } from './legs';
import { Avatar } from '../../ui/Avatar';
import { EmptyState } from '../../ui/States';
import { PageRefreshNotice } from '../../ui/RefreshNotice';
import { StatsTeamFirstRun } from './StatsTeamFirstRun';
import { Icon } from '../../ui/Icon';
import { SectionBoundary, SectionGroup, SectionGroupNotice } from '../../ui/SectionBoundary';
import { Segmented } from '../../ui/Segmented';
import { changeTone, formatFixed, formatSigned, formatToPar, MINUS, NO_DATA } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { CH_DUR, CH_EASE } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { sgBaseline, sgScale, sgShare } from '../../lib/sg';
import { gridPeek, teamPlayerHref } from './links';
import { PlayerPeek } from '../../ui/PlayerPeek';
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
/** The leg the strokes gained readout shows and the players' SG sort ranks by: the team total or one of the four legs. */
export type ChLegPick = 'total' | ChLeg;

// Recharts loads on its own chunk after the page has painted, and never on desktop (this module is imported there too).
// The page holds the chart's box and its accessible summary, so nothing waits on it or moves when it lands.
const TeamTrendChart = dynamic(() => import('./TeamTrendChart'), { ssr: false, loading: () => null });

/** Number Flow on the Clubhouse curve: digits roll over base, fade over quick (D-64); instant when reduced. */
const FLOW_TIMING = {
  transformTiming: { duration: CH_DUR.base * 1000, easing: `cubic-bezier(${CH_EASE.join(',')})` },
  spinTiming: { duration: CH_DUR.base * 1000, easing: `cubic-bezier(${CH_EASE.join(',')})` },
  opacityTiming: { duration: CH_DUR.quick * 1000, easing: 'ease-out' },
} as const;
const ONE_PLACE = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;

/**
 * A signed strokes-gained value whose digits roll when it changes (a leg picked; never on first paint, never on a
 * window change, which remounts it). Intl draws a hyphen, so the sign is ours: a true minus, a plus, none at 0.0
 * (formatSigned's rule). Assistive technology reads the formatted text; the rolling digits are hidden from it.
 */
function SignedFlow({ value, suffix = '' }: { value: number; suffix?: string }) {
  const reduced = useChReducedMotion();
  const text = formatSigned(value);
  const sign = text.startsWith('+') ? '+' : text.startsWith(MINUS) ? MINUS : '';
  return (
    <>
      <span className="ch-sr-only">
        {text}
        {suffix}
      </span>
      <span aria-hidden="true">
        <NumberFlow value={Number(Math.abs(value).toFixed(1))} format={ONE_PLACE} prefix={sign} suffix={suffix} animated={!reduced} {...FLOW_TIMING} />
      </span>
    </>
  );
}

const legIndex = (leg: ChLegPick) => (leg === 'total' ? -1 : LEGS_LIST.indexOf(leg));

/**
 * Team stats on the phone, direction A "native analysis" (owner, 2026-10-08): the team over its large title, the window
 * and filter, one hero figure (the scoring average) with its trend directly under it, then grouped inset lists: the
 * round's other figures, strokes gained by leg (the rows pick a leg), the players (ranked by that leg on SG) and putting
 * by distance. Same loader, window change, filter, notices and catalog as before (design/handoff/m-stats.jsx is the
 * board it recomposes); season bests and export stay on desktop. Stats is a coach tab (D-66), so the shell's top bar is
 * the tab root and the page adds nothing to it.
 */
export function StatsTeamPhone({ data }: { data: ChTeamStats }) {
  const go = useGoWindow();
  const shown = useShownWindow();
  // The leg and the sort come back when the coach returns to the page (PAGE_PERFORMANCE.md rule 1).
  const [leg, setLeg] = useChSessionState<ChLegPick>('team-sg-leg', 'total');
  const [sort, setSort] = useChSessionState<Sort>('team-players-sort', 'avg');
  const noRounds = !data.roundsError && data.roundCount === 0;
  // D-71's first-run page is for no round of either length: a team with only 9-hole rounds gets CH-4301 and the CH-4319 hint instead.
  const nineOnly = noRounds && nineRoundsInWindow(data.filter, data.filterOptions);
  const filtered = isFiltered(data.filter);
  const showFilter = !data.roundsError && (data.filterOptions.total > 0 || filtered);
  // Two or more parts that didn't load are told once, under the head, with one Try again; each keeps its title (CH-1209).
  const failed: string[] = [];
  if (!data.roundsError && !noRounds) {
    if (data.cacheError) failed.push('some team figures');
    if (data.puttsError) failed.push('team putting');
  }
  const covered = failed.length > 1;
  // A window or filter change remounts the rolling figures, so only a leg change rolls them; new rounds swap in at once.
  const scope = JSON.stringify(data.filter);
  // CH-4703: picking a leg is one selection tick, and ranks the players by it (the SG sort).
  const pickLeg = (next: ChLegPick) => {
    if (next === leg) return;
    haptic('select');
    setLeg(next);
    setSort('sg');
  };
  return (
    // Sections that crash together are told once, under the controls (CH-1210).
    <SectionGroup>
      <div className="ch-stm is-team">
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
        {/* The page's one read failed, so the page says so as its whole body (CH-1211), not a notice over a blank page. */}
        {data.roundsError && (
          <EmptyState
            size="page"
            tone="danger"
            code="CH-4201"
            title="Team rounds didn’t load"
            body="Every figure would be incomplete, so none is shown. The error has been reported."
          />
        )}
        <PageRefreshNotice parts={failed} />
        <SectionGroupNotice />
        {filtered && data.roundCount > 0 && data.roundsEffective < 3 && <EarlyRead code="CH-4314" count={data.roundCount} whole={data.roundsEffective} />}
        {noRounds && !filtered && <NineHint code="CH-4319" filter={data.filter} options={data.filterOptions} who="This team has" />}
        {noRounds && filtered ? (
          <TeamFilterEmpty />
        ) : noRounds && data.window === 'season' && !nineOnly ? (
          <StatsTeamFirstRun />
        ) : noRounds ? (
          // The whole page body is empty, so it is the page's empty state, not a section's (states audit, 2026-10-08).
          <EmptyState
            size="page"
            code={data.window === 'qualifiers' ? 'CH-4302' : 'CH-4301'}
            icon={data.window === 'qualifiers' ? Medal : ChartColumn}
            title={data.window === 'qualifiers' ? 'No qualifier rounds this season yet' : 'No 18-hole rounds in this window yet'}
            body={data.window === 'qualifiers' ? 'Qualifier rounds appear here once they are posted as qualifying.' : 'Team stats fill in as players post countable rounds.'}
            action={data.window !== 'season' ? <ShowSeason /> : undefined}
          />
        ) : (
          !data.roundsError && (
            <>
              <SectionBoundary surface="stats.team.figures" label="Team figures" code="CH-4204">
                {data.cacheError && (
                  <RetryNotice code="CH-4202" title="Some team figures didn’t load" body="Scoring is correct; greens, putts and scrambling are missing. The error has been reported." covered={covered} />
                )}
                <Hero figure={data.figures.find((f) => f.label === 'Scoring average')} />
                {/* The trend reads the hero, so it sits right under it; it crashes on its own. */}
                <SectionBoundary surface="stats.team.trend" label="Scoring trend" code="CH-4205">
                  <Trend data={data} />
                </SectionBoundary>
                <RoundFigures data={data} />
              </SectionBoundary>
              <SectionBoundary surface="stats.team.legs" label="Strokes gained by leg" code="CH-4206">
                <Legs key={scope} data={data} leg={leg} onLeg={pickLeg} />
              </SectionBoundary>
              <SectionBoundary surface="stats.team.players" label="Players" code="CH-4206">
                <Players key={scope} data={data} leg={leg} sort={sort} onSort={setSort} />
              </SectionBoundary>
              <SectionBoundary surface="stats.team.putting" label="Team putting" code="CH-4207">
                <Putting data={data} covered={covered} />
              </SectionBoundary>
            </>
          )
        )}
      </div>
    </SectionGroup>
  );
}

/** The class a change takes: green when it moved the good way, amber the other, none when it rounds to zero (D-42, F-54). */
function toneClass(f: ChFigure): string {
  const t = changeTone(f.delta, f.lowerIsBetter, f.digits);
  return t === 'is-gain' ? 'ch-gain' : t === 'is-loss' ? 'ch-loss' : '';
}

const figureValue = (f: ChFigure) => (f.value == null ? NO_DATA : `${f.value.toFixed(f.digits)}${f.unit}`);

/**
 * The one hero figure: the scoring average, its change and what the change is against ("vs. previous 10"). A window with
 * no comparison keeps the line, empty and hidden from assistive technology, so the trend below never moves.
 */
function Hero({ figure: f }: { figure: ChFigure | undefined }) {
  if (!f) return null;
  const none = f.delta == null;
  // What the average is against par a round (the loader's, per 18 holes), over the change: no bare number (2026-10-07).
  const toPar = f.gauge?.kind === 'par' ? f.gauge.toPar : null;
  return (
    <dl className="ch-stm-hero">
      <dt>{f.label}</dt>
      {toPar != null && <dd className="ch-stm-hero__par ch-num">{formatToPar(toPar, 1) === 'E' ? 'Even par' : `${formatToPar(toPar, 1)} to par`}</dd>}
      <dd className="ch-stm-hero__v ch-num">{figureValue(f)}</dd>
      <dd className="ch-stm-hero__c" aria-hidden={none ? true : undefined}>
        {!none && (
          <>
            <b className={'ch-num ' + toneClass(f)}>{formatSigned(f.delta, f.digits)}</b> {f.context}
          </>
        )}
      </dd>
    </dl>
  );
}

/** The team's average on each of its last ten round days against their mean (dashed), with a one-line reading. */
function Trend({ data }: { data: ChTeamStats }) {
  const days = data.days ?? [];
  const known = days.filter((d): d is { label: string; score: number } => d.score != null);
  // The heading is for assistive technology: the hero above names what the line is.
  const head = (
    <h2 id="ch-stm-trend" className="ch-sr-only">
      Scoring trend
    </h2>
  );
  // One round day is a point, not a trend: say so instead of dropping the section (F-41).
  if (known.length < 2)
    return (
      <section className="ch-stm-trend" aria-labelledby="ch-stm-trend">
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
  const mean = known.reduce((a, d) => a + d.score, 0) / known.length;
  return (
    <section className="ch-stm-trend" aria-labelledby="ch-stm-trend">
      {head}
      <div
        className="ch-stm-plot"
        role="img"
        aria-label={`Team scoring average by round day, from ${formatFixed(known[0]!.score)} to ${formatFixed(known[known.length - 1]!.score)}. ${reading} Lower scores sit higher.`}
      >
        <TeamTrendChart days={days} mean={mean} />
      </div>
      <p className="ch-stm-note">
        <span>Lower is better. {reading}</span>
        <span className="ch-stm-mean ch-num" aria-hidden="true">
          <i /> Mean {formatFixed(mean)}
        </span>
      </p>
    </section>
  );
}

/** What each of the round's other figures is drawn against, in words (owner, 2026-10-07: no bare numbers). */
function reference(f: ChFigure): string | null {
  const g = f.gauge;
  if (g?.kind === 'rate' && g.ref != null) return `${g.refLabel ?? 'Tour'} average ${Math.round(g.ref)}%`;
  if (g?.kind === 'putts') return 'Two putts a green is 36';
  return null;
}

/** Greens, putts and scrambling as an inset group: the value, then its change (green better, amber worse; D-42). */
function RoundFigures({ data }: { data: ChTeamStats }) {
  const rows = data.figures.filter((f) => !f.signed && f.label !== 'Scoring average').slice(0, 3);
  // Greens, putts and scrambling read the rounds with their holes (Q-123); this says how many, under the group.
  const coverage = data.holeRoundCount == null ? null : holeCoverage(data.holeRoundCount, data.roundCount);
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-stm-round">
      <div className="ch-stm-panel__h">
        <h2 id="ch-stm-round">The round</h2>
      </div>
      <dl className="ch-stm-group ch-stm-figrows">
        {rows.map((f) => {
          const ref = reference(f);
          return (
            <div key={f.label} className="ch-stm-figrow">
              <dt>
                <span>{f.label}</span>
                {ref && <span className="ch-stm-figrow__ref">{ref}</span>}
              </dt>
              <dd className="ch-stm-figrow__v ch-num">{figureValue(f)}</dd>
              <dd className={'ch-stm-figrow__d ch-num ' + toneClass(f)} aria-hidden={f.delta == null ? true : undefined}>
                {f.delta == null ? null : formatSigned(f.delta, f.digits)}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="ch-stm-cover" aria-hidden={coverage ? undefined : true}>
        {coverage}
      </p>
    </section>
  );
}

/**
 * Strokes gained per round by leg, against the baseline: the chosen leg's team figure over the legs as bars either side
 * of zero on the data's own scale, the total under them on the same scale. The rows are the leg picker (Base UI Tabs,
 * vertical): a wash slides to the chosen row, its figure rolls, and the players below rank by it.
 */
function Legs({ data, leg, onLeg }: { data: ChTeamStats; leg: ChLegPick; onLeg: (leg: ChLegPick) => void }) {
  const baseline = sgBaseline(data.tour);
  const legs = LEGS_LIST.map((l, i) => ({ l, v: data.legTotals[i] ?? null }));
  const known = legs.filter((x): x is { l: ChLeg; v: number } => x.v != null);
  const losing = known.filter((x) => x.v < -0.05);
  const head = (
    <div className="ch-stm-panel__h">
      <h2 id="ch-stm-legs">Strokes gained by leg</h2>
      <span>Per round · {baseline.vs}</span>
    </div>
  );
  if (!known.length)
    return (
      <section className="ch-stm-panel ch-stm-panel--bars" aria-labelledby="ch-stm-legs">
        {head}
        <EmptyState compact code="CH-4303" title="No strokes gained in this window." body="Strokes gained appears for rounds posted with shots." />
      </section>
    );
  const note = !losing.length
    ? `No leg is losing strokes against ${baseline.noun}.`
    : losing.length === 1
      ? `${losing[0]!.l} is the only leg losing strokes, ${Math.abs(losing[0]!.v).toFixed(1)} a round.`
      : `${losing.length} legs are losing strokes: ${losing.map((x) => x.l).join(', ')}.`;
  // The team total is the window's own mean (data.team.sgMean), never the legs added up.
  const rows: Array<{ key: ChLegPick; label: string; v: number | null; total?: boolean }> = [
    ...legs.map(({ l, v }) => ({ key: l, label: l as string, v })),
    { key: 'total', label: 'Team total', v: data.team.sgMean, total: true },
  ];
  const scale = sgScale(rows.map((r) => r.v));
  const picked = rows.find((r) => r.key === leg) ?? rows[rows.length - 1]!;
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-stm-legs">
      {head}
      <div className="ch-stm-group">
        <p className="ch-stm-sgfig">
          <b className={'ch-num ' + (picked.v == null ? '' : picked.v >= 0 ? 'ch-gain' : 'ch-loss')}>{picked.v == null ? NO_DATA : <SignedFlow value={picked.v} />}</b>
          <span>{picked.total ? 'Team total' : picked.label}, a round</span>
        </p>
        <Tabs.Root value={picked.key} onValueChange={(v) => onLeg(v as ChLegPick)} orientation="vertical">
          <Tabs.List className="ch-stm-legs" aria-label="Strokes gained leg">
            {rows.map(({ key, label, v, total }) => (
              <Tabs.Tab key={key} value={key} className={'ch-stm-leg' + (total ? ' is-total' : '')} aria-label={`${label}, ${v == null ? 'no data' : formatSigned(v)}`}>
                <span>{label}</span>
                <span className="ch-stm-leg__bar" aria-hidden="true">
                  <i className="ch-stm-leg__z" />
                  {v != null && <i className={'ch-stm-leg__v ' + (v >= 0 ? 'is-gain' : 'is-loss')} style={{ [v >= 0 ? 'left' : 'right']: '50%', width: `${sgShare(v, scale) * 50}%` }} />}
                </span>
                <b className={'ch-num ' + (v == null ? '' : v >= 0 ? 'ch-gain' : 'ch-loss')}>{v == null ? NO_DATA : formatSigned(v)}</b>
              </Tabs.Tab>
            ))}
            {/* Base UI measures the chosen row; the stylesheet reads it as Clubhouse properties and slides the wash. */}
            <Tabs.Indicator
              className="ch-stm-legpick"
              style={(s) =>
                s.activeTabPosition && s.activeTabSize
                  ? ({ '--ch-stm-pick-y': `${s.activeTabPosition.top}px`, '--ch-stm-pick-h': `${s.activeTabSize.height}px` } as CSSProperties)
                  : undefined
              }
            />
          </Tabs.List>
        </Tabs.Root>
      </div>
      <p className="ch-stm-note">{note}</p>
    </section>
  );
}

function Players({ data, leg, sort, onSort }: { data: ChTeamStats; leg: ChLegPick; sort: Sort; onSort: (s: Sort) => void }) {
  const i = legIndex(leg);
  // On SG the list ranks by the chosen leg (the team total by default); on Avg it shows each player's total.
  const sgOf = (p: ChTeamStats['grid'][number]) => (sort === 'sg' && i >= 0 ? (p.legs[i] ?? null) : p.total);
  const rows = useMemo(
    () =>
      [...data.grid].sort((a, b) => {
        if (sort === 'avg') return (a.avg ?? 999) - (b.avg ?? 999) || a.name.localeCompare(b.name);
        const x = sort === 'sg' && i >= 0 ? a.legs[i] : a.total;
        const y = sort === 'sg' && i >= 0 ? b.legs[i] : b.total;
        return (y ?? -99) - (x ?? -99) || a.name.localeCompare(b.name);
      }),
    [data.grid, sort, i],
  );
  const by = sort === 'avg' ? 'by scoring average' : i < 0 ? 'by strokes gained' : `by ${LEGS_LIST[i]} SG`;
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-stm-players">
      <div className="ch-stm-panel__h">
        <div className="ch-stm-gh">
          <h2 id="ch-stm-players">Players</h2>
          <span>{by}</span>
        </div>
        {/* CH-4703: Segmented ticks on a change only. */}
        <Segmented<Sort>
          size="sm"
          label="Sort players"
          value={sort}
          onChange={onSort}
          options={[
            { value: 'avg', label: 'Avg', aria: 'Avg, scoring average' },
            { value: 'sg', label: 'SG', aria: 'SG, strokes gained' },
          ]}
        />
      </div>
      {!rows.length ? (
        <EmptyState compact code="CH-4305" icon={Users} title="No player rounds in this window." body="Players appear here as they post countable rounds." />
      ) : (
        <ul className="ch-stm-list ch-stm-group">
          {rows.map((p) => {
            const sg = sgOf(p);
            return (
              <li key={p.id}>
                {/* P003-C1: a hold peeks at the player; a tap still opens their stats. */}
                <PlayerPeek player={gridPeek(p)}>
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
                      <span className={sg == null ? '' : sg >= 0 ? 'ch-gain' : 'ch-loss'}>{sg == null ? 'Early read' : <SignedFlow value={sg} suffix=" SG" />}</span>
                    </span>
                    <Icon icon={ChevronRight} size={16} className="ch-stm-row__chev" />
                    <LinkPending />
                  </Link>
                </PlayerPeek>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Make rate by distance: a bar per band, the Tour rate as a mark, a band under it in amber. */
function Putting({ data, covered }: { data: ChTeamStats; covered: boolean }) {
  if (data.puttsError) return <RetryNotice code="CH-4203" title="Team putting didn’t load" body="Try again; the error has been reported." covered={covered} />;
  if (!data.putting) return <EmptyState compact code="CH-4306" title="No putts logged in this window." body="Putting fills in from rounds posted with putt distances." />;
  const bands = data.putting.bands.slice(0, 5);
  const drawn = bands.reduce((a, b) => a + b.attempts, 0);
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-stm-putt">
      <div className="ch-stm-panel__h">
        <h2 id="ch-stm-putt">Team putting</h2>
        <span className="ch-num">Make rate by distance · {drawn} putts</span>
      </div>
      <div className="ch-stm-putt ch-stm-group">
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
      <p className="ch-stm-note">{puttingNote(data.putting.bands)} The mark is the Tour make rate.</p>
    </section>
  );
}

/**
 * The phone's scoring line (m-stats.jsx `Trend`; CH-4805): scores oldest to newest,
 * gaps skipped, the mean dashed, the newest point larger. Lower scores sit
 * higher, so a line that climbs is a player getting better, and the axis says
 * so: "Lower is better", the one scoring-axis convention (P004-D1). A player's stats on the phone draw it; Team stats
 * draws its own interactive line (TeamTrendChart).
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
  // The mean's label goes in the corner the line keeps clear of (right or left end, above or below the dashed line),
  // so it never sits on the data; the first clear corner wins, the right above first.
  const lineAt = (px: number) => {
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      if (px >= x(a.i) && px <= x(b.i)) return y(a.v) + ((px - x(a.i)) / Math.max(1e-6, x(b.i) - x(a.i))) * (y(b.v) - y(a.v));
    }
    return px < x(pts[0]!.i) ? y(pts[0]!.v) : y(last.v);
  };
  const labelW = 64;
  const corners = [
    { end: true, above: true },
    { end: true, above: false },
    { end: false, above: true },
    { end: false, above: false },
  ].map((c) => {
    const ty = c.above ? y(mean) - 5 : y(mean) + 14;
    const x0 = c.end ? W - pad - labelW : pad;
    let clear = Infinity;
    for (let px = x0; px <= x0 + labelW; px += 4) {
      const ly = lineAt(px);
      clear = Math.min(clear, ly < ty - 11 ? ty - 11 - ly : ly > ty + 3 ? ly - ty - 3 : 0);
    }
    return { ...c, ty, clear };
  });
  const spot = corners.find((c) => c.clear >= 4) ?? [...corners].sort((a, b) => b.clear - a.clear)[0]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ch-stm-chart" role="img" aria-label={`${label} Lower scores sit higher.`}>
      <line x1={pad} x2={W - pad} y1={y(mean)} y2={y(mean)} className="ch-stm-chart__mean" />
      <text x={spot.end ? W - pad : pad} y={spot.ty} textAnchor={spot.end ? 'end' : 'start'} className="ch-stm-chart__t">
        Mean {formatFixed(mean)}
      </text>
      <path d={d} className="ch-stm-chart__line" />
      {pts.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={p === last ? 4 : 2.4} className={p === last ? 'ch-stm-chart__dot is-last' : 'ch-stm-chart__dot'} />
      ))}
      <text x={pad} y={H - 2} className="ch-stm-chart__t">
        {from}
      </text>
      <text x={W / 2} y={H - 2} textAnchor="middle" className="ch-stm-chart__t">
        ↑ Lower is better
      </text>
      <text x={W - pad} y={H - 2} textAnchor="end" className="ch-stm-chart__t">
        {to}
      </text>
    </svg>
  );
}
