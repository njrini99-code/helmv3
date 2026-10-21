'use client';

import { Suspense, use, useId, useState } from 'react';
import { Archive, Check, ChevronDown, ChevronUp, Flag, UserPlus, Users } from 'lucide-react';
import { ACTIVE_FOCUS_DUPLICATE_ERROR } from '@/lib/coachhelm/focus-areas/duplicate-guard';
import type { ChNotEnough } from '../../data/coachhelm-firm';
import { firstName, playersLine, pulseGapsLabel, type ChBoardMissing, type ChCoachHelmData, type ChCoachPlayer, type ChHelmAssigned, type ChPulse, type ChPulseResult } from '../../data/coachhelm-shape';
import { haptic } from '../../lib/haptics';
import { useRefresh } from '../../lib/use-refresh';
import { useChSessionState } from '../../lib/session-state';
import { normalise, useAction } from '../../lib/use-action';
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
import { useToast } from '../../ui/Toast';
import { COACHHELM_HREF, CoachHelmTabs, type CoachHelmView } from './chat/SubTabs';
import { BoardPartial, FocusCard, Head } from './parts';
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
 * helm3.jsx `CoachHelm`; spec docs/clubhouse/phone/coachhelm.md; the design
 * call's D2 and D4): the header sentence with the program pulse folded into one
 * "Since you were last here" line, then the decision: the team's players with
 * their top read (and a row for each player with no read yet), and the chosen
 * player's card with its path line, Assign as focus and Dismiss (Undo brings it
 * back). Team patterns sit flush under it. Only the team's
 * own players are read (data/coachhelm.ts). Share with the player has no action
 * behind it (players already see their own insights), so it is not drawn.
 */
