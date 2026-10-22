'use client';

import { createContext, useContext, useId, useState } from 'react';
import { CORRECTION_REASONS, SNOOZE_CHECKPOINTS, type CorrectionKind, type CorrectionReason } from '@/lib/coachhelm/v3/corrections/types';
import type { ChCorrectionAnswer, ChCorrections } from '../../data/coachhelm-engine-shape';
import { haptic } from '../../lib/haptics';
import { LIVE_CORRECTION_WRITES, type ChCorrectionWrites } from './writes';

/**
 * The correction chips under a read's audit (03 §7.2; flag `coachhelm_corrections_v1`): Not this (with a reason), Wrong cause,
 * Already on it, Show later and Good read for the player's coach, Not this and Good read for the player on their own read (the
 * kinds `recordCoachHelmCorrection` takes from each). Drawn only when the loader put `engine.corrections` on the card.
 *
 * A tap shows its answer at once and rolls it back if the save fails. The action is append-only, so there is no Undo: Change
 * opens the chips again and the next answer is a new correction, the one that counts. "Not available" (the flag went off, or
 * the HELD table is not there) takes the chips away without a word, since nothing was saved and nothing failed.
 */

const CorrectionWritesContext = createContext<ChCorrectionWrites>(LIVE_CORRECTION_WRITES);

/** Preview and tests hand the chips their own writes. */
export const CorrectionWritesProvider = CorrectionWritesContext.Provider;

export const CORRECTION_LABEL: Record<CorrectionKind, string> = {
  not_this: 'Not this',
  wrong_cause: 'Wrong cause',
  already_on_it: 'Already on it',
  snooze: 'Show later',
  confirm: 'Good read',
};

/** What each chip does, for its accessible name. */
const ARIA: Record<CorrectionKind, string> = {
  not_this: 'Not this: say why this read is off',
  wrong_cause: 'Wrong cause: the number is right, the cause is not',
  already_on_it: 'Already on it: you are working on this already',
  snooze: `Show later: hide this read for ${SNOOZE_CHECKPOINTS} rounds`,
  confirm: 'Good read: this read is right',
};

const REASON: Record<CorrectionReason, string> = {
  wrong: 'It’s wrong',
  not_important: 'Not important',
  already_know: 'Already known',
};

/** The quiet line an answer leaves: "Your answer: Not this, not important." */
export function answerLine(a: ChCorrectionAnswer): string {
  const reason = a.kind === 'not_this' && a.reason ? `, ${REASON[a.reason].toLowerCase()}` : '';
  return `Your answer: ${CORRECTION_LABEL[a.kind]}${reason}.`;
}

const FAILED = 'That answer didn’t save. Try again.';

/**
 * `held` is the parent's Show later state (rounds left, or null when the read is shown) and `onHeld` sets it, so a Show later tap
 * hides the read at once and a failed save brings it back as it was.
 */
export function CorrectionChips({ c, held = null, onHeld, code = 'CH-13970' }: { c: ChCorrections; held?: number | null; onHeld?: (rounds: number | null) => void; code?: string }) {
  const writes = useContext(CorrectionWritesContext);
  const id = useId();
  const [answer, setAnswer] = useState<ChCorrectionAnswer | null>(c.latest);
  const [changing, setChanging] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [saving, setSaving] = useState(false);
  if (gone) return null;

  const record = async (kind: CorrectionKind, reason: CorrectionReason | null) => {
    if (saving) return;
    const before = answer;
    const heldBefore = held;
    // Optimistic: the answer shows now; Show later hides the read now, and any other answer shows a held read again.
    setAnswer({ kind, reason });
    setChanging(false);
    setPicking(false);
    setError(null);
    setSaving(true);
    onHeld?.(kind === 'snooze' ? SNOOZE_CHECKPOINTS : null);
    let status: 'recorded' | 'not_available' | 'failed';
    try {
      const res = await writes.record({ insightId: c.insightId, kind, reason });
      status = res.status === 'recorded' || res.status === 'not_available' ? res.status : 'failed';
    } catch {
      status = 'failed';
    }
    setSaving(false);
    if (status === 'recorded') {
      haptic('success');
      return;
    }
    // Nothing was saved: put back what was there. Not available draws the read and takes the chips away.
    setAnswer(before);
    if (status === 'not_available') {
      onHeld?.(null);
      setGone(true);
      return;
    }
    onHeld?.(heldBefore);
    haptic('error');
    setError(FAILED);
  };

  if (answer && !changing) {
    return (
      <div className="ch-hl-cx is-done" data-ch-code="CH-13971">
        <p className="ch-hl-cx__done" role="status">
          {answerLine(answer)}
        </p>
        <button
          type="button"
          className="ch-hl-cx__chg"
          aria-label="Change your answer on this read"
          disabled={saving}
          onClick={() => {
            haptic('select');
            setChanging(true);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="ch-hl-cx" data-ch-code={code}>
      <p className="ch-hl-cx__k" id={`${id}-k`}>
        Is this read right?
      </p>
      <div className="ch-hl-cx__chips" role="group" aria-labelledby={`${id}-k`}>
        {c.kinds.map((k) => (
          <button
            key={k}
            type="button"
            className={'ch-hl-cx__c' + (k === 'not_this' && picking ? ' is-on' : '')}
            aria-label={ARIA[k]}
            aria-expanded={k === 'not_this' ? picking : undefined}
            aria-controls={k === 'not_this' ? `${id}-why` : undefined}
            disabled={saving}
            onClick={() => {
              if (k !== 'not_this') return void record(k, null);
              haptic('select');
              setPicking((v) => !v);
            }}
          >
            {CORRECTION_LABEL[k]}
          </button>
        ))}
      </div>
      <div id={`${id}-why`} className="ch-hl-cx__why" role="group" aria-label="Why not this read" hidden={!picking}>
        {CORRECTION_REASONS.map((r) => (
          <button key={r} type="button" className="ch-hl-cx__c is-reason" aria-label={`Not this: ${REASON[r].toLowerCase()}`} onClick={() => void record('not_this', r)}>
            {REASON[r]}
          </button>
        ))}
        <button type="button" className="ch-hl-cx__chg" aria-label="Not this, with no reason" onClick={() => void record('not_this', null)}>
          No reason
        </button>
      </div>
      {error && (
        <p className="ch-hl-cx__err" role="alert">
          {error}
        </p>
      )}
      {changing && (
        <button type="button" className="ch-hl-cx__chg" aria-label="Keep your answer on this read" onClick={() => setChanging(false)}>
          Keep my answer
        </button>
      )}
    </div>
  );
}

/** A read the coach held back with Show later: when it comes back (03 §7.2, two checkpoints, each a round posted). */
export function ReadLater({ rounds, code = 'CH-13972' }: { rounds: number; code?: string }) {
  return (
    <p className="ch-hl-later" role="note" data-ch-code={code}>
      Held back for now. It comes back after <span className="ch-num">{rounds}</span> more {rounds === 1 ? 'round is' : 'rounds are'} posted.
    </p>
  );
}
