'use client';

import { AlertTriangle, ChartColumn, Flag, Medal } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { Button } from '../../ui/Button';
import { useBigText } from './StatsPlayerPhoneShs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ChTeamStats } from '../../data/stats-team';
import { hasRange, isFiltered, nineRoundsInWindow } from '../../data/stats-filter';
import { holeCoverage } from '../../data/round-scope';
import { formatFixed, formatSigned, formatToPar } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import { TERMS } from '../../lib/glossary';
import { haptic } from '../../lib/haptics';
import { pluralWord } from '../../lib/plural';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useChSessionState } from '../../lib/session-state';
import { deltaTone } from '../../lib/stats-signal';
import { useArrivalPainted } from '../../lib/use-painted';
import { Icon } from '../../ui/Icon';
import { PageRefreshNotice } from '../../ui/RefreshNotice';
import { SectionBoundary, SectionGroup, SectionGroupNotice } from '../../ui/SectionBoundary';
import { EmptyState } from '../../ui/States';
import { hashOf, type StatsDetailId, type StatsTeamDetailId } from './detail-route';
import { LEGS_LIST } from './legs';
import { MiniDiverging } from './MiniCharts';
import { TeamFeatureChart } from './ScoringFeatureChart';
import { Ribbon, SHS_HOW } from './ShsBlocks';
import { divergeBar, filterKey, sgTone, windowShort, type ShsTone } from './shs-figures';
import { useGrowOnce, useStuck, WindowCrossfade } from './shs-motion';
import { EarlyRead, NineHint } from './StatsFilter';
import { DetailHero, StatsDetailScreen } from './StatsDetailScreen';
import { PhoneWindowSwitch, RetryNotice, ShowSeason, TeamFilter, TeamFilterEmpty } from './StatsTeamIslands';
import { figureValue, Players, Putting, reference, teamDaysMean, teamTrendReading, type ChLegPick } from './StatsTeamPhone';
import { TeamInsight } from './StatsInsight';
import { ShsArrow, ShsCard, ShsPill, SummaryCard } from './SummaryCard';
import { teamRankRows } from './team-rank';
import { TeamRank } from './TeamRank';
import { useStatsDetail, type StatsArrivalState } from './use-stats-detail';

const TITLE: Readonly<Record<StatsTeamDetailId, string>> = { tscore: 'Team scoring', tgame: 'Team game', tplayers: 'Players' };

const windowDays = (data: ChTeamStats) => (data.window === 'last10' && !isFiltered(data.filter) ? `Last ${data.last} days` : windowShort(data.filter));


/** "Sam gains the most; Lee loses the most", and "loses the least" when everyone is below zero (08 criterion 57). */
export function teamSentence(rows: ReadonlyArray<{ name: string; value: number | null }>): string | null {
  const known = rows.filter((r): r is { name: string; value: number } => r.value != null).sort((a, b) => b.value - a.value);
  if (!known.length) return null;
  const top = known[0]!;
  const end = known[known.length - 1]!;
  const first = top.value >= 0 ? `${top.name} gains the most` : `${top.name} loses the least`;
  return known.length > 1 ? `${first}; ${end.name} loses the most.` : `${first}.`;
}

function scoringFigure(data: ChTeamStats) {
  return data.figures.find((x) => x.label === TERMS.scoringAvg.long) ?? null;
}

function changeBits(data: ChTeamStats): { chip: string | null; tone: ShsTone; direction: 'down' | 'up' | 'flat'; words: string } {
  const f = scoringFigure(data);
  if (!f || f.delta == null) return { chip: null, tone: 'flat', direction: 'flat', words: 'Nothing earlier to compare with' };
  const t = deltaTone(f.delta, f.se, f.lowerIsBetter);
  return {
    chip: `${formatFixed(Math.abs(f.delta), f.digits)} ${f.delta < 0 ? 'lower' : 'higher'}`,
    tone: t === 'is-gain' ? 'gain' : t === 'is-loss' ? 'loss' : 'flat',
    direction: f.delta < 0 ? 'down' : f.delta > 0 ? 'up' : 'flat',
    words: f.context || `than the ${data.last} before`,
  };
}

