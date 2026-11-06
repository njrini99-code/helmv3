'use client';

import { AlertTriangle, Flag, MessageSquare, Plus, RotateCw, Share } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChPlayerProfile } from '../../data/stats-player';
import { basisWords, clearFilters, hasRange, isFiltered, rangeOf, type ChFilter, type ChRange } from '../../data/stats-filter';
import { playerInsight } from '../../data/stats-insight';
import { formatAvg, formatFixed, formatHcp, formatSigned, formatToPar } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import { TERMS } from '../../lib/glossary';
import { haptic } from '../../lib/haptics';
import { plural, pluralWord } from '../../lib/plural';
import { sgBaseline, sgScale } from '../../lib/sg';
import { chTrail } from '../../lib/track';
import { useArrivalPainted } from '../../lib/use-painted';
import { rebuiltHref } from '../../shell/nav';
import { PhoneTop } from '../../shell/phone-chrome';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { LargeTitle } from '../../ui/LargeTitle';
import { InlineNotice } from '../../ui/Notices';
import { PhoneIconAction } from '../../ui/PhoneBar';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { EmptyState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { FigureGauge, SgChangeChip } from './charts';
import { hashOf, type StatsDetailId, type StatsPlayerDetailId } from './detail-route';
import { ROUND_TYPE } from './detail';
import { devMetric, devProgress, devTitle, devValue, goalLine, progressOf } from './dev-format';
import { FocusLoop } from './FocusLoop';
import { GameDetail, type ChReadsSource } from './GameDetail';
import { GoalSetButton, GoalStatus, GoalSuggestions } from './Goals';
import { legReadout, sgLegRows } from './leg-rows';
import { GoalRing, MiniDiverging, MiniRails, RoundTicker, type MiniRailRow } from './MiniCharts';
import { CACHE_ERROR, countWords, shotsWords } from './notes';
import { ProposalAnswer } from './ProposalAnswer';
import { RoundsExtra } from './RoundsExtra';
import { RoundTrend } from './RoundTrend';
import { trendRounds } from './round-trend';
import { halvesChange, halvesTone } from '../../lib/stats-signal';
import { ScoringFeatureChart } from './ScoringFeatureChart';
import { AgainstBefore, COMPARE_ROWS, Ribbon, SHS_HOW } from './ShsBlocks';
import {
  changeBars,
  divergeAt,
  divergeBar,
  glanceTiles,
  hasPrevious,
  keyFigure,
  scoringChange,
  SG_WAIT,
  sgReady,
  sgTone,
  strongestAndLeak,
  windowLabel,
  windowShort,
} from './shs-figures';
import { FilterEmpty, NineHint, StatsFilter } from './StatsFilter';
import { DetailHero, StatsDetailScreen } from './StatsDetailScreen';
import { ShsArrow, ShsCard, ShsChevron, ShsIcon, ShsPill, SummaryCard, type ShsIconName } from './SummaryCard';
import { useStatsDetail, type StatsArrivalState } from './use-stats-detail';
import { useGrowOnce, useStuck, WindowCrossfade } from './shs-motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { filterKey } from './shs-figures';
import { WindowSwitch } from './WindowSwitch';

const PARTS: ReadonlyArray<{ id: 'tee' | 'approach' | 'short' | 'putting'; name: string; icon: ShsIconName; leg: string }> = [
  { id: 'tee', name: 'Off the tee', icon: 'tee', leg: 'tee' },
  { id: 'approach', name: 'Approach', icon: 'target', leg: 'approach' },
  { id: 'short', name: TERMS.shortGame.long, icon: 'chip', leg: 'around' },
  { id: 'putting', name: 'Putting', icon: 'putt', leg: 'putting' },
];

const DETAIL_TITLE: Readonly<Record<StatsPlayerDetailId, string>> = {
  scoring: 'Scoring',
  sg: 'Strokes gained',
  tee: 'Off the tee',
  approach: 'Approach',
  short: TERMS.shortGame.long,
  putting: 'Putting',
  rounds: 'Rounds',
  goals: 'Goals',
};

/** Text Size Larger and XXL (1.24 and up) reflow the page (08 criterion 20). */
function useBigText(): boolean {
  const [big, setBig] = useState(false);
  useEffect(() => {
    const read = () => setBig(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ch-type-scale')) >= 1.24);
    read();
    const watch = new MutationObserver(read);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => watch.disconnect();
  }, []);
  return big;
}

/**
 * My stats on the phone, behind clubhouse_stats_redesign_v1 (stats-home): one scroll of summary cards under a sticky window switch, each
 * pushing a detail with the house push. No large title, and section names on the page, as drawn (Nick, 31 Oct). Nothing today's phone
 * shows is removed; each block has a home (02 "Where today's content goes"). The same loader, window change and focus-area sheet as
 * `StatsPlayerPhone`, which stays exactly as it was for the flag off.
 */
export function StatsPlayerPhoneShs({
  data,
  initialTab,
  reads,
  playerHref,
  messageHref,
  windowShown,
  onWindow,
  onFilter,
  onBackToTeam,
  onAddFocus,
  onRetry,
  updating,
}: {
  data: ChPlayerProfile;
  initialTab?: string;
  reads?: ChReadsSource;
  playerHref: string;
  messageHref: string | null;
  windowShown?: ChRange;
  onWindow: (r: ChRange) => void;
  onFilter: (next: ChFilter) => void;
  onBackToTeam: () => void;
  onAddFocus: (() => void) | null;
  onRetry: () => void;
  /** The change-in-flight note, in the sticky controls. */
  updating?: ReactNode;
}) {
  const coach = data.viewer === 'coach';
  const toast = useToast();
  const big = useBigText();
  const below = useArrivalPainted();
  const w = data.win;
  const first = data.firstName;
  const filtered = isFiltered(data.filter);
  const failed = data.roundsError;
  const noRounds = !failed && w.rounds === 0;
  // A window or filter with nothing in it, not a player with no rounds: Season on 1 August, say (CP-123, CP-124).
  const emptyFilter = noRounds && (filtered || data.window !== 'last10');
  const firstRun = noRounds && !emptyFilter;
  const early = !failed && !noRounds && w.effRounds < 3;
  const noShots = !failed && !noRounds && !early && w.effSgRounds < 3;
  const showFilter = !failed && (data.filterOptions.total > 0 || filtered);
  const arrivalState: StatsArrivalState = failed ? 'failed' : noRounds ? 'empty' : 'ready';

  const { detail, open, close, replace, saveScroll, detailScroll, restoreTo } = useStatsDetail({ screen: 'player', tab: initialTab, state: arrivalState });
  const backLabel = coach ? 'Player stats' : 'My stats';

  const share = async () => {
    haptic('press');
    const url = `${window.location.origin}${playerHref}`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: `${data.name} · stats`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      haptic('success');
      toast({ title: 'Link copied', body: `Coaches on your team can open ${first}’s stats from it.` });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      chTrail('stats share failed');
      haptic('error');
      toast({ tone: 'error', title: 'Couldn’t share the link', body: 'Your browser blocked it. Try again, or copy the address from the browser.', code: 'CH-5002' });
    }
  };

  const go = (id: StatsDetailId, landOn?: string) => {
    setAnchor(landOn ?? null);
    open(id);
  };
  const [anchor, setAnchor] = useState<string | null>(null);
  const reduced = useChReducedMotion();
  const stuck = useStuck();
  const root = useRef<HTMLDivElement>(null);
  // A landing after a failed load or a Try again draws at rest: marks grow once in a session of the page, and that wasn't a first look.
  const hadFailed = useRef(failed);
  if (failed) hadFailed.current = true;
  useGrowOnce(root, reduced || hadFailed.current, [below, failed, noRounds]);
  // Keys that open a detail move focus to Back; a finger doesn't (07 M-STATS-27).
  const keyboard = useRef(false);

  return (
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
      {coach ? (
        <PhoneTop title="Player stats" heading={false} back={{ label: 'Team', onBack: onBackToTeam }} action={<PhoneIconAction icon={Share} label={`Share ${first}’s stats`} onClick={() => void share()} />} />
      ) : (
        <PhoneTop title="My stats" heading={false} start />
      )}

      {/* While a detail is open the summary is out of reach of the keyboard and VoiceOver. */}
      <div inert={detail != null} aria-hidden={detail != null || undefined}>
        {coach && (
          <header className="ch-spm-head">
            <Avatar name={data.name} id={data.id} size="lg" />
            <span className="ch-spm-head__id">
              <LargeTitle>{data.name}</LargeTitle>
              <p className="ch-num">{[data.classYear, failed ? null : `${plural(data.season.rounds, 'round')}`, data.handicap == null ? null : `${formatHcp(data.handicap)} ${TERMS.handicap.short}`].filter(Boolean).join(' · ')}</p>
            </span>
            {messageHref && (
              <Link href={messageHref} className="ch-spm-head__msg" aria-label={`Message ${first}`} data-ch-press="">
                <Icon icon={MessageSquare} size={18} />
              </Link>
            )}
          </header>
        )}

        <div className={'ch-shs-ctl' + (hasRange(data.filter) ? ' is-custom' : '') + (stuck ? ' is-stuck' : '')}>
          <div className="ch-shs-ctl__row">
            <WindowSwitch value={windowShown ?? rangeOf(data.filter)} onChange={onWindow} custom={hasRange(data.filter)} hook="stats-window-seg" />
            {showFilter && <StatsFilter filter={data.filter} options={data.filterOptions} count={w.rounds} onChange={onFilter} codes={{ empty: 'CH-5320', pickEmpty: 'CH-5321', pickCap: 'CH-5322', range: 'CH-5102', holes: 'CH-5323' }} phone hook="stats-filter" />}
          </div>
          {updating}
        </div>

        <WindowCrossfade k={filterKey(data.filter)} off={false} reduced={reduced} className="ch-shs-sheet">
          {!filtered && noRounds && !firstRun && <NineHint code="CH-5324" filter={data.filter} options={data.filterOptions} who={coach ? `${first} has` : 'You have'} />}
          {failed && <FailedCard onRetry={onRetry} seen={data} />}
          {emptyFilter && (
            <section className="ch-shs-card ch-shs-empty" suppressHydrationWarning>
              <FilterEmpty code="CH-5320" onClear={() => onFilter(clearFilters(data.filter))} />
            </section>
          )}
          {firstRun && <FirstRunCard />}
          {early && (
            <p className="ch-shs-few" role="note" data-ch-code="CH-5305">
              <b>From {plural(w.rounds, 'round')}.</b> Every figure shows, with its range, but nothing is coloured until a difference is clear. Strokes gained starts from the third round. Comparisons appear once there are earlier rounds to compare with.
            </p>
          )}
          {noShots && (
            <p className="ch-shs-few" role="note" data-ch-code="CH-5308">
              Strokes gained needs three rounds posted with shots. {coach ? `${first} has` : 'You have'} {shotsWords(w.sgRounds, w.rounds, w.effSgRounds)} in this window, so strokes gained shows a dash until there are three.
            </p>
          )}

          {!failed && !noRounds && (
            <>
              <h2 className="ch-shs-sech">Overview</h2>
              <SectionBoundary surface="stats.player.overview" label="The overview" code="CH-5204">
                {data.cacheError && <InlineNotice code="CH-5213" title={CACHE_ERROR.title} body={CACHE_ERROR.body} onRetry={onRetry} />}
                <ScoringCard data={data} onOpen={() => go('scoring')} />
              </SectionBoundary>
              <SectionBoundary surface="stats.player.insight" label="What changed" code="CH-5204">
                <SummaryCard go="scoring" onOpen={() => go('scoring', 'against')} title="What changed" meta={windowLabel(data.filter)} ariaLabel={`What changed. ${windowLabel(data.filter)}. Open details`}>
                  <WhatChanged data={data} />
                </SummaryCard>
              </SectionBoundary>
              <ShsCard title="At a glance" meta="Tap one for more">
                <Glance data={data} onOpen={go} />
              </ShsCard>

              {below && (
                <>
                  <h2 className="ch-shs-sech">Your game</h2>
                  <SectionBoundary surface="stats.player.strokesGained" label="Strokes gained" code="CH-5204">
                    <SgCard data={data} onOpen={() => go('sg')} />
                  </SectionBoundary>
                  <SectionBoundary surface="stats.player.game" label="Game detail" code="CH-5205">
                    {data.statsError ? (
                      <InlineNotice code="CH-5202" title="Shot-level detail didn’t load." body="Scores and rounds are correct. Try again." onRetry={onRetry} />
                    ) : data.stats && data.stats.roundsPlayed > 0 ? (
                      PARTS.map((p) => <PartCard key={p.id} data={data} part={p} onOpen={() => go(p.id)} />)
                    ) : (
                      <section className="ch-shs-card" suppressHydrationWarning>
                        <EmptyState kind="filtered" compact code="CH-5301" title="No shot-by-shot rounds in this window." body="Game detail fills in from rounds posted hole by hole with shots. Totals-only rounds still count toward scoring." />
                      </section>
                    )}
                  </SectionBoundary>

                  <h2 className="ch-shs-sech">Rounds</h2>
                  <SectionBoundary surface="stats.player.rounds" label="The rounds" code="CH-5206">
                    <RoundsCard data={data} onOpen={() => go('rounds')} />
                  </SectionBoundary>
                </>
              )}
            </>
          )}

          {below && (
            <>
              <h2 className="ch-shs-sech">Development</h2>
              <SectionBoundary surface="stats.player.development" label="Development" code="CH-5207">
                <GoalsCard data={data} onOpen={() => go('goals')} />
                {/* A write stays on the summary, so it never hides in a detail. */}
                {onAddFocus && (
                  <Button size="sm" leftIcon={Plus} onClick={onAddFocus}>
                    Add focus area
                  </Button>
                )}
              </SectionBoundary>
            </>
          )}
        </WindowCrossfade>
      </div>

      <AnimatePresence initial={false}>
        {detail && (
          <StatsDetailScreen key="stats-detail" keyboard={keyboard.current} anchor={anchor} id={hashOf(detail)} title={DETAIL_TITLE[detail as StatsPlayerDetailId]} backLabel={backLabel} onBack={close} scrollRef={detailScroll} restoreScroll={restoreTo?.detail ?? null} onLeave={saveScroll} big={big}>
            <WindowCrossfade k={filterKey(data.filter)} off={false} reduced={reduced} className="ch-shs-d-sheet ch-shs-d-sheet--body">
              <DetailBody id={detail as StatsPlayerDetailId} data={data} reads={reads} onRetry={onRetry} coach={coach} onAddFocus={onAddFocus} onPart={replace} />
            </WindowCrossfade>
          </StatsDetailScreen>
        )}
      </AnimatePresence>
    </div>
  );
}

function FailedCard({ onRetry, seen }: { onRetry: () => void; /** The page's data: a new copy means the retry came back, so Try again works again. */ seen: unknown }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [seen]);
  return (
    <section className="ch-shs-card" suppressHydrationWarning role="alert" data-ch-code="CH-5201">
      <div className="ch-shs-notice">
        <span className="ch-shs-notice__ic--flag">
          <Icon icon={AlertTriangle} size={16} />
        </span>
        <div>
          <p className="ch-shs-notice__t">Rounds didn’t load.</p>
          <p className="ch-shs-notice__b">Posted rounds are safe. Every figure that reads them would be incomplete, so they’re hidden. Try again.</p>
          <button
            type="button"
            className="ch-shs-btn"
            data-ch="stats-retry"
            aria-disabled={busy || undefined}
            onClick={() => {
              if (busy) return; // A second tap while it loads does nothing.
              setBusy(true);
              onRetry();
            }}
          >
            <Icon icon={RotateCw} size={15} />
            Try again
          </button>
        </div>
      </div>
    </section>
  );
}

