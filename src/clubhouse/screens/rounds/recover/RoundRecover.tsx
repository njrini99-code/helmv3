'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Flag, History, RotateCw, Trash2, TriangleAlert } from 'lucide-react';
import { haptic } from '../../../lib/haptics';
import { chReport } from '../../../lib/track';
import { normalise, useAction } from '../../../lib/use-action';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { InlineNotice } from '../../../ui/Notices';
import { EmptyState, Skeleton } from '../../../ui/States';
import { ROUNDS_LIBRARY } from '../entry/routes';
import { reasonText, typeLabel } from '../entry/labels';
import { useAgo } from '../entry/parts';
import { shortDay } from '../parts';
import { LIVE_RECOVER_PORTS, type ChRecoverPorts } from './ports';
import type { ChDeviceScan, ChRecoverRound } from './scan';
import '../../../styles/rounds-recover.css';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/** "Practice · Oct 14 · 9 of 18 holes · 41 strokes": what the saved round holds, skipping what it does not. */
function factsOf(r: ChRecoverRound): string {
  const holes = r.holesDone > 0 ? `${r.holesDone}${r.holesTotal ? ` of ${r.holesTotal}` : ''} ${r.holesDone === 1 ? 'hole' : 'holes'}` : 'Shots on a hole in progress';
  return [typeLabel(r.type), ISO_DAY.test(r.date) ? shortDay(r.date) : null, holes, r.score != null ? `${r.score} strokes` : null].filter(Boolean).join(' · ');
}

function statusOf(r: ChRecoverRound): { tone: 'warning' | 'info' | 'neutral'; label: string } {
  if (r.syncFailed) return { tone: 'warning', label: 'Didn’t sync' };
  if (r.queued) return { tone: 'info', label: 'Waiting to sync' };
  return { tone: 'neutral', label: r.roundId ? 'Saved on this device' : 'Only on this device' };
}