function Change({ data }: { data: ChTeamStats }) {
  const c = changeBits(data);
  return (
    <>
      {c.chip && (
        <ShsPill tone={c.tone}>
          <ShsArrow direction={c.direction} />
          {c.chip}
        </ShsPill>
      )}
      <span>{c.words}</span>
    </>
  );
}

const toPar = (data: ChTeamStats): string | null => {
  const g = scoringFigure(data)?.gauge;
  if (g?.kind !== 'par') return null;
  const w = formatToPar(g.toPar, 1);
  return w === 'E' ? 'Even par' : `${w} to par`;
};

/**
 * Team Stats on the phone behind clubhouse_stats_redesign_v1: three summary cards under the sticky window switch, each pushing its detail.
 * No large title, as drawn. A coach's page only: the route never serves it to a player (`routes/stats.tsx`). `StatsTeamPhone` stays for
 * the flag off, and its Players list and Team putting render here unchanged.
 */
export function StatsTeamPhoneShs({ data }: { data: ChTeamStats }) {
  const noRounds = !data.roundsError && data.roundCount === 0;
  const nineOnly = noRounds && nineRoundsInWindow(data.filter, data.filterOptions);
  const filtered = isFiltered(data.filter);
  const showFilter = !data.roundsError && (data.filterOptions.total > 0 || filtered);
  const firstRun = noRounds && !filtered && (data.window === 'season' || (data.window !== 'qualifiers' && data.filterOptions.total === 0)) && !nineOnly;
  const bare = firstRun && data.filterOptions.total === 0;
  const failed: string[] = [];
  if (!data.roundsError && !noRounds) {
    if (data.cacheError) failed.push('some team figures');
    if (data.puttsError) failed.push('team putting');
  }
  const covered = failed.length > 1;
  const below = useArrivalPainted();
  const arrival: StatsArrivalState = data.roundsError ? 'failed' : noRounds ? 'empty' : 'ready';
  const { detail, open, close } = useStatsDetail({ screen: 'team', state: arrival });
  const reduced = useChReducedMotion();
  const stuck = useStuck();
  const root = useRef<HTMLDivElement>(null);
  const hadFailed = useRef(data.roundsError);
  if (data.roundsError) hadFailed.current = true;
  useGrowOnce(root, reduced || hadFailed.current, [below, data.roundsError, noRounds]);
  const big = useBigText();
  const keyboard = useRef(false);
  const go = (id: StatsDetailId) => open(id);
  const days = (data.days ?? []).filter((d): d is { label: string; score: number; n?: number; date?: string } => d.score != null);
  const mean = days.length ? teamDaysMean(days) : null;
  const few = !data.roundsError && !noRounds && days.length > 0 && days.length < 3;

  return (
    <SectionGroup>
      <div
        ref={root}
        className={'ch-shs' + (big ? ' is-big' : '')}
        onKeyDownCapture={(e) => {
          if (e.key === 'Enter' || e.key === ' ') keyboard.current = true;
        }}
        onPointerDownCapture={() => {
          keyboard.current = false;
        }}
      >
        <h1 className="ch-sr-only">Team stats</h1>
        <div inert={detail != null} aria-hidden={detail != null || undefined}>
          {!bare && (
            <div className={'ch-shs-ctl' + (hasRange(data.filter) ? ' is-custom' : '') + (stuck ? ' is-stuck' : '')}>
              <div className="ch-shs-ctl__row">
                <PhoneWindowSwitch custom={hasRange(data.filter)} hook="stats-window-seg" />
                {showFilter && <TeamFilter filter={data.filter} options={data.filterOptions} count={data.roundCount} phone hook="stats-filter" />}
              </div>
            </div>
          )}
          <WindowCrossfade k={filterKey(data.filter)} off={false} reduced={reduced} className="ch-shs-sheet">
            {data.roundsError && <TeamFailedCard seen={data} />}
            <PageRefreshNotice parts={failed} />
            <SectionGroupNotice />
            {filtered && data.roundCount > 0 && data.roundsEffective < 3 && <EarlyRead code="CH-4314" count={data.roundCount} whole={data.roundsEffective} />}
            {noRounds && !filtered && <NineHint code="CH-4319" filter={data.filter} options={data.filterOptions} who="This team has" />}
            {noRounds && filtered ? (
              <section className="ch-shs-card ch-shs-empty" suppressHydrationWarning>
                <TeamFilterEmpty />
              </section>
            ) : firstRun ? (
              <section className="ch-shs-card ch-shs-empty" suppressHydrationWarning>
                <span className="ch-shs-empty__ic">
                  <Icon icon={Flag} size={22} />
                </span>
                <h2>No team rounds yet</h2>
                <p>When players finish rounds with shot tracking, this page fills in: the team scoring average, strokes gained by leg, and who gains and loses.</p>
              </section>
            ) : noRounds ? (
              <section className="ch-shs-card" suppressHydrationWarning>
                <EmptyState
                  kind={data.window === 'season' ? 'first-run' : 'filtered'}
                  code={data.window === 'qualifiers' ? 'CH-4302' : 'CH-4301'}
                  icon={data.window === 'qualifiers' ? Medal : ChartColumn}
                  title={data.window === 'qualifiers' ? 'No qualifier rounds this season yet' : 'No 18-hole rounds in this window yet'}
                  body={data.window === 'qualifiers' ? 'Qualifier rounds appear here once they are posted as qualifying.' : 'Team stats fill in as players post countable rounds.'}
                  action={data.window !== 'season' ? <ShowSeason /> : undefined}
                />
              </section>
            ) : (
              !data.roundsError && (
                <>
                  {few && (
                    <p className="ch-shs-few" role="note">
                      <b>From {days.length} round days.</b> Every figure shows, with its range, but nothing is coloured until a difference is clear. Comparisons appear once there are earlier rounds to compare with.
                    </p>
                  )}
                  <h2 className="ch-shs-sech">Overview</h2>
                  <SectionBoundary surface="stats.team.figures" label="Team figures" code="CH-4204">
                    {data.cacheError && <RetryNotice code="CH-4202" title="Some team figures didn’t load" body="Scoring is correct; greens, putts and scrambling are missing." covered={covered} />}
                    <SummaryCard feature go="tscore" onOpen={() => go('tscore')} icon="flag" title="Team scoring average" meta={windowDays(data)} ariaLabel={`Team scoring average ${scoringFigure(data) ? figureValue(scoringFigure(data)!) : 'no value'}. Open details`}>
                      <div className="ch-shs-figs">
                        <div className="ch-shs-figline">
                          <span className="ch-shs-fig">{scoringFigure(data) ? figureValue(scoringFigure(data)!) : <NoData />}</span>
                          {toPar(data) && <span className="ch-shs-fig-sub">{toPar(data)}</span>}
                        </div>
                        <div className="ch-shs-delta">
                          <Change data={data} />
                        </div>
                      </div>
                      {days.length >= 2 ? <TeamFeatureChart days={days} mean={mean} /> : <p className="ch-shs-anote">The trend draws once the team has rounds on a second day.</p>}
                    </SummaryCard>
                  </SectionBoundary>
                  {below && (
                    <>
                      <h2 className="ch-shs-sech">Team game</h2>
                      <SectionBoundary surface="stats.team.legs" label="Strokes gained by leg" code="CH-4206">
                        <TeamGameCard data={data} onOpen={() => go('tgame')} />
                      </SectionBoundary>
                      <h2 className="ch-shs-sech">Players</h2>
                      <SectionBoundary surface="stats.team.rank" label="Who gains and loses" code="CH-4206">
                        <TeamPlayersCard data={data} onOpen={() => go('tplayers')} />
                      </SectionBoundary>
                    </>
                  )}
                </>
              )
            )}
          </WindowCrossfade>
        </div>
        <AnimatePresence initial={false}>
          {detail && (
            <StatsDetailScreen key="stats-detail" keyboard={keyboard.current} id={hashOf(detail)} title={TITLE[detail as StatsTeamDetailId]} backLabel="Stats" onBack={close} big={big}>
              <WindowCrossfade k={filterKey(data.filter)} off={false} reduced={reduced} className="ch-shs-d-sheet ch-shs-d-sheet--body">
                {detail === 'tscore' && <TeamScoringDetail data={data} covered={covered} days={days} mean={mean} />}
                {detail === 'tgame' && <TeamGameDetail data={data} />}
                {detail === 'tplayers' && <TeamPlayersDetail data={data} />}
              </WindowCrossfade>
            </StatsDetailScreen>
          )}
        </AnimatePresence>
      </div>
    </SectionGroup>
  );
}

