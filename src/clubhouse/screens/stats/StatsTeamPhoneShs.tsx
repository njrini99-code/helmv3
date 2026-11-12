'use client';

import { AlertTriangle, ChartColumn, Flag, Medal } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { Button } from '../../ui/Button';
import { useBigText } from './StatsPlayerPhoneShs';
import { useRefresh } from '../../lib/use-refresh';
import { useSegFade } from './seg-fade';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DeskPane } from './DeskPane';
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
import { divergeBar, filterKey, scoreChangeChip, sgTone, windowShort, type ShsTone } from './shs-figures';
import { useStuck, WindowCrossfade } from './shs-motion';
import { EarlyRead, NineHint } from './StatsFilter';
import { DetailHero, StatsDetailScreen } from './StatsDetailScreen';
import { PhoneWindowSwitch, RetryNotice, ShowSeason, TeamFilter, TeamFilterEmpty } from './StatsTeamIslands';
import { figureValue, Players, Putting, reference, teamDaysMean, teamTrendReading, type ChLegPick } from './StatsTeamPhone';
import { TeamInsight } from './StatsInsight';
import { ShsArrow, ShsCard, ShsPill, SummaryCard } from './SummaryCard';
import { teamRankRows } from './team-rank';
import { TeamRank } from './TeamRank';
import { sgIsEstimate, sgMixWords } from '../../data/stats-sg-mix';
import { useStatsDetail, type StatsArrivalState } from './use-stats-detail';

const TITLE: Readonly<Record<StatsTeamDetailId, string>> = { tscore: 'Team scoring', tgame: 'Team game', tplayers: 'Players' };

/** "10 round days": the unit is a day the team played, never a calendar day, and it stays short enough to sit beside the card's title on one line. */
const windowDays = (data: ChTeamStats) => (data.window === 'last10' && !isFiltered(data.filter) ? `${data.last} round days` : windowShort(data.filter));


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
  // One phrasing with My stats ("0.9 lower than the 10 before") and one rule with Home ("No clear change vs previous 10" under the
  // standard error, W27); the loader's own reason, when it gives one, stays as written.
  const vs = f.context || `vs previous ${data.last}`;
  return scoreChangeChip(f.delta, f.se, f.lowerIsBetter, { than: vs.replace(/^vs (?:the )?previous (\d+)$/i, 'than the $1 before'), vs }, f.digits);
}

