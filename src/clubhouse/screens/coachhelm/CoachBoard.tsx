'use client';

import Link from 'next/link';
import { Suspense, use, useId, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, UserPlus, Users } from 'lucide-react';
import type { ChNotEnough } from '../../data/coachhelm-firm';
import { firstName, playersLine, pulseGapsLabel, type ChCoachHelmData, type ChCoachPlayer, type ChPulse, type ChPulseResult } from '../../data/coachhelm-shape';
import { coachPlayerHref } from '../../data/coachhelm-views-shape';
import { haptic } from '../../lib/haptics';
import { useRefresh } from '../../lib/use-refresh';
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
import { BoardPartial, FocusActions, FocusCard, Head, useFocusActions } from './parts';
import { TeamPatterns } from './TeamPatterns';
import { ClearedLines } from './EngineState';
import { useHydrated } from './use-hydrated';
import { useViewSwitch } from './use-view-switch';
import { CoursePlan } from './CoursePlan';
import { LIVE_COACHHELM_WRITES, LIVE_COURSE_PLAN_READS, LIVE_RECHECK_WRITES, type ChCoachHelmWrites, type ChCoursePlanReads, type ChRecheckWrites } from './writes';
import { RecheckReads } from './Recheck';
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
 * helm3.jsx `CoachHelm`; spec docs/clubhouse/phone/coachhelm.md; the design
 * call's D2 and D4): the header sentence with the program pulse folded into one
 * "Since you were last here" line, then the decision: the team's players with
 * their top read (and a row for each player with no read yet), and the chosen
 * player's card with its path line, Assign as focus and Dismiss (Undo brings it
 * back). Team patterns sit flush under it. Only the team's
 * own players are read (data/coachhelm.ts). Share with the player has no action
 * behind it (players already see their own insights), so it is not drawn.
 */
/**
 * `trackRecordHref`: the Track record's address, handed over only with `coachhelm_track_record_v1` on (the route checks it); without it no link is drawn.
 * `briefHref`: the Brief's (the team view behind /intelligence, which holds the Monday brief), likewise with `coachhelm_monday_brief_v1` on.
 * `recheck`: Re-check reads (CH-13944), the team re-run; preview and tests pass their own.
 */
