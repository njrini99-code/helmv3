'use client';

import Link from 'next/link';
import { Suspense, use, useState } from 'react';
import { ArrowRight, Check, UserPlus, Users } from 'lucide-react';
import { firstName, playersLine, pulseGapsLabel, withoutSignalsLine, withoutSignalsRuns, type ChCoachHelmData, type ChCoachPlayer, type ChPulse, type ChPulseResult } from '../../data/coachhelm-shape';
import { coachPlayerHref } from '../../data/coachhelm-views-shape';
import { haptic } from '../../lib/haptics';
import { useChSessionState } from '../../lib/session-state';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { rebuiltHref } from '../../shell/nav';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { Section } from '../../ui/Section';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { EmptyState, Skeleton } from '../../ui/States';
import { COACHHELM_HREF, CoachHelmTabs, type CoachHelmView } from './chat/SubTabs';
import { BoardPartial, FocusActions, FocusCard, Head, PulseList, useFocusActions } from './parts';
import { TeamPatterns } from './TeamPatterns';
import { ClearedLines } from './EngineState';
import { useHydrated } from './use-hydrated';
import { useViewSwitch } from './use-view-switch';
import { CoursePlan } from './CoursePlan';
import { LIVE_COACHHELM_WRITES, LIVE_COURSE_PLAN_READS, type ChCoachHelmWrites, type ChCoursePlanReads } from './writes';
import { SideScroll } from '../../ui/SideScroll';

/** Where each control goes. A target that isn't rebuilt yet isn't drawn (nav.rebuiltHref), never a dead button. */
export const coachBoardLinks = {
  roster: () => rebuiltHref('/golf/dashboard/roster', 'coach'),
  /** Roster with its invite sheet open (Roster reads `?invite=1` once), as Home's Invite players. */
  invite: () => rebuiltHref('/golf/dashboard/roster?invite=1', 'coach'),
  settings: () => rebuiltHref('/golf/dashboard/settings/coaching-intelligence', 'coach'),
};

/**
 * CoachHelm for the coach (P013; design/handoff/Coach - CoachHelm.html,
 * helm3.jsx `CoachHelm`; spec docs/clubhouse/phone/coachhelm.md): the program
 * pulse, the team's players with their top signal, and the chosen player's
 * focus with Assign as focus and Dismiss (Undo brings it back). Only the team's
 * own players are read (data/coachhelm.ts). Share with the player has no action
 * behind it (players already see their own insights), so it is not drawn.
 */
