'use client';

import { Ban, CircleX, Ellipsis, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { setTournamentCancelled, untrackTournament } from '@/app/golf/actions/tournaments-calendar';
import { Button, IconButton } from '../../ui/Button';
import { Menu, type MenuItem } from '../../ui/Menu';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { chReport, chTrail } from '../../lib/track';
import { haptic } from '../../lib/haptics';
import { isOffline } from '../../lib/use-action';
import { refusalNotice, type TournamentRefusal } from './fields/refusals';
import { useTourPaths } from './paths';
import type { ChTourTrack } from './types';

/**
 * P-5 4.11.5: the desk's tournament menu. Cancel tournament asks CH-16551 and is held while its toast (CH-16051) offers
 * Undo, then written, as the calendar holds a round's cancel, so Undo sends nothing. Restore tournament writes at once
 * (CH-16052). Stop tracking asks CH-16550 and, written, says so (CH-16050) with no Undo: the tournament's own rows go.
 */
export function deskTrackToast(kind: 'cancelled' | 'restored' | 'untracked', name: string): { code: string; title: string } {
  if (kind === 'cancelled') return { code: 'CH-16051', title: `${name} is cancelled` };
  if (kind === 'restored') return { code: 'CH-16052', title: `${name} is back on the calendar` };
  return { code: 'CH-16050', title: `${name} is no longer tracked. Its calendar entries stay.` };
}

/** Why Stop tracking isn't offered: scores entered, or the results official. Null when it may go. */
export function stopTrackingBlock(t: Pick<ChTourTrack, 'official' | 'scoredRound'>): string | null {
  if (t.official) return 'The results are official, so this tournament stays tracked.';
  if (t.scoredRound != null) return `Scores are entered for R${t.scoredRound}, so this tournament stays tracked.`;
  return null;
}

export function DeskTrackMenu({ tournamentId, name, track }: { tournamentId: string; name: string; track: ChTourTrack | null | undefined }) {
  const router = useRouter();
  const toast = useToast();
  const paths = useTourPaths();
  const [ask, setAsk] = useState<null | 'cancel' | 'untrack'>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  /** A cancel waiting on its Undo: shown as cancelled here at once, written when the toast goes or the page is left. */
  const [held, setHeld] = useState(false);
  const write = useRef<(() => void) | null>(null);
  const flush = useCallback(() => write.current?.(), []);
  useEffect(() => {
    const leave = () => {
      if (isOffline()) write.current = null;
      flush();
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      flush();
    };
  }, [flush]);

  if (!track) return null;
  const cancelled = track.cancelled || held;
  const fail = (refusal: TournamentRefusal, save: 'cancel' | 'untrack', verb: string) => {
    const n = refusalNotice(refusal, { save, name });
    haptic('error');
    toast({ tone: 'error', title: `Couldn’t ${verb} ${name}`, body: n.text, code: n.code, replace: 'tour-track' });
  };

  const cancel = (why: string | null) => {
    setAsk(null);
    setHeld(true);
    const run = () => {
      if (write.current !== run) return;
      write.current = null;
      chTrail('tournament desk cancel write');
      setTournamentCancelled(tournamentId, null, true, why, track.version)
        .then((res) => {
          if (res.success) {
            haptic('success');
            router.refresh();
            return;
          }
          setHeld(false);
          fail((res.code ?? 'failed') as TournamentRefusal, 'cancel', 'cancel');
        })
        .catch((err) => {
          chReport(err, { surface: 'tournaments.desk', action: 'tournaments.cancel' });
          setHeld(false);
          fail('failed', 'cancel', 'cancel');
        });
    };
    write.current = run;
    const t = deskTrackToast('cancelled', name);
    toast({
      title: t.title,
      code: t.code,
      replace: 'tour-track',
      action: {
        label: 'Undo',
        run: () => {
          if (write.current !== run) return;
          write.current = null;
          setHeld(false);
          haptic('select');
        },
      },
      onExpire: () => {
        if (write.current === run) flush();
      },
    });
  };

  const restore = async () => {
    flush();
    setBusy(true);
    try {
      const res = await setTournamentCancelled(tournamentId, null, false, null, track.version);
      if (!res.success) return fail((res.code ?? 'failed') as TournamentRefusal, 'cancel', 'restore');
      haptic('success');
      const t = deskTrackToast('restored', name);
      toast({ title: t.title, code: t.code, replace: 'tour-track' });
      router.refresh();
    } catch (err) {
      chReport(err, { surface: 'tournaments.desk', action: 'tournaments.restore' });
      fail('failed', 'cancel', 'restore');
    } finally {
      setBusy(false);
    }
  };

  const untrack = async () => {
    setBusy(true);
    try {
      const res = await untrackTournament(tournamentId, track.version);
      if (!res.success) {
        setAsk(null);
        return fail((res.code ?? 'failed') as TournamentRefusal, 'untrack', 'stop tracking');
      }
      haptic('success');
      const t = deskTrackToast('untracked', name);
      toast({ title: t.title, code: t.code, replace: 'tour-track' });
      setAsk(null);
      router.push(paths.home());
    } catch (err) {
      chReport(err, { surface: 'tournaments.desk', action: 'tournaments.untrack' });
      fail('failed', 'untrack', 'stop tracking');
    } finally {
      setBusy(false);
    }
  };

  const block = stopTrackingBlock(track);
  const items: MenuItem[] = [
    cancelled
      ? { label: 'Restore tournament', icon: RotateCcw, onSelect: () => void restore() }
      : { label: 'Cancel tournament', icon: CircleX, danger: true, onSelect: () => (setReason(''), setAsk('cancel')) },
    { kind: 'separator' },
    { label: 'Stop tracking', icon: Ban, onSelect: () => setAsk('untrack') },
  ];

  return (
    <>
      <Menu label="Tournament actions" items={items} trigger={(p) => <IconButton icon={Ellipsis} label="Tournament actions" menu={p} disabled={busy} />} />
      <Modal
        code="CH-16551"
        open={ask === 'cancel'}
        onClose={() => setAsk(null)}
        width={420}
        icon={CircleX}
        title={`Cancel ${name}?`}
        description={`All ${track.entries} ${track.entries === 1 ? 'round is' : 'rounds are'} struck through for players. Nothing is deleted, so you can restore it.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsk(null)}>
              Keep tournament
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                haptic('warning');
                cancel(reason.trim() || null);
              }}
            >
              Cancel tournament
            </Button>
          </>
        }
      >
        <label className="ch-field">
          <span className="ch-field__label">Reason · optional</span>
          <input className="ch-input" placeholder="Rain, frost, course closed" maxLength={120} value={reason} onChange={(ev) => setReason(ev.target.value)} />
        </label>
      </Modal>
      <Modal
        code="CH-16550"
        open={ask === 'untrack'}
        onClose={() => setAsk(null)}
        width={420}
        icon={Ban}
        title={block ? `${name} stays tracked` : `Stop tracking ${name}?`}
        description={
          block ??
          `Its ${track.entries} calendar ${track.entries === 1 ? 'entry stays' : 'entries stay'}, so players still see the days. The lineup, tee times and notes for it are removed.`
        }
        footer={
          block ? (
            <Button variant="primary" onClick={() => setAsk(null)}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setAsk(null)}>
                Keep tracking
              </Button>
              <Button
                variant="danger"
                busy={busy}
                onClick={() => {
                  haptic('warning');
                  void untrack();
                }}
              >
                Stop tracking
              </Button>
            </>
          )
        }
      />
    </>
  );
}