function Change({ data }: { data: ChTeamStats }) {
  const c = changeBits(data);
  return (
    <>
      {c.chip && (
        <ShsPill tone={c.tone}>
          {/* No glyph for no clear change: a dash beside a signed number read as "— −0.8" (the Islands hero's rule). */}
          {c.direction !== 'flat' && <ShsArrow direction={c.direction} />}
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
export function StatsTeamPhoneShs({
  data,
  initialArea,
  desk = false,
  extra,
}: {
  data: ChTeamStats;
  /** The address's production `?area=`. */
  initialArea?: string;
  /**
   * The desktop page (stats-home, "Desktop"): the same cards as a bento on a flat canvas, the chosen card's drill beside them
   * instead of pushed over them. No push and nothing written to the address; the page's head is the caller's.
   */
  desk?: boolean;
  /** Desk only: what the desktop page has that no phone card carries (Season bests), drawn after the cards. */
  extra?: ReactNode;
}) {
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
  const ctlRef = useRef<HTMLDivElement | null>(null);
  useSegFade(ctlRef);
  const below = useArrivalPainted();
  const arrival: StatsArrivalState = data.roundsError ? 'failed' : noRounds ? 'empty' : 'ready';
  const { detail, open, close } = useStatsDetail({ screen: 'team', area: initialArea, state: arrival });
  const reduced = useChReducedMotion();
  const stuck = useStuck();
  const root = useRef<HTMLDivElement>(null);
  const hadFailed = useRef(data.roundsError);
  if (data.roundsError) hadFailed.current = true;
  const big = useBigText();
  const keyboard = useRef(false);
  // On a desk the drill stands beside the cards: choosing a card changes the pane, with no push.
  const [deskPick, setDeskPick] = useState<StatsTeamDetailId | null>(null);
  const deskDetail: StatsTeamDetailId = deskPick ?? (detail as StatsTeamDetailId | null) ?? 'tscore';
  const go = (id: StatsDetailId) => (desk ? setDeskPick(id as StatsTeamDetailId) : open(id));
  const days = (data.days ?? []).filter((d): d is { label: string; score: number; n?: number; date?: string } => d.score != null);
  const mean = days.length ? teamDaysMean(days) : null;
  const few = !data.roundsError && !noRounds && days.length > 0 && days.length < 3;

  const controls = !bare && (
            <div ref={ctlRef} className={desk ? 'ch-shs-dctl' : 'ch-shs-ctl' + (hasRange(data.filter) ? ' is-custom' : '') + (stuck ? ' is-stuck' : '')}>
              <PhoneWindowSwitch
                custom={hasRange(data.filter)}
                hook={desk ? undefined : 'stats-window-seg'}
                rows
                beside={showFilter && <TeamFilter filter={data.filter} options={data.filterOptions} count={data.roundCount} phone={!desk} hook="stats-filter" />}
              />
            </div>
          );
  const sheet = (
    <>
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
                    <TeamScoringCard data={data} days={days} mean={mean} onOpen={() => go('tscore')} />
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
    </>
  );
  const ready = !data.roundsError && !noRounds;
  // Each drill reads the page's figures as it draws, so each sits in a boundary of its own: one that cannot be drawn says so in its
  // place and the page stands (CH-4204, CH-4206), as the cards beside it do.
  const drill = (id: StatsTeamDetailId) => (
    <SectionBoundary key={id} surface={`stats.team.detail.${id}`} label={TITLE[id]} code={id === 'tscore' ? 'CH-4204' : 'CH-4206'}>
      {id === 'tscore' && <TeamScoringDetail data={data} covered={covered} days={days} mean={mean} beside={desk} />}
      {id === 'tgame' && <TeamGameDetail data={data} />}
      {id === 'tplayers' && <TeamPlayersDetail data={data} />}
    </SectionBoundary>
  );

  if (desk)
    return (
      <SectionGroup>
        <div ref={root} className="ch-shs ch-shs--desk ch-shs--desk-team" data-ch-shs-open={ready ? deskDetail : undefined}>
          {controls}
          <WindowCrossfade k={filterKey(data.filter)} off={false} reduced={reduced} className={'ch-shs-desk' + (ready ? '' : ' is-alone')}>
            <div className="ch-shs-desk__sum">
              {sheet}
              {ready && below && extra}
            </div>
            {ready && (
              <DeskPane detail={deskDetail} hash={hashOf(deskDetail)} title={TITLE[deskDetail]}>
                {drill(deskDetail)}
              </DeskPane>
            )}
          </WindowCrossfade>
        </div>
      </SectionGroup>
    );

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
          {controls}
          <WindowCrossfade k={filterKey(data.filter)} off={false} reduced={reduced} className="ch-shs-sheet">
            {sheet}
          </WindowCrossfade>
        </div>
        <AnimatePresence initial={false}>
          {detail && (
            <StatsDetailScreen key="stats-detail" keyboard={keyboard.current} id={hashOf(detail)} title={TITLE[detail as StatsTeamDetailId]} backLabel="Stats" onBack={close} big={big}>
              <WindowCrossfade k={filterKey(data.filter)} off={false} reduced={reduced} className="ch-shs-d-sheet ch-shs-d-sheet--body">
                {drill(detail as StatsTeamDetailId)}
              </WindowCrossfade>
            </StatsDetailScreen>
          )}
        </AnimatePresence>
      </div>
    </SectionGroup>
  );
}

function TeamFailedCard({ seen }: { /** The page's data: a new copy means the retry came back, so Try again works again. */ seen: unknown }) {
  const { refresh, refreshing } = useRefresh();
  const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [seen]);
  useEffect(() => {
    if (!busy || refreshing) return;
    const t = window.setTimeout(() => setBusy(false), 1000);
    return () => window.clearTimeout(t);
  }, [busy, refreshing]);
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
        busy={busy || refreshing}
        data={{ 'data-ch': 'stats-retry' }}
        onClick={() => {
          if (busy) return;
          setBusy(true);
          haptic('press');
          refresh();
        }}
      >
        Try again
      </Button>
    </section>
  );
}

/**
 * The Overview card. Its own component, so the boundary around it holds everything it reads: a figures list that is not one crashes
 * this card (CH-4204), never the page. Looking the figure up while the page built the card's props answered /stats with a 500.
 */
function TeamScoringCard({ data, days, mean, onOpen }: { data: ChTeamStats; days: ReadonlyArray<{ label: string; score: number; n?: number; date?: string }>; mean: number | null; onOpen: () => void }) {
  const f = scoringFigure(data);
  const par = toPar(data);
  return (
    <SummaryCard feature go="tscore" onOpen={onOpen} icon="flag" title="Scoring average" meta={windowDays(data)} ariaLabel={`Team scoring average ${f ? figureValue(f) : 'no value'}. Open details`}>
      <div className="ch-shs-figs">
        <div className="ch-shs-figline">
          <span className="ch-shs-fig">{f ? figureValue(f) : <NoData />}</span>
          {par && <span className="ch-shs-fig-sub">{par}</span>}
        </div>
        <div className="ch-shs-delta">
          <Change data={data} />
        </div>
      </div>
      {days.length >= 2 ? <TeamFeatureChart days={days} mean={mean} /> : <p className="ch-shs-anote">The trend draws once the team has rounds on a second day.</p>}
    </SummaryCard>
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
  // Where the rounds' strokes gained came from (stats-sg-mix.ts): all estimate, the figure is marked; mixed, the card says how many.
  const est = data.team.sgMean != null && sgIsEstimate(data.sgMix);
  const mix = data.team.sgMean != null ? sgMixWords(data.sgMix) : null;
  const legs = legRows(data);
  const noShots = data.team.sgMean == null && legs.every((r) => r.value == null);
  return (
    <SummaryCard go="tgame" onOpen={onOpen} title="Strokes gained by leg" meta="vs Tour" ariaLabel={`Strokes gained by leg: team ${formatSigned(data.team.sgMean)}${est ? ', an estimate,' : ''} a round against the Tour. Open details`}>
      <div className="ch-shs-sb is-one">
        <div>
          <span className={`ch-shs-bigv${tone === 'flat' ? '' : ` ch-shs-${tone}`}${data.team.sgMean == null ? ' ch-shs-none' : ''}`}>
            {formatSigned(data.team.sgMean)}
            {est && <small>est.</small>}
          </span>
          <div className="ch-shs-cap">Team strokes a round against the Tour</div>
          {mix && (
            <p className="ch-shs-mini-cap" data-ch-sg-mix="">
              {mix}
            </p>
          )}
        </div>
      </div>
      {noShots ? (
        // Every round posted as a total: one line, not four rows of dashes and a foot of three more.
        <p className="ch-shs-sumfoot">Fills in from rounds posted with shots. Rounds posted as totals still count toward scoring.</p>
      ) : (
        <>
          <MiniDiverging rows={legs} fixedScale={4} />
          {foot.length > 0 && (
            <p className="ch-shs-sumfoot">
              {foot.map((f, i) => (
                <span key={f.label}>
                  {i > 0 && ' · '}
                  {shortLabel(f.label)} <b className="ch-num">{figureValue(f)}</b>
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </SummaryCard>
  );
}

/**
 * A player row, the bar and figure toned by sign (08 criterion 52). `scale` is the card's own largest figure (W28: on a fixed
 * ±8, −4.2 and −4.9 drew the same length); the default keeps the old fixed ±8.
 */
function PlayerRow({ rank, name, value, scale = 8 }: { rank: string; name: string; value: number | null; scale?: number }) {
  const tone = sgTone(value);
  const bar = value == null ? null : divergeBar(value, scale);
  return (
    <div className="ch-shs-prow">
      <span className="rk">{rank}</span>
      <span className="nm">{name}</span>
      <span className="ch-shs-rail" aria-hidden="true">
        <span className="ch-shs-zero" />
        {bar && <span className={`ch-shs-bar ch-shs-fill-${tone}`} style={{ left: `${bar.left}%`, width: `${bar.width}%`, transformOrigin: `${(value ?? 0) >= 0 ? '0' : '100%'} 50%` }} />}
      </span>
      <span className={`val${tone === 'flat' ? '' : ` ch-shs-${tone}`}`}>{formatSigned(value)}</span>
    </div>
  );
}

/**
 * Who gains and loses, the summary card (W28, owner's preview, 11 Nov 2026). The rows are the top two and, when more are ranked,
 * the one who loses most at their own rank, so the sentence under them names players on the card. When everyone loses, the
 * title says so. The bars run to the card's largest figure (floor 2), and players with no strokes gained are counted, not dropped.
 */
export function playersCard<T extends { value: number | null }>(ranked: readonly T[]): { title: string; rows: Array<{ row: T; rank: number }>; scale: number } {
  const known = ranked.filter((r) => r.value != null);
  const rows = known.length <= 3 ? known.map((row, i) => ({ row, rank: i + 1 })) : [{ row: known[0]!, rank: 1 }, { row: known[1]!, rank: 2 }, { row: known[known.length - 1]!, rank: known.length }];
  const scale = Math.max(2, ...rows.map((r) => Math.abs(r.row.value!)));
  const title = known.length > 0 && known.every((r) => r.value! < 0) ? 'Who loses least and most' : 'Who gains and loses';
  return { title, rows, scale };
}

function TeamPlayersCard({ data, onOpen }: { data: ChTeamStats; onOpen: () => void }) {
  const rows = teamRankRows(data.grid, 'sg');
  const ranked = rows.filter((r) => r.value != null);
  const said = teamSentence(ranked.map((r) => ({ name: r.name, value: r.value })));
  const card = playersCard(ranked);
  const unranked = Math.max(0, data.activeCount - ranked.length);
  const meta = `${ranked.length} ${pluralWord(ranked.length, 'player')}`;
  return (
    <SummaryCard go="tplayers" onOpen={onOpen} title={card.title} meta={meta} ariaLabel={`${card.title}: ${meta}. Open details`}>
      <div className="ch-shs-flushrows">
        {card.rows.map(({ row: r, rank }) => (
          <PlayerRow key={r.id} rank={String(rank)} name={r.name} value={r.value} scale={card.scale} />
        ))}
      </div>
      {said && (
        <p className="ch-shs-sumfoot">
          {said}
          {ranked.length > 0 && unranked > 0 && ` ${unranked} more ${unranked === 1 ? 'has' : 'have'} no strokes gained in this window.`}
        </p>
      )}
      {/* No player has strokes gained to rank: the card says what fills it, rather than a title over nothing. */}
      {ranked.length === 0 && <p className="ch-shs-sumfoot">Fills in from rounds posted with shots.</p>}
    </SummaryCard>
  );
}

/**
 * The Round's note (W29, owner's preview, 11 Nov 2026: three chips with no label over four grey lines explaining grey): one
 * sentence that says what the chips are and what grey means, then coverage and the caller's context.
 */
export function roundNote(data: Pick<ChTeamStats, 'window' | 'filter' | 'last'>, chips: boolean, coverage: string | null, note?: string | null): string {
  const before = data.window === 'last10' && !isFiltered(data.filter) ? `the previous ${data.last} round days` : 'the window before';
  return [chips ? `Chips: the change vs ${before}, grey when it is inside its likely error.` : null, coverage ? `${coverage}.` : null, note].filter(Boolean).join(' ');
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
              {ref && <dd className="m ch-num">{ref}</dd>}
              {f.delta != null && (
                <dd className="d">
                  <ShsPill tone={t === 'is-gain' ? 'gain' : t === 'is-loss' ? 'loss' : 'flat'}>{formatSigned(f.delta, f.digits)}</ShsPill>
                </dd>
              )}
            </div>
          );
        })}
      </dl>
      <p className="ch-shs-anote">{roundNote(data, rows.some((f) => f.delta != null), coverage, note)}</p>
    </ShsCard>
  );
}

function TeamScoringDetail({
  data,
  covered,
  days,
  mean,
  beside = false,
}: {
  data: ChTeamStats;
  covered: boolean;
  days: ReadonlyArray<{ label: string; score: number; n?: number }>;
  mean: number | null;
  /** On a desk the Scoring average card stands beside this drill with the same figure, change and curve, so the drill starts at what the card lacks. */
  beside?: boolean;
}) {
  const f = scoringFigure(data);
  // The separators keep to the words before them, as the page head's do: a wrapped line never starts with the dot.
  // Today's trend reading, on the card that now draws the trend. One round day is a point, not a trend.
  const trend = days.length >= 2 ? teamTrendReading(data, days.length) : null;
  return (
    <>
      {!beside && <DetailHero figure={f ? figureValue(f) : <NoData />} caption={['Team scoring average', toPar(data), windowDays(data)].filter(Boolean).join(' · ')} chips={<Change data={data} />} />}
      {!beside && days.length > 0 && (
        <ShsCard title="By round day" meta={mean == null ? undefined : 'Average dashed'}>
          <Ribbon points={days.map((d) => ({ label: d.label, value: d.score }))} lowerIsBetter reference={mean == null ? null : { value: mean, label: 'Avg of these days' }} format={(v) => formatFixed(v, 1)} tone={trend?.tone === 'is-gain' ? 'gain' : trend?.tone === 'is-loss' ? 'loss' : 'flat'} />
          <p className="ch-shs-mini-cap">{trend ? `Lower is better. ${trend.reading}` : 'The trend draws once the team has rounds on a second day.'}</p>
        </ShsCard>
      )}
      {/* The page head says the team, its active players and that only countable rounds count; the note doesn't repeat it (W29). */}
      <TheRound data={data} />
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
      <DetailHero
        figure={formatSigned(data.team.sgMean)}
        unit={data.team.sgMean != null && sgIsEstimate(data.sgMix) ? 'est.' : undefined}
        caption={
          <>
            Team strokes a round against the Tour
            {data.team.sgMean != null && sgMixWords(data.sgMix) && (
              <>
                <br />
                <span data-ch-sg-mix="">{sgMixWords(data.sgMix)}</span>
              </>
            )}
          </>
        }
        chips={worst && worst.value < -0.05 ? <span>{worst.label} costs the most, {formatFixed(Math.abs(worst.value))} a round</span> : undefined} />
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
                {bar && <span className={`ch-shs-bar ch-shs-fill-${tone}`} style={{ left: `${bar.left}%`, width: `${bar.width}%`, transformOrigin: `${(r.value ?? 0) >= 0 ? '0' : '100%'} 50%` }} />}
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
