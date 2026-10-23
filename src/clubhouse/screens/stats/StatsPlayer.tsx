'use client';

import { CalendarPlus, ChevronLeft, ChevronRight, Info, MessageSquare, Plus, Sparkles, Target } from 'lucide-react';
import Link from 'next/link';
import { memo, useDeferredValue, useEffect, useRef, useState, useTransition, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createFocusArea } from '@/app/golf/actions/development';
import type { ChPlayerProfile } from '../../data/stats-player';
import type { ChStatsReads } from '../../data/stats-reads';
import { basisWords, clearFilters, HOLES_ADJ, hasRange, per18, type ChHoles, isFiltered, isWindowChange, statsHref, rangeOf, withScope, type ChFilter, type ChRange } from '../../data/stats-filter';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { Segmented } from '../../ui/Segmented';
import { Swap } from '../../ui/Swap';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { ScrollRegion } from '../../ui/ScrollRegion';
import { useDelayedToast, useToast } from '../../ui/Toast';
import { CH_SLOW_SAVE_AFTER, isOffline, useAction } from '../../lib/use-action';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { useSlidePlate } from '../../lib/slide-plate';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useChPhone } from '../../lib/use-phone';
import { tabListKeys } from '../../lib/tabs';
import { changeInk, formatAvg, formatFixed, formatHcp, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { sgBaseline } from '../../lib/sg';
import { rebuiltHref } from '../../shell/nav';
import { usePageCrumbs } from '../../shell/crumbs';
import { gameSectionFromHash, LEGS_LIST, LEG_SECTION } from './legs';
import { SgChangeChip } from './charts';
import { ROUND_TYPE } from './detail';
import { GameDetail } from './GameDetail';
import { RoundsExtra } from './RoundsExtra';
import type { ChFocusLoop } from '../../data/focus-loop-shape';
import { FocusLoop } from './FocusLoop';
import { ProposalAnswer } from './ProposalAnswer';
import { GoalSetButton, GoalStatus, GoalSuggestions } from './Goals';
import { StatsPlayerPhone } from './StatsPlayerPhone';
import { changeWords, UpdatingNote, WindowSwitch } from './WindowSwitch';
import { useChSessionState } from '../../lib/session-state';
import { CACHE_ERROR, countWords, FORM_STEADY, shotsWords } from './notes';
import { PlayerStage } from './PlayerStage';
import { PrintHead, usePrinting } from './PrintHead';
import { OverviewZones } from './OverviewZones';
import { Zone, ZoneBig as Big, Zones } from '../../ui/Zone';
import { FilterEmpty, NineHint, StatsFilter } from './StatsFilter';
import { devMetric, devProgress, devTitle, devValue, goalLine } from './dev-format';

type Tab = 'overview' | 'game' | 'rounds' | 'dev';
const TABS: readonly Tab[] = ['overview', 'game', 'rounds', 'dev'];

/** Form over the plotted rounds (oldest first): the newer half against the older half, in strokes. */
export function formNote(first: string, scores: number[]): string {
  if (scores.length < 3) return `Early read. ${first}’s form shows after three rounds.`;
  const half = Math.floor(scores.length / 2);
  const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const c = m(scores.slice(scores.length - half)) - m(scores.slice(0, half));
  if (c <= -FORM_STEADY) return `${first} is scoring ${Math.abs(c).toFixed(1)} lower in the newer half of these rounds.`;
  if (c >= FORM_STEADY) return `${first} is scoring ${c.toFixed(1)} higher in the newer half of these rounds.`;
  return `${first} is holding steady across these rounds.`;
}

/**
 * `initialTab` is the URL's `tab` (Roster's "All N" opens `tab=rounds`, D-53); anything else opens Overview. `reads` is what CoachHelm
 * sees per Game detail section (data/stats-reads.ts); without it Game detail draws no count line.
 */
export function StatsPlayer({ data, coachId, initialTab, reads }: { data: ChPlayerProfile; coachId: string | null; initialTab?: string; reads?: ChStatsReads }) {
  const router = useRouter();
  const toast = useToast();
  const delayedToast = useDelayedToast();
  const reduced = useChReducedMotion();
  const printing = usePrinting();
  const phone = useChPhone() && !printing;
  // The tab comes back when the coach returns to the page (PAGE_PERFORMANCE.md rule 1); an address that names one (Roster's "All N" opens
  // `?tab=rounds`, D-53) wins until a tab is chosen.
  const [keptTab, setKeptTab] = useChSessionState<Tab>('profile-tab', 'overview');
  const named = useRef<Tab | undefined>(TABS.find((t) => t === initialTab));
  const tab = named.current ?? keptTab;
  // The underline and the selected tab move on the press; the panel (the heavy part) renders just behind them.
  const shownTab = useDeferredValue(tab);
  const setTab = (t: Tab) => {
    named.current = undefined;
    setKeptTab(t);
  };
  // A leg's Game detail (Q12): opened from the Overview's pinned leg, or from an address that ends `#gm-<section>` (the team grid's cell).
  // The section is only in the page once the Game detail tab is, so the scroll waits for it.
  const wantSection = useRef<string | null>(null);
  const openLeg = (label: string) => {
    const id = (LEG_SECTION as Record<string, string | undefined>)[label];
    if (!id) return;
    wantSection.current = `gm-${id}`;
    setTab('game');
  };
  // On the phone the hash picks the section Game detail draws (GameDetail reads it itself), so this scroll is the desktop's.
  useEffect(() => {
    if (!wantSection.current && !phone && gameSectionFromHash(window.location.hash)) wantSection.current = window.location.hash.slice(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- read once, as the page opens
  useEffect(() => {
    const id = wantSection.current;
    if (phone) {
      wantSection.current = null;
      return;
    }
    if (!id || shownTab !== 'game') return;
    const el = document.getElementById(id);
    if (!el) return;
    wantSection.current = null;
    el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  });
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
  // Rounds that did not load are not "0 rounds": every figure, count and early-read note drawn from them waits for the retry (PAGE_PERFORMANCE rule 4).
  const failed = data.roundsError;
  const early = !failed && w.effRounds < 3 && !emptyFilter;
  const noShots = !failed && !early && !emptyFilter && w.effSgRounds < 3;
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
  // A choice back to what is already on screen (a quick Season, Qualifiers, Season) has nothing left to wait for: its slow notice ends with the tap.
  useEffect(() => {
    if (loading && href(data.id, loading) === here) setLoading(null);
  }, [loading, here]); // eslint-disable-line react-hooks/exhaustive-deps -- href is built from data.id and the base alone
  useEffect(() => {
    if (!loading) return;
    const words = changeWords(data.filter, loading);
    return delayedToast({ title: words.slow, body: `This is taking longer than usual. ${words.still}`, code: 'CH-5902' }, CH_SLOW_SAVE_AFTER);
  }, [loading, data.filter, delayedToast]);
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
  const changeWindow = (r: ChRange) => changeFilter(withScope(data.filter, r));
  const filterCodes = { empty: 'CH-5320', pickEmpty: 'CH-5321', pickCap: 'CH-5322', range: 'CH-5102', holes: 'CH-5323' };
  // A coach's Message opens the direct thread with this player (Messages' ?player= link), not the bare inbox.
  const messageHref = coach ? rebuiltHref(`/golf/dashboard/messages?player=${data.id}`) : null;
  // The board's Schedule 1:1: Calendar's editor with only this player invited (D-52).
  const planHref = coach ? rebuiltHref(`/golf/dashboard/calendar?new=1&with=${data.id}`) : null;
  // The player's CoachHelm reads (Roster's "View insights" opens the same page): a coach reads a player's stats and insights together.
  const insightsHref = coach ? rebuiltHref(`/golf/dashboard/coachhelm?player=${data.id}`, 'coach') : null;

  const heroFigs: Array<[string, string, string, string?, ReactNode?]> = [
    ['Scoring avg', failed ? NO_DATA : formatFixed(w.avg), failed ? 'Didn’t load' : coach && data.teamAvg != null ? `Team ${formatAvg(data.teamAvg)}` : `${w.rounds} rounds`],
    ['Handicap', formatHcp(data.handicap), 'Index'],
    // The change's line is always there (a window with no change leaves it empty, `hold`), so the figures, the tabs and the page below do not move between windows.
    ['SG / round', failed || w.sgPerRound == null ? NO_DATA : formatSigned(w.sgPerRound), `Per round ${baseline.vs}`, failed ? undefined : changeInk(w.sgPerRound) || undefined, !failed && w.sgPerRound != null && (data.sgChange.delta != null || data.sgChange.context) ? <SgChangeChip change={data.sgChange} code="CH-5310" /> : <span aria-hidden="true" />],
    ['Rounds', failed ? NO_DATA : String(data.season.rounds), 'This season'],
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
    ['rounds', 'Rounds', failed ? undefined : data.rounds.length],
    ['dev', 'Development'],
  ];
  const tabKeys = tabListKeys(
    tabs.map(([t]) => t),
    tab,
    pickTab,
    (t) => `tab-${t}`,
  );
  // The underline slides from the tab it left on the compositor (lib/slide-plate.ts), not Motion's layoutId.
  const tabsRef = useRef<HTMLDivElement>(null);
  useSlidePlate(tabsRef, '[aria-selected="true"] > .ch-tab-t__bar', phone ? null : tab, { reduced, tween: 'base' });

  const sheet = coach && coachId && <FocusAreaSheet open={focusOpen} onClose={() => setFocusOpen(false)} playerId={data.id} coachId={coachId} first={first} />;

  // CH-5903: the figures on screen are dimmed until the new ones land; this says which ones they are.
  const updating = <UpdatingNote from={data.filter} to={loading} code="CH-5903" />;
  if (phone)
    return (
      <>
        <main className="ch-st is-phone" aria-busy={pending} data-ch-code={pending ? 'CH-5402' : undefined}>
          <StatsPlayerPhone
            data={data}
            initialTab={initialTab}
            reads={reads}
            playerHref={href(data.id, data.filter)}
            messageHref={messageHref}
            windowShown={rangeOf(loading ?? data.filter)}
            onWindow={changeWindow}
            onFilter={changeFilter}
            onBackToTeam={() => go(null, data.filter)}
            onAddFocus={coach && coachId ? () => setFocusOpen(true) : null}
            onRetry={() => router.refresh()}
          />
          {sheet}
        </main>
        {updating}
      </>
    );

  // `is-desk`: the server renders desktop; at phone width it stays hidden until the phone view takes over at hydration.
  return (
    <>
      <main className="ch-st is-desk" aria-busy={pending} data-ch-code={pending ? 'CH-5402' : undefined} data-canopy="">
        <PrintHead subject={`${data.name} · Player stats`} />
        {coach && (
          <div className="ch-st-back">
            <Button size="sm" variant="ghost" leftIcon={ChevronLeft} href={href(null, data.filter)}>
              Team stats
            </Button>
            {data.nav && (
              <div className="ch-st-back__nav">
                <IconButton icon={ChevronLeft} size="sm" label="Previous player" href={href(data.nav.prev, data.filter)} scroll={false} />
                <span className="ch-num">
                  {data.nav.index} of {data.nav.total}
                </span>
                <IconButton icon={ChevronRight} size="sm" label="Next player" href={href(data.nav.next, data.filter)} scroll={false} />
              </div>
            )}
          </div>
        )}

        <section className="ch-pf-hero" aria-label={data.name} data-canopy-head="">
          <span className="ch-pf-hero__av">
            <Avatar name={data.name} size={84} />
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
            {coach && (messageHref || planHref || insightsHref || coachId) && (
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
                {insightsHref && (
                  <Button leftIcon={Sparkles} href={insightsHref}>
                    CoachHelm
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
          <div ref={tabsRef} className="ch-tabs" role="tablist" aria-label="Profile sections">
            {tabs.map(([t, l, n]) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`tab-${t}`}
                aria-selected={tab === t}
                aria-controls={t === shownTab ? `panel-${t}` : undefined}
                tabIndex={tab === t ? 0 : -1}
                className="ch-tab-t"
                onClick={() => pickTab(t)}
                onKeyDown={tabKeys}
              >
                {l}
                {n != null && <span className="ch-tab-t__n ch-num">{n}</span>}
                {tab === t && <span className="ch-tab-t__bar" aria-hidden="true" />}
              </button>
            ))}
          </div>
          {/* The switch moves on the tap: the window being loaded, not the one whose figures are still showing (F-55). */}
          <WindowSwitch value={rangeOf(loading ?? data.filter)} onChange={changeWindow} custom={hasRange(data.filter)} />
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
          <InlineNotice code="CH-5201" title="Rounds didn’t load." body="Posted rounds are safe. Every figure that reads them would be incomplete, so they’re hidden. Try again." onRetry={() => router.refresh()} />
        )}

        {/* The tab's panel swaps (CH-5603) behind the underline that already moved (CH-5601). */}
        <Swap swapKey={shownTab}>
          <div role="tabpanel" id={`panel-${shownTab}`} aria-labelledby={`tab-${shownTab}`} className="ch-st-panel">
            {emptyFilter && shownTab !== 'dev' && <FilterEmpty code={filterCodes.empty} onClear={() => changeFilter(clearFilters(data.filter))} />}

            {shownTab === 'overview' && !emptyFilter && !failed && (
              <SectionBoundary surface="stats.player.overview" label="The overview" code="CH-5204">
                {data.cacheError && <InlineNotice code="CH-5213" title={CACHE_ERROR.title} body={CACHE_ERROR.body} onRetry={() => router.refresh()} />}
                <Overview data={data} coach={coach} onOpenLeg={openLeg} />
              </SectionBoundary>
            )}

            {shownTab === 'game' && !emptyFilter && !failed && (
              <SectionBoundary surface="stats.player.game" label="Game detail" code="CH-5205">
                {data.statsError ? (
                  <InlineNotice
                    code="CH-5202"
                    title="Shot-level detail didn’t load."
                    body="Scores and rounds above are correct. Try again."
                    onRetry={() => router.refresh()}
                  />
                ) : data.stats && data.stats.roundsPlayed > 0 ? (
                  <GameDetail s={data.stats} x={data.extra} bench={data.bench} first={coach ? first : 'You'} rounds={w.rounds} window={data.window} basis={basisWords(data.filter)} holes={data.filter.holes} puttBands={data.puttBands} reads={reads} onRetry={() => router.refresh()} />
                ) : (
                  <div className="ch-st-card">
                    <EmptyState code="CH-5301" title="No shot-by-shot rounds in this window." body="Game detail fills in from rounds posted hole by hole with shots. Totals-only rounds still count toward scoring." />
                  </div>
                )}
              </SectionBoundary>
            )}

            {shownTab === 'rounds' && !emptyFilter && !failed && (
              <SectionBoundary surface="stats.player.rounds" label="The rounds table" code="CH-5206">
                <Zones>
                  {data.rounds.length > 0 && <RoundsExtra zones x={data.extra} filter={data.filter} share={{ viewer: data.viewer, name: data.name, coach: data.attestingCoach }} />}
                  <Zone
                    n={data.rounds.length > 0 ? 3 : 1}
                    wide
                    title="Round by round"
                    def={
                      <>
                        Every countable {HOLES_ADJ[data.filter.holes]} round, newest first, with strokes gained {sgBaseline(data.tour).vs} split by the shots it counts.
                      </>
                    }
                  >
                    <RoundsTable rounds={data.rounds} role={coach ? 'coach' : 'player'} tour={data.tour} holes={data.filter.holes} />
                  </Zone>
                </Zones>
              </SectionBoundary>
            )}

            {shownTab === 'dev' && (
              <SectionBoundary surface="stats.player.development" label="Development" code="CH-5207">
                <Development data={data} coach={coach} first={first} onAdd={coach && coachId ? () => setFocusOpen(true) : null} />
              </SectionBoundary>
            )}
          </div>
        </Swap>

        {sheet}
      </main>
      {updating}
    </>
  );
}

/*
 * Each tab's content is its own component, so its SectionBoundary contains
 * everything the tab computes: a crash stays inside the tab.
 */

/** Memoised: the seven zones are the page's heaviest read, and the tab's own state (the focus sheet, a transition) must not recompute them. */
const Overview = memo(function Overview({ data, coach, onOpenLeg }: { data: ChPlayerProfile; coach: boolean; onOpenLeg: (label: string) => void }) {
  const first = data.firstName;
  const trendRounds = [...data.rounds].reverse().slice(-10).map((r) => ({ label: r.date, course: r.course, score: per18(r.score, r.holes), toPar: r.toPar == null ? null : per18(r.toPar, r.holes), holes: r.holes }));
  // Seven zones, one per stat area; the last holds the scoring-form ribbon. Every figure is read from the profile (see OverviewZones).
  return (
    <OverviewZones
      data={data}
      coach={coach}
      onOpenLeg={onOpenLeg}
      ribbon={
        <PlayerStage
          rounds={trendRounds.map((r) => ({ label: r.label, course: r.course, score: r.score, toPar: r.toPar, holes: r.holes }))}
          first={first}
          coach={coach}
          teamAvg={data.teamAvg}
          meta={`Last ${trendRounds.length} ${HOLES_ADJ[data.filter.holes]} ${trendRounds.length === 1 ? 'round' : 'rounds'}${trendRounds.some((r) => r.holes === 9) ? ' · 9-hole scores doubled' : ''}`}
          note={trendRounds.length ? formNote(first, trendRounds.map((r) => r.score)) : undefined}
        />
      }
    />
  );
});

function RoundsTable({ rounds, role, tour, holes }: { rounds: ChPlayerProfile['rounds']; role: 'coach' | 'player'; tour: ChPlayerProfile['tour']; holes: ChHoles }) {
  const baseline = sgBaseline(tour);
  return (
    <div role="group" className="ch-zt" aria-label={`Rounds: countable ${HOLES_ADJ[holes]} rounds, newest first, strokes gained ${baseline.vs}`}>
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
              <span role="columnheader" className="r ch-tr__x">GIR</span>
              <span role="columnheader" className="r ch-tr__x">Putts</span>
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
                      <Link href={href} className="ch-tr__link ch-tr__name" title={r.course} aria-label={`${r.course}, ${r.date}: open the round`}>
                        {r.course}
                      </Link>
                    ) : (
                      <span className="ch-tr__name" title={r.course}>
                        {r.course}
                      </span>
                    );
                  })()}
                  {r.holes === 9 && <em className="ch-gx-type">9 holes</em>}
                  {r.type && <em className={`ch-gx-type is-${r.type}`}>{ROUND_TYPE[r.type]}</em>}
                </span>
                <span role="cell" className="ch-n2">{r.date}</span>
                <span role="cell" className="r ch-num ch-n">{r.score}</span>
                <span role="cell" className={'r ch-num ch-topar' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>{formatToPar(r.toPar)}</span>
                <span role="cell" className="r ch-num ch-n2 ch-tr__x">{r.gir ?? NO_DATA}</span>
                <span role="cell" className="r ch-num ch-n2 ch-tr__x">{r.putts ?? NO_DATA}</span>
                <span role="cell" className={'r ch-num ch-n2 ' + changeInk(r.sg)}>{formatSigned(r.sg)}</span>
                {r.sgLegs.map((v, i) => (
                  <span key={i} role="cell" className={'r ch-num ch-n2 ' + changeInk(v)}>
                    {formatSigned(v)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </ScrollRegion>
      )}
    </div>
  );
}

/** One focus area or goal as a track from where it started to its target, the player's current value marked on it. */
function DevTrack({ title, state, line, baseline, current, target, metric, done = false, extra, loop }: { title: string; state?: string | null; line: string; baseline: number | null; current: number | null; target: number | null; metric: string | null; done?: boolean; extra?: ReactNode; loop?: ChFocusLoop }) {
  const progress = progressOf(baseline, current, target);
  return (
    <li className={'ch-dv' + (done ? ' is-done' : '')}>
      <div className="ch-dv__top">
        <div>
          <b>{title}</b>
          <span>{state ?? line}</span>
          {extra}
        </div>
        <em className="ch-num">{done ? 'Achieved' : progress == null ? NO_DATA : `${progress}% of the way`}</em>
      </div>
      {progress != null && (
        <div className="ch-dv__rail" role="img" aria-label={`${title}: ${devValue(baseline, metric)} to start, ${devValue(current, metric)} now, ${devValue(target, metric)} target, ${progress} percent of the way`}>
          <i className="ch-dv__done" style={{ '--ch-dv-p': progress / 100 } as CSSProperties} />
          <i className="ch-dv__dot" style={{ '--ch-dv-p': progress / 100 } as CSSProperties} />
          <b className="ch-dv__now ch-num" style={{ left: `${Math.min(88, Math.max(12, progress))}%` }}>{devValue(current, metric)} now</b>
          <span className="ch-dv__end is-start">
            <b className="ch-num">{devValue(baseline, metric)}</b>Started
          </span>
          <span className="ch-dv__end is-target">
            <b className="ch-num">{devValue(target, metric)}</b>Target
          </span>
          <i className="ch-dv__flag" />
        </div>
      )}
      <FocusLoop loop={loop} />
    </li>
  );
}

function Development({ data, coach, first, onAdd }: { data: ChPlayerProfile; coach: boolean; first: string; onAdd: (() => void) | null }) {
  const router = useRouter();
  const active = data.focusAreas.filter((f) => f.status === 'active').length;
  const waiting = data.focusAreas.filter((f) => f.status === 'proposed').length;
  return (
    <>
      {data.devError && <InlineNotice code="CH-5203" title="Some development items didn’t load." body="Try again." onRetry={() => router.refresh()} />}
      <Zones>
        <Zone
          n={1}
          title="Focus areas"
          def={<>What {coach ? `${first} and the coach are` : 'you and your coach are'} working on. Each is measured by the same stat the other tabs show, so progress here is that number moving there.</>}
          read={
            <>
              <Big value={String(active)} />
              <div className="ch-znlines">
                <span>
                  <b>active</b>
                  {waiting > 0 && ` · ${waiting} waiting on ${coach ? first : 'you'}`}
                </span>
                {onAdd && (
                  <Button size="sm" leftIcon={Plus} onClick={onAdd}>
                    Add focus area
                  </Button>
                )}
              </div>
            </>
          }
        >
          {data.focusAreas.length === 0 ? (
            <EmptyState code="CH-5303" compact title="No focus areas yet." body={coach ? 'Add one from a weak leg in Game detail.' : 'Your coach adds focus areas; they show here.'} />
          ) : (
            <ul className="ch-dvl" aria-label="Focus areas">
              {data.focusAreas.map((f) => (
                <DevTrack
                  key={f.id}
                  title={devTitle(f.title)}
                  state={f.status === 'proposed' ? 'Proposed, waiting to be accepted' : null}
                  line={devProgress(f)}
                  baseline={f.baseline}
                  current={f.current}
                  target={f.target}
                  metric={devMetric(f.title, f.metric)}
                  extra={!coach && f.status === 'proposed' ? <ProposalAnswer id={f.id} title={f.title} /> : undefined}
                  loop={f.loop}
                />
              ))}
            </ul>
          )}
        </Zone>
        <Zone
          n={2}
          alt
          title="Goals"
          def={<>Results {coach ? first : 'you'} {coach ? 'is' : 'are'} chasing this season, set by the player and the coach.</>}
          read={
            <>
              <Big value={String(data.goals.length)} />
              <div className="ch-znlines">
                <span>
                  <b>this season</b>
                </span>
                {!coach && <GoalSetButton />}
              </div>
            </>
          }
        >
          {!coach && <GoalSuggestions items={data.goalSuggestions} error={data.goalSuggestionsError} />}
          {data.goals.length === 0 ? (
            <EmptyState code="CH-5304" compact title="No goals set." body={coach ? `${first} has no goals yet.` : 'Goals you and your coach set show here.'} />
          ) : (
            <ul className="ch-dvl" aria-label="Goals">
              {data.goals.map((g) => {
                const done = g.state === 'achieved' || g.state === 'completed';
                return (
                  <DevTrack
                    key={g.id}
                    title={devTitle(g.title)}
                    line={goalLine(g)}
                    state={null}
                    baseline={g.baseline}
                    current={g.current}
                    target={g.target}
                    metric={devMetric(g.title, g.metric)}
                    done={done}
                    extra={<GoalStatus id={g.id} title={devTitle(g.title)} state={g.state} coach={coach} />}
                  />
                );
              })}
            </ul>
          )}
        </Zone>
      </Zones>
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
      failed: `Couldn’t add the focus area for ${first}`,
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
  // CH-5602: the shared Modal's entrance: on desktop the sheet rises 6px and fades in from 98% (base), on the phone it
  // rises from the bottom edge (base) and drags down to close (CH-1611). Instant with reduced motion or Animations off.
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
          <Button variant="primary" busy={save.pending} feel={null} onClick={() => void submit()}>
            {save.pending ? <span data-ch-code="CH-5401">Adding…</span> : 'Propose focus area'}
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
