'use client';
import { Button } from '../../../../ui/Button';

import { useEffect, useRef, useState } from 'react';
import { Check, Timer } from 'lucide-react';
import { Icon } from '../../../../ui/Icon';
import { requestAskCredits, undoAskCredits } from '@/app/golf/actions/coachhelm-ask-credits';
import type { AskAllowanceBucket } from '../../../../data/coachhelm-chat-shape';

const UNDO_MS = 8_000;

/** "Ask this week": a word only, never an amount, a percentage or a dollar sign (AK10b). */
export function AllowanceMeter({ bucket }: { bucket: AskAllowanceBucket }) {
  const word = bucket === 'plenty' ? 'Plenty left' : bucket === 'low' ? 'Low' : 'Paused';
  return (
    <section className={'ch-ak-meter' + (bucket !== 'plenty' ? ' is-low' : '')} aria-label={`Ask this week: ${word}, resets Monday`}>
      <b>Ask this week</b>
      <span>{word} · resets Monday</span>
      {/* A bucket's level, never an amount (AK10b). */}
      <i aria-hidden="true" className={`is-${bucket}`} />
    </section>
  );
}

const REQUEST_WORDS = 'I ran out of this week’s Ask and would like more.';

/**
 * Out of Ask (E-OUT): the card stays in the thread and says why; the composer stays, paused. `live`: it just ran out in
 * front of the player, so Request more arrives a moment after the reason. On a page that opens already out, it's there.
 */
export function OutCard({ live = false, sent = false, off = false, onRequest }: { live?: boolean; sent?: boolean; off?: boolean; onRequest: () => void }) {
  return (
    <section className="ch-ak-out" role="status">
      <div className="top">
        <span className="ic">
          <Icon icon={Timer} size={20} />
        </span>
        <h3>You’ve used this week’s Ask</h3>
        <p>Every player gets a set amount of CoachHelm each week. Answers that read a lot of rounds or draw charts use more of it. Yours resets Monday morning.</p>
        <div className="rs">
          <i aria-hidden="true" />
          <span>Resets Mon</span>
        </div>
      </div>
      <div className="keep">
        <Icon icon={Check} size={16} />
        <span>Your past answers and charts still open. Your stats and rounds are all still there.</span>
      </div>
      <div className={'ask' + (live ? ' is-late' : '') + (off ? ' is-off' : '')}>
        <span>{sent ? 'Request sent to Helm Sports Labs' : 'Need more before Monday?'}</span>
        <Button variant="primary" disabled={sent || off} onClick={onRequest}>
          {sent ? 'Sent' : 'Request more'}
        </Button>
      </div>
    </section>
  );
}

type Stage = 'idle' | 'confirm' | 'sending' | 'held' | 'undoing' | 'undone' | 'told' | 'cancelled';

/** Request more (S-ASK.player.request): the kit's card and 8 second Undo. Undo in time deletes the row and nothing is sent. */
export function PlayerOut({ live = false, from }: { live?: boolean; from: string }) {
  const [stage, setStage] = useState<Stage>('idle');
  const [already, setAlready] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const send = async () => {
    setStage('sending');
    setError(null);
    const r = await requestAskCredits(REQUEST_WORDS).catch(() => ({ success: false, id: undefined, error: 'That didn’t go in. Try again.' }));
    if (!r.success) {
      if (r.error?.includes('already')) {
        setAlready(true);
        return setStage('idle');
      }
      setError(r.error ?? 'That didn’t go in. Try again.');
      return setStage('confirm');
    }
    id.current = r.id ?? null;
    setStage('held');
    timer.current = setTimeout(() => setStage((s) => (s === 'held' ? 'told' : s)), UNDO_MS);
  };
  const undo = async () => {
    if (timer.current) clearTimeout(timer.current);
    setStage('undoing');
    const r = id.current ? await undoAskCredits(id.current).catch(() => ({ success: false })) : { success: false };
    // Too late or unreachable: it's on its way, and the card says so rather than promising it was stopped.
    setStage(r.success ? 'undone' : 'told');
  };
  const told = stage === 'told' || already;
  const showConfirm = stage === 'confirm' || stage === 'sending' || stage === 'held' || stage === 'undoing' || stage === 'told' || stage === 'undone' || stage === 'cancelled';
  return (
    <div className="ch-ak-th ch-ak-outwrap">
      <OutCard live={live} sent={told} off={stage !== 'idle' && stage !== 'undone' && stage !== 'cancelled' && !told} onRequest={() => setStage('confirm')} />
      {showConfirm && (
        <section className={'conf ch-ak-request' + (stage === 'cancelled' ? ' is-cancelled' : '')}>
          <div className="hd">
            <span className="tt">
              <b>Request more Ask</b>
              <span>An email to Helm Sports Labs</span>
            </span>
          </div>
          <div className={'evd' + (stage === 'cancelled' ? ' dim' : '')}>
            <div className="ls">
              <div className="f">
                <span className="k">To</span>
                <span className="v">Helm Sports Labs support</span>
              </div>
              <div className="f">
                <span className="k">From</span>
                <span className="v">{from}</span>
              </div>
              <div className="f">
                <span className="k">Message</span>
                <span className="v">{REQUEST_WORDS}</span>
              </div>
            </div>
          </div>
          {(stage === 'confirm' || stage === 'sending') && (
            <>
              <p className="oncf">
                <b>On confirm:</b> one email goes to Helm Sports Labs once Undo closes. Your coach isn’t emailed.
              </p>
              {error && (
                <p className="oncf" role="alert">
                  {error}
                </p>
              )}
              <div className="btns">
                <Button variant="ghost" disabled={stage === 'sending'} onClick={() => setStage('cancelled')}>
                  Cancel
                </Button>
                {stage === 'sending' ? (
                  <span className="p cap">Sending…</span>
                ) : (
                  <Button variant="primary" onClick={() => void send()}>
                    Send request
                  </Button>
                )}
              </div>
            </>
          )}
          {(stage === 'held' || stage === 'undoing') && (
            <div className="receipt in" role="status">
              <span className="ck">
                <Icon icon={Check} size={13} />
              </span>
              <div>
                <b>Request ready for Helm Sports Labs</b>
                <span className="sub">It sends when Undo closes</span>
              </div>
              <button type="button" className="lk undo" data-ch-ask-undo="" disabled={stage === 'undoing'} onClick={() => void undo()}>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" aria-hidden="true">
                  <circle className="trk" cx="12" cy="12" r="10" />
                  <circle className="drn" cx="12" cy="12" r="10" style={{ animationDuration: `${UNDO_MS}ms` }} />
                </svg>
                {stage === 'undoing' ? 'Undoing' : 'Undo'}
              </button>
            </div>
          )}
          {stage === 'told' && (
            <div className="receipt" role="status">
              <span className="ck">
                <Icon icon={Check} size={13} />
              </span>
              <div>
                <b>Sent. You’ll hear back here.</b>
              </div>
            </div>
          )}
          {stage === 'undone' && (
            <div className="receipt undone" role="status">
              <div>
                <b>Undone. Nothing was sent.</b>
                <span className="sub">You can ask again any time.</span>
              </div>
            </div>
          )}
          {stage === 'cancelled' && <p className="cxl">Cancelled. Nothing was sent.</p>}
        </section>
      )}
    </div>
  );
}