/** `trackRecordHref`: the Track record's address, handed over only with `coachhelm_track_record_v1` on (the route checks it); without it no link is drawn. */
export function CoachBoard({ data, writes = LIVE_COACHHELM_WRITES, coursePlanReads = LIVE_COURSE_PLAN_READS, initialPlayer, trackRecordHref }: { data: ChCoachHelmData; writes?: ChCoachHelmWrites; coursePlanReads?: ChCoursePlanReads; initialPlayer?: string; trackRecordHref?: string }) {
  const phone = useChPhone();
  const toast = useToast();
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
  // Who a write is in flight for (set inside the action, so a toast's Retry sets it too): only that player's card says "Assigning",
  // "Dismissing" or "Undoing". The controls of every card wait meanwhile, because the one write in flight is the hook's.
  const [acting, setActing] = useState<{ playerId: string; kind: 'assign' | 'dismiss' | 'undo' } | null>(null);
  // What this visit changed, over what the page loaded: an insight assigned (by its id) or dismissed.
  const [assigned, setAssigned] = useState<Record<string, ChHelmAssigned>>({});
  const [dismissed, setDismissed] = useState<Record<string, true>>({});
  // A switch to Ask moves the strip at once and dims the board (aria-busy) until Ask is ready.
  const sw = useViewSwitch<CoachHelmView>('board', (v) => COACHHELM_HREF[v], Object.keys(COACHHELM_HREF) as CoachHelmView[]);

  // The follow-ups (marking assigned, hiding a dismissed card, restoring it) live inside the action, so a toast's Retry completes them too.
  // CH-13702: Assign is a primary Button, so its tap is the light press; the write's success and error haptics come from useAction.
  const assign = useAction(
    'coachhelm.assign',
    async (p: ChCoachPlayer) => {
      const t = p.top;
      setActing({ playerId: p.id, kind: 'assign' });
      try {
        // The focus area is the player's to read: it is saved with the insight's own wording, not the board's rewrite of it for the coach.
        const res = await writes.assign({ playerId: p.id, insightId: t.id, title: t.assignAs.title, description: t.assignAs.description, areaType: t.areaType, targetMetric: t.metric, currentValue: t.current });
        if (normalise(res).success) {
          setAssigned((m) => ({ ...m, [t.id]: 'proposed' }));
          return res;
        }
        // The player already has an active focus on this metric: that is the outcome the coach wanted, not a failure.
        if (res.error === ACTIVE_FOCUS_DUPLICATE_ERROR) {
          setAssigned((m) => ({ ...m, [t.id]: 'active' }));
          toast({ title: `${firstName(p.name)} already has a focus on this` });
          return { success: true };
        }
        return res;
      } finally {
        setActing(null);
      }
    },
    (p: ChCoachPlayer) => ({ done: '', failed: `Couldn’t assign the focus to ${firstName(p.name)}`, hint: 'Nothing was saved. Try again.', code: 'CH-13001' }),
  );
  const dismiss = useAction(
    'coachhelm.dismiss',
    async (p: ChCoachPlayer) => {
      setActing({ playerId: p.id, kind: 'dismiss' });
      try {
        const res = await writes.dismiss(p.top.id);
        if (normalise(res).success) setDismissed((d) => ({ ...d, [p.top.id]: true }));
        return res;
      } finally {
        setActing(null);
      }
    },
    { done: '', failed: 'Couldn’t dismiss the insight', hint: 'It’s still on the board. Try again.', code: 'CH-13002' },
  );
  const undo = useAction(
    'coachhelm.undo',
    async (p: ChCoachPlayer) => {
      setActing({ playerId: p.id, kind: 'undo' });
      try {
        const res = await writes.undo(p.top.id, p.top.lifecycle);
        if (normalise(res).success)
          setDismissed((d) => {
            const { [p.top.id]: _gone, ...rest } = d;
            return rest;
          });
        return res;
      } finally {
        setActing(null);
      }
    },
    { done: '', failed: 'Couldn’t undo the dismissal', hint: 'It’s still dismissed. Try again.', code: 'CH-13003' },
  );
  const busy = assign.pending || dismiss.pending || undo.pending;

  // A player's open signals: their count, less the top insight when it was dismissed here, and only when that top insight was one of them.
  const open = players.map((p) => Math.max(0, p.count - (dismissed[p.top.id] && countsAsSignal(p) ? 1 : 0)));
  // The headline counts players, never the rows behind them: the board draws one card per player, so a count of signals is a count of cards it does not draw.
  const playersOpen = open.filter((n) => n > 0).length;
  const cur = players.find((p) => p.id === picked?.id) ?? players[0] ?? null;
  // The player the coach had open is no longer on the board (a refresh took their signal away): the card is another player's, and says so.
  const gone = picked && cur && picked.id !== cur.id ? picked : null;
  // What is in flight is for this player's card only: another player's card shows its own button as it is, waiting.
  const here = (kind: 'assign' | 'dismiss' | 'undo') => acting?.kind === kind && acting.playerId === cur?.id;
  // Assigned: from this visit, or a focus area the page found already made from the insight.
  const mine = cur ? (assigned[cur.top.id] ?? cur.top.assigned) : null;
  // A card that states no finding is not assigned or dismissed, and a read older than the newest round is not assigned (it is still dismissed if the coach wants it gone).
  const note = cur?.top.kind === 'note';
  const stale = !!cur?.top.stale;
  // A read beside the cards that failed (CH-13207): whether this card was already assigned, was declined, or is still current is not
  // known, so Assign (and Propose again) are not offered. Dismiss does not depend on any of them and stays.
  const statusUnknown = !mine && !!(data.missing?.assigned || data.missing?.declined || data.missing?.newest);
  const noReads = noReadRows(data.withoutSignals, data.withoutNames);
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
                      <b>{r.name ?? `${r.more} more ${r.more === 1 ? 'player' : 'players'}`}</b>
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
                {dismissed[cur.top.id] ? (
                  <div className="ch-hl-dis" role="status" data-ch-code="CH-13901">
                    <Icon icon={Archive} size={16} />
                    <span>
                      <b>Insight dismissed.</b> It no longer shows on your board or on {firstName(cur.name)}’s. Undo brings it back.
                    </span>
                    <Button size="sm" variant="ghost" busy={here('undo')} disabled={busy && !here('undo')} onClick={() => void undo.run(cur)}>
                      {here('undo') ? <span data-ch-code="CH-13403">Undoing…</span> : 'Undo'}
                    </Button>
                  </div>
                ) : (
                  <>
                    <FocusCard key={cur.top.id} ins={cur.top} who={firstName(cur.name)} assigned={mine} />
                    {note ? (
                      // CH-13904: nothing to assign or dismiss on a card that states no finding.
                      <div className="ch-hl-cact">
                        <p className="ch-hl-cact__m" data-ch-code="CH-13904">
                          This card states no finding, so there is nothing to assign.
                        </p>
                      </div>
                    ) : (
                      <div className="ch-hl-cact">
                        {/* A strength is assignable too, as a keep-doing focus (the board draws it on Theo’s card). */}
                        {mine ? (
                          <span className="ch-hl-done" role="status" data-ch-code="CH-13601">
                            <Icon icon={Check} size={15} />
                            Assigned as {firstName(cur.name)}’s focus
                          </span>
                        ) : statusUnknown ? (
                          <RefreshNotice
                            code="CH-13207"
                            title="Assign as focus isn’t offered right now"
                            body={`${focusStatusSaid(data.missing, firstName(cur.name))} Dismiss still works. Try again in a moment.`}
                          />
                        ) : stale ? null : (
                          <Button variant="primary" leftIcon={Flag} busy={here('assign')} disabled={busy && !here('assign')} onClick={() => void assign.run(cur)}>
                            {here('assign') ? <span data-ch-code="CH-13403">Assigning…</span> : cur.top.declined ? 'Propose again' : 'Assign as focus'}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          leftIcon={Archive}
                          busy={here('dismiss')}
                          disabled={busy && !here('dismiss')}
                          onClick={() => {
                            // CH-13703: the warning comes before the write, as before any destructive tap (D-70).
                            haptic('warning');
                            void dismiss.run(cur);
                          }}
                        >
                          {here('dismiss') ? <span data-ch-code="CH-13403">Dismissing…</span> : 'Dismiss'}
                        </Button>
                        {mine === 'proposed' && <p className="ch-hl-cact__m">{firstName(cur.name)} sees it as a proposal and accepts it to start.</p>}
                        {!mine && !stale && !statusUnknown && cur.top.declined && (
                          <p className="ch-hl-cact__m" data-ch-code="CH-13907">
                            {firstName(cur.name)} declined this as a focus. Propose again sends it back as a new proposal.
                          </p>
                        )}
                        {!mine && stale && (
                          <p className="ch-hl-cact__m" data-ch-code="CH-13906">
                            This read is older than {firstName(cur.name)}’s newest round, so it can’t be assigned as a focus yet.
                          </p>
                        )}
                      </div>
                    )}
                    <ClearedLines lines={cur.cleared} />
                  </>
                )}
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
    <div className="ch-hl-since is-loading" aria-busy="true" aria-label="Loading what’s new since you were last here" data-ch-code="CH-13405">
      <Skeleton width={196} height={13} />
    </div>
  );
}

/** Roster players with no read yet, as By player rows: each named one, then the unnamed as one "N more players" row. */
function noReadRows(count: number, names: readonly string[] = []): Array<{ key: string; name: string | null; more: number }> {
  if (count <= 0) return [];
  const shown = names.slice(0, count);
  const more = count - shown.length;
  return [...shown.map((name, i) => ({ key: `n${i}:${name}`, name, more: 0 })), ...(more > 0 ? [{ key: 'more', name: null, more }] : [])];
}

/** The top card is a signal the count includes: a finding whose read is current. */
const countsAsSignal = (p: ChCoachPlayer) => p.top.kind === 'finding' && !p.top.stale;

/** What could not be checked about this card, in the coach's words. */
function focusStatusSaid(missing: ChBoardMissing | undefined, who: string): string {
  const said: string[] = [];
  if (missing?.assigned || missing?.declined) said.push(`Whether ${who} already has a focus from this read, or declined one, couldn’t be checked.`);
  if (missing?.newest) said.push('Whether this read is still current couldn’t be checked.');
  return said.join(' ');
}