function FirstRunCard() {
  return (
    <section className="ch-shs-card ch-shs-empty" suppressHydrationWarning>
      <span className="ch-shs-empty__ic">
        <Icon icon={Flag} size={22} />
      </span>
      <h3 className="ch-shs-empty__t">Your stats start with your first round</h3>
      <p>Finish a round with shot tracking and this page fills in: your scoring average, strokes gained, greens, scrambling and putting, each against the Tour.</p>
    </section>
  );
}

/** The one green card. A drag on its chart shows that round in the figures; release restores the average. */
function ScoringCard({ data, onOpen }: { data: ChPlayerProfile; onOpen: () => void }) {
  const [read, setRead] = useState<number | null>(null);
  const rounds = trendRounds(data.rounds, 'score');
  const shown = rounds.filter((r) => r.value != null);
  const change = scoringChange(data);
  const round = read == null ? null : (data.rounds.find((r) => r.id === shown[read]?.id) ?? null);
  const label = windowLabel(data.filter);
  const showAvgLine = shown.length >= 3;
  return (
    <SummaryCard
      feature
      go="scoring"
      onOpen={onOpen}
      icon="flag"
      title="Scoring average"
      meta={round ? [round.date, round.type ? ROUND_TYPE[round.type] : null].filter(Boolean).join(' · ') : label}
      ariaLabel={`Scoring average ${formatFixed(data.win.avg)}, ${label}. Open details`}
    >
      <div className="ch-shs-figs">
        <div className="ch-shs-figline">
          <span className="ch-shs-fig">{round ? round.score : formatFixed(data.win.avg)}</span>
          <span className="ch-shs-fig-sub">
            {round ? (
              <>
                <span className={round.toPar != null && round.toPar < 0 ? 'ch-shs-under' : undefined}>{formatToPar(round.toPar)}</span> · {formatSigned(round.sg)} SG
              </>
            ) : data.win.toPar == null ? null : (
              `${formatToPar(data.win.toPar)} to par`
            )}
          </span>
        </div>
        <div className="ch-shs-delta">
          {round ? (
            <span>{round.course}</span>
          ) : (
            <>
              {change.chip && (
                <ShsPill tone={change.tone}>
                  <ShsArrow direction={change.direction} />
                  {change.chip}
                </ShsPill>
              )}
              <span>{change.words}</span>
            </>
          )}
        </div>
      </div>
      <ScoringFeatureChart rounds={rounds} tone={change.tone} onRead={setRead} />
      <div className="ch-shs-legend" aria-hidden="true">
        <span>
          <i className="ld" />
          Round
        </span>
        {showAvgLine && (
          <span>
            <i className={`ll ch-shs-fill-${change.tone}`} />
            5-round average
          </span>
        )}
        <span>
          <i className="lp" />
          Par
        </span>
      </div>
    </SummaryCard>
  );
}