function TeamFailedCard({ seen }: { /** The page's data: a new copy means the retry came back, so Try again works again. */ seen: unknown }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [seen]);
  return (
    <section className="ch-shs-card ch-shs-empty is-danger" suppressHydrationWarning role="alert" data-ch-code="CH-4201">
      <span className="ch-shs-empty__ic">
        <Icon icon={AlertTriangle} size={22} />
      </span>
      <h3 className="ch-shs-empty__t">Team rounds didn’t load</h3>
      <p>Every figure would be incomplete, so none is shown.</p>
      <Button
        variant="secondary"
        size="sm"
        busy={busy}
        data-ch="stats-retry"
        onClick={() => {
          if (busy) return;
          setBusy(true);
          haptic('press');
          router.refresh();
        }}
      >
        Try again
      </Button>
    </section>
  );
}

const roundRows = (data: ChTeamStats) => data.figures.filter((f) => !f.signed && f.label !== TERMS.scoringAvg.long).slice(0, 3);

const shortLabel = (label: string) => (/green|gir/i.test(label) ? 'Greens' : /putt/i.test(label) ? 'Putts' : /scramb/i.test(label) ? 'Scrambling' : label);

function legRows(data: ChTeamStats) {
  return LEGS_LIST.map((l, i) => ({ label: l as string, value: data.legTotals[i] ?? null }));
}