/** `trackRecordHref`: the Track record's address, handed over only with `coachhelm_track_record_v1` on (the route checks it); without it no link is drawn. */
export function CoachBoard({ data, writes = LIVE_COACHHELM_WRITES, coursePlanReads = LIVE_COURSE_PLAN_READS, initialPlayer, trackRecordHref }: { data: ChCoachHelmData; writes?: ChCoachHelmWrites; coursePlanReads?: ChCoursePlanReads; initialPlayer?: string; trackRecordHref?: string }) {
  const phone = useChPhone();
  const players = data.players.list;
  // Roster's View insights opens on its player (`?player=`, which is only ever read: nothing here writes the address); a player with no
  // insight on the board opens the most pressing one. What the coach picks is kept for this tab with the shell's session state, so a way
  // back to the board (Back, another tab and back) returns to it (owner rule 8). A player the address names wins over a kept pick, as a
  // link must, and is read from the props every render: a first load that failed or came back empty, then answered by Try again, still
  // opens on them. The name is kept with the id so that a refresh that takes the player off the board is said, not answered with another
  // player's card in silence.
  const hydrated = useHydrated();
  const [stored, setKept] = useChSessionState<{ id: string; name: string } | null>('coachhelm.board.player', null);
  const kept = hydrated ? stored : null;
  const [byHand, setByHand] = useState(false);
  // A new `?player=` handed down by the server (a link to this page for another player) is a new opening, not a prop copied once.
  const [seenInitial, setSeenInitial] = useState(initialPlayer);
  if (initialPlayer !== seenInitial) {
    setSeenInitial(initialPlayer);
    setByHand(false);
  }
  const named = byHand ? undefined : players.find((p) => p.id === initialPlayer);
  const picked = named ? { id: named.id, name: named.name } : kept;
  // A switch to Ask moves the strip at once and dims the board (aria-busy) until Ask is ready.
  const sw = useViewSwitch<CoachHelmView>('board', (v) => COACHHELM_HREF[v], Object.keys(COACHHELM_HREF) as CoachHelmView[]);
  // Assign as focus, Dismiss and Undo, and what this visit changed: the same wiring as a coach's Deep dive of one player (parts.tsx).
  const fa = useFocusActions(writes);
  const dismissed = fa.dismissed;

  // A player's open signals: their count, less the top insight when it was dismissed here, and only when that top insight was one of them.
  const open = players.map((p) => Math.max(0, p.count - (dismissed[p.top.id] && countsAsSignal(p) ? 1 : 0)));
  // The headline counts players, never the rows behind them: the board draws one card per player, so a count of signals is a count of cards it does not draw.
  const playersOpen = open.filter((n) => n > 0).length;
  const cur = players.find((p) => p.id === picked?.id) ?? players[0] ?? null;
  // The player the coach had open is no longer on the board (a refresh took their signal away): the card is another player's, and says so.
  const gone = picked && cur && picked.id !== cur.id ? picked : null;
  // Assigned: from this visit, or a focus area the page found already made from the insight.
  const mine = cur ? (fa.assigned[cur.top.id] ?? cur.top.assigned) : null;
  const rosterHref = coachBoardLinks.roster();
  const inviteHref = coachBoardLinks.invite();

  const body = data.off ? (
    <EmptyState
      size="page"
      code="CH-13305"
      {...(data.off.by === 'global' ? { kind: 'restricted' as const } : { shape: 'rows' as const })}
      title="CoachHelm is off"
      body={
        data.off.by === 'global'
          ? 'CoachHelm is turned off for GolfHelm right now, so no insights are being shown.'
          : `${data.off.by === 'team' ? 'Your team has' : 'You have'} turned CoachHelm off${data.off.reason ? `: “${data.off.reason}”` : ''}. Turn it back on in Settings to see signals again.`
      }
      action={
        data.off.by !== 'global' && coachBoardLinks.settings() ? (
          <Button variant="primary" href={coachBoardLinks.settings()!}>
            Open CoachHelm settings
          </Button>
        ) : undefined
      }
    />
  ) : !data.roster.error && data.roster.count === 0 ? (
    <EmptyState
      size="page"
      code="CH-13307"
      shape="people"
      title="Add players to start CoachHelm"
      body="Invite your players. Each one’s insights show up here once they post rounds."
      action={
        inviteHref ? (
          <Button variant="primary" leftIcon={UserPlus} href={inviteHref}>
            Invite players
          </Button>
        ) : undefined
      }
    />
  ) : (
    <>
      <SectionBoundary surface="coachhelm.pulse" label="The program pulse" code="CH-13204">
        <section className="ch-hl-pulse" aria-labelledby="ch-hl-pulse-h">
          <h2 id="ch-hl-pulse-h">Program pulse</h2>
          {/* The pulse is the longest read on the page and nothing else uses it, so the board does not wait for it (CH-13405): its card
              holds its place at a reserved height, and the rows land in it. */}
          <div className="ch-hl-pulse__slot">{isPulseLater(data.pulse) ? <Suspense fallback={<PulseSkeleton />}><PulseFromRead read={data.pulse} /></Suspense> : <PulseBody pulse={data.pulse} />}</div>
        </section>
      </SectionBoundary>

      {/* Slice 7b (coachhelm_team_pattern_v1, off): the loader hands rows only with the flag on. */}
      {data.teamPatterns && (
        <SectionBoundary surface="coachhelm.patterns" label="Team patterns" code="CH-13204">
          <TeamPatterns data={data.teamPatterns} />
        </SectionBoundary>
      )}

      {data.roster.error || data.players.error ? (
        <RefreshNotice code="CH-13202" title="Your players’ insights didn’t load" body="Nothing is lost. Every insight is still saved; try again in a moment." />
      ) : !cur ? (
        // The pulse is on the page, so this is the players' section with nothing in it yet, not an empty page: its line
        // and View roster sit right under the heading, in view on the desktop and the phone (states audit, 2026-10-08).
        <Section id="ch-hl-none" title="Your players">
          <EmptyState
            code="CH-13306"
            shape="people"
            shapeCount={3}
            title="No signals yet"
            body="CoachHelm reads posted rounds. Each player’s insights appear once they’ve posted enough rounds to find a pattern."
            action={
              rosterHref ? (
                <Button variant="primary" leftIcon={Users} href={rosterHref}>
                  View roster
                </Button>
              ) : undefined
            }
          />
        </Section>
      ) : (
        <>
          {data.missing && <BoardPartial missing={data.missing} what="board" focus={false} />}
          <div className="ch-hl-cgrid">
            <SectionBoundary surface="coachhelm.players" label="Your players" code="CH-13204">
              <SideScroll as="section" className="ch-hl-plist" aria-labelledby="ch-hl-plist-h">
                <h2 id="ch-hl-plist-h">By player</h2>
                {players.map((p, i) => {
                  const on = p.id === cur.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={'ch-hl-pl' + (on ? ' is-on' : '')}
                      aria-pressed={on}
                      onClick={() => {
                        haptic('select');
                        setKept({ id: p.id, name: p.name });
                        setByHand(true);
                      }}
                    >
                      <Avatar name={p.name} size={phone ? 28 : 34} />
                      <span>
                        <b>{p.name}</b>
                        <em>{dismissed[p.top.id] ? 'Dismissed' : p.top.title}</em>
                      </span>
                      {/* No open signal draws no count: a "0" beside a signal line read as a contradiction (P013 D12). */}
                      {open[i] ? <span className="ch-hl-pl__c ch-num">{open[i]}</span> : null}
                    </button>
                  );
                })}
              </SideScroll>
            </SectionBoundary>
            {/* CH-13805: the focus is a polite live region, so choosing another player is announced. */}
            <div className="ch-hl-cmain" aria-live="polite">
              <SectionBoundary surface="coachhelm.focus" label="This player’s focus" code="CH-13204">
                {gone && (
                  <p className="ch-hl-note" role="status" data-ch-code="CH-13908">
                    {firstName(gone.name)} is no longer on the board, so this is {firstName(cur.name)}’s card.
                  </p>
                )}
                {!dismissed[cur.top.id] && <FocusCard key={cur.top.id} ins={cur.top} who={firstName(cur.name)} assigned={mine} />}
                <FocusActions
                  fa={fa}
                  target={{ playerId: cur.id, first: firstName(cur.name), ins: cur.top }}
                  missing={data.missing}
                  where="board"
                  extra={
                    // Spec A: every read on this player, with its evidence, in the coach's Deep dive of them.
                    <Button variant="ghost" rightIcon={ArrowRight} href={coachPlayerHref('deep-dive', cur.id)} feel="select">
                      All of {firstName(cur.name)}’s reads
                    </Button>
                  }
                />
                {!dismissed[cur.top.id] && <ClearedLines lines={cur.cleared} />}
              </SectionBoundary>
              {/* Slice 7c: the course plan, on request, behind coachhelm_course_plan_v1 (off); the loader sets coursePlan only when it is on. */}
              {data.coursePlan && (
                <SectionBoundary surface="coachhelm.course-plan" label="Course plan" code="CH-13204">
                  <CoursePlan key={cur.id} playerId={cur.id} who={firstName(cur.name)} reads={coursePlanReads} />
                </SectionBoundary>
              )}
            </div>
          </div>
          {data.withoutSignals > 0 && (
            <p className="ch-hl-note" data-ch-code="CH-13310">
              <WithoutSignals count={data.withoutSignals} names={data.withoutNames} ids={data.withoutIds} />
            </p>
          )}
        </>
      )}
    </>
  );

  // With CoachHelm off (CH-13305), Ask is off too, so the strip that leads there is not drawn.
  const tabs = data.off ? null : <CoachHelmTabs active={sw.shown} onGo={sw.go} />;
  return (
    <main className={'ch-hl' + (phone ? ' is-phone' : '')} aria-labelledby="ch-hl-title" aria-busy={sw.pending || undefined} data-canopy={phone ? undefined : ''}>
      {phone && <PhoneTop start title="CoachHelm" />}
      {phone && tabs}
      <Head who="Coach" phone={phone} aside={!phone ? tabs : undefined}>
        {players.length > 0 && !data.off ? playersLine(playersOpen) : 'CoachHelm reads the rounds your players post.'}
      </Head>
      {body}
      {trackRecordHref && !data.off && (
        <p className="ch-htr-link" data-ch-code="CH-13969">
          <Button variant="secondary" href={trackRecordHref}>
            Track record
          </Button>
        </p>
      )}
    </main>
  );
}