/** The sentence (the honest insight, past its error only) and the two bars. Under four rounds it says when it will have something. */
/** The page writes the change as one sentence: "Putts per round are down 0.8; greens in regulation are down 5.6 pts, against the previous 10." */
function changeSentence(lines: ReadonlyArray<{ subject: string; figure: string; words: string }>): string {
  const parts = lines.map((l, i) => {
    const subject = i === 0 ? l.subject : l.subject.charAt(0).toLowerCase() + l.subject.slice(1);
    const down = /^[−-]/.test(l.figure);
    return `${subject} ${(l.subject.startsWith('Putts') || l.subject.endsWith('s')) ? 'are' : 'is'} ${down ? 'down' : 'up'} ${l.figure.replace(/^[−+-]/, '')}`;
  });
  const against = /than (.*)$/.exec(lines[0]?.words ?? '')?.[1];
  return `${parts.join('; ')}${against ? `, against ${against}` : ''}.`;
}

function WhatChanged({ data }: { data: ChPlayerProfile }) {
  const scores = trendRounds(data.rounds, 'score').filter((r) => r.value != null);
  const bars = changeBars(data);
  if (scores.length < 4)
    return (
      <p className="ch-shs-hl">
        {plural(scores.length, 'round')} so far, averaging {formatFixed(data.win.avg)}. Once there are a few more, this card says what changed and why.
      </p>
    );
  const insight = hasPrevious(data) ? playerInsight(data) : null;
  return (
    <>
      {insight?.state === 'changes' ? (
        <p className="ch-shs-hl">{changeSentence(insight.lines)}</p>
      ) : insight?.state === 'none' ? (
        <p className="ch-shs-hl">Nothing has moved past its usual round-to-round spread {insight.against}.</p>
      ) : (
        <p className="ch-shs-hl">
          {plural(scores.length, 'round')}, averaging {formatFixed(data.win.avg)}. {bars.length === 2 ? `Your ${bars[0]!.label.toLowerCase()} average ${formatFixed(Math.abs(bars[0]!.value - bars[1]!.value))} ${bars[0]!.value < bars[1]!.value ? 'lower' : 'higher'} than the ${bars[1]!.label.toLowerCase()} of this window.` : ''}
        </p>
      )}
      {bars.length > 0 && (
        <div className="ch-shs-cmp" aria-hidden="true">
          {bars.map((b) => (
            <div className="ch-shs-cmp-row" key={b.label}>
              <span className="k">{b.label}</span>
              <span className="ch-shs-cmp-track">
                <i className={`ch-shs-fill-${b.tone}`} data-ch-grow="" style={{ width: `${formatFixed(b.width, 1)}%` }} />
              </span>
              <span className="v">{formatFixed(b.value)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Glance({ data, onOpen }: { data: ChPlayerProfile; onOpen: (id: StatsDetailId) => void }) {
  return (
    <div className="ch-shs-glance">
      {glanceTiles(data).map((t) => (
        <button
          key={t.label}
          type="button"
          className="ch-shs-gc"
          data-ch="stats-glance"
          aria-label={`${t.label} ${t.value == null ? 'no value' : `${t.value}${t.unit}`}, ${t.meta}. Open ${DETAIL_TITLE[t.go]}`}
          onClick={() => {
            haptic('select');
            onOpen(t.go);
          }}
        >
          <span className="t">{t.label}</span>
          <span className={'v' + (t.value == null ? ' ch-shs-none' : '')}>
            {t.value ?? <NoData />}
            {t.value != null && t.unit && <small>{t.unit}</small>}
          </span>
          <span className="m">{t.meta}</span>
        </button>
      ))}
    </div>
  );
}

function SgCard({ data, onOpen }: { data: ChPlayerProfile; onOpen: () => void }) {
  const ready = sgReady(data);
  const rows = sgLegRows(data, data.viewer === 'coach').filter((r) => !r.total);
  const said = strongestAndLeak(rows);
  const tone = sgTone(data.win.sgPerRound, ready);
  return (
    <SummaryCard go="sg" onOpen={onOpen} title="Strokes gained" meta="vs Tour" ariaLabel={`Strokes gained ${ready ? formatSigned(data.win.sgPerRound) : 'no value'} a round against the Tour. Open details`}>
      <div className="ch-shs-sb is-one">
        <div>
          <span className={`ch-shs-bigv${tone === 'flat' ? '' : ` ch-shs-${tone}`}${ready ? '' : ' ch-shs-none'}`}>{ready ? formatSigned(data.win.sgPerRound) : <NoData />}</span>
          <div className="ch-shs-cap">{ready ? 'Strokes a round against the Tour' : `${SG_WAIT}.`}</div>
        </div>
      </div>
      <MiniDiverging rows={rows} ready={ready} />
      {ready && earlyLegsNote(rows) && <p className="ch-shs-mini-cap">{earlyLegsNote(rows)}</p>}
      {ready && said && (
        <p className="ch-shs-sumfoot">
          Strongest: <b>{said.strongest}</b>.{said.leak && (
            <>
              {' '}
              Biggest leak: <b>{said.leak.label}</b>, {formatFixed(Math.abs(said.leak.value))} a round.
            </>
          )}
        </p>
      )}
    </SummaryCard>
  );
}

const legValue = (data: ChPlayerProfile, leg: string): number | null => (data.win.sgLegs as Record<string, number | null>)[leg] ?? null;

/** The rails each part card draws: real bands, and a Tour tick only for a loaded standard. */
function partRails(data: ChPlayerProfile, part: string): { rows: MiniRailRow[]; caption: string } | null {
  const s = data.stats;
  if (!s) return null;
  if (part === 'approach')
    return {
      rows: [
        { label: '50–75', value: s.girPct50_75 },
        { label: '75–100', value: s.girPct75_100 },
        { label: '100–125', value: s.girPct100_125 },
        { label: '125–150', value: s.girPct125_150 },
        { label: '150–175', value: s.girPct150_175 },
        { label: '175–200', value: s.girPct175_200 },
        { label: '200+', value: s.girPct200_225 ?? s.girPct225Plus },
      ],
      caption: 'Greens hit by distance, in yards',
    };
  if (part === 'short')
    return {
      rows: [
        { label: 'All chances', value: s.scramblingPercentage },
        { label: 'From sand', value: s.sandSavePercentage, tour: data.bench.scrambling_pct_sand ?? null },
        { label: 'Inside 10 yds', value: s.scramblingPct0_10 },
        { label: 'From the fringe', value: s.scramblingPctFringe },
      ],
      caption: 'Up and down rate; the tick is the Tour, from sand only',
    };
  if (part === 'putting') {
    // The middle four of the six real bands, as drawn (3–5 to 15–25 ft, each with its Tour tick).
    const rows = (data.puttBands ?? []).slice(1, 5).map((b) => ({ label: b.label, value: b.attempts ? (b.made / b.attempts) * 100 : null, tour: b.bench }));
    return rows.length ? { rows, caption: 'Putts made by distance; the tick is the Tour' } : null;
  }
  return null;
}

function partStrip(data: ChPlayerProfile, part: string): Array<{ t: string; v: string | null; unit?: string }> {
  const s = data.stats;
  if (!s) return [];
  const yds = (v: number | null | undefined) => (v == null ? null : String(Math.round(v)));
  const pc = (v: number | null | undefined) => (v == null ? null : String(Math.round(v)));
  if (part === 'tee')
    return [
      { t: 'All tee shots', v: yds(s.drivingDistanceAvg), unit: ' yds' },
      { t: 'Driver', v: yds(s.drivingDistanceDriverOnly), unit: ' yds' },
      { t: 'Other tee shots', v: yds(s.drivingDistanceNonDriverOnly), unit: ' yds' },
    ];
  if (part === 'approach')
    return [
      { t: 'From the fairway', v: pc(s.girPctFromFairway), unit: '%' },
      { t: 'From the rough', v: pc(s.girPctFromRough), unit: '%' },
      { t: 'Missed short', v: pc(s.approachMissShortPct), unit: '%' },
    ];
  if (part === 'putting')
    return [
      { t: 'Three-putts / round', v: s.threePuttsPerRound == null ? null : formatFixed(s.threePuttsPerRound) },
      { t: 'Make rate 5–10 ft', v: pc(data.puttBands?.[2] && data.puttBands[2].attempts ? (data.puttBands[2].made / data.puttBands[2].attempts) * 100 : null), unit: '%' },
    ];
  return [];
}

function PartCard({ data, part, onOpen }: { data: ChPlayerProfile; part: (typeof PARTS)[number]; onOpen: () => void }) {
  const kf = keyFigure(data, part.id);
  const ready = sgReady(data);
  const sg = legValue(data, part.leg);
  const s = data.stats;
  const rails = partRails(data, part.id);
  const strip = partStrip(data, part.id);
  const opp = s?.fairwayOpportunities ?? 0;
  const tee = part.id === 'tee' && s && opp > 0 ? [
    { label: 'Left', share: (s.missLeftCount / opp) * 100, cls: 'ch-shs-fill-flat' },
    { label: 'Fairway', share: (s.fairwaysHit / opp) * 100, cls: 'ch-shs-fill-gain' },
    { label: 'Right', share: (s.missRightCount / opp) * 100, cls: 'ch-shs-fill-miss' },
  ] : null;
  return (
    <SummaryCard go={part.id} onOpen={onOpen} icon={part.icon} title={part.name} ariaLabel={`${part.name}: ${kf.label} ${kf.value == null ? 'no value' : `${kf.value}${kf.unit}`}. Open details`}>
      <div className="ch-shs-kfr">
        <div>
          <span className={'ch-shs-bigv' + (kf.value == null ? ' ch-shs-none' : '')}>
            {kf.value ?? <NoData />}
            {kf.value != null && kf.unit && <small>{kf.unit}</small>}
          </span>
          <div className="ch-shs-cap">
            {kf.label}
            {kf.tour ? ` · ${kf.tour}` : ''}
          </div>
        </div>
        {ready && sg != null && <ShsPill tone={sgTone(sg)}>{formatSigned(sg)} SG</ShsPill>}
      </div>
      {tee && (
        <>
          <div className="ch-shs-stack" aria-hidden="true" data-ch-grow="">
            {tee.map((x) => (
              <span key={x.label} className={x.cls} style={{ flexGrow: x.share }} />
            ))}
          </div>
          <div className="ch-shs-mini-key">
            {tee.map((x) => (
              <span key={x.label}>
                {x.label} <b>{Math.round(x.share)}%</b>
              </span>
            ))}
          </div>
        </>
      )}
      {rails && <MiniRails rows={rails.rows} caption={rails.caption} />}
      {strip.length > 0 && (
        <div className="ch-shs-strip">
          {strip.map((x) => (
            <div key={x.t}>
              <span className="t">{x.t}</span>
              <span className={'v' + (x.v == null ? ' ch-shs-none' : '')}>
                {x.v ?? <NoData />}
                {x.v != null && x.unit && <small>{x.unit}</small>}
              </span>
            </div>
          ))}
        </div>
      )}
    </SummaryCard>
  );
}

/** The window's rounds oldest first, for the ticker. */
const tickerRounds = (data: ChPlayerProfile) => [...data.rounds].reverse().map((r) => ({ id: r.id, score: r.score }));

function RoundsCard({ data, onOpen }: { data: ChPlayerProfile; onOpen: () => void }) {
  const best = data.extra.bests.score;
  const label = windowLabel(data.filter);
  const n = data.win.rounds;
  return (
    <SummaryCard go="rounds" onOpen={onOpen} title="Round by round" meta={label} ariaLabel={`Round by round: ${plural(n, 'round')}${best ? `, best ${best.value}` : ''}. Open details`}>
      <div className="ch-shs-sb">
        <div>
          <span className="ch-shs-bigv">
            {n}
            <small>{pluralWord(n, 'round', 'rounds')}</small>
          </span>
          {best && n > 1 && (
            <div className="ch-shs-cap">
              Best {best.value} · {best.date}
            </div>
          )}
        </div>
        <div>
          <RoundTicker rounds={tickerRounds(data)} />
          {n > 1 && <div className="ch-shs-mini-cap">Taller is lower; best in green</div>}
        </div>
      </div>
    </SummaryCard>
  );
}

interface RingItem {
  id: string;
  title: string;
  progress: number | null;
  centre: string;
  line: string;
}

/** Rings only from `progressOf`, never invented (criterion 46): goals first, then the coach's focus areas. */
function ringItems(data: ChPlayerProfile): RingItem[] {
  const goals = data.goals
    .filter((g) => g.state !== 'achieved' && g.state !== 'completed' && g.state !== 'paused')
    .map((g) => {
      const metric = devMetric(g.title, g.metric);
      return { id: g.id, title: devTitle(g.title), progress: progressOf(g.baseline, g.current, g.target), centre: devValue(g.current, metric), line: goalLine(g) };
    });
  const areas = data.focusAreas
    .filter((f) => f.status === 'active')
    .map((f) => {
      const metric = devMetric(f.title, f.metric);
      return { id: f.id, title: devTitle(f.title), progress: progressOf(f.baseline, f.current, f.target), centre: devValue(f.current, metric), line: devProgress(f) };
    });
  return [...goals, ...areas];
}

function GoalsCard({ data, onOpen }: { data: ChPlayerProfile; onOpen: () => void }) {
  const items = ringItems(data);
  const three = items.slice(0, 3);
  return (
    <SummaryCard go="goals" onOpen={onOpen} title="Goals and focus areas" meta={`${items.length} active`} ariaLabel={`Goals and focus areas: ${items.length} active. Open details`}>
      {data.devError ? (
        <p className="ch-shs-goaltext">Some development items didn’t load. Open this card to try again.</p>
      ) : !three.length ? (
        <p className="ch-shs-goaltext">{data.viewer === 'coach' ? `${data.firstName} has no goals or focus areas yet.` : 'Goals you and your coach set show here.'}</p>
      ) : (
        <div className="ch-shs-rings">
          {three.map((g) => (
            <div key={g.id} role="img" aria-label={`${g.title}: ${g.line}`}>
              {g.progress != null ? <GoalRing progress={g.progress} label={g.centre} /> : <span className="ch-shs-rg-none ch-num">{g.centre}</span>}
              <b>{g.title}</b>
              <small>{g.line}</small>
            </div>
          ))}
        </div>
      )}
    </SummaryCard>
  );
}

/** A leg's chips on a hero: its SG pill and likely range, or the wait line under three rounds. */
function PartChips({ data, leg }: { data: ChPlayerProfile; leg: string }) {
  if (!sgReady(data)) return <span>{SG_WAIT}</span>;
  const row = sgLegRows(data, data.viewer === 'coach').find((r) => r.key === leg);
  if (row?.value == null) return <span>{SG_WAIT}</span>;
  return (
    <>
      <ShsPill tone={sgTone(row.value)}>{formatSigned(row.value)} SG</ShsPill>
      {row.se != null && (
        <span className="ch-num">
          likely {formatSigned(row.value - row.se)} to {formatSigned(row.value + row.se)}
        </span>
      )}
    </>
  );
}

function DetailBody({
  id,
  data,
  reads,
  onRetry,
  coach,
  onAddFocus,
  onPart,
}: {
  id: StatsPlayerDetailId;
  data: ChPlayerProfile;
  reads?: ChReadsSource;
  onRetry: () => void;
  coach: boolean;
  onAddFocus: (() => void) | null;
  onPart: (id: StatsDetailId) => void;
}) {
  if (id === 'sg') return <SgDetail data={data} onPart={onPart} />;
  if (id === 'rounds') return <RoundsDetail data={data} />;
  if (id === 'goals') return <GoalsDetail data={data} coach={coach} onAddFocus={onAddFocus} onRetry={onRetry} />;
  return <GameAreaDetail id={id} data={data} reads={reads} onRetry={onRetry} />;
}

/** Scoring and the four parts: the page's blocks around today's panels, every one of them kept (`GameDetail only`). */
function GameAreaDetail({ id, data, reads, onRetry }: { id: 'scoring' | 'tee' | 'approach' | 'short' | 'putting'; data: ChPlayerProfile; reads?: ChReadsSource; onRetry: () => void }) {
  const label = windowLabel(data.filter);
  const previous = hasPrevious(data);
  if (data.statsError) return <InlineNotice code="CH-5202" title="Shot-level detail didn’t load." body="Scores and rounds are correct. Try again." onRetry={onRetry} />;
  const coach = data.viewer === 'coach';
  const x = data.extra;
  const part = PARTS.find((p) => p.id === id);
  let hero: ReactNode;
  let bench: ReactNode = null;
  let before: ReactNode = null;
  let after: ReactNode;
  if (id === 'scoring') {
    const change = scoringChange(data);
    hero = (
      <DetailHero
        figure={formatFixed(data.win.avg)}
        caption={`Scoring average${data.win.toPar == null ? '' : ` · ${formatToPar(data.win.toPar)} to par`} · ${label}${coach && data.teamAvg != null ? ` · Team ${formatAvg(data.teamAvg)}` : ''}`}
        gauge={data.win.avg != null && data.win.toPar != null ? <FigureGauge gauge={{ kind: 'par', toPar: data.win.toPar }} n={data.win.avg} /> : undefined}
        chips={
          <>
            {change.chip && (
              <ShsPill tone={change.tone}>
                <ShsArrow direction={change.direction} />
                {change.chip}
              </ShsPill>
            )}
            <span>{change.words}</span>
          </>
        }
      />
    );
    const parValues = new Set(data.rounds.map((r) => (r.toPar == null || r.holes !== 18 ? null : r.score - r.toPar)));
    const par = parValues.size === 1 ? [...parValues][0]! : null;
    const reading = scoreTrendReading(data);
    before = x.series.score.length > 0 && (
      <ShsCard title="Score by round" meta={par == null ? undefined : 'Par dashed'}>
        <Ribbon points={x.series.score} lowerIsBetter reference={par == null ? null : { value: par, label: 'Par' }} />
        {reading && <p className="ch-shs-mini-cap">{reading}</p>}
      </ShsCard>
    );
    after = (
      <>
        <ShsCard title="What changed">
          <WhatChanged data={data} />
        </ShsCard>
        <AgainstBefore compare={x.compare} rows={COMPARE_ROWS.all} previous={previous} how={SHS_HOW.scoring} />
      </>
    );
  } else {
    const kf = keyFigure(data, id);
    hero = <DetailHero figure={kf.value ?? <NoData />} unit={kf.value != null ? kf.unit : undefined} caption={`${kf.label} · ${label}`} chips={<PartChips data={data} leg={part!.leg} />} />;
    if (kf.rail)
      bench = (
        <>
          <span className="ch-shs-hrail ch-shs-kf-bar" aria-hidden="true">
            <i className={`ch-shs-fill-${kf.rail.tone}`} data-ch-grow="" style={{ width: `${kf.rail.you}%` }} />
            <span className="ch-shs-tour" style={{ left: `${kf.rail.tour}%` }} />
          </span>
          <div className="ch-shs-bench-k">
            <span className={`ch-shs-${kf.rail.tone}`}>
              You {kf.value}
              {kf.unit}
            </span>
            <span>{kf.tour}</span>
          </div>
        </>
      );
    const tour = data.bench.gir_pct;
    if (id === 'approach' && x.series.gir.length > 0)
      before = (
        <ShsCard title="Greens by round" meta={tour == null ? undefined : 'Tour dashed'}>
          <Ribbon points={x.series.gir} reference={tour == null ? null : { value: tour, label: 'Tour' }} format={(v) => `${Math.round(v)}%`} />
        </ShsCard>
      );
    if (id === 'putting' && x.series.putts.length > 0)
      before = (
        <ShsCard title="Putts by round" meta="Up is fewer">
          <Ribbon points={x.series.putts} lowerIsBetter />
        </ShsCard>
      );
    after =
      id === 'short' ? (
        <ShsCard title="How this is measured">
          <p className="ch-shs-how-t is-open">{SHS_HOW.short}</p>
        </ShsCard>
      ) : (
        <AgainstBefore compare={x.compare} rows={COMPARE_ROWS[id]} previous={previous} how={SHS_HOW[id]} />
      );
  }
  if (!data.stats || data.stats.roundsPlayed === 0)
    return (
      <>
        {hero}
        {before}
        <section className="ch-shs-card" suppressHydrationWarning>
          <EmptyState kind="filtered" compact code="CH-5301" title="No shot-by-shot rounds in this window." body="Game detail fills in from rounds posted hole by hole with shots. Totals-only rounds still count toward scoring." />
        </section>
        {after}
      </>
    );
  return (
    <GameDetail
      s={data.stats}
      x={x}
      bench={data.bench}
      tour={data.tour}
      first={coach ? data.firstName : 'You'}
      rounds={data.win.rounds}
      window={data.window}
      basis={basisWords(data.filter)}
      holes={data.filter.holes}
      puttBands={data.puttBands}
      reads={reads}
      onRetry={onRetry}
      phone
      only={id}
      shs
      asDetail={{ hero, bench, before, after, figuresMeta: windowShort(data.filter), figuresFirst: id !== 'scoring' }}
    />
  );
}

/** What today's Scoring trend said in words: how far the rounds run, which way they went past the noise (A1), and that a 9-hole score is doubled. */
export function scoreTrendReading(data: ChPlayerProfile): string | null {
  const rounds = trendRounds(data.rounds, 'score');
  if (rounds.length === 0) return null;
  const moved = halvesTone(halvesChange(rounds.map((r) => r.value!), 'score'), true, 0);
  const said = moved === 'is-gain' ? ', lower lately' : moved === 'is-loss' ? ', higher lately' : rounds.length >= 3 ? ', no clear change' : '';
  const doubled = rounds.some((r) => r.holes === 9) ? ' 9-hole scores doubled.' : '';
  return `${plural(rounds.length, 'round')}, from ${Math.round(rounds[0]!.value!)} to ${Math.round(rounds[rounds.length - 1]!.value!)}${said}.${doubled}`;
}

/** The muted legs, named: a leg between its show and early floors reads as an early read, as today's bars did. */
export function earlyLegsNote(rows: ReadonlyArray<{ label: string; state?: string; total?: boolean }>): string | null {
  const early = rows.filter((r) => r.state === 'early' && !r.total).map((r) => r.label);
  return early.length ? `Hollow bars are early reads (${early.join(', ')}) and can still move a lot.` : null;
}

function SgDetail({ data, onPart }: { data: ChPlayerProfile; onPart: (id: StatsDetailId) => void }) {
  const label = windowLabel(data.filter);
  const ready = sgReady(data);
  const [pin, setPin] = useState<string | null>(null);
  const how = (
    <ShsCard title="How strokes gained works">
      <p className="ch-shs-how-t is-open">{SHS_HOW.sg}</p>
    </ShsCard>
  );
  if (!ready)
    return (
      <>
        <DetailHero figure={<NoData />} caption={`Strokes a round against the Tour · ${label}`} chips={<span>{SG_WAIT}</span>} />
        {how}
      </>
    );
  const all = sgLegRows(data, data.viewer === 'coach');
  const total = all.find((r) => r.total);
  const scale = sgScale(all.map((r) => r.value));
  const sgRounds = trendRounds(data.rounds, 'sg');
  const role = data.viewer === 'coach' ? 'coach' : 'player';
  const pinned = all.find((r) => r.key === pin);
  const baseline = sgBaseline(data.tour);
  return (
    <>
      <DetailHero
        figure={formatSigned(data.win.sgPerRound)}
        caption={`Strokes a round against the Tour · ${label}`}
        gauge={data.win.sgPerRound != null ? <FigureGauge gauge={{ kind: 'sg', tour: data.tour }} n={data.win.sgPerRound} /> : undefined}
        chips={
          <>
            {total?.se != null && data.win.sgPerRound != null && (
              <span className="ch-num">
                Likely {formatSigned(data.win.sgPerRound - total.se)} to {formatSigned(data.win.sgPerRound + total.se)}
              </span>
            )}
            {data.sgChange.delta != null && <SgChangeChip change={data.sgChange} subject="Change in SG a round" code="CH-5310" />}
          </>
        }
      />
      <ShsCard title="By part of the game" meta="Per round">
        <p className="ch-shs-readout" aria-live="polite">
          {pinned ? legReadout(pinned) : 'Tap a part to see its likely range.'}
        </p>
        {all.map((r) => {
          // An early read is muted and untoned, a leg under its floor says what it needs (as today's SgBars).
          const early = r.state === 'early';
          const tone = early ? 'flat' : sgTone(r.value);
          const bar = r.value == null ? null : divergeBar(r.value, scale);
          const on = pin === r.key;
          return (
            <button key={r.key} type="button" className={`ch-shs-drow${r.total ? ' is-total' : ''}${on ? ' is-pinned' : ''}`} data-ch="stats-sg-row" aria-pressed={on} aria-label={r.value == null && r.tag ? `${r.label}: ${r.tag}` : `${r.label}: ${formatSigned(r.value)} a round${early && r.tag ? `, ${r.tag}` : ''}`} onClick={() => setPin(on ? null : r.key)}>
              <span className="lab">{r.label}</span>
              <span className="ch-shs-rail">
                <span className="ch-shs-zero" />
                {bar && <span className={`ch-shs-bar ch-shs-fill-${tone}${early ? ' is-early' : ''}`} data-ch-grow="" style={{ left: `${bar.left}%`, width: `${bar.width}%`, transformOrigin: `${(r.value ?? 0) >= 0 ? '0' : '100%'} 50%` }} />}
                {r.value == null && r.tag && <span className="ch-shs-needs">{r.tag}</span>}
                {r.value != null && r.se != null && <span className="ch-shs-whisk" style={{ left: `${divergeAt(r.value - r.se, scale)}%`, width: `${divergeAt(r.value + r.se, scale) - divergeAt(r.value - r.se, scale)}%` }} />}
              </span>
              <span className={`val${tone === 'flat' ? '' : ` ch-shs-${tone}`}`}>{formatSigned(r.value)}</span>
            </button>
          );
        })}
        <div className="ch-shs-scale" aria-hidden="true">
          <span />
          <span>
            <span>−{scale}</span>
            <span>0</span>
            <span>+{scale}</span>
          </span>
          <span />
        </div>
        {earlyLegsNote(all) && <p className="ch-shs-mini-cap">{earlyLegsNote(all)}</p>}
      </ShsCard>
      <ShsCard title="Open a part" flush>
        <ul className="ch-shs-rlist">
          {PARTS.map((p) => {
            const kf = keyFigure(data, p.id);
            const sg = legValue(data, p.leg);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="ch-shs-rrow is-part"
                  data-ch="stats-part-row"
                  onClick={() => {
                    haptic('select');
                    onPart(p.id);
                  }}
                >
                  <ShsIcon name={p.icon} />
                  <span className="c">
                    <b>{p.name}</b>
                    <span>
                      {kf.label} {kf.value == null ? <NoData /> : `${kf.value}${kf.unit}`}
                    </span>
                  </span>
                  <span className="r">{sg != null && <ShsPill tone={sgTone(sg)}>{formatSigned(sg)} SG</ShsPill>}</span>
                  <ShsChevron />
                </button>
              </li>
            );
          })}
        </ul>
      </ShsCard>
      {sgRounds.some((r) => r.value != null) && (
        <ShsCard title="Strokes gained by round" meta="Per 18 holes">
          <RoundTrend rounds={sgRounds} kind="sg" tour={data.tour} openHref={(rid) => rebuiltHref(`/golf/dashboard/rounds/${rid}`, role)} label={`Strokes gained in each round of the window, against ${baseline.noun}.`} />
        </ShsCard>
      )}
      {how}
    </>
  );
}

function RoundsDetail({ data }: { data: ChPlayerProfile }) {
  const role = data.viewer === 'coach' ? 'coach' : 'player';
  const n = data.win.rounds;
  const label = windowLabel(data.filter);
  return (
    <>
      <DetailHero figure={String(n)} caption={`Rounds · averaging ${formatFixed(data.win.avg)} · ${label}`} chips={<span className="ch-num">{countWords(n, data.win.effRounds)} in this window.</span>} />
      <ShsCard title="Round by round" meta="Taller is lower">
        <RoundTicker rounds={tickerRounds(data)} />
        <p className="ch-shs-mini-cap">{n > 1 ? 'Best round in green. Score by round is on the Scoring page.' : 'Score by round is on the Scoring page.'}</p>
      </ShsCard>
      {data.rounds.length > 0 && <RoundsExtra noCompare x={data.extra} filter={data.filter} phone share={{ viewer: data.viewer, name: data.name, coach: data.attestingCoach }} />}
      {data.rounds.length > 0 && <AgainstBefore compare={data.extra.compare} rows={COMPARE_ROWS.all} previous={hasPrevious(data)} how={SHS_HOW.scoring} />}
      <ShsCard title="Every round" meta={plural(data.rounds.length, 'round')} flush>
        {data.rounds.length === 0 ? (
          <EmptyState code="CH-5302" kind="filtered" compact title="No rounds in this window." body="Try This season to see every round posted since August." />
        ) : (
          <ul className="ch-shs-rlist">
            {data.rounds.map((r) => {
              const href = rebuiltHref(`/golf/dashboard/rounds/${r.id}`, role);
              const under = r.toPar != null && r.toPar < 0;
              const row = (
                <>
                  <span className={'ch-shs-score' + (under ? ' is-under' : '')}>{r.score}</span>
                  <span className="c">
                    <b>{r.course}</b>
                    <span className="ch-num">{[r.date, r.holes === 9 ? '9 holes' : null, r.type ? ROUND_TYPE[r.type] : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="r">
                    <span className={'ch-shs-tp' + (under ? ' is-under' : '')}>{formatToPar(r.toPar)}</span>
                    {r.sg != null && data.win.sgPerRound != null && <ShsPill tone={sgTone(r.sg)}>{formatSigned(r.sg)} SG</ShsPill>}
                  </span>
                  {href ? <ShsChevron /> : <span />}
                </>
              );
              return (
                <li key={r.id}>
                  {href ? (
                    <Link
                      prefetch={false}
                      href={href}
                      className="ch-shs-rrow"
                      data-ch="stats-round-row"
                      aria-label={`${r.course}, ${r.date}: ${[r.score, r.toPar != null ? `${formatToPar(r.toPar)} to par` : null, r.sg != null ? `${formatSigned(r.sg)} strokes gained` : null].filter((v) => v != null).join(', ')}. Open the round`}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="ch-shs-rrow">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ShsCard>
    </>
  );
}

function GoalsDetail({ data, coach, onAddFocus, onRetry }: { data: ChPlayerProfile; coach: boolean; onAddFocus: (() => void) | null; onRetry: () => void }) {
  const first = data.firstName;
  const active = data.focusAreas.filter((f) => f.status === 'active').length;
  const proposed = data.focusAreas.filter((f) => f.status === 'proposed').length;
  return (
    <>
      {data.devError && <InlineNotice code="CH-5203" title="Some development items didn’t load." body="Try again." onRetry={onRetry} />}
      <ShsCard title="Goals this season" meta={plural(data.goals.length, 'goal')}>
        {!coach && (
          <>
            <GoalSetButton />
            <GoalSuggestions items={data.goalSuggestions} error={data.goalSuggestionsError} />
          </>
        )}
        {data.goals.length === 0 ? (
          <EmptyState code="CH-5304" kind="first-run" compact title="No goals set." body={coach ? `${first} has no goals yet.` : 'Goals you and your coach set show here.'} />
        ) : (
          <div className="ch-shs-goals">
            {data.goals.map((g) => {
              const metric = devMetric(g.title, g.metric);
              const progress = progressOf(g.baseline, g.current, g.target);
              return (
                <div className="ch-shs-goal1" key={g.id}>
                  {progress != null && <GoalRing progress={progress} label={devValue(g.current, metric)} />}
                  <div>
                    <b>{devTitle(g.title)}</b>
                    <span className="ch-num">{goalLine(g)}</span>
                    <GoalStatus id={g.id} title={devTitle(g.title)} state={g.state} coach={coach} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ShsCard>
      <ShsCard title="Focus areas" meta={`${active} active${proposed ? ` · ${proposed} waiting on ${coach ? first : 'you'}` : ''}`} flush>
        {data.focusAreas.length === 0 ? (
          <EmptyState code="CH-5303" kind="first-run" compact title="No focus areas yet." body={coach ? 'Add one from a weak section above.' : 'Your coach adds focus areas; they show here.'} />
        ) : (
          <div className="ch-shs-dev">
            {data.focusAreas.map((f) => {
              const progress = progressOf(f.baseline, f.current, f.target);
              return (
                <div key={f.id}>
                  <b>{devTitle(f.title)}</b>
                  <span className="ch-num">{f.status === 'proposed' ? 'Proposed, waiting to be accepted' : devProgress(f)}</span>
                  {progress != null && (
                    <div className="ch-shs-prog" aria-hidden="true">
                      <i data-ch-grow="" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                  {!coach && f.status === 'proposed' && <ProposalAnswer id={f.id} title={f.title} />}
                  <FocusLoop loop={f.loop} />
                </div>
              );
            })}
          </div>
        )}
      </ShsCard>
      {onAddFocus && (
        <Button size="sm" leftIcon={Plus} onClick={onAddFocus}>
          Add focus area
        </Button>
      )}
    </>
  );
}