function TeamGameCard({ data, onOpen }: { data: ChTeamStats; onOpen: () => void }) {
  const tone = sgTone(data.team.sgMean);
  const foot = roundRows(data);
  return (
    <SummaryCard go="tgame" onOpen={onOpen} title="Strokes gained by leg" meta="vs Tour" ariaLabel={`Strokes gained by leg: team ${formatSigned(data.team.sgMean)} a round against the Tour. Open details`}>
      <div className="ch-shs-sb is-one">
        <div>
          <span className={`ch-shs-bigv${tone === 'flat' ? '' : ` ch-shs-${tone}`}${data.team.sgMean == null ? ' ch-shs-none' : ''}`}>{formatSigned(data.team.sgMean)}</span>
          <div className="ch-shs-cap">Team strokes a round against the Tour</div>
        </div>
      </div>
      <MiniDiverging rows={legRows(data)} fixedScale={4} />
      {foot.length > 0 && (
        <p className="ch-shs-sumfoot">
          {foot.map((f, i) => (
            <span key={f.label}>
              {i > 0 && ' · '}
              {shortLabel(f.label)} <b>{figureValue(f)}</b>
            </span>
          ))}
        </p>
      )}
    </SummaryCard>
  );
}

/** Fixed ±8 for player rows, the bar and figure toned by sign (08 criterion 52). */
function PlayerRow({ rank, name, value }: { rank: string; name: string; value: number | null }) {
  const tone = sgTone(value);
  const bar = value == null ? null : divergeBar(value, 8);
  return (
    <div className="ch-shs-prow">
      <span className="rk">{rank}</span>
      <span className="nm">{name}</span>
      <span className="ch-shs-rail" aria-hidden="true">
        <span className="ch-shs-zero" />
        {bar && <span className={`ch-shs-bar ch-shs-fill-${tone}`} data-ch-grow="" style={{ left: `${bar.left}%`, width: `${bar.width}%`, transformOrigin: `${(value ?? 0) >= 0 ? '0' : '100%'} 50%` }} />}
      </span>
      <span className={`val${tone === 'flat' ? '' : ` ch-shs-${tone}`}`}>{formatSigned(value)}</span>
    </div>
  );
}

