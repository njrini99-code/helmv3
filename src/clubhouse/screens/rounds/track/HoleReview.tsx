'use client';

import type { Dispatch } from 'react';
import { Pencil, TriangleAlert } from 'lucide-react';
import type { ShotAction } from '@/hooks/golf/use-shot-state-machine';
import type { DistancePreference } from '@/lib/golf/distance-units';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import { haptic } from '../../../lib/haptics';
import { isOffline } from '../../../lib/use-action';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Spinner } from '../../../ui/Spinner';
import { shotLine, shotTitle } from './labels';
import { lieClass } from './parts';
import { UndoConfirm } from './ShotEntry';

/**
 * A holed-out hole (board "Shot review"): every stroke, tap one to change it.
 * The round screen moves on by itself once the hole is saved, so this shows
 * while the hole saves (CH-11402), when the save failed (CH-11003, with Retry)
 * and when the player goes back to a finished hole. It stands in the shot
 * card, where the shot was, and its actions are the bar's keys under the card
 * (ShotEntry): Undo, then "Back to hole N" or, once every hole is in, "Review
 * and post" (CH-11910) in Next shot's place, in the thumb zone. The card and
 * the bar stay where they are as the hole is holed (owner, 2026-11-11).
 */
export function HoleReview({
  hole,
  shots,
  pref,
  checkpointStatus,
  showUndoConfirm,
  undoSaving,
  undoError,
  dispatch,
  onEditShot,
  onRetryCheckpoint,
  onUndoLastShot,
}: {
  hole: RoundHole;
  shots: ShotRecord[];
  pref: DistancePreference;
  checkpointStatus: 'idle' | 'saving' | 'failed';
  showUndoConfirm: boolean;
  undoSaving: boolean;
  undoError: string | null;
  dispatch: Dispatch<ShotAction>;
  onEditShot: (shot: ShotRecord) => void;
  onRetryCheckpoint: () => void;
  onUndoLastShot: () => void;
}) {
  const saving = checkpointStatus === 'saving';
  return (
    <section className="ch-rt-review" aria-label={`Hole ${hole.number} shots`}>
      <div className="ch-rt-review__h">
        <b>Shot review</b>
        <span>Tap a shot to change it</span>
      </div>
      {saving && (
        <p className="ch-rt-note ch-rt-note--flat is-saving" role="status" data-ch-code="CH-11402">
          <Spinner />
          <span>Saving hole {hole.number}…</span>
        </p>
      )}
      {checkpointStatus === 'failed' && (
        <div className="ch-rt-note is-danger ch-rt-note--flat" role="alert" data-ch-code="CH-11003">
          <Icon icon={TriangleAlert} size={15} />
          <span>
            <b>Hole {hole.number} didn&rsquo;t save.</b> Your shots are kept on this device. {isOffline() ? 'Reconnect, then try again.' : 'Try again to move on.'}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (isOffline()) {
                // CH-1905's rule: a retry while offline would fail the same way.
                haptic('warning');
                return;
              }
              onRetryCheckpoint();
            }}
          >
            Try again
          </Button>
        </div>
      )}
      <ol className="ch-rt-rs-list">
        {shots.map((s, i) => (
          <li key={s.id ?? `${s.shotNumber}-${i}`}>
            <button type="button" className="ch-rt-rs" disabled={saving} aria-label={`Change shot ${s.shotNumber}: ${shotTitle(s)}, ${shotLine(s, pref)}`} onClick={() => onEditShot(s)}>
              <span className={'ch-rt-rs__n ' + lieClass(s)} aria-hidden="true">
                {s.isPenalty ? 'P' : s.shotNumber}
              </span>
              <span className="ch-rt-rs__b">
                <b>{shotTitle(s)}</b>
                <span>{shotLine(s, pref)}</span>
              </span>
              <Icon icon={Pencil} size={14} />
            </button>
          </li>
        ))}
      </ol>
      {showUndoConfirm && <UndoConfirm shots={shots} saving={undoSaving} error={undoError} dispatch={dispatch} onUndo={onUndoLastShot} />}
    </section>
  );
}