const isPulseLater = (p: ChCoachHelmData['pulse']): p is Promise<ChPulseResult> => typeof (p as { then?: unknown }).then === 'function';

/** A pulse that could not be read is the pulse not loading, as a result that says so (the loader's read never rejects). */
const PULSE_NOT_LOADED: ChPulse = { rows: [], error: true };

/** The pulse's rows, or what stands in for them: its own notice when it did not load, or when a read it is made from failed (never "nothing is flagged"). */
function PulseBody({ pulse }: { pulse: ChPulse }) {
  const gaps = pulse.missing && pulse.missing.length > 0 ? pulseGapsLabel(pulse.missing) : null;
  if (pulse.error) return <RefreshNotice code="CH-13203" title="The program pulse didn’t load" body="Your players’ insights below are not affected. Try again in a moment." />;
  if (pulse.rows.length === 0 && !gaps) {
    return (
      <p className="ch-hl-pulse__none" data-ch-code="CH-13309">
        Nothing is flagged in the pulse right now.
      </p>
    );
  }
  return (
    <>
      {pulse.rows.length > 0 && <PulseList rows={pulse.rows} />}
      {/* Every read came in (no gaps), so what is not listed was checked and is clear: say so in the card's held space
          instead of leaving it empty. Up to four items, the two rows the desktop's reserve leaves room under. */}
      {!gaps && pulse.rows.length > 0 && pulse.rows.length <= 4 && (
        <p className="ch-hl-pulse__clear">
          <Icon icon={Check} size={13} />
          Nothing else is flagged across the program.
        </p>
      )}
      {/* CH-13206: a read the pulse is made from failed, so what is not listed was not checked: never "nothing is flagged". */}
      {gaps && pulse.missing && (
        <RefreshNotice
          code="CH-13206"
          title={pulse.rows.length === 0 ? 'The program pulse didn’t fully load' : 'The program pulse may be incomplete'}
          body={`${gaps} didn’t load, so anything made from ${pulse.missing.length === 1 ? 'it' : 'them'} is missing here and was not checked. What is listed was found. Try again in a moment.`}
        />
      )}
    </>
  );
}