function RecoverCard({
  round,
  phone,
  busy,
  resuming,
  onResume,
  onRetry,
  onDiscard,
}: {
  round: ChRecoverRound;
  phone: boolean;
  busy: boolean;
  resuming: boolean;
  onResume: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const ago = useAgo(round.savedAt);
  const status = statusOf(round);
  const size = phone ? 'lg' : 'md';
  const why = round.syncFailed ? (reasonText(round.syncError) ?? 'The last try didn’t go through. It is kept on this device.') : null;
  return (
    <li>
      <article className="ch-rcv-card" aria-label={`Saved round at ${round.course}`}>
        <div className="ch-rcv-top">
          <h2>{round.course}</h2>
          <Badge tone={status.tone} dot={status.tone !== 'neutral'}>
            {status.label}
          </Badge>
        </div>
        <p className="ch-rcv-facts ch-num">{factsOf(round)}</p>
        {why && <p className="ch-rcv-why">{why}</p>}
        {ago && <p className="ch-rcv-saved">Saved {ago}</p>}
        <div className="ch-rcv-acts" role="group" aria-label={`Actions for the round at ${round.course}`}>
          <Button variant="primary" size={size} leftIcon={History} disabled={busy} onClick={onResume}>
            {resuming ? 'Restoring' : round.finished ? 'Submit round' : 'Restore round'}
          </Button>
          {round.queued && (
            <Button size={size} leftIcon={RotateCw} disabled={busy} onClick={onRetry}>
              Retry sync
            </Button>
          )}
          <Button variant="ghost" size={size} leftIcon={Trash2} disabled={busy} onClick={onDiscard}>
            Discard
          </Button>
        </div>
      </article>
    </li>
  );
}

/**
 * /golf/dashboard/rounds/recover in Clubhouse (swap audit F-02): the rounds this device holds that the server may
 * not, for the signed-in player, and what to do with each. Restore writes the round to the server and opens it to
 * continue, or submits it when it was a finished round whose submit failed (Fairway's recovery, ported: only the
 * words and the frame are new); Retry sync asks the sync engine to send the queued rounds again; Discard asks first,
 * then deletes the round the way the round screens do (the server's unfinished round, every device copy, and a mark
 * so another tab or the queue cannot bring it back).
 *
 * It is where a submit that couldn't reach the server lands (`ENGINE_ROUTES`). Nothing links here from Rounds: a
 * round the device holds shows up in the library too once it has been restored.
 */
export function RoundRecover({ playerId, ports = LIVE_RECOVER_PORTS }: { playerId: string; ports?: ChRecoverPorts }) {
  const phone = useChPhone();
  const router = useRouter();
  const fromSubmit = useSearchParams().get('from') === 'submit';
  /** null while the device is read. */
  const [rounds, setRounds] = useState<ChRecoverRound[] | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [asking, setAsking] = useState<ChRecoverRound | null>(null);
  const [resumingKey, setResumingKey] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    let next: ChDeviceScan;
    try {
      next = await ports.scan(playerId);
    } catch (err) {
      chReport(err, { surface: 'rounds.recover', action: 'scan' });
      next = { rounds: [], unreadable: true };
    }
    if (!alive.current) return;
    setRounds(next.rounds);
    setUnreadable(next.unreadable);
  }, [ports, playerId]);
  useEffect(() => {
    void load();
  }, [load]);

  // CH-11017: a failed restore keeps the round exactly as it was; the reason, when the server gave one, is in words.
  // The round opens from inside the action, so a toast's Retry that works opens it too.
  const restoreRound = async (r: ChRecoverRound) => {
    setResumingKey(r.key);
    try {
      const result = await ports.resume(r, playerId);
      if (normalise(result).success && result.data) router.push(result.data.href);
      return result;
    } finally {
      if (alive.current) setResumingKey(null);
    }
  };
  const resumeRound = useAction(
    'rounds.recover.resume',
    restoreRound,
    (r: ChRecoverRound) => ({ done: 'Round restored', failed: `Couldn’t restore the round at ${r.course}`, hint: 'It is still saved on this device. Try again.', code: 'CH-11017' }),
    (result, copy) => (result.success ? { ...copy, done: result.data?.done ?? copy.done } : { ...copy, hint: reasonText(result.error) ?? copy.hint }),
  );

  // CH-11018: Retry sync asks the engine and reads the device again, whatever the answer: the engine counts the attempt.
  const syncAgain = async () => {
    const result = await ports.retrySync();
    await load();
    return result;
  };
  const retrySync = useAction(
    'rounds.recover.retry',
    syncAgain,
    { done: 'Sync finished', failed: 'Couldn’t sync your rounds', hint: 'They are still saved on this device. Try again in a moment.', code: 'CH-11018' },
    (result, copy) => {
      if (!result.success) return { ...copy, hint: reasonText(result.error) ?? copy.hint };
      if (result.data?.declined) return { ...copy, done: 'A sync is already running' };
      const synced = result.data?.synced ?? 0;
      return { ...copy, done: synced > 0 ? `Synced ${synced} ${synced === 1 ? 'round' : 'rounds'}` : 'Nothing was sent this time. Restore a round to send it now' };
    },
  );

  // The card leaves on success wherever the call came from, the toast's Retry included.
  const discardRound = async (r: ChRecoverRound) => {
    const result = await ports.discard(r, playerId);
    if (normalise(result).success && alive.current) {
      setRounds((xs) => xs?.filter((x) => x.key !== r.key) ?? xs);
      setAsking((a) => (a?.key === r.key ? null : a));
    }
    return result;
  };
  // CH-11019. Nothing is sent for a round that exists only here, so being offline is not a reason to refuse it.
  const discard = useAction('rounds.recover.discard', discardRound, (r: ChRecoverRound) => ({
    done: 'Round discarded',
    failed: `Couldn’t discard the round at ${r.course}`,
    hint: 'It is still saved on this device. Try again.',
    code: 'CH-11019',
    offline: r.roundId ? undefined : () => false,
  }));
  // CH-11520: the warning comes before the question.
  const askDiscard = (r: ChRecoverRound) => {
    haptic('warning');
    setAsking(r);
  };

  const busy = resumeRound.pending || retrySync.pending || discard.pending;
  const list = rounds ?? [];
  const empty = rounds !== null && !unreadable && list.length === 0;

  return (
    <main className={'ch-rcv' + (phone ? ' is-phone' : '')} aria-labelledby="ch-rcv-title">
      {phone && <PhoneTop title="Recover" back={{ label: 'Rounds', onBack: () => router.push(ROUNDS_LIBRARY) }} />}
      <header className="ch-rcv-h">
        <div>
          <span className="ch-rcv-k">Saved on this device</span>
          <h1 id="ch-rcv-title">Recover a round</h1>
        </div>
        {/* The empty page carries its own way back. The phone's top bar has the back link. */}
        {!phone && !empty && (
          <Button variant="secondary" href={ROUNDS_LIBRARY}>
            Back to Rounds
          </Button>
        )}
      </header>

      {rounds === null ? (
        <div role="status" aria-busy="true" aria-label="Scanning this device for saved rounds" data-ch-code="CH-11409">
          <ul className="ch-rcv-list" aria-hidden="true">
            {[0, 1].map((i) => (
              <li key={i}>
                <Skeleton width="100%" height={140} radius={16} />
              </li>
            ))}
          </ul>
        </div>
      ) : unreadable ? (
        <InlineNotice
          code="CH-11212"
          title="This device’s saved rounds couldn’t be read"
          body="Nothing is deleted. Use the same browser and device that tracked the round, then try again."
          onRetry={() => {
            setRounds(null);
            void load();
          }}
        />
      ) : list.length === 0 ? (
        <EmptyState
          size="page"
          code="CH-11314"
          icon={Flag}
          title="Nothing to recover"
          body="A round saved only on this device after an interruption or a failed submit shows up here. This page finds the rounds the browser and device you are on tracked."
          action={
            <Button variant="primary" href={ROUNDS_LIBRARY}>
              Back to Rounds
            </Button>
          }
        />
      ) : (
        <>
          {fromSubmit && (
            <p className="ch-rcv-note" data-ch-code="CH-11911">
              <b>Your round is saved on this device.</b> It couldn’t reach the server, so it waits here. Restore it below without entering anything again.
            </p>
          )}
          <p className="ch-rcv-lede">
            {list.length} saved {list.length === 1 ? 'round' : 'rounds'} on this device. Nothing is deleted until you discard it.
          </p>
          <ul className="ch-rcv-list">
            {list.map((r) => (
              <RecoverCard
                key={r.key}
                round={r}
                phone={phone}
                busy={busy}
                resuming={resumingKey === r.key}
                onResume={() => void resumeRound.run(r)}
                onRetry={() => void retrySync.run()}
                onDiscard={() => askDiscard(r)}
              />
            ))}
          </ul>
        </>
      )}

      <Modal
        open={!!asking}
        onClose={() => setAsking(null)}
        icon={TriangleAlert}
        code="CH-11520"
        title="Discard this round?"
        description={
          asking
            ? asking.roundId
              ? `The round at ${asking.course} and every shot in it are deleted, here and on the server. A round you already submitted is not touched. This can’t be undone.`
              : `The copy of your round at ${asking.course} saved on this device is deleted. It never reached the server, so this can’t be undone.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Keep it
            </Button>
            <Button variant="danger" disabled={discard.pending} feel={null} onClick={() => asking && void discard.run(asking)}>
              {discard.pending ? 'Discarding' : 'Discard round'}
            </Button>
          </>
        }
      />
    </main>
  );
}