function TeamPlayersCard({ data, onOpen }: { data: ChTeamStats; onOpen: () => void }) {
  const rows = teamRankRows(data.grid, 'sg');
  const ranked = rows.filter((r) => r.value != null);
  const said = teamSentence(ranked.map((r) => ({ name: r.name, value: r.value })));
  return (
    <SummaryCard go="tplayers" onOpen={onOpen} title="Who gains and loses" meta={`${data.grid.length} ${pluralWord(data.grid.length, 'player')}`} ariaLabel={`Who gains and loses: ${data.grid.length} ${pluralWord(data.grid.length, 'player')}. Open details`}>
      <div className="ch-shs-flushrows">
        {ranked.slice(0, 3).map((r, i) => (
          <PlayerRow key={r.id} rank={String(i + 1)} name={r.name} value={r.value} />
        ))}
      </div>
      {said && <p className="ch-shs-sumfoot">{said}</p>}
    </SummaryCard>
  );
}

function TheRound({ data, note }: { data: ChTeamStats; note?: string | null }) {
  const rows = roundRows(data);
  const coverage = data.holeRoundCount == null ? null : holeCoverage(data.holeRoundCount, data.roundCount);
  return (
    <ShsCard title="The round" meta={windowDays(data)}>
      <dl className="ch-shs-m3">
        {rows.map((f) => {
          const t = deltaTone(f.delta, f.se, f.lowerIsBetter);
          const ref = reference(f);
          return (
            <div key={f.label}>
              <dt>{shortLabel(f.label)}</dt>
              <dd className="v">{figureValue(f)}</dd>
              {ref && <dd className="m">{ref}</dd>}
              {f.delta != null && (
                <dd>
                  <ShsPill tone={t === 'is-gain' ? 'gain' : t === 'is-loss' ? 'loss' : 'flat'}>{formatSigned(f.delta, f.digits)}</ShsPill>
                </dd>
              )}
            </div>
          );
        })}
      </dl>
      <p className="ch-shs-anote">{[coverage ? `${coverage}.` : null, 'Grey means the change is inside its likely error.', note].filter(Boolean).join(' ')}</p>
    </ShsCard>
  );
}

