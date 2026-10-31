'use client';

import { ArrowRight, ArrowUpRight, ClipboardCheck, GitCompare, Radio, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { Section } from '../../ui/Section';
import { EmptyState, SkelRows, Skeleton } from '../../ui/States';
import { TrustChip } from '../../ui/TrustChip';
import { haptic } from '../../lib/haptics';
import { tabListKeys } from '../../lib/tabs';
import { useRefresh } from '../../lib/use-refresh';
import { deskRows, roundSets, type DeskRow, type HoleCardRow } from './desk-model';
import { EvidenceDrawer, type DeskEvidence } from './EvidenceDrawer';
import { countLabel, countsEachRound, formatToPar, holesLabel, playLabel, tourDayTime, tourRange } from './format';
import { HoleGrid } from './HoleGrid';
import { Review } from './Review';
import { TourChip, TourCrumb, TourFailed, TourHead, TourLoading, TourMain, TourPhoneTop, ToPar, tourGate, useTourPhone } from './parts';
import { useTourPaths, type ChTourPaths } from './paths';
import { WhoCounted } from './WhoCounted';
import { DeskTrackMenu } from './track-actions';
import type { ChTourDeskData, ChTourDeskSearch, ChTourDeskTab, ChTourEvent, ChTourFinding, ChTourPlayerRound, EventDeskProps } from './types';
import '../../styles/tournaments-desk.css';

const TITLE_ID = 'ch-tour-desk-title';
const TAB_LABEL: Record<ChTourDeskTab, string> = { overview: 'Overview', live: 'Live', counted: 'Who counted', holes: 'Holes', compare: 'Compare', review: 'Review' };

/**
 * The event desk (board `EventDesk`; phone `MEvent`): one event's head with its result, then Overview (who counted and
 * where the event turned), Who counted for one round or everyone, Holes, Compare and Review. The tab, the round and the
 * views are the URL's (`search`), kept in step as they change. Emphasis follows the week (`event.mood`): the one primary
 * action is the next thing to do (build the lineup, follow live, compare, open the review).
 */
export function EventDesk({ data, search, load, phone: forced }: EventDeskProps) {
  const phone = useTourPhone(forced);
  const e = data.event;
  return tourGate(load, {
    loading: () => <DeskLoading phone={phone} />,
    failed: () => <TourFailed view="desk" phone={phone} id={TITLE_ID} eyebrow={e.short} title={e.name} className="ch-tour-desk" />,
    ready: () => <DeskReady data={data} search={search} phone={phone} />,
  });
}

function DeskLoading({ phone }: { phone: boolean }) {
  return (
    <TourLoading view="desk" phone={phone} title="Event" className="ch-tour-desk">
      <Skeleton width={phone ? '70%' : 420} height={24} radius={12} />
      <Skeleton width="100%" height={40} radius={12} />
      <SkelRows rows={phone ? 5 : 7} trail />
    </TourLoading>
  );
}

/** The URL for a desk state: the tab through the paths, the rest as the desk's own query. */
function deskHref(paths: ChTourPaths, id: string, s: { tab: ChTourDeskTab; round: 'all' | number; view: 'team' | 'players'; holes: ChTourDeskSearch['holes'] }): string {
  const base = paths.desk(id, s.tab);
  const q = new URLSearchParams();
  if (s.round !== 'all') q.set('round', String(s.round));
  if (s.view !== 'team') q.set('view', s.view);
  if (s.holes !== 'to-par') q.set('holes', s.holes);
  const rest = q.toString();
  return rest ? `${base}${base.includes('?') ? '&' : '?'}${rest}` : base;
}

function DeskReady({ data, search, phone }: { data: ChTourDeskData; search: ChTourDeskSearch; phone: boolean }) {
  const paths = useTourPaths();
  const router = useRouter();
  const { refresh, refreshing } = useRefresh();
  const e = data.event;
  const live = e.status === 'live';
  const hasScores = e.playerRounds.length > 0;

  // The URL's state, kept here so a press answers at once; it follows the URL when the URL changes under it.
  const key = `${search.tab}|${search.round}|${search.view}|${search.holes}`;
  const [seen, setSeen] = useState(key);
  const [state, setState] = useState<{ tab: ChTourDeskTab; round: 'all' | number; view: 'team' | 'players'; holes: ChTourDeskSearch['holes'] }>({ tab: search.tab, round: search.round, view: search.view, holes: search.holes });
  if (seen !== key) {
    setSeen(key);
    setState({ tab: search.tab, round: search.round, view: search.view, holes: search.holes });
  }
  const tabs: ChTourDeskTab[] = ['overview', ...(live ? (['live'] as const) : []), 'counted', 'holes', 'compare', 'review'];
  const tab = tabs.includes(state.tab) ? state.tab : 'overview';
  const move = (next: Partial<typeof state>) => {
    const s = { ...state, ...next };
    setState(s);
    router.replace(deskHref(paths, e.id, s), { scroll: false });
  };
  const pickTab = (t: ChTourDeskTab) => {
    if (t !== tab) haptic('select');
    move({ tab: t });
  };

  const rows = useMemo(() => deskRows(e, data.players), [e, data.players]);
  const course = data.courses[e.courseIds[0] ?? ''];
  const [evidence, setEvidence] = useState<DeskEvidence | null>(null);
  const openScore = (row: DeskRow | null, pr: ChTourPlayerRound) => setEvidence(scoreEvidence(data, row, pr));
  const openHole = (r: HoleCardRow) => {
    const pr = e.playerRounds.find((p) => p.playerId === r.playerId && p.roundNumber === r.card.roundNumber);
    if (pr) openScore(rows.find((x) => x.entry.playerId === r.playerId) ?? null, pr);
  };
  const holesRound = state.round === 'all' ? (e.rounds[0]?.number ?? 1) : state.round;
  const open = (t: ChTourDeskTab, round: number | null) => {
    haptic('select');
    move({ tab: t, ...(round != null ? { round } : {}) });
  };

  const result = e.team.result;
  const mismatch = e.playerRounds.filter((p) => p.officialTotal != null && p.officialTotal !== p.total);
  const first = mismatch[0];
  const firstWho = first ? (data.players.find((p) => p.id === first.playerId)?.first ?? 'A player') : '';
  const covered = e.coverage.scorecards;
  const withShots = e.coverage.withShots;

  const primary = (() => {
    switch (e.mood) {
      case 'prep':
        return { label: e.lineup.status === 'none' ? 'Build lineup' : 'Edit lineup', icon: Users, href: paths.lineup(e.id) };
      case 'live':
        return { label: 'Follow live', icon: Radio, href: paths.live(e.id) };
      case 'review':
        return { label: 'Open review', icon: ClipboardCheck, onClick: () => pickTab('review') };
      default:
        return { label: 'Compare', icon: GitCompare, onClick: () => pickTab('compare') };
    }
  })();
  const actions = (
    <div className="ch-tour-desk-side">
      {result?.total != null && (
        <p className="ch-tour-desk-res" aria-label={`${e.short}: ${result.total}, ${formatToPar(result.toPar)}${e.finish ? `, ${e.finish.place} of ${e.finish.of} teams` : ''}`}>
          <b className="ch-num">{result.total}</b>
          <ToPar value={result.toPar} />
          {e.finish && (
            <em>
              {e.finish.place} of {e.finish.of} teams
            </em>
          )}
        </p>
      )}
      <div className="ch-tour-head__a">
        {e.resultsUrl && !phone && (
          <a className="ch-tour-desk-link" href={e.resultsUrl} target="_blank" rel="noopener noreferrer">
            <Icon icon={ArrowUpRight} size={15} />
            <span>Official results</span>
          </a>
        )}
        {e.status !== 'complete' && primary.href !== paths.lineup(e.id) && !phone && (
          <Button leftIcon={Users} href={paths.lineup(e.id)}>
            Manage lineup
          </Button>
        )}
        {/* P-5 4.11.5: Cancel or Restore tournament, and Stop tracking. */}
        <DeskTrackMenu tournamentId={e.id} name={e.name} track={data.track} />
        {'href' in primary ? (
          <Button variant="primary" leftIcon={primary.icon} href={primary.href}>
            {primary.label}
          </Button>
        ) : (
          <Button variant="primary" leftIcon={primary.icon} onClick={primary.onClick}>
            {primary.label}
          </Button>
        )}
      </div>
    </div>
  );

  const meta = (
    <div className="ch-tour-desk-meta">
      <TourChip>
        {holesLabel(e)} · {playLabel(e.format)}
      </TourChip>
      {countsEachRound(e.format) && <TourChip>{countLabel(e.format)} each round</TourChip>}
      <TourChip tone={e.status === 'live' ? 'live' : e.status === 'complete' ? 'ok' : undefined} dot={e.status !== 'upcoming'}>
        {e.status === 'complete' ? 'Completed' : e.status === 'live' ? 'Live' : 'Upcoming'}
      </TourChip>
      {e.trust !== 'upcoming' && e.status !== 'live' && <TrustChip state={e.trust} />}
      {covered > 0 && (
        <TourChip tone={withShots < covered ? 'warn' : undefined}>
          {covered} scorecards · {withShots} with shot data
        </TourChip>
      )}
    </div>
  );

  return (
    <TourMain view="desk" phone={phone} labelledBy={TITLE_ID} className="ch-tour-desk">
      <TourPhoneTop phone={phone} title={e.short} back={{ label: 'Tournaments', href: paths.home() }} />
      <TourHead
        id={TITLE_ID}
        phone={phone}
        // The phone bar carries Back (TourPhoneTop); a second crumb under it said the same thing twice.
        crumb={phone ? undefined : <TourCrumb href={paths.home()} />}
        eyebrow={`${tourRange(e.startDate, e.endDate)}${phone ? '' : `, ${e.startDate.slice(0, 4)}`}${course ? ` · ${course.name}` : ''}${course && !phone ? ` · ${course.tees}` : ''}`}
        title={e.name}
        meta={meta}
        actions={actions}
        tight
      />

      {first && (
        <div className="ch-tour-desk-warn" role="status" data-ch-code="CH-16920">
          <p className="ch-tour-desk-warn__t">Results are provisional</p>
          <p>
            The imported leaderboard has {firstWho} at {first.officialTotal} in round {first.roundNumber}. The scorecard says {first.total}.
            {mismatch.length > 1 ? ` ${mismatch.length - 1} more differ.` : ''} Team totals use the scorecard until you confirm which is right.
          </p>
        </div>
      )}
      {data.errors.field && (
        <InlineNotice code="CH-16221" title="The field didn’t load" body="Where the team finished needs the field, so it is left out for now. Scores are unaffected. Try again." onRetry={refresh} retrying={refreshing} />
      )}

      <DeskTabs tabs={tabs} tab={tab} onPick={pickTab} reviewCount={data.review?.layers.length ?? 0} />

      <div role="tabpanel" id={`ch-tour-desk-panel-${tab}`} aria-labelledby={`ch-tour-desk-tab-${tab}`} className="ch-tour-desk-panel">
        {tab === 'overview' && (
          <>
            <Section id="ch-tour-desk-who" title="Who counted" meta={hasScores ? `Lowest ${e.format.counting} whole-round scores each round make the team total` : undefined}>
              {data.errors.rounds ? <RoundsFailed onRetry={refresh} retrying={refreshing} /> : hasScores ? <WhoCounted event={e} rows={rows} round="all" view="team" phone={phone} onOpen={openScore} /> : <NoScores event={e} />}
            </Section>
            {data.findings.length > 0 && (
              <Section id="ch-tour-desk-find" title="Where the event turned" meta="Each finding opens its rounds">
                <div className="ch-tour-desk-find">
                  {data.findings.map((f) => (
                    <FindingCard key={f.id} finding={f} onOpen={open} onEvidence={(ref) => setEvidence({ ref, card: null })} />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
        {tab === 'live' && (
          <Section id="ch-tour-desk-live" title="Live" meta="Scores as they are posted">
            <p className="ch-tour-desk-line">A round is on the course. Scores post here as they come in; the live view follows every group.</p>
            <Button variant="secondary" leftIcon={Radio} href={paths.live(e.id)}>
              Follow live
            </Button>
          </Section>
        )}
        {tab === 'counted' && (
          <Section id="ch-tour-desk-counted" title="Who counted" meta={hasScores ? `Lowest ${e.format.counting} whole-round scores each round make the team total` : undefined}>
            {data.errors.rounds ? (
              <RoundsFailed onRetry={refresh} retrying={refreshing} />
            ) : hasScores ? (
              <>
                <CountedTools event={e} round={state.round} view={state.view} phone={phone} onRound={(r) => move({ round: r })} onView={(v) => move({ view: v })} />
                <WhoCounted event={e} rows={rows} round={state.round} view={state.view} phone={phone} onOpen={openScore} />
              </>
            ) : (
              <NoScores event={e} />
            )}
          </Section>
        )}
        {tab === 'holes' && (
          <Section id="ch-tour-desk-holes" title="Hole analysis" meta={course ? `${course.name} · ${course.tees} · tap a hole for the scorecard` : undefined}>
            <HoleGrid
              event={e}
              players={data.players}
              ledger={data.holes}
              failed={!!data.errors.holes}
              round={holesRound}
              onRound={(n) => move({ round: n })}
              mode={state.holes}
              onMode={(m) => move({ holes: m })}
              phone={phone}
              onOpen={openHole}
              onRetry={refresh}
              retrying={refreshing}
            />
          </Section>
        )}
        {tab === 'compare' && (
          <Section id="ch-tour-desk-compare" title="Compare" meta="Players and rounds side by side, with coverage shown">
            <p className="ch-tour-desk-line">Open the comparison with {e.name} already set as one side{data.previous ? `, or against ${data.previous.name}` : ''}.</p>
            <div className="ch-tour-desk-links">
              <Button variant="secondary" leftIcon={GitCompare} href={paths.compare(e.id)}>
                Compare {e.short}
              </Button>
              {data.previous && (
                <Button leftIcon={ArrowRight} href={paths.desk(data.previous.eventId)}>
                  {data.previous.name}
                </Button>
              )}
            </div>
          </Section>
        )}
        {tab === 'review' && (
          <Review
            embedded
            phone={phone}
            data={{ now: data.now, event: e, players: data.players, review: data.review, findings: data.findings, errors: data.errors.review ? { review: true } : {} }}
          />
        )}
      </div>

      <EvidenceDrawer evidence={evidence} onClose={() => setEvidence(null)} />
    </TourMain>
  );
}

/** The tab strip (a scroller on the phone). Real tabs: each controls its panel, the arrows move between them. */
function DeskTabs({ tabs, tab, onPick, reviewCount }: { tabs: readonly ChTourDeskTab[]; tab: ChTourDeskTab; onPick: (t: ChTourDeskTab) => void; reviewCount: number }) {
  const keys = tabListKeys(tabs, tab, onPick, (t) => `ch-tour-desk-tab-${t}`);
  return (
    <div className="ch-hscroll ch-tour-desk-tabs" role="tablist" aria-label="Event sections">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          id={`ch-tour-desk-tab-${t}`}
          aria-selected={tab === t}
          aria-controls={`ch-tour-desk-panel-${t}`}
          tabIndex={tab === t ? 0 : -1}
          onClick={() => onPick(t)}
          onKeyDown={(ev: KeyboardEvent<HTMLElement>) => keys(ev)}
        >
          {TAB_LABEL[t]}
          {t === 'review' && reviewCount > 0 && (
            <span className="ch-tour-desk-tabs__n ch-num" aria-hidden="true">
              {reviewCount}
            </span>
          )}
          {tab === t && <span className="ch-tour-desk-tabs__bar" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

/** Who counted for one round or all, as the team or as a flat list of players. */
function CountedTools({ event, round, view, phone, onRound, onView }: { event: ChTourEvent; round: 'all' | number; view: 'team' | 'players'; phone: boolean; onRound: (r: 'all' | number) => void; onView: (v: 'team' | 'players') => void }) {
  return (
    <div className="ch-tour-desk-tools">
      <div className="ch-tour-desk-pills" role="group" aria-label="Round">
        {(['all', ...event.rounds.map((r) => r.number)] as const).map((r) => (
          <button key={r} type="button" className="ch-tour-desk-pill" aria-pressed={round === r} onClick={() => (haptic('select'), onRound(r))}>
            {r === 'all' ? 'All rounds' : phone ? `R${r}` : `Round ${r}`}
          </button>
        ))}
      </div>
      <div className="ch-tour-desk-pills" role="group" aria-label="Show">
        {(['team', 'players'] as const).map((v) => (
          <button key={v} type="button" className="ch-tour-desk-pill" aria-pressed={view === v} onClick={() => (haptic('select'), onView(v))}>
            {v === 'team' ? 'Team' : 'Players'}
          </button>
        ))}
      </div>
    </div>
  );
}

function RoundsFailed({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return <InlineNotice code="CH-16222" title="The rounds didn’t load" body="Scores are saved; they just can’t be shown right now. Try again." onRetry={onRetry} retrying={retrying} />;
}

/** Nothing scored yet: the empty line, and where the event stands. */
function NoScores({ event: e }: { event: ChTourEvent }) {
  const l = e.lineup;
  const state =
    l.status === 'none'
      ? 'No lineup yet.'
      : l.status === 'draft'
        ? `Draft lineup · ${l.set} of ${l.of} set${l.locksAt ? ` · locks ${tourDayTime(l.locksAt)}` : ''}.`
        : l.status === 'locked'
          ? 'The lineup is locked.'
          : `Lineup ${l.status}${l.seen ? ` · seen by ${l.seen.by} of ${l.seen.of}` : ''}.`;
  return <EmptyState compact kind="first-run" code="CH-16320" title="No scores yet" body={`Scores show here as rounds are entered. ${state}${e.note ? ` ${e.note}.` : ''}`} />;
}

/** A finding (board `tr-find__c`): a chip, the finding, what it rests on, and where to see it. */
function FindingCard({ finding: f, onOpen, onEvidence }: { finding: ChTourFinding; onOpen: (t: ChTourDeskTab, round: number | null) => void; onEvidence: (ref: NonNullable<ChTourFinding['evidence']>) => void }) {
  return (
    <article className="ch-tour-desk-fc">
      <TourChip tone={f.tone === 'gain' ? 'ok' : f.tone === 'loss' ? 'warn' : undefined}>{f.chip}</TourChip>
      <h3>{f.title}</h3>
      <p>{f.body}</p>
      <div className="ch-tour-desk-fc__a">
        <button type="button" className="ch-tour-desk-link" onClick={() => onOpen(f.link.tab, f.round)}>
          {f.link.label}
          <Icon icon={ArrowRight} size={14} />
        </button>
        {f.evidence && (
          <button type="button" className="ch-tour-desk-link" onClick={() => f.evidence && onEvidence(f.evidence)}>
            Show the rounds
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * What a score is made of: the formula in words, the lineup scores the round had and which made the team's count, and
 * the card when the round has holes. Read off the round's own sets (nothing here recounts a round).
 */
function scoreEvidence(data: ChTourDeskData, row: DeskRow | null, pr: ChTourPlayerRound): DeskEvidence {
  const e = data.event;
  const name = row?.player?.name ?? data.players.find((p) => p.id === pr.playerId)?.name ?? 'Player';
  const round = e.rounds.find((r) => r.number === pr.roundNumber);
  const date = round?.date ?? e.startDate;
  const individual = pr.role === 'individual';
  const sets = roundSets(e, pr.roundNumber);
  const lineup = e.playerRounds.filter((p) => p.roundNumber === pr.roundNumber && p.role !== 'individual').sort((a, b) => (a.total ?? 999) - (b.total ?? 999));
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Player';
  const course = data.courses[e.courseIds[0] ?? ''];
  const card = data.holes?.cards.find((c) => c.playerId === pr.playerId && c.roundNumber === pr.roundNumber);
  return {
    ref: {
      title: `${name} · round ${pr.roundNumber}`,
      figure: pr.total == null ? null : `${pr.total} (${formatToPar(pr.toPar)})`,
      formula: individual ? 'An individual entry is shown with the field and is never part of the team score.' : `The team’s round is the lowest ${e.format.counting} of ${e.format.players} whole-round scores.`,
      denominator: individual ? 'Not in the team score' : `${lineup.length} lineup scores in round ${pr.roundNumber}`,
      rounds: individual
        ? [{ key: `${pr.playerId}-${pr.roundNumber}`, label: name, date, value: pr.total == null ? null : String(pr.total), included: false, reason: 'individual' as const }]
        : lineup.map((p) => ({
            key: `${p.playerId}-${p.roundNumber}`,
            label: `${nameOf(p.playerId)}${sets.tied.includes(p.playerId) ? ' · tied at the line' : ''}`,
            date,
            value: p.total == null ? null : String(p.total),
            included: p.count === 'counted',
            reason: p.status === 'wd' ? ('wd' as const) : p.status === 'dq' ? ('dq' as const) : null,
          })),
    },
    card:
      card && pr.holesKnown
        ? { player: name, roundNumber: pr.roundNumber, courseLine: course ? `${course.name} · ${course.tees}` : '', holes: card.holes, startHole: card.startHole, shotData: pr.shotData }
        : null,
  };
}
