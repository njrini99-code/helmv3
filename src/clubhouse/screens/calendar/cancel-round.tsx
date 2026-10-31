'use client';

import { CircleX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { setTournamentCancelled } from '@/app/golf/actions/tournaments-calendar';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { chReport, chTrail } from '../../lib/track';
import { haptic } from '../../lib/haptics';
import { isOffline } from '../../lib/use-action';
import type { ChCalEvent } from './model';
import { refusalNotice, type TournamentRefusal } from '../tournaments/fields/refusals';

export type ChCancelScope = 'round' | 'tournament';

/**
 * P-5 4.10, the toasts: CH-6042 "R2 is cancelled" and CH-6043 "Pinehurst Invitational is cancelled", each with Undo;
 * CH-6044 "R2 is back on the calendar" (or the tournament's name), with none: restoring is the safe direction.
 */
export function cancelToast(scope: ChCancelScope, round: { roundNo: number; name: string }, restored: boolean): { code: string; title: string } {
  const what = scope === 'round' ? `R${round.roundNo}` : round.name;
  if (restored) return { code: 'CH-6044', title: `${what} is back on the calendar` };
  return scope === 'round' ? { code: 'CH-6042', title: `${what} is cancelled` } : { code: 'CH-6043', title: `${what} is cancelled` };
}

/** The events a cancel strikes: the round, or every round of its tournament the calendar has. */
export const cancelIds = (e: ChCalEvent, scope: ChCancelScope, events: readonly ChCalEvent[]) =>
  scope === 'round' || !e.round ? [e.id] : events.filter((x) => x.round?.tournamentId === e.round!.tournamentId).map((x) => x.id);

/**
 * P-5 should 5: a cancel is held while its toast offers Undo, then written, as P-4 holds a move. The rounds strike
 * through at once; the write is the toast's onExpire (or leaving the page), so Undo sends nothing and no player hears
 * of a cancel that was taken back. A refusal that comes back after (scores entered meanwhile) un-strikes them and says
 * why. Restore writes at once.
 */
export function useHeldCancel(events: readonly ChCalEvent[], onSaved: () => void, preview = false) {
  const toast = useToast();
  const [struck, setStruck] = useState<ReadonlyMap<string, ChCancelScope>>(() => new Map());
  const held = useRef<{ write: () => void; ids: string[]; scope: ChCancelScope } | null>(null);
  const unstrike = useCallback((ids: readonly string[]) => setStruck((s) => new Map([...s].filter(([id]) => !ids.includes(id)))), []);
  // The server's copy has caught up: what was written stands on its own; only a cancel still on its Undo stays drawn.
  useEffect(() => {
    const h = held.current;
    setStruck(new Map((h?.ids ?? []).map((id) => [id, h!.scope])));
  }, [events]);
  const flush = useCallback(() => held.current?.write(), []);
  useEffect(() => {
    const leave = () => {
      if (isOffline()) held.current = null;
      flush();
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      flush();
    };
  }, [flush]);

  const failed = useCallback(
    (refusal: TournamentRefusal, e: ChCalEvent, scope: ChCancelScope, restoring: boolean) => {
      const r = e.round!;
      const n = refusalNotice(refusal, { save: 'cancel', round: scope === 'round' ? r.roundNo : null, name: r.name });
      haptic('error');
      toast({ tone: 'error', title: restoring ? `Couldn’t restore ${scope === 'round' ? `R${r.roundNo}` : r.name}` : `Couldn’t cancel ${scope === 'round' ? `R${r.roundNo}` : r.name}`, body: n.text, code: n.code, replace: 'calendar-cancel' });
    },
    [toast],
  );

  const cancel = useCallback(
    (e: ChCalEvent, scope: ChCancelScope, reason: string | null) => {
      const r = e.round;
      if (!r) return;
      flush();
      const ids = cancelIds(e, scope, events);
      setStruck((s) => new Map([...s, ...ids.map((id) => [id, scope] as const)]));
      const write = () => {
        if (held.current !== entry) return;
        held.current = null;
        if (preview) return;
        chTrail(`calendar ${scope} cancel write`);
        setTournamentCancelled(r.tournamentId, scope === 'round' ? e.id : null, true, reason, r.version)
          .then((res) => {
            if (res.success) {
              haptic('success');
              onSaved();
              return;
            }
            unstrike(ids);
            failed((res.code ?? 'failed') as TournamentRefusal, e, scope, false);
          })
          .catch((err) => {
            chReport(err, { surface: 'calendar.cancelRound', action: 'calendar.cancelRound' });
            unstrike(ids);
            failed('failed', e, scope, false);
          });
      };
      const entry = { write, ids, scope };
      held.current = entry;
      const t = cancelToast(scope, r, false);
      toast({
        title: t.title,
        code: t.code,
        replace: 'calendar-cancel',
        action: {
          label: 'Undo',
          run: () => {
            if (held.current !== entry) return;
            held.current = null;
            unstrike(ids);
            haptic('select');
          },
        },
        onExpire: () => {
          if (held.current === entry) flush();
        },
      });
    },
    [events, flush, unstrike, failed, toast, onSaved, preview],
  );

  const restore = useCallback(
    (e: ChCalEvent, scope: ChCancelScope) => {
      const r = e.round;
      if (!r || preview) return;
      flush();
      chTrail(`calendar ${scope} restore`);
      setTournamentCancelled(r.tournamentId, scope === 'round' ? e.id : null, false, null, r.version)
        .then((res) => {
          if (!res.success) return failed((res.code ?? 'failed') as TournamentRefusal, e, scope, true);
          haptic('success');
          const t = cancelToast(scope, r, true);
          toast({ title: t.title, code: t.code, replace: 'calendar-cancel' });
          onSaved();
        })
        .catch((err) => {
          chReport(err, { surface: 'calendar.restoreRound', action: 'calendar.restoreRound' });
          failed('failed', e, scope, true);
        });
    },
    [flush, failed, toast, onSaved, preview],
  );

  /** The events as the coach now sees them: a held cancel strikes its rounds (and marks a whole tournament cancelled). */
  const overlay = useCallback(
    (e: ChCalEvent): ChCalEvent => {
      const sc = struck.get(e.id);
      if (!sc) return e;
      return { ...e, cancelled: true, round: e.round && sc === 'tournament' ? { ...e.round, tournamentCancelled: true } : e.round };
    },
    [struck],
  );

  return { struck, overlay, cancel, restore };
}

/**
 * CH-6540 "Cancel R2 of Pinehurst Invitational?" and CH-6541 "Cancel Pinehurst Invitational?". One dialog: the round's
 * question, with "Cancel the whole tournament instead" to switch to the tournament's. An optional reason is kept on the
 * event (cancellation_reason).
 */
export function CancelRoundDialog({ event, onClose, onConfirm }: { event: ChCalEvent | null; onClose: () => void; onConfirm: (scope: ChCancelScope, reason: string | null) => void }) {
  const [scope, setScope] = useState<ChCancelScope>('round');
  const [reason, setReason] = useState('');
  useEffect(() => {
    setScope('round');
    setReason('');
  }, [event?.id]);
  const r = event?.round;
  if (!event || !r) return null;
  const round = scope === 'round';
  return (
    <Modal
      code={round ? 'CH-6540' : 'CH-6541'}
      open
      onClose={onClose}
      width={420}
      icon={CircleX}
      title={round ? `Cancel R${r.roundNo} of ${r.name}?` : `Cancel ${r.name}?`}
      description={
        round
          ? 'Players see it struck through on the calendar. Its lineup and tee times stay, so you can restore it.'
          : `All ${r.roundsCount} rounds are struck through for players. Nothing is deleted, so you can restore it.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {round ? 'Keep round' : 'Keep tournament'}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              // D-70: a destructive confirm is felt as a warning; success follows when the write lands.
              haptic('warning');
              onConfirm(scope, reason.trim() || null);
            }}
          >
            {round ? `Cancel R${r.roundNo}` : 'Cancel tournament'}
          </Button>
        </>
      }
    >
      <label className="ch-field">
        <span className="ch-field__label">Reason · optional</span>
        <input className="ch-input" placeholder="Rain, frost, course closed" maxLength={120} value={reason} onChange={(ev) => setReason(ev.target.value)} />
      </label>
      {round && r.roundsCount > 1 && (
        <Button variant="ghost" size="sm" onClick={() => setScope('tournament')}>
          Cancel the whole tournament instead
        </Button>
      )}
    </Modal>
  );
}
