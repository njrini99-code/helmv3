'use client';

import { Archive, Flag, MessageCircleQuestion, MessageSquare, RotateCcw, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { deleteFocusArea } from '@/app/golf/actions/development';
import { refreshPlayerAnalysisAsCoach } from '@/app/golf/actions/insights-coachhelm';
import { COACHHELM_ENGINE_RATE_LIMITED } from '@/lib/auth/action-rate-limit-messages';
import { assignStateOf, type ChReadDetail } from '../../../data/coachhelm-read-view-shape';
import type { ChBoardMissing } from '../../../data/coachhelm-shape';
import type { ChCoachPlayerHead } from '../../../data/coachhelm-views-shape';
import { friendlyReason } from '../../../lib/friendly-reason';
import { haptic } from '../../../lib/haptics';
import { pluralWord } from '../../../lib/plural';
import { chReport } from '../../../lib/track';
import { isOffline, normalise, type ServerResult } from '../../../lib/use-action';
import { useRefresh } from '../../../lib/use-refresh';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { RefreshNotice } from '../../../ui/RefreshNotice';
import { useToast } from '../../../ui/Toast';
import { focusStatusSaid, type ChFocusActions } from '../parts';
import { ProposalRow } from '../Proposals';
import type { ChPlayerWrites } from '../writes';

/**
 * The read page's own two writes, beside the board's three (`ChCoachHelmWrites`). Both are existing server actions, unchanged:
 * the coach's delete of a focus area (Stats Development's own; coach-only, checked against the player's team) and the coach's
 * re-check of one player (auth, the engine's rate limit and the team membership are checked in the action). Preview and tests pass
 * their own.
 */
export interface ChReadWrites {
  removeFocus(focusAreaId: string): Promise<ServerResult>;
  recheck(playerId: string): Promise<{ success: boolean; insightsCreated?: number; error?: string }>;
}
export const LIVE_READ_WRITES: ChReadWrites = {
  removeFocus: (id) => deleteFocusArea(id),
  recheck: (playerId) => refreshPlayerAnalysisAsCoach(playerId),
};

/** The window a held write waits in, the same eight seconds Ask holds a write for (`lib/coachhelm/v3/chat/undo-hold.ts`). */
export const READ_HOLD_MS = 8_000;

/** What the page shows while a write waits behind its Undo: the outcome, at once. Nothing is saved until the window closes. */
export type ReadHeld = 'assign' | 'remove' | null;

/**
 * A write held behind Undo (the pattern of the board's Decline and the calendar's held move): the page shows the outcome at once,
 * the toast offers Undo for eight seconds, and the write is sent only when Undo stops being offered, or at once when the page is
 * left. Undo is the write never sent, so nothing is saved and the player is told nothing until the window closes.
 */
function useHeldWrite(holdMs: number) {
  const toast = useToast();
  const held = useRef<{ write: () => void } | null>(null);
  useEffect(() => {
    const flush = () => held.current?.write();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  return (title: string, code: string, write: () => void, undo: () => void) => {
    const notice = new AbortController();
    const entry = {
      write: () => {
        if (held.current !== entry) return;
        held.current = null;
        notice.abort();
        write();
      },
    };
    held.current = entry;
    toast({
      title,
      code,
      holdMs,
      signal: notice.signal,
      action: {
        label: 'Undo',
        run: () => {
          if (held.current !== entry) return;
          held.current = null;
          haptic('select');
          undo();
        },
      },
      onExpire: () => entry.write(),
    });
  };
}

/**
 * The coach's actions, straight under the read's head (7 Nov design): one deliberate group of the real keys. Assign as focus is the
 * one primary, with Dismiss and Message beside it as quiet keys of equal weight. The gating is the board's own (`assignStateOf`, the
 * same branches `FocusActions` runs) and so are the three writes (`useFocusActions`).
 *
 * Assign and Remove focus wait behind an eight-second Undo (`useHeldWrite`): the row turns at once, and the proposal is saved, and the
 * player told, only when the window closes. A read older than the newest round offers Re-check now in Assign's place: the coach's own
 * re-check of this one player. A read whose status could not be checked says so. Dismissed, the row is one line and Undo.
 */
export function CoachActions({
  d,
  coach,
  fa,
  writes,
  missing,
  messageHref,
  held,
  onHeld,
  holdMs = READ_HOLD_MS,
}: {
  d: ChReadDetail;
  coach: ChCoachPlayerHead;
  fa: ChFocusActions;
  writes: ChReadWrites;
  missing?: ChBoardMissing;
  messageHref: string | null;
  held: ReadHeld;
  onHeld: (h: ReadHeld) => void;
  holdMs?: number;
}) {
  const toast = useToast();
  const hold = useHeldWrite(holdMs);
  const { refresh } = useRefresh();
  const [rechecking, setRechecking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const ins = d.insight;
  const first = coach.first;
  const target = { playerId: coach.playerId, first, ins };
  const focus = d.todo.plan.focus;
  const mine = held === 'assign' ? 'proposed' : (fa.assigned[ins.id] ?? ins.assigned);
  const state = held === 'remove' ? 'removed' : assignStateOf(ins, { dismissed: !!fa.dismissed[ins.id], assigned: !!mine, missing });

  const message = messageHref ? (
    <Button variant="ghost" leftIcon={MessageSquare} href={messageHref} data={{ 'data-ch-read-act': 'message' }}>
      Message {first}
    </Button>
  ) : null;

  const assign = () => {
    if (fa.busy || held) return;
    // Offline, nothing is held: the action says so itself (CH-1903) and nothing changes.
    if (isOffline()) return void fa.assign.run(target);
    onHeld('assign');
    hold(
      `Proposed to ${first} as a focus`,
      'CH-13601',
      () => {
        // Not saved (refused, thrown): the key comes back beside the action's own error toast. Saved: the hook marks it assigned.
        void fa.assign.run(target).then(() => onHeld(null));
      },
      () => onHeld(null),
    );
  };

  const remove = (focusAreaId: string) => {
    if (fa.busy || held || removing) return;
    haptic('warning');
    onHeld('remove');
    hold(
      `Focus removed for ${first}`,
      'CH-13602',
      () => {
        setRemoving(true);
        void writes
          .removeFocus(focusAreaId)
          .then((res) => normalise(res))
          .catch(() => ({ success: false as const, error: null }))
          .then((res) => {
            setRemoving(false);
            if (res.success) return refresh();
            // Not removed: the focus is still there, and the row says so again.
            onHeld(null);
            haptic('error');
            toast({ tone: 'error', title: `Couldn’t remove ${first}’s focus`, body: 'It is still in place. Try again.', code: 'CH-13008' });
          });
      },
      () => onHeld(null),
    );
  };

  const recheck = async () => {
    if (rechecking) return;
    if (isOffline()) {
      haptic('error');
      toast({ tone: 'error', title: 'Couldn’t re-check: you’re offline', body: 'Reconnect, then try again. Nothing was changed.', code: 'CH-1903' });
      return;
    }
    setRechecking(true);
    let res: Awaited<ReturnType<ChReadWrites['recheck']>> | null = null;
    try {
      res = await writes.recheck(coach.playerId);
    } catch (err) {
      chReport(err, { surface: 'coachhelm', action: 'coachhelm.read.recheck' });
    }
    setRechecking(false);
    if (res?.success) {
      haptic('success');
      toast({ title: `Re-checked ${first}’s rounds`, body: res.insightsCreated ? `${res.insightsCreated} new ${pluralWord(res.insightsCreated, 'read')}.` : undefined, code: 'CH-13945' });
      // The page shows what the re-check wrote: its own reads, again.
      refresh();
      return;
    }
    haptic('error');
    const limited = res?.error === COACHHELM_ENGINE_RATE_LIMITED;
    toast({ tone: 'error', title: limited ? 'Re-check is resting for a moment' : 'Couldn’t re-check this read', body: limited ? (res?.error ?? undefined) : (friendlyReason(res?.error) ?? 'The read is as it was. Try again in a moment.'), code: limited ? 'CH-13007' : 'CH-13006' });
  };

  if (state === 'removed') {
    return (
      <div className="ch-hl-cact" data-ch-read-actions="removed" role="status">
        <p className="ch-hl-path__l ch-hr-done">
          <Icon icon={Flag} size={14} />
          <span>{removing ? 'Removing the focus…' : `Focus removed. ${first} is told nothing until Undo closes.`}</span>
        </p>
      </div>
    );
  }
  if (state === 'dismissed') {
    return (
      <div className="ch-hl-cact" data-ch-read-actions="dismissed" role="status" data-ch-code="CH-13901">
        <p className="ch-hl-path__l ch-hr-done">
          <Icon icon={Archive} size={14} />
          <span>Dismissed. It no longer shows on the board or on {first}’s.</span>
        </p>
        <Button variant="ghost" leftIcon={RotateCcw} busy={fa.here('undo', ins.id)} disabled={fa.busy && !fa.here('undo', ins.id)} onClick={() => void fa.undo.run(target)} data={{ 'data-ch-read-act': 'undo' }}>
          Undo
        </Button>
      </div>
    );
  }
  if (state === 'assigned') {
    // A focus made from this read can be taken back from here; one on the same stat made elsewhere is Development's to manage.
    const removable = !held && focus?.fromThis ? focus.id : null;
    return (
      <div className="ch-hl-cact" data-ch-read-actions="assigned" data-ch-code="CH-13601">
        {messageHref && (
          <Button variant="secondary" leftIcon={MessageSquare} href={messageHref} data={{ 'data-ch-read-act': 'message' }}>
            Message {first}
          </Button>
        )}
        {removable && (
          <Button variant="ghost" onClick={() => remove(removable)} data={{ 'data-ch-read-act': 'remove' }}>
            Remove focus
          </Button>
        )}
        {mine === 'proposed' && <p className="ch-hl-cact__m">{held === 'assign' ? `${first} is told when Undo closes.` : `${first} sees it as a proposal and accepts it to start.`}</p>}
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
      ) : state === 'stale' ? (
        <Button variant="primary" leftIcon={RotateCw} busy={rechecking} onClick={() => void recheck()} data={{ 'data-ch-read-act': 'recheck' }}>
          Re-check now
        </Button>
      ) : (
        <Button variant="primary" leftIcon={Flag} busy={fa.here('assign', ins.id)} disabled={fa.busy && !fa.here('assign', ins.id)} onClick={assign} data={{ 'data-ch-read-act': 'assign' }}>
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
          This read is older than {first}’s newest round, so it can’t be assigned as a focus until it is re-checked.
        </p>
      )}
    </div>
  );
}

/**
 * The player's actions. A proposal a coach made from this read is answered in place, exactly as on the board (`ProposalRow`: Accept
 * starts it, Decline waits behind Undo). Otherwise Ask about this is the one primary (secondary once the read is their focus), with
 * Message beside it: their coach by name when the page knows who that is. No coach control is ever drawn for a player.
 */
export function PlayerActions({ d, askHref, messageHref, coachName, coachUserId, writes }: { d: ChReadDetail; askHref: string | null; messageHref: string | null; coachName: string | null; coachUserId: string | null; writes: ChPlayerWrites }) {
  const ins = d.insight;
  const focus = d.todo.plan.focus;
  if (ins.assigned === 'proposed' && focus?.fromThis) {
    return (
      <div data-ch-read-actions="proposed">
        <section className="ch-hl-prop" aria-labelledby="ch-hr-prop-h">
          <h2 id="ch-hr-prop-h">Proposed for you</h2>
          <p className="ch-hl-note">Accept to start a focus, or decline to set it aside.</p>
          <ul>
            <ProposalRow p={{ id: focus.id, title: focus.title, from: ins.title, coachUserId }} writes={writes} />
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
      {messageHref && (
        <Button variant="ghost" leftIcon={MessageSquare} href={messageHref} data={{ 'data-ch-read-act': 'message' }}>
          Message {coachName ?? 'your coach'}
        </Button>
      )}
    </div>
  );
}
