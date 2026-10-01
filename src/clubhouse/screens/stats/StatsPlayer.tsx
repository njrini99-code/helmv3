'use client';

import { CalendarPlus, Check, ChevronLeft, ChevronRight, Info, MessageSquare, Plus, Target } from 'lucide-react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createFocusArea } from '@/app/golf/actions/development';
import type { ChPlayerProfile } from '../../data/stats-player';
import type { ChWindow } from '../../data/stats-common';
import { holeCoverage } from '../../data/round-scope';
import { basisWords, clearFilters, HOLES_ADJ, hasRange, per18, type ChHoles, isFiltered, isWindowChange, statsHref, withWindow, type ChFilter } from '../../data/stats-filter';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { Segmented } from '../../ui/Segmented';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { ScrollRegion } from '../../ui/ScrollRegion';
import { useToast } from '../../ui/Toast';
import { CH_SLOW_SAVE_AFTER, isOffline, useAction } from '../../lib/use-action';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { chTween } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useChPhone } from '../../lib/use-phone';
import { tabListKeys } from '../../lib/tabs';
import { formatFixed, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { sgBaseline } from '../../lib/sg';
import { rebuiltHref } from '../../shell/nav';
import { formatHcp } from '../roster/format';
import { usePageCrumbs } from '../../shell/crumbs';
import { LEGS_LIST } from './legs';
import { FieldTable, FigureCards, LegRoute, ScoreBoardTrend, SgChangeChip, YardagePage } from './charts';
import { ROUND_TYPE } from './detail';
import { GameDetail } from './GameDetail';
import { RoundsExtra } from './RoundsExtra';
import { ProposalAnswer } from './ProposalAnswer';
import { StatsPlayerPhone } from './StatsPlayerPhone';
import { changeWords, WindowSwitch } from './WindowSwitch';
import { CACHE_ERROR, countWords, shotsWords } from './notes';
import { FilterEmpty, NineHint, StatsFilter } from './StatsFilter';

type Tab = 'overview' | 'game' | 'rounds' | 'dev';
const TABS: readonly Tab[] = ['overview', 'game', 'rounds', 'dev'];

/** Form over the plotted rounds (oldest first): the newer half against the older half, in strokes. */
export function formNote(first: string, scores: number[]): string {
  if (scores.length < 3) return `Early read. ${first}'s form shows after three rounds.`;
  const half = Math.floor(scores.length / 2);
  const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const c = m(scores.slice(scores.length - half)) - m(scores.slice(0, half));
  if (c <= -0.5) return `${first} is scoring ${Math.abs(c).toFixed(1)} lower in the newer half of these rounds.`;
  if (c >= 0.5) return `${first} is scoring ${c.toFixed(1)} higher in the newer half of these rounds.`;
  return `${first} is holding steady across these rounds.`;
}

/** `initialTab` is the URL's `tab` (Roster's "All N" opens `tab=rounds`, D-53); anything else opens Overview. */
export function StatsPlayer({ data, coachId, initialTab }: { data: ChPlayerProfile; coachId: string | null; initialTab?: string }) {
  const router = useRouter();
  const toast = useToast();
  const reduced = useChReducedMotion();
  const phone = useChPhone();
  const [tab, setTab] = useState<Tab>(() => TABS.find((t) => t === initialTab) ?? 'overview');
  const [focusOpen, setFocusOpen] = useState(false);
  const [pending, start] = useTransition();
  const coach = data.viewer === 'coach';
  // As in the handoff: a coach looking at a player reads "Stats › Jonah Okafor".
  usePageCrumbs(coach ? ['Stats', data.name] : null);
  const w = data.win;
  // Strokes gained needs three rounds WITH shots, so the banner keys on those, not on the round count alone.
  // A filter that leaves no round says so in place of the tab's figures (CH-5320), not as an early read of nothing.
  const filtered = isFiltered(data.filter);
  const emptyFilter = filtered && w.rounds === 0 && !data.roundsError;
  const early = w.effRounds < 3 && !emptyFilter;
  const noShots = !early && !emptyFilter && w.effSgRounds < 3;
  const showFilter = !data.roundsError && (data.filterOptions.total > 0 || filtered);
  const first = data.firstName;
  const baseline = sgBaseline(data.tour);
  const base = '/golf/dashboard/stats';
  const href = (player: string | null, f: ChFilter) => statsHref(base, f, { player: player && coach ? player : null });
  const go = (player: string | null, f: ChFilter) => start(() => router.push(href(player, f), { scroll: false }));
  // Changing the window or the filter while offline requests nothing (CH-5901); one that is slow says so once (CH-5902).
  const here = href(data.id, data.filter);
  const [loading, setLoading] = useState<ChFilter | null>(null);
  useEffect(() => setLoading(null), [here]);
  useEffect(() => {
    if (!loading) return;
    const words = changeWords(data.filter, loading);
    const slow = window.setTimeout(() => toast({ title: words.slow, body: `This is taking longer than usual. ${words.still}`, code: 'CH-5902' }), CH_SLOW_SAVE_AFTER);
    return () => window.clearTimeout(slow);
  }, [loading, data.filter, toast]);
  const changeFilter = (next: ChFilter) => {
    if (isOffline()) {
      const words = changeWords(data.filter, next);
      haptic('error');
      toast({ tone: 'error', title: words.offline, body: `Reconnect, then try again. ${words.still}`, code: 'CH-5901' });
      return;
    }
    chTrail(isWindowChange(data.filter, next) ? `stats window ${next.window}` : 'stats filter');
    setLoading(next);
    go(data.id, next);
  };
  const changeWindow = (win: ChWindow) => changeFilter(withWindow(data.filter, win));
  const filterCodes = { empty: 'CH-5320', pickEmpty: 'CH-5321', pickCap: 'CH-5322', range: 'CH-5102', holes: 'CH-5323' };
  // A coach's Message opens the direct thread with this player (Messages' ?player= link), not the bare inbox.
  const messageHref = coach ? rebuiltHref(`/golf/dashboard/messages?player=${data.id}`) : null;
  // The board's Schedule 1:1: Calendar's editor with only this player invited (D-52).
  const planHref = coach ? rebuiltHref(`/golf/dashboard/calendar?new=1&with=${data.id}`) : null;

  const heroFigs: Array<[string, string, string, string?, ReactNode?]> = [
    ['Scoring avg', formatFixed(w.avg), coach && data.teamAvg != null ? `Team ${data.teamAvg.toFixed(1)}` : `${w.rounds} rounds`],
    ['Handicap', formatHcp(data.handicap), 'Index'],
    ['SG / round', w.sgPerRound == null ? NO_DATA : formatSigned(w.sgPerRound), `Per round ${baseline.vs}`, w.sgPerRound == null ? undefined : w.sgPerRound >= 0 ? 'ch-gain' : 'ch-loss', w.sgPerRound != null && (data.sgChange.delta != null || data.sgChange.context) ? <SgChangeChip change={data.sgChange} code="CH-5310" /> : undefined],
    ['Rounds', String(data.season.rounds), 'This season'],
  ];
  const pickTab = (t: Tab) => {
    if (t !== tab) {
      haptic('select');
      chTrail(`stats tab ${t}`);
    }
    setTab(t);
  };
  const tabs: Array<[Tab, string, number?]> = [
    ['overview', 'Overview'],
    ['game', 'Game detail'],
    ['rounds', 'Rounds', data.rounds.length],
    ['dev', 'Development'],
  ];
  const tabKeys = tabListKeys(
    tabs.map(([t]) => t),
    tab,
    pickTab,
    (t) => `tab-${t}`,
  );

  const sheet = coach && coachId && <FocusAreaSheet open={focusOpen} onClose={() => setFocusOpen(false)} playerId={data.id} coachId={coachId} first={first} />;

  if (phone)
    return (
      <main className="ch-st is-phone" aria-busy={pending} data-ch-code={pending ? 'CH-5402' : undefined}>
        <StatsPlayerPhone
          data={data}
          initialTab={initialTab}
          playerHref={href(data.id, data.filter)}
          messageHref={messageHref}
          onWindow={changeWindow}
          onFilter={changeFilter}
          onBackToTeam={() => go(null, data.filter)}
          onAddFocus={coach && coachId ? () => setFocusOpen(true) : null}
          onRetry={() => router.refresh()}
        />
        {sheet}
      </main>
    );

  // `is-desk`: the server renders desktop; at phone width it stays hidden until the phone view takes over at hydration.
  return (
    <main className="ch-st is-desk" aria-busy={pending} data-ch-code={pending ? 'CH-5402' : undefined}>
      {coach && (
        <div className="ch-st-back">
          <Button size="sm" variant="ghost" leftIcon={ChevronLeft} href={href(null, data.filter)}>
            Team stats
          </Button>
          {data.nav && (
            <div className="ch-st-back__nav">
              <Link className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm" href={href(data.nav.prev, data.filter)} aria-label="Previous player" onClick={() => haptic('select')} scroll={false}>
                <Icon icon={ChevronLeft} size={15} />
              </Link>
              <span className="ch-num">
                {data.nav.index} of {data.nav.total}
              </span>
              <Link className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm" href={href(data.nav.next, data.filter)} aria-label="Next player" onClick={() => haptic('select')} scroll={false}>
                <Icon icon={ChevronRight} size={15} />
              </Link>
            </div>
          )}
        </div>
      )}

      <section className="ch-pf-hero" aria-label={data.name}>
        <span className="ch-pf-hero__av">
          <Avatar name={data.name} size={112} />
        </span>
        <div className="ch-pf-hero__id">
          <div className="ch-pf-hero__tags">
            <span className={`ch-pf-tag is-${data.status}`}>
              <i aria-hidden="true" />
              {data.status === 'active' ? 'Active' : 'Inactive'}
            </span>
          </div>
          <h1 className="ch-display">{coach ? data.name : 'Your stats'}</h1>
          <p>{[coach ? null : data.name, data.classYear, data.gradYear ? `Class of ${data.gradYear}` : null, data.hometown].filter(Boolean).join(' · ')}</p>
          {coach && (messageHref || planHref || coachId) && (
            <div className="ch-pf-hero__act">
              {messageHref && (
                <Button leftIcon={MessageSquare} href={messageHref}>
                  Message
                </Button>
              )}
              {planHref && (
                <Button leftIcon={CalendarPlus} href={planHref}>
                  Schedule 1:1
                </Button>
              )}
              {coachId && (
                <Button variant="primary" leftIcon={Target} onClick={() => setFocusOpen(true)}>
                  Add focus area
                </Button>
              )}
            </div>
          )}
        </div>
        <dl className="ch-pf-hero__figs">
          {heroFigs.map(([l, v, s, cls, chip]) => (
            <div key={l}>
              <dt>{l}</dt>
              <dd className={`ch-num${cls ? ` ${cls}` : ''}`}>{v}</dd>
              <dd className="ch-pf-hero__sub">{s}</dd>
              {chip && <dd className="ch-pf-hero__chg">{chip}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <div className="ch-pf-tabs">
        <div className="ch-tabs" role="tablist" aria-label="Profile sections">
          {tabs.map(([t, l, n]) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              className="ch-tab-t"
              onClick={() => pickTab(t)}
              onKeyDown={tabKeys}
            >
              {l}
              {n != null && <span className="ch-tab-t__n ch-num">{n}</span>}
              {tab === t && <m.span className="ch-tab-t__bar" layoutId={reduced ? undefined : 'pf-tab'} transition={chTween('base')} />}
            </button>
          ))}
        </div>
        <WindowSwitch value={data.window} onChange={changeWindow} custom={hasRange(data.filter)} />
      </div>

      {showFilter && <StatsFilter filter={data.filter} options={data.filterOptions} count={w.rounds} onChange={changeFilter} codes={filterCodes} />}

      {!filtered && w.rounds === 0 && !data.roundsError && <NineHint code="CH-5324" filter={data.filter} options={data.filterOptions} who={coach ? `${data.firstName} has` : 'You have'} />}
      {early && (
        <div className="ch-pf-early" role="note" data-ch-code="CH-5305">
          <Icon icon={Info} size={15} />
          Early read. {first} has {countWords(w.rounds, w.effRounds)} in this window, so averages and trends will move a lot. Strokes gained shows once there are three.
        </div>
      )}
      {noShots && (
        <div className="ch-pf-early" role="note" data-ch-code="CH-5308">
          <Icon icon={Info} size={15} />
          Strokes gained needs three rounds posted with shots. {first} has {shotsWords(w.sgRounds, w.rounds, w.effSgRounds)} in this window, so strokes gained shows a dash until there are three.
        </div>
      )}
      {data.roundsError && (
        <InlineNotice code="CH-5201" title="Rounds didn't load." body="Posted rounds are safe. Try again; the error has been reported." onRetry={() => router.refresh()} />
      )}

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="ch-st-panel">
        {emptyFilter && tab !== 'dev' && <FilterEmpty code={filterCodes.empty} onClear={() => changeFilter(clearFilters(data.filter))} />}

        {tab === 'overview' && !emptyFilter && (
          <SectionBoundary surface="stats.player.overview" label="The overview" code="CH-5204">
            {data.cacheError && <InlineNotice code="CH-5213" title={CACHE_ERROR.title} body={CACHE_ERROR.body} onRetry={() => router.refresh()} />}
            <Overview data={data} coach={coach} />
          </SectionBoundary>
        )}

        {tab === 'game' && !emptyFilter && (
          <SectionBoundary surface="stats.player.game" label="Game detail" code="CH-5205">
            {data.statsError ? (
              <InlineNotice
                code="CH-5202"
                title="Shot-level detail didn't load."
                body="Scores and rounds above are correct. Try again; the error has been reported."
                onRetry={() => router.refresh()}
              />
            ) : data.stats && data.stats.roundsPlayed > 0 ? (
              <GameDetail s={data.stats} x={data.extra} bench={data.bench} first={first} rounds={w.rounds} window={data.window} basis={basisWords(data.filter)} holes={data.filter.holes} puttBands={data.puttBands} onRetry={() => router.refresh()} />
            ) : (
              <div className="ch-st-card">
                <EmptyState code="CH-5301" title="No shot-by-shot rounds in this window." body="Game detail fills in from rounds posted hole by hole with shots. Totals-only rounds still count toward scoring." />
              </div>
            )}
          </SectionBoundary>
        )}

        {tab === 'rounds' && !emptyFilter && (
          <SectionBoundary surface="stats.player.rounds" label="The rounds table" code="CH-5206">
            {data.rounds.length > 0 && (
              <div className="ch-st-grid2">
                <RoundsExtra x={data.extra} filter={data.filter} />
              </div>
            )}
            <RoundsTable rounds={data.rounds} role={coach ? 'coach' : 'player'} tour={data.tour} holes={data.filter.holes} />
          </SectionBoundary>
        )}

        {tab === 'dev' && (
          <SectionBoundary surface="stats.player.development" label="Development" code="CH-5207">
            <Development data={data} coach={coach} first={first} onAdd={coach && coachId ? () => setFocusOpen(true) : null} />
          </SectionBoundary>
        )}
      </div>

      {sheet}
    </main>
  );
}

/*
 * Each tab's content is its own component, so its SectionBoundary contains
 * everything the tab computes: a crash stays inside the tab.
 */

function Overview({ data, coach }: { data: ChPlayerProfile; coach: boolean }) {
  const w = data.win;
  const first = data.firstName;
  const baseline = sgBaseline(data.tour);
  const cmp = (label: string) => data.comparisons.find((c) => c.label === label);
  // These four are hole-level: they read the window's rounds with their holes scored, not a round posted as a total only (Q-123), and say so when that is fewer.
  const holeCount = data.extra.holeRounds ?? w.rounds;
  const fig = (label: string, short: string) => {
    const c = cmp(label);
    const ref = coach ? c?.team : c?.bench;
    return {
      label: short,
      value: c?.you == null ? NO_DATA : c.you.toFixed(c.digits),
      unit: c?.unit,
      delta: c?.you != null && ref != null ? c.you - ref : null,
      deltaDigits: c?.digits ?? 0,
      lowerIsBetter: c?.lowerIsBetter,
      context: ref == null ? `${holeCount} ${holeCount === 1 ? 'round' : 'rounds'}` : `vs. ${coach ? 'team' : 'Tour'} ${ref.toFixed(c?.digits ?? 0)}${c?.unit ?? ''}`,
      note: holeCoverage(holeCount, w.rounds) ?? undefined,
    };
  };
  // Best round: one length at a time (a 9-hole score and an 18-hole score are not the same best): the 9-hole rounds when that is all
  // the window holds, else the 18-hole ones. The lines draw scores per 18 holes, a 9-hole score doubled.
  const bestHoles = data.filter.holes === '9' ? 9 : 18;
  const bestPool = data.rounds.filter((r) => r.holes === bestHoles);
  const best = bestPool.length ? Math.min(...bestPool.map((r) => r.score)) : null;
  const trendRounds = [...data.rounds].reverse().slice(-10).map((r) => ({ label: r.date, score: per18(r.score, r.holes), toPar: r.toPar == null ? null : per18(r.toPar, r.holes), holes: r.holes }));
  const legs = [
    { label: 'Off the tee', value: w.sgLegs.tee },
    { label: 'Approach', value: w.sgLegs.approach },
    { label: 'Around green', value: w.sgLegs.around },
    { label: 'Putting', value: w.sgLegs.putting },
  ];
  const known = legs.filter((l) => l.value != null) as Array<{ label: string; value: number }>;
  const strongest = [...known].sort((a, b) => b.value - a.value)[0];
  const weakest = [...known].sort((a, b) => a.value - b.value)[0];
  const legNote = !known.length
    ? 'Strokes gained by leg appears after three rounds with shot data.'
    : weakest && weakest.value < 0 && known.filter((l) => l.value < 0).length === 1
      ? `${weakest.label} is the only leg losing strokes, about ${Math.abs(weakest.value).toFixed(1)} a round.`
      : `Strongest leg is ${strongest!.label.toLowerCase()}${weakest && weakest.value < 0 ? `; ${weakest.label.toLowerCase()} gives back the most` : ''}.`;

  return (
    <>
      <FigureCards
        items={[
          fig('Fairways hit', 'Fairways hit'),
          fig('Greens in regulation', 'Greens in regulation'),
          fig('Putts per round', 'Putts per round'),
          fig('Scrambling', 'Scrambling'),
          { label: 'Best round', value: best == null ? NO_DATA : String(best), context: bestHoles === 18 && data.filter.holes === '18' ? `${w.rounds} rounds in window` : `${bestPool.length} ${bestHoles}-hole ${bestPool.length === 1 ? 'round' : 'rounds'} in window` },
        ]}
      />
      <div className="ch-st-grid2">
        <YardagePage
          title="Scoring"
          meta={`Last ${trendRounds.length} ${HOLES_ADJ[data.filter.holes]} ${trendRounds.length === 1 ? 'round' : 'rounds'}${trendRounds.some((r) => r.holes === 9) ? ' · 9-hole scores doubled' : ''}`}
          note={trendRounds.length ? formNote(first, trendRounds.map((r) => r.score)) : undefined}
        >
          <ScoreBoardTrend rounds={trendRounds} />
        </YardagePage>
        <YardagePage title="Strokes gained by leg" meta={`Per round ${baseline.vs}${w.sgPerRound != null ? ` · total ${formatSigned(w.sgPerRound)}` : ''}`} note={legNote}>
          <LegRoute rows={legs} />
        </YardagePage>
      </div>
      <YardagePage
        title={coach ? `${first} vs. team` : 'You vs. the Tour'}
        meta={coach ? `Same window, active players · strokes gained ${baseline.vs}` : `Tour averages where the benchmark exists · strokes gained ${baseline.vs}`}
        note={`${coach ? "Team values are pooled from the active players' rounds in the same window, where the round cache has the figure. " : ''}Bands need 10 shots or putts. Par scoring is strokes a hole; the pressure gap (tournament and qualifier rounds against practice) and the opening hole are strokes to par, and lower is better.`}
      >
        <FieldTable rows={data.comparisons} showTeam={coach} />
      </YardagePage>

    </>
  );
}

function RoundsTable({ rounds, role, tour, holes }: { rounds: ChPlayerProfile['rounds']; role: 'coach' | 'player'; tour: ChPlayerProfile['tour']; holes: ChHoles }) {
  const baseline = sgBaseline(tour);
  return (
    <section className="ch-st-card">
      <div className="ch-st-card__head">
        <div>
          <h2>Rounds</h2>
          <span>Countable {HOLES_ADJ[holes]} rounds &middot; newest first &middot; strokes gained {baseline.vs}</span>
        </div>
      </div>
      {rounds.length === 0 ? (
        <EmptyState code="CH-5302" compact title="No rounds in this window." body="Try This season to see every round posted since August." />
      ) : (
        <ScrollRegion label="Rounds, scrolls sideways" className="ch-tbl">
          <div role="table" aria-label="Rounds">
            <div className="ch-tr ch-tr--h" role="row">
              <span role="columnheader">Course</span>
              <span role="columnheader">Date</span>
              <span role="columnheader" className="r">Score</span>
              <span role="columnheader" className="r">To par</span>
              <span role="columnheader" className="r">GIR</span>
              <span role="columnheader" className="r">Putts</span>
              <span role="columnheader" className="r">SG total</span>
              {LEGS_LIST.map((l) => (
                <span key={l} role="columnheader" className="r">
                  SG {l.toLowerCase()}
                </span>
              ))}
            </div>
            {rounds.map((r) => (
              <div key={r.id} className="ch-tr" role="row">
                <span role="cell" className="ch-tr__course">
                  {/* CH-5808: a round opens its review where the review is rebuilt for this viewer. */}
                  {(() => {
                    const href = rebuiltHref(`/golf/dashboard/rounds/${r.id}`, role);
                    return href ? (
                      <Link href={href} className="ch-tr__link" aria-label={`${r.course}, ${r.date}: open the round`}>
                        {r.course}
                      </Link>
                    ) : (
                      r.course
                    );
                  })()}
                  {r.holes === 9 && <em className="ch-gx-type">9 holes</em>}
                  {r.type && <em className={`ch-gx-type is-${r.type}`}>{ROUND_TYPE[r.type]}</em>}
                </span>
                <span role="cell" className="ch-n2">{r.date}</span>
                <span role="cell" className="r ch-num ch-n">{r.score}</span>
                <span role="cell" className={'r ch-num ch-topar' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>{formatToPar(r.toPar)}</span>
                <span role="cell" className="r ch-num ch-n2">{r.gir ?? NO_DATA}</span>
                <span role="cell" className="r ch-num ch-n2">{r.putts ?? NO_DATA}</span>
                <span role="cell" className={'r ch-num ch-n2' + (r.sg == null ? '' : r.sg >= 0 ? ' ch-gain' : ' ch-loss')}>{formatSigned(r.sg)}</span>
                {r.sgLegs.map((v, i) => (
                  <span key={i} role="cell" className={'r ch-num ch-n2' + (v == null ? '' : v >= 0 ? ' ch-gain' : ' ch-loss')}>
                    {formatSigned(v)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </ScrollRegion>
      )}
    </section>
  );
}

function Development({ data, coach, first, onAdd }: { data: ChPlayerProfile; coach: boolean; first: string; onAdd: (() => void) | null }) {
  const router = useRouter();
  return (
    <>
      {data.devError && <InlineNotice code="CH-5203" title="Some development items didn't load." body="Try again; the error has been reported." onRetry={() => router.refresh()} />}
      <div className="ch-st-grid2">
        <section className="ch-st-card">
          <div className="ch-st-card__head">
            <div>
              <h2>Focus areas</h2>
              <span>
                {data.focusAreas.filter((f) => f.status === 'active').length} active
                {data.focusAreas.some((f) => f.status === 'proposed') && ` · ${data.focusAreas.filter((f) => f.status === 'proposed').length} waiting on ${coach ? first : 'you'}`}
              </span>
            </div>
            {onAdd && (
              <Button size="sm" leftIcon={Plus} onClick={onAdd}>
                Add
              </Button>
            )}
          </div>
          {data.focusAreas.length === 0 ? (
            <EmptyState code="CH-5303" compact title="No focus areas yet." body={coach ? 'Add one from a weak leg in Game detail.' : 'Your coach adds focus areas; they show here.'} />
          ) : (
            data.focusAreas.map((f) => {
              const progress = progressOf(f.baseline, f.current, f.target);
              return (
                <div key={f.id} className="ch-pf-focus">
                  <div>
                    <b>{f.title}</b>
                    <span>
                      {f.status === 'proposed'
                        ? 'Proposed, waiting to be accepted'
                        : f.target != null
                          ? `${f.current ?? f.baseline ?? NO_DATA} → target ${f.target}`
                          : 'No target set'}
                    </span>
                    {!coach && f.status === 'proposed' && <ProposalAnswer id={f.id} title={f.title} />}
                  </div>
                  <div className="ch-pf-bar" aria-hidden="true">
                    {progress != null && <span style={{ width: `${progress}%` }} />}
                  </div>
                  <span className="ch-num ch-n2">{progress == null ? NO_DATA : `${progress}%`}</span>
                </div>
              );
            })
          )}
        </section>
        <section className="ch-st-card">
          <div className="ch-st-card__head">
            <div>
              <h2>Goals</h2>
              <span>{data.goals.length} this season</span>
            </div>
          </div>
          {data.goals.length === 0 ? (
            <EmptyState code="CH-5304" compact title="No goals set." body={coach ? `${first} sets goals from the player app.` : 'Set goals from your development page.'} />
          ) : (
            data.goals.map((g) => {
              const done = g.state === 'achieved' || g.state === 'completed';
              return (
                <div key={g.id} className="ch-pf-goal">
                  <span className={'ch-pf-goal__c' + (done ? ' is-done' : '')} aria-hidden="true">
                    {done && <Icon icon={Check} size={12} />}
                  </span>
                  <span className="ch-sr-only">{done ? 'Achieved:' : 'In progress:'}</span>
                  <div>
                    <b>{g.title}</b>
                    <span>{g.current != null ? `Now ${g.current}${g.target != null ? ` · target ${g.target}` : ''}` : (g.state ?? 'Active')}</span>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>

    </>
  );
}

function progressOf(baseline: number | null, current: number | null, target: number | null): number | null {
  if (baseline == null || current == null || target == null || baseline === target) return null;
  const p = ((current - baseline) / (target - baseline)) * 100;
  return Math.max(0, Math.min(100, Math.round(p)));
}

const AREAS = [
  { value: 'driving', label: 'Driving' },
  { value: 'approach', label: 'Approach' },
  { value: 'short_game', label: 'Short game' },
  { value: 'putting', label: 'Putting' },
  { value: 'mental_game', label: 'Mental' },
] as const;
type Area = (typeof AREAS)[number]['value'];

function FocusAreaSheet({ open, onClose, playerId, coachId, first }: { open: boolean; onClose: () => void; playerId: string; coachId: string; first: string }) {
  const router = useRouter();
  const [area, setArea] = useState<Area>('approach');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const invalid = title.trim().length < 3;
  const save = useAction(
    'stats.addFocusArea',
    () =>
      createFocusArea({
        player_id: playerId,
        coach_id: coachId,
        area_type: area,
        title: title.trim(),
        description: note.trim() || null,
        target_metric: null,
        current_value: null,
        target_value: null,
        status: 'proposed',
      }),
    {
      done: `Focus area proposed to ${first}. It starts when ${first} accepts.`,
      failed: `Couldn't add the focus area for ${first}`,
      hint: 'Your text is still here. Try again in a moment.',
      code: 'CH-5001',
    },
  );
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (invalid) {
      haptic('warning');
      document.getElementById('fa-title')?.focus();
      return;
    }
    const res = await save.run();
    if (res.success) {
      setTitle('');
      setNote('');
      setTouched(false);
      onClose();
      router.refresh();
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Target}
      title={`Add a focus area for ${first}`}
      description={`${first} sees it as proposed and accepts it to start the improvement window.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={save.pending} feel={null} onClick={() => void submit()}>
            {save.pending ? <span data-ch-code="CH-5401">Adding</span> : 'Propose focus area'}
          </Button>
        </>
      }
    >
      <form className="ch-rs-inv" onSubmit={submit} noValidate>
        <div className="ch-field">
          <span className="ch-field__label">Area</span>
          <Segmented<Area> size="sm" label="Area" value={area} onChange={setArea} options={AREAS} />
        </div>
        <div className="ch-field">
          <label className="ch-field__label" htmlFor="fa-title">
            What to work on
          </label>
          <input
            id="fa-title"
            className="ch-input"
            value={title}
            maxLength={120}
            placeholder="Approach from 125 to 150 yards"
            aria-invalid={touched && invalid}
            aria-describedby="fa-title-help"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          <span id="fa-title-help" className={'ch-field__help' + (touched && invalid ? ' is-error' : '')} data-ch-code={touched && invalid ? 'CH-5101' : undefined}>
            {touched && invalid ? 'Give it a short name, at least three characters.' : 'A short name the player will recognise.'}
          </span>
        </div>
        <label className="ch-field" htmlFor="fa-note">
          <span className="ch-field__label">Note for {first} (optional)</span>
          <textarea id="fa-note" className="ch-textarea" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}
