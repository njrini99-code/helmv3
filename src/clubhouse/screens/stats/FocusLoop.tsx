import type { ChFocusLoop } from '../../data/focus-loop-shape';

/**
 * A focus area's prescription and verdict loop (CoachHelm chs-11; supercharge 04 layout 5), drawn on the focus area itself: the
 * target, how far it has come, and the verdict word with both numbers and the regression line once the horizon is reached. Drawn
 * only when the loader put a loop on the area (`coachhelm_verdicts_v1` on and a prescription stamped); the word carries the state
 * and the pill's tone is decoration.
 */
export function FocusLoop({ loop }: { loop: ChFocusLoop | undefined }) {
  if (!loop) return null;
  return (
    <dl className="ch-dv-loop">
      {loop.target && (
        <div>
          <dt>Target</dt>
          <dd className="ch-num">{loop.target}</dd>
        </div>
      )}
      {loop.progress && (
        <div>
          <dt>Progress</dt>
          <dd className="ch-num">{loop.progress}</dd>
        </div>
      )}
      <div>
        <dt>Verdict</dt>
        <dd>
          <span className={'ch-dv-loop__w is-' + loop.tone}>{loop.word}</span>
          {loop.line && <span className="ch-dv-loop__l ch-num">{loop.line}</span>}
        </dd>
      </div>
    </dl>
  );
}