export function CoachBoard({
  data,
  writes = LIVE_COACHHELM_WRITES,
  coursePlanReads = LIVE_COURSE_PLAN_READS,
  initialPlayer,
  trackRecordHref,
  briefHref,
  recheck = LIVE_RECHECK_WRITES,
}: {
  data: ChCoachHelmData;
  writes?: ChCoachHelmWrites;
  coursePlanReads?: ChCoursePlanReads;
  initialPlayer?: string;
  trackRecordHref?: string;
  briefHref?: string;
  recheck?: ChRecheckWrites;
}) {
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
  const noReads = noReadRows(data.withoutSignals, data.withoutNames, data.withoutIds);
  // CH-13943: a player every one of whose reads is Not enough yet has no card; they are a By player row that says so.
  const heldOnly = data.notEnough?.players.filter((p) => !p.card) ?? [];
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
      {data.roster.error || data.players.error ? (
        <RefreshNotice code="CH-13202" title="Your players’ insights didn’t load" body="Nothing is lost. Every insight is still saved; try again in a moment." />
      ) : !cur ? (
        // The header is on the page, so this is the players' section with nothing in it yet, not an empty page: its line
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
          {data.notEnough && <NotEnoughLine data={data.notEnough} />}
        </Section>
      ) : (
        <>
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
                {/* CH-13310: a player with no read yet is a row in the list, not a footer under the card (design call §1, "What to cut"). */}
                {noReads.map((r) => (
                  <div key={r.key} className="ch-hl-pl is-none" data-ch-code="CH-13310">
                    {r.name ? <Avatar name={r.name} size={phone ? 28 : 34} /> : <span className="ch-hl-pl__more ch-num" aria-hidden="true">+{r.more}</span>}
                    <span>
                      <b>
                        {r.name && r.id ? (
                          <Link className="ch-hl-note__a" href={coachPlayerHref('standing', r.id)}>
                            {r.name}
                          </Link>
                        ) : (
                          (r.name ?? `${r.more} more ${r.more === 1 ? 'player' : 'players'}`)
                        )}
                      </b>
                      <em>No reads yet</em>
                    </span>
                  </div>
                ))}
                {heldOnly.map((p) => (
                  <div key={p.id} className="ch-hl-pl is-none" data-ch-code="CH-13943">
                    <Avatar name={p.name} size={phone ? 28 : 34} />
                    <span>
                      <b>{p.name}</b>
                      <em>Not enough yet</em>
                    </span>
                  </div>
                ))}
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
          {/* Round 2C (coachhelm_support_v1): reads rated Not enough yet are not cards; they are one collapsed line under the board. */}
          {data.notEnough && <NotEnoughLine data={data.notEnough} />}
          {/* What failed beside the cards is one line under the list, not a banner over it (design call §3, States: Partial). */}
          {data.missing && <BoardPartial missing={data.missing} what="board" focus={false} />}
          {/* Slice 7b (coachhelm_team_pattern_v1, off): the loader hands rows only with the flag on. Flush under the Board (D5). */}
          {data.teamPatterns && (
            <SectionBoundary surface="coachhelm.patterns" label="Team patterns" code="CH-13204">
              <TeamPatterns data={data.teamPatterns} />
            </SectionBoundary>
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
      <Head
        who="Coach"
        phone={phone}
        aside={!phone ? tabs : undefined}
        below={data.off || (!data.roster.error && data.roster.count === 0) ? undefined : (
          // D4: the program pulse is one collapsed line in the header, never a block that comes before the decision.
          <SectionBoundary surface="coachhelm.pulse" label="Since you were last here" code="CH-13204">
            {isPulseLater(data.pulse) ? (
              <Suspense fallback={<SinceSkeleton />}>
                <SinceFromRead read={data.pulse} />
              </Suspense>
            ) : (
              <SinceLine pulse={data.pulse} />
            )}
          </SectionBoundary>
        )}
      >
        {players.length > 0 && !data.off ? playersLine(playersOpen) : 'CoachHelm reads the rounds your players post.'}
      </Head>
      {body}
      {briefHref && !data.off && (
        <p className="ch-hmb-link" data-ch-code="CH-13938">
          <Button variant="secondary" href={briefHref}>
            Brief
          </Button>
        </p>
      )}
      {/* CH-13944: the team re-run, a quiet secondary action under the board. Not with CoachHelm off or with no players to read. */}
      {!data.off && (data.roster.error || data.roster.count > 0) && <RecheckReads players={data.roster.error ? null : data.roster.count} writes={recheck} />}
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

/**
 * "Since you were last here" (D4): the program pulse as one collapsed line in the header, up to three items when opened, flush,
 * no glyphs. Each state is a line, never a block: not loaded (CH-13203), nothing new (CH-13309), and, when a read it is made from
 * failed, what was not checked (CH-13206), so a gap is never read as "nothing is flagged". The tap is silent, as the card's other
 * disclosures are (D-70).
 */
function SinceLine({ pulse }: { pulse: ChPulse }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const gaps = pulse.missing && pulse.missing.length > 0 ? pulseGapsLabel(pulse.missing) : null;
  if (pulse.error) return <SinceFailed />;
  const n = pulse.rows.length;
  if (n === 0 && !gaps) {
    return (
      <div className="ch-hl-since is-quiet" data-ch-code="CH-13309">
        Nothing new since you were last here.
      </div>
    );
  }
  // A read it is made from failed and nothing was found: said in the open, never behind the tap (CH-13206).
  if (n === 0 && gaps && pulse.missing) {
    return (
      <div className="ch-hl-since is-quiet" role="status" data-ch-code="CH-13206">
        Since you were last here: {gaps.charAt(0).toLowerCase() + gaps.slice(1)} didn’t load, so what is new was not checked.
      </div>
    );
  }
  return (
    <div className="ch-hl-since" data-ch-code="CH-13941">
      <button type="button" className="ch-hl-since__b" aria-expanded={open} aria-controls={`${id}-since`} onClick={() => setOpen((v) => !v)}>
        <span>Since you were last here</span>
        <span className="ch-num">{gaps ? `${n} · may be incomplete` : n}</span>
        <Icon icon={open ? ChevronUp : ChevronDown} size={15} />
      </button>
      <div id={`${id}-since`} hidden={!open}>
        <ul className="ch-hl-since__l">
          {pulse.rows.map((r) => (
            <li key={r.id} className={'is-' + r.tone}>
              <b>{r.headline}</b> <span>{r.evidence}</span>
            </li>
          ))}
        </ul>
        {gaps && pulse.missing && (
          <div className="ch-hl-since__gap" data-ch-code="CH-13206">
            {gaps} didn’t load, so anything made from {pulse.missing.length === 1 ? 'it' : 'them'} is missing here and was not checked.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * CH-13942: the reads the support pass rated Not enough yet, as one collapsed line under the board ("Not enough yet (5)"), which
 * opens in place to each read: the player, its title and what it is waiting for. Flush rows, no glyphs; the tap is silent, as the
 * header's line is (D-70). Drawn only with `coachhelm_support_v1` on and at least one read held back.
 */
function NotEnoughLine({ data }: { data: ChNotEnough }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="ch-hl-ney" data-ch-code="CH-13942">
      <button type="button" className="ch-hl-ney__b" aria-expanded={open} aria-controls={`${id}-ney`} onClick={() => setOpen((v) => !v)}>
        <span>
          Not enough yet <span className="ch-num">({data.count})</span>
        </span>
        <Icon icon={open ? ChevronUp : ChevronDown} size={15} />
      </button>
      <div id={`${id}-ney`} hidden={!open}>
        <p className="ch-hl-ney__m">Not on a card until there is enough to say something.</p>
        <ul className="ch-hl-ney__l">
          {data.players.flatMap((p) =>
            p.reads.map((r) => (
              <li key={r.id}>
                <b>{p.name}</b> · <span>{r.title}</span>
                {r.watching && <span className="ch-hl-ney__w ch-num">{r.watching}</span>}
              </li>
            )),
          )}
        </ul>
      </div>
    </div>
  );
}

/** CH-13203: the line did not load, said as a line with its own Try again (`useRefresh`, as every notice's retry). */
function SinceFailed() {
  const { refresh, refreshing } = useRefresh();
  return (
    <div className="ch-hl-since is-quiet" role="status" data-ch-code="CH-13203">
      What’s new since you were last here didn’t load. Your players’ reads below are not affected.{' '}
      <button type="button" className="ch-hl-since__retry" onClick={refresh} disabled={refreshing}>
        {refreshing ? 'Trying again…' : 'Try again'}
      </button>
    </div>
  );
}

/** The pulse read the loader handed over still on its way; this suspends until it lands, inside the line's own Suspense. */
function SinceFromRead({ read }: { read: Promise<ChPulseResult> }) {
  const res = use(read);
  return <SinceLine pulse={res.status === 'ok' ? res.pulse : PULSE_NOT_LOADED} />;
}

/** CH-13405: the line on its way, at the line's own height, so the header does not move when it lands. */
function SinceSkeleton() {
  return (
    <div role="status" className="ch-hl-since is-loading" aria-busy="true" aria-label="Loading what’s new since you were last here" data-ch-code="CH-13405">
      <Skeleton width={196} height={13} />
    </div>
  );
}

/** Roster players with no read yet, as By player rows (each named one links to that player's Standing, spec A): each named one, then the unnamed as one "N more players" row. */
function noReadRows(count: number, names: readonly string[] = [], ids?: readonly string[]): Array<{ key: string; name: string | null; id: string | null; more: number }> {
  if (count <= 0) return [];
  const shown = names.slice(0, count);
  const more = count - shown.length;
  // The ids come beside the names, in the same order; without them (or out of step) a name is text, not a link.
  const linked = !!ids && ids.length === names.length;
  return [...shown.map((name, i) => ({ key: `n${i}:${name}`, name, id: linked ? ids![i]! : null, more: 0 })), ...(more > 0 ? [{ key: 'more', name: null, id: null, more }] : [])];
}

/** The top card is a signal the count includes: a finding whose read is current. */
const countsAsSignal = (p: ChCoachPlayer) => p.top.kind === 'finding' && !p.top.stale;