/** The pulse read the loader handed over still on its way; this suspends until it lands, inside the card's own Suspense. */
function PulseFromRead({ read }: { read: Promise<ChPulseResult> }) {
  const res = use(read);
  return <PulseBody pulse={res.status === 'ok' ? res.pulse : PULSE_NOT_LOADED} />;
}

/** CH-13405: the pulse's rows on their way, in the card's reserved place (the slot holds its height whether the rows are here or not). */
function PulseSkeleton() {
  return (
    <div className="ch-hl-pulse__sk" aria-busy="true" aria-label="Loading the program pulse" data-ch-code="CH-13405">
      {[0, 1, 2].map((i) => (
        <div key={i} className="ch-hl-pulse__skrow">
          <Skeleton width={30} height={30} radius={10} />
          <span>
            <Skeleton width="58%" height={12} />
            <Skeleton width="82%" height={10} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** The top card is a signal the count includes: a finding whose read is current. */
const countsAsSignal = (p: ChCoachPlayer) => p.top.kind === 'finding' && !p.top.stale;

/** CH-13310 with each named player a link to their Standing (spec A), when the ids came with the names; the same words either way. */
function WithoutSignals({ count, names = [], ids }: { count: number; names?: string[]; ids?: string[] }) {
  if (!ids || ids.length !== names.length) return <>{withoutSignalsLine(count, names)}</>;
  return (
    <>
      {withoutSignalsRuns(count, names).map((r, i) =>
        typeof r === 'number' ? (
          <Link key={i} className="ch-hl-note__a" href={coachPlayerHref('standing', ids[r]!)} onClick={() => haptic('select')}>
            {names[r]}
          </Link>
        ) : (
          r
        ),
      )}
    </>
  );
}
