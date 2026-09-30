'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Check, Flag, Sparkles, Users } from 'lucide-react';
import { ACTIVE_FOCUS_DUPLICATE_ERROR } from '@/lib/coachhelm/focus-areas/duplicate-guard';
import { firstName, signalsLine, type ChCoachHelmData, type ChCoachPlayer, type ChHelmAssigned } from '../../data/coachhelm-shape';
import { haptic } from '../../lib/haptics';
import { normalise, useAction } from '../../lib/use-action';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { rebuiltHref } from '../../shell/nav';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { EmptyState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { FocusCard, Head, PulseList } from './parts';
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
export function CoachBoard({ data, writes = LIVE_COACHHELM_WRITES }: { data: ChCoachHelmData; writes?: ChCoachHelmWrites }) {
  const phone = useChPhone();
  const router = useRouter();
  const toast = useToast();
  const players = data.players.list;
  const [sel, setSel] = useState<string | null>(players[0]?.id ?? null);
  // What this visit changed, over what the page loaded: an insight assigned (by its id) or dismissed.
  const [assigned, setAssigned] = useState<Record<string, ChHelmAssigned>>({});
  const [dismissed, setDismissed] = useState<Record<string, true>>({});
  const refresh = () => router.refresh();

  // The follow-ups (marking assigned, hiding a dismissed card, restoring it) live inside the action, so a toast's Retry completes them too.
  // CH-13702: Assign is a primary Button, so its tap is the light press; the write's success and error haptics come from useAction.
  const assign = useAction(
    'coachhelm.assign',
    async (p: ChCoachPlayer) => {
      const t = p.top;
      const res = await writes.assign({ playerId: p.id, insightId: t.id, title: t.title, description: t.lede || t.title, areaType: t.areaType, targetMetric: t.metric });
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
    },
    (p: ChCoachPlayer) => ({ done: '', failed: `Couldn’t assign the focus to ${firstName(p.name)}`, hint: 'Nothing was saved. Try again.', code: 'CH-13001' }),
  );
  const dismiss = useAction(
    'coachhelm.dismiss',
    async (p: ChCoachPlayer) => {
      const res = await writes.dismiss(p.top.id);
      if (normalise(res).success) setDismissed((d) => ({ ...d, [p.top.id]: true }));
      return res;
    },
    { done: '', failed: 'Couldn’t dismiss the insight', hint: 'It’s still on the board. Try again.', code: 'CH-13002' },
  );
  const undo = useAction(
    'coachhelm.undo',
    async (p: ChCoachPlayer) => {
      const res = await writes.undo(p.top.id, p.top.lifecycle);
      if (normalise(res).success)
        setDismissed((d) => {
          const { [p.top.id]: _gone, ...rest } = d;
          return rest;
        });
      return res;
    },
    { done: '', failed: 'Couldn’t undo the dismissal', hint: 'It’s still dismissed. Try again.', code: 'CH-13003' },
  );
  const busy = assign.pending || dismiss.pending || undo.pending;

  // Open signals: a player's count, less the top insight when it was dismissed here.
  const open = players.map((p) => Math.max(0, p.count - (dismissed[p.top.id] ? 1 : 0)));
  const totalOpen = open.reduce((a, b) => a + b, 0);
  const playersOpen = open.filter((n) => n > 0).length;
  const cur = players.find((p) => p.id === sel) ?? players[0] ?? null;
  // Assigned: from this visit, or a focus area the page found already made from the insight.
  const mine = cur ? (assigned[cur.top.id] ?? cur.top.assigned) : null;
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
          {data.pulse.error ? (
            <InlineNotice code="CH-13203" title="The program pulse didn’t load" body="Your players’ insights below are not affected. Try again in a moment." onRetry={refresh} />
          ) : data.pulse.rows.length === 0 ? (
            <p className="ch-hl-pulse__none" data-ch-code="CH-13309">
              Nothing is flagged in the pulse right now.
            </p>
          ) : (
            <PulseList rows={data.pulse.rows} />
          )}
        </section>
      </SectionBoundary>

      {data.roster.error || data.players.error ? (
        <InlineNotice code="CH-13202" title="Your players’ insights didn’t load" body="Nothing is lost. Every insight is still saved; try again in a moment." onRetry={refresh} />
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
                        setSel(p.id);
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
                {dismissed[cur.top.id] ? (
                  <div className="ch-hl-dis" role="status" data-ch-code="CH-13901">
                    <Icon icon={Archive} size={16} />
                    <span>
                      <b>Insight dismissed.</b> It no longer shows on your board or on {firstName(cur.name)}’s. Undo brings it back.
                    </span>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void undo.run(cur)}>
                      {undo.pending ? 'Undoing' : 'Undo'}
                    </Button>
                  </div>
                ) : (
                  <>
                    <FocusCard key={cur.top.id} ins={cur.top} who={firstName(cur.name)} />
                    <div className="ch-hl-cact">
                      {!cur.top.strength &&
                        (mine ? (
                          <span className="ch-hl-done" role="status" data-ch-code="CH-13601">
                            <Icon icon={Check} size={15} />
                            Assigned as {firstName(cur.name)}’s focus
                          </span>
                        ) : (
                          <Button variant="primary" leftIcon={Flag} disabled={busy} onClick={() => void assign.run(cur)}>
                            {assign.pending ? <span data-ch-code="CH-13403">Assigning</span> : 'Assign as focus'}
                          </Button>
                        ))}
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
                        {dismiss.pending ? <span data-ch-code="CH-13403">Dismissing</span> : 'Dismiss'}
                      </Button>
                      {!cur.top.strength && mine === 'proposed' && <p className="ch-hl-cact__m">{firstName(cur.name)} sees it as a proposal and accepts it to start.</p>}
                    </div>
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

  return (
    <main className={'ch-hl' + (phone ? ' is-phone' : '')} aria-labelledby="ch-hl-title">
      {phone && <PhoneTop start title="CoachHelm" />}
      <Head who="Coach">{players.length > 0 && !data.off ? signalsLine(totalOpen, playersOpen) : 'CoachHelm reads the rounds your players post.'}</Head>
      {body}
    </main>
  );
}
