'use client';

import { Archive, Flag, MessageCircleQuestion, MessageSquare, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { assignStateOf, type ChReadDetail } from '../../../data/coachhelm-read-view-shape';
import type { ChBoardMissing } from '../../../data/coachhelm-shape';
import type { ChCoachPlayerHead } from '../../../data/coachhelm-views-shape';
import { haptic } from '../../../lib/haptics';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { RefreshNotice } from '../../../ui/RefreshNotice';
import { useToast } from '../../../ui/Toast';
import { focusStatusSaid, type ChFocusActions } from '../parts';
import { ProposalRow } from '../Proposals';
import type { ChPlayerWrites } from '../writes';

/**
 * The coach's actions, straight under the read's head (7 Nov design): Assign as focus is the one primary, with Dismiss and Message
 * beside it. The gating is the board's own (`assignStateOf`, the same branches `FocusActions` runs) and so are the three writes
 * (`useFocusActions`): a read older than the newest round is not assigned, a read whose status could not be checked says so, a
 * declined one is proposed again. Dismissed, the row is one line and Undo.
 */
export function CoachActions({ d, coach, fa, missing, messageHref }: { d: ChReadDetail; coach: ChCoachPlayerHead; fa: ChFocusActions; missing?: ChBoardMissing; messageHref: string | null }) {
  const toast = useToast();
  const ins = d.insight;
  const first = coach.first;
  const target = { playerId: coach.playerId, first, ins };
  const mine = fa.assigned[ins.id] ?? ins.assigned;
  const state = assignStateOf(ins, { dismissed: !!fa.dismissed[ins.id], assigned: !!mine, missing });
  const message = messageHref ? (
    <Link className="ch-hd-msg" href={messageHref} data-ch-read-act="message">
      <Icon icon={MessageSquare} size={15} />
      Message {first}
    </Link>
  ) : null;
  if (state === 'dismissed') {
    return (
      <div className="ch-hl-cact" data-ch-read-actions="dismissed" role="status" data-ch-code="CH-13901">
        <p className="ch-hl-path__l ch-hr-done">
          <Icon icon={Archive} size={14} />
          <span>Dismissed. It no longer shows on the board or on {first}’s.</span>
        </p>
        <Button size="sm" variant="ghost" leftIcon={RotateCcw} busy={fa.here('undo', ins.id)} disabled={fa.busy && !fa.here('undo', ins.id)} onClick={() => void fa.undo.run(target)} data={{ 'data-ch-read-act': 'undo' }}>
          Undo
        </Button>
      </div>
    );
  }
  if (state === 'assigned') {
    return (
      <div className="ch-hl-cact" data-ch-read-actions="assigned" data-ch-code="CH-13601">
        {messageHref && (
          <Button variant="secondary" leftIcon={MessageSquare} href={messageHref}>
            Message {first}
          </Button>
        )}
        {mine === 'proposed' && <p className="ch-hl-cact__m">{first} sees it as a proposal and accepts it to start.</p>}
      </div>
    );
  }
  const dismiss = (
    <Button
      variant="ghost"
      leftIcon={Archive}
      busy={fa.here('dismiss', ins.id)}
      disabled={fa.busy && !fa.here('dismiss', ins.id)}
      data={{ 'data-ch-read-act': 'dismiss' }}
      onClick={() => {
        // CH-13703: the warning comes before the write, as before any destructive tap.
        haptic('warning');
        void fa.dismiss.run(target).then((res) => {
          if (res.success) toast({ title: 'Read dismissed', code: 'CH-13901', action: { label: 'Undo', run: () => void fa.undo.run(target) } });
        });
      }}
    >
      Dismiss
    </Button>
  );
  if (state === 'note') {
    return (
      <div className="ch-hl-cact" data-ch-read-actions="note">
        <p className="ch-hl-cact__m" data-ch-code="CH-13904">
          This card states no finding, so there is nothing to assign.
        </p>
        {message}
      </div>
    );
  }
  return (
    <div className="ch-hl-cact" data-ch-read-actions={state}>
      {state === 'unknown' ? (
        <RefreshNotice code="CH-13207" title="Assign as focus isn’t offered right now" body={`${focusStatusSaid(missing, first)} Dismiss still works. Try again in a moment.`} />
      ) : state === 'stale' ? null : (
        <Button variant="primary" leftIcon={Flag} busy={fa.here('assign', ins.id)} disabled={fa.busy && !fa.here('assign', ins.id)} onClick={() => void fa.assign.run(target)} data={{ 'data-ch-read-act': 'assign' }}>
          {state === 'declined' ? 'Propose again' : 'Assign as focus'}
        </Button>
      )}
      {dismiss}
      {message}
      {state === 'declined' && (
        <p className="ch-hl-cact__m" data-ch-code="CH-13907">
          {first} declined this as a focus. Propose again sends it back as a new proposal.
        </p>
      )}
      {state === 'stale' && (
        <p className="ch-hl-cact__m" data-ch-code="CH-13906">
          This read is older than {first}’s newest round, so it can’t be assigned as a focus yet.
        </p>
      )}
    </div>
  );
}

/**
 * The player's actions. A proposal a coach made from this read is answered in place, exactly as on the board (`ProposalRow`: Accept
 * starts it, Decline waits behind Undo). Otherwise Ask about this is the one primary (secondary once the read is their focus), with a
 * way to their coach. No coach control is ever drawn for a player.
 */
export function PlayerActions({ d, askHref, messageHref, writes }: { d: ChReadDetail; askHref: string | null; messageHref: string | null; writes: ChPlayerWrites }) {
  const ins = d.insight;
  const focus = d.todo.plan.focus;
  if (ins.assigned === 'proposed' && focus?.fromThis) {
    return (
      <div data-ch-read-actions="proposed">
        <section className="ch-hl-prop" aria-labelledby="ch-hr-prop-h">
          <h2 id="ch-hr-prop-h">Proposed for you</h2>
          <p className="ch-hl-note">Accept to start a focus, or decline to set it aside.</p>
          <ul>
            <ProposalRow p={{ id: focus.id, title: focus.title, from: ins.title, coachUserId: null }} writes={writes} />
          </ul>
        </section>
      </div>
    );
  }
  const mine = ins.assigned === 'active';
  if (!askHref && !messageHref) return null;
  return (
    <div className="ch-hl-cact" data-ch-read-actions={mine ? 'focus' : 'open'}>
      {askHref && (
        <Button variant={mine ? 'secondary' : 'primary'} leftIcon={MessageCircleQuestion} href={askHref}>
          Ask about this
        </Button>
      )}
      {!mine && messageHref && (
        <Link className="ch-hd-msg" href={messageHref} data-ch-read-act="message">
          <Icon icon={MessageSquare} size={15} />
          Message your coach
        </Link>
      )}
    </div>
  );
}
