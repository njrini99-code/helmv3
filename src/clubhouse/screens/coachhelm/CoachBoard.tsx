'use client';

import { Suspense, use, useState } from 'react';
import { Archive, Check, Flag, Sparkles, Users } from 'lucide-react';
import { ACTIVE_FOCUS_DUPLICATE_ERROR } from '@/lib/coachhelm/focus-areas/duplicate-guard';
import { firstName, playersLine, pulseGapsLabel, type ChBoardMissing, type ChCoachHelmData, type ChCoachPlayer, type ChHelmAssigned, type ChPulse, type ChPulseResult } from '../../data/coachhelm-shape';
import { haptic } from '../../lib/haptics';
import { normalise, useAction } from '../../lib/use-action';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { rebuiltHref } from '../../shell/nav';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { EmptyState, Skeleton } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { COACHHELM_HREF, CoachHelmTabs, type CoachHelmView } from './chat/SubTabs';
import { BoardPartial, FocusCard, Head, PulseList } from './parts';
import { useViewSwitch } from './use-view-switch';
import { LIVE_COACHHELM_WRITES, type ChCoachHelmWrites } from './writes';

/** Where each control goes. A target that isn't rebuilt yet isn't drawn (nav.rebuiltHref), never a dead button. */
export const coachBoardLinks = {
  roster: () => rebuiltHref('/golf/dashboard/roster', 'coach'),
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
export function CoachBoard({ data, writes = LIVE_COACHHELM_WRITES, initialPlayer }: { data: ChCoachHelmData; writes?: ChCoachHelmWrites; initialPlayer?: string }) {
  const phone = useChPhone();
  const toast = useToast();
  const players = data.players.list;
  // Roster's View insights opens on its player; a player with no insight on the board opens the most pressing one. The name is kept
  // with the id so that a refresh that takes the player off the board is said, not answered with another player's card in silence.
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(() => {
    const first = players.find((p) => p.id === initialPlayer) ?? players[0];
    return first ? { id: first.id, name: first.name } : null;
  });
  // Who a write is in flight for (set inside the action, so a toast's Retry sets it too): only that player's card says "Assigning",
  // "Dismissing" or "Undoing". The controls of every card wait meanwhile, because the one write in flight is the hook's.
  const [acting, setActing] = useState<{ playerId: string; kind: 'assign' | 'dismiss' | 'undo' } | null>(null);
  // What this visit changed, over what the page loaded: an insight assigned (by its id) or dismissed.
  const [assigned, setAssigned] = useState<Record<string, ChHelmAssigned>>({});
  const [dismissed, setDismissed] = useState<Record<string, true>>({});
  // A switch to Ask moves the strip at once and dims the board (aria-busy) until Ask is ready.
  const sw = useViewSwitch<CoachHelmView>('board', (v) => COACHHELM_HREF[v]);

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
  const rosterHref = coachBoardLinks.roster();

  const body = data.off ? (
    <EmptyState
      size="page"
      code="CH-13305"
      icon={Sparkles}
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
      icon={Users}
      title="Add players to start CoachHelm"
      body="CoachHelm reads the rounds your players post. Invite players from Roster, and their insights show up here."
      action={
        rosterHref ? (
          <Button variant="primary" leftIcon={Users} href={rosterHref}>
            Open roster
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

      {data.roster.error || data.players.error ? (
        <RefreshNotice code="CH-13202" title="Your players’ insights didn’t load" body="Nothing is lost. Every insight is still saved; try again in a moment." />
      ) : !cur ? (
        <EmptyState
          size="page"
          code="CH-13306"
          icon={Sparkles}
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
      ) : (
        <>
          {data.missing && <BoardPartial missing={data.missing} what="board" focus={false} />}
          <div className="ch-hl-cgrid">
            <SectionBoundary surface="coachhelm.players" label="Your players" code="CH-13204">
              <section className="ch-hl-plist" aria-labelledby="ch-hl-plist-h">
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
                        setPicked({ id: p.id, name: p.name });
                      }}
                    >
                      <Avatar name={p.name} size={phone ? 28 : 34} />
                      <span>
                        <b>{p.name}</b>
                        <em>{dismissed[p.top.id] ? 'Dismissed' : p.top.title}</em>
                      </span>
                      <span className="ch-hl-pl__c ch-num">{open[i]}</span>
                    </button>
                  );
                })}
              </section>
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
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void undo.run(cur)}>
                      {here('undo') ? <span data-ch-code="CH-13403">Undoing</span> : 'Undo'}
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
                          <Button variant="primary" leftIcon={Flag} disabled={busy} onClick={() => void assign.run(cur)}>
                            {here('assign') ? <span data-ch-code="CH-13403">Assigning</span> : cur.top.declined ? 'Propose again' : 'Assign as focus'}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          leftIcon={Archive}
                          disabled={busy}
                          onClick={() => {
                            // CH-13703: the warning comes before the write, as before any destructive tap (D-70).
                            haptic('warning');
                            void dismiss.run(cur);
                          }}
                        >
                          {here('dismiss') ? <span data-ch-code="CH-13403">Dismissing</span> : 'Dismiss'}
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
                  </>
                )}
              </SectionBoundary>
            </div>
          </div>
          {data.withoutSignals > 0 && (
            <p className="ch-hl-note" data-ch-code="CH-13310">
              {data.withoutSignals} {data.withoutSignals === 1 ? 'player has' : 'players have'} no insights yet.
            </p>
          )}
        </>
      )}
    </>
  );

  // With CoachHelm off (CH-13305), Ask is off too, so the strip that leads there is not drawn.
  const tabs = data.off ? null : <CoachHelmTabs active={sw.shown} onGo={sw.go} />;
  return (
    <main className={'ch-hl' + (phone ? ' is-phone' : '')} aria-labelledby="ch-hl-title" aria-busy={sw.pending || undefined}>
      {phone && <PhoneTop start title="CoachHelm" />}
      {phone && tabs}
      <Head who="Coach">{players.length > 0 && !data.off ? playersLine(playersOpen) : 'CoachHelm reads the rounds your players post.'}</Head>
      {!phone && tabs}
      {body}
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

/** What could not be checked about this card, in the coach's words. */
function focusStatusSaid(missing: ChBoardMissing | undefined, who: string): string {
  const said: string[] = [];
  if (missing?.assigned || missing?.declined) said.push(`Whether ${who} already has a focus from this read, or declined one, couldn’t be checked.`);
  if (missing?.newest) said.push('Whether this read is still current couldn’t be checked.');
  return said.join(' ');
}