function TeamScoringDetail({ data, covered, days, mean }: { data: ChTeamStats; covered: boolean; days: ReadonlyArray<{ label: string; score: number; n?: number }>; mean: number | null }) {
  const f = scoringFigure(data);
  const context = `${data.teamName} · ${data.activeCount} active ${pluralWord(data.activeCount, 'player')} · countable rounds only.`;
  // Today's trend reading, on the card that now draws the trend. One round day is a point, not a trend.
  const trend = days.length >= 2 ? teamTrendReading(data, days.length) : null;
  return (
    <>
      <DetailHero figure={f ? figureValue(f) : <NoData />} caption={['Team scoring average', toPar(data), windowDays(data)].filter(Boolean).join(' · ')} chips={<Change data={data} />} />
      {days.length > 0 && (
        <ShsCard title="By round day" meta={mean == null ? undefined : 'Team mean dashed'}>
          <Ribbon points={days.map((d) => ({ label: d.label, value: d.score }))} lowerIsBetter reference={mean == null ? null : { value: mean, label: 'Mean' }} format={(v) => formatFixed(v, 1)} tone={trend?.tone === 'is-gain' ? 'gain' : trend?.tone === 'is-loss' ? 'loss' : 'flat'} />
          <p className="ch-shs-mini-cap">{trend ? `Lower is better. ${trend.reading}` : 'The trend draws once the team has rounds on a second day.'}</p>
        </ShsCard>
      )}
      <TheRound data={data} note={context} />
      <ShsCard title="Round days" meta={`${days.length} ${pluralWord(days.length, 'day')}`}>
        <table className="ch-shs-tbl">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Team average</th>
              <th scope="col">Rounds</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td>
                  <b>{formatFixed(d.score)}</b>
                </td>
                <td>{d.n ?? <NoData />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ShsCard>
      <SectionBoundary surface="stats.team.putting" label="Team putting" code="CH-4207">
        <Putting data={data} covered={covered} />
      </SectionBoundary>
      <SectionBoundary surface="stats.team.insight" label="What changed" code="CH-4204">
        <TeamInsight figures={data.figures} last={data.last} />
      </SectionBoundary>
    </>
  );
}

function TeamGameDetail({ data }: { data: ChTeamStats }) {
  const rows = [...legRows(data).map((r) => ({ ...r, total: false })), { label: 'Team total', value: data.team.sgMean, total: true }];
  const [pin, setPin] = useState<string | null>(null);
  const known = rows.filter((r): r is { label: string; value: number; total: boolean } => !r.total && r.value != null);
  const worst = [...known].sort((a, b) => a.value - b.value)[0];
  const losing = known.filter((r) => r.value < -0.05);
  const pinned = rows.find((r) => r.label === pin);
  return (
    <>
      <DetailHero figure={formatSigned(data.team.sgMean)} caption="Team strokes a round against the Tour" chips={worst && worst.value < -0.05 ? <span>{worst.label} costs the most, {formatFixed(Math.abs(worst.value))} a round</span> : undefined} />
      <ShsCard title="Strokes gained by leg" meta="Per round">
        <p className="ch-shs-readout" aria-live="polite">
          {pinned ? `${pinned.label}: ${formatSigned(pinned.value)} a round.` : 'Tap a leg to read it.'}
        </p>
        {rows.map((r) => {
          const tone = sgTone(r.value);
          const bar = r.value == null ? null : divergeBar(r.value, 4);
          const on = pin === r.label;
          return (
            <button key={r.label} type="button" className={`ch-shs-drow${r.total ? ' is-total' : ''}${on ? ' is-pinned' : ''}`} aria-pressed={on} aria-label={`${r.label}: ${formatSigned(r.value)} a round`} onClick={() => setPin(on ? null : r.label)}>
              <span className="lab">{r.label}</span>
              <span className="ch-shs-rail">
                <span className="ch-shs-zero" />
                {bar && <span className={`ch-shs-bar ch-shs-fill-${tone}`} data-ch-grow="" style={{ left: `${bar.left}%`, width: `${bar.width}%`, transformOrigin: `${(r.value ?? 0) >= 0 ? '0' : '100%'} 50%` }} />}
              </span>
              <span className={`val${tone === 'flat' ? '' : ` ch-shs-${tone}`}`}>{formatSigned(r.value)}</span>
            </button>
          );
        })}
        <div className="ch-shs-scale" aria-hidden="true">
          <span />
          <span>
            <span>−4</span>
            <span>0</span>
            <span>+4</span>
          </span>
          <span />
        </div>
        {known.length > 0 && <p className="ch-shs-anote">{!losing.length ? 'No leg is losing strokes.' : losing.length === 1 ? `${losing[0]!.label} is the only leg losing strokes.` : `${losing.length} legs are losing strokes: ${losing.map((x) => x.label).join(', ')}.`}</p>}
      </ShsCard>
      <TheRound data={data} />
      <ShsCard title="How strokes gained works">
        <p className="ch-shs-how-t is-open">{SHS_HOW.sg}</p>
      </ShsCard>
    </>
  );
}

function TeamPlayersDetail({ data }: { data: ChTeamStats }) {
  const [sort, setSort] = useChSessionState<'avg' | 'sg'>('team-players-sort', 'avg');
  const leg: ChLegPick = 'total';
  const said = teamSentence(teamRankRows(data.grid, 'sg').map((r) => ({ name: r.name, value: r.value })));
  return (
    <>
      <DetailHero figure={String(data.grid.length)} caption="Players · strokes gained a round against the Tour" chips={said ? <span>{said}</span> : undefined} />
      <SectionBoundary surface="stats.team.rank" label="Who gains and loses" code="CH-4206">
        <TeamRank data={data} phone />
      </SectionBoundary>
      <SectionBoundary surface="stats.team.players" label="Players" code="CH-4206">
        <Players key={filterKey(data.filter)} data={data} leg={leg} sort={sort} onSort={setSort} />
      </SectionBoundary>
    </>
  );
}
