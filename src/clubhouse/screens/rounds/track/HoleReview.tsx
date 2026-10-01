'use client';

import type { Dispatch } from 'react';
import { ArrowRight, Pencil, TriangleAlert, Undo2 } from 'lucide-react';
import type { ShotAction } from '@/hooks/golf/use-shot-state-machine';
import type { DistancePreference } from '@/lib/golf/distance-units';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import { haptic } from '../../../lib/haptics';
import { isOffline } from '../../../lib/use-action';
import { Icon } from '../../../ui/Icon';
import { shotLine, shotTitle } from './labels';
import { lieClass } from './parts';
import { UndoConfirm } from './ShotEntry';

/**
 * A holed-out hole (board "Shot review"): every stroke, tap one to change it.
 * The round screen moves on by itself once the hole is saved, so this shows
 * while the hole saves (CH-11402), when the save failed (CH-11003, with Retry)
 * and when the player goes back to a finished hole (then "Back to hole N").
 */
export function HoleReview({
  hole,
  shots,
  pref,
  checkpointStatus,
  backTo,
  showUndoConfirm,
  undoSaving,
  undoError,
  dispatch,
  onEditShot,
  onNavigateToHole,
  onRetryCheckpoint,
  onUndoLastShot,
}: {
  hole: RoundHole;
  shots: ShotRecord[];
  pref: DistancePreference;
  checkpointStatus: 'idle' | 'saving' | 'failed';
  /** The next unplayed hole, when the player is looking back at a finished one. */
  backTo: { index: number; number: number } | null;
  showUndoConfirm: boolean;
  undoSaving: boolean;
  undoError: string | null;
  dispatch: Dispatch<ShotAction>;
  onEditShot: (shot: ShotRecord) => void;
  onNavigateToHole: (index: number) => void;
  onRetryCheckpoint: () => void;
  onUndoLastShot: () => void;
}) {
  const saving = checkpointStatus === 'saving';
  return (
    <section className="ch-rt-panel ch-rt-review" aria-label={`Hole ${hole.number} shots`}>
      <div className="ch-rt-review__h">
        <b>Shot review</b>
        <span>Tap a shot to change it</span>
      </div>
      {saving && (
        <p className="ch-rt-note ch-rt-note--flat" role="status" data-ch-code="CH-11402">
          <span className="ch-rt-spin" aria-hidden="true" />
          <span>Saving hole {hole.number}…</span>
        </p>
      )}
      {checkpointStatus === 'failed' && (
        <div className="ch-rt-note is-danger ch-rt-note--flat" role="alert" data-ch-code="CH-11003">
          <Icon icon={TriangleAlert} size={15} />
          <span>
            <b>Hole {hole.number} didn&rsquo;t save.</b> Your shots are kept on this device. {isOffline() ? 'Reconnect, then try again.' : 'Try again to move on.'}
          </span>
          <button
            type="button"
            className="ch-btn ch-btn--secondary ch-btn--sm"
            onClick={() => {
              if (isOffline()) {
                // CH-1905's rule: a retry while offline would fail the same way.
                haptic('warning');
                return;
              }
              onRetryCheckpoint();
            }}
          >
            <span>Try again</span>
          </button>
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
      <div className="ch-rt-review__f">
        <button type="button" className="ch-btn ch-btn--ghost" disabled={saving || undoSaving} onClick={() => dispatch({ type: 'SHOW_UNDO_CONFIRM' })}>
          <Icon icon={Undo2} size={15} />
          <span>Undo last shot</span>
        </button>
        {backTo && (
          <button type="button" className="ch-btn ch-btn--primary ch-btn--lg" disabled={saving} onClick={() => onNavigateToHole(backTo.index)}>
            <span>Back to hole {backTo.number}</span>
            <Icon icon={ArrowRight} size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
