'use client';

import { useState } from 'react';
import { ArrowRight, Bookmark, Check, CirclePlay, Send, Table2, Trash2, TriangleAlert } from 'lucide-react';
import { formatToPar, NO_DATA } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { Icon } from '../../../ui/Icon';
import { Modal } from '../../../ui/Modal';
import { ScoreMark } from '../../../ui/ScoreMark';

/**
 * The round's own sheets, around the shot screen: Exit (save for later, keep
 * playing, discard), the scorecard, the finished round and its submit. The
 * round screen owns them, because it owns the round (RoundTracking only
 * scores the current hole); each is driven by props.
 */

/** A hole on the scorecard: its score and putts once holed. */
export interface ChCardHole {
  number: number;
  par: number;
  score: number | null;
  putts: number | null;
}

/** One nine of the scorecard, with totals of what's scored so far. The current hole is marked. */
function CardNine({ label, holes, current }: { label: 'Out' | 'In'; holes: ChCardHole[]; current: number | null }) {
  if (!holes.length) return null;
  const scored = holes.filter((h) => h.score != null);
  const par = holes.reduce((s, h) => s + h.par, 0);
  const score = scored.reduce((s, h) => s + (h.score ?? 0), 0);
  const putts = scored.reduce((s, h) => s + (h.putts ?? 0), 0);
  return (
    <table className="ch-rt-mc ch-num">
      <caption className="ch-sr-only">{`${label === 'Out' ? 'Front' : 'Back'} nine: par, score and putts by hole`}</caption>
      <thead>
        <tr>
          <th scope="col">{label}</th>
          {holes.map((h) => (
            <th key={h.number} scope="col" className={h.number === current ? 'is-cur' : undefined} aria-current={h.number === current ? 'step' : undefined}>
              {h.number}
            </th>
          ))}
          <th scope="col">Tot</th>
        </tr>
      </thead>
      <tbody>
        <tr className="is-p">
          <th scope="row">Par</th>
          {holes.map((h) => (
            <td key={h.number}>{h.par}</td>
          ))}
          <td>{par}</td>
        </tr>
        <tr>
          <th scope="row">Score</th>
          {holes.map((h) => (
            <td key={h.number}>{h.score != null ? <ScoreMark score={h.score} par={h.par} size="sm" /> : NO_DATA}</td>
          ))}
          <td>
            <b>{scored.length ? score : NO_DATA}</b>
          </td>
        </tr>
        <tr className="is-p">
          <th scope="row">Putts</th>
          {holes.map((h) => (
            <td key={h.number}>{h.putts ?? NO_DATA}</td>
          ))}
          <td>{scored.length ? putts : NO_DATA}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function Scorecard({ holes, current }: { holes: ChCardHole[]; current: number | null }) {
  // It scrolls sideways on a phone, so it takes focus for the arrow keys (axe scrollable-region-focusable).
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- axe scrollable-region-focusable: a keyboard user must reach a region that scrolls
    <div className="ch-rt-mcw" tabIndex={0} role="region" aria-label="Scorecard">
      <CardNine label="Out" holes={holes.slice(0, 9)} current={current} />
      <CardNine label="In" holes={holes.slice(9, 18)} current={current} />
    </div>
  );
}

/** CH-11509: the scorecard, from the top bar. */
export function ScorecardSheet({ open, onClose, course, tee, holes, current }: { open: boolean; onClose: () => void; course: string; tee: string | null; holes: ChCardHole[]; current: number }) {
  const thru = holes.filter((h) => h.score != null).length;
  return (
    <Modal open={open} onClose={onClose} title="Scorecard" description={[course, tee, `thru ${thru}`].filter(Boolean).join(' · ')} icon={Table2} width={760} code="CH-11509">
      <Scorecard holes={holes} current={current} />
    </Modal>
  );
}

/**
 * CH-11506: Exit. Save for later goes back to Rounds, where the round waits
 * to be continued; Keep playing closes; Discard asks again before it deletes
 * every shot (CH-11507). A failed discard keeps the sheet with the reason.
 */
export function ExitSheet({
  open,
  course,
  holes,
  currentNumber,
  discarding,
  saving = false,
  discardError,
  onSave,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  course: string;
  holes: ChCardHole[];
  currentNumber: number;
  discarding: boolean;
  /** Save for later is writing the round (R-12: it shows, and the sheet can't be dismissed under it). */
  saving?: boolean;
  discardError: string | null;
  onSave: () => void;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const done = holes.filter((h) => h.score != null);
  const toPar = done.reduce((s, h) => s + (h.score ?? 0) - h.par, 0);
  const busy = discarding || saving;
  const keep = () => {
    setConfirm(false);
    onKeep();
  };
  return (
    // R-12: Escape or the backdrop can't close the sheet while a discard or save is in flight.
    <Modal open={open} onClose={busy ? () => {} : keep} title="Exit round" code="CH-11506">
      <div className="ch-rt-exitc">
        <span className="ch-rt-exitc__n">
          <b>{done.length}</b>
          <em>of {holes.length}</em>
        </span>
        <div>
          <b>Round in progress</b>
          <span>
            {course} · thru {done.length}
            {done.length ? ` · ${formatToPar(toPar)}` : ''}
          </span>
          <i className="ch-rt-exitc__bar" aria-hidden="true">
            <i style={{ width: `${(done.length / Math.max(1, holes.length)) * 100}%` }} />
          </i>
        </div>
      </div>
      {confirm ? (
        <div className="ch-rt-confirm ch-rt-confirm--danger" role="group" aria-label="Discard this round" data-ch-code="CH-11507">
          <div>
            <b>Discard this round?</b>
            <span>It deletes every shot you entered at {course}. This can&rsquo;t be undone.</span>
            {discardError && (
              <span className="ch-rt-error" role="alert" data-ch-code="CH-11006">
                Couldn&rsquo;t discard the round. {discardError}
              </span>
            )}
          </div>
          <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm" disabled={discarding} onClick={() => setConfirm(false)}>
            <span>Keep it</span>
          </button>
          <button
            type="button"
            className="ch-btn ch-btn--danger ch-btn--sm"
            disabled={discarding}
            onClick={() => {
              haptic('warning');
              onDiscard();
            }}
          >
            <span>{discarding ? 'Discarding…' : 'Discard round'}</span>
          </button>
        </div>
      ) : (
        <div className="ch-rt-exit__opts">
          <button type="button" className="ch-rt-xopt is-primary" disabled={busy} onClick={onSave}>
            <Icon icon={Bookmark} size={18} />
            <span>
              <b>{saving ? 'Saving…' : 'Save for later'}</b>
              <em>{saving ? 'Keep this screen open.' : 'Continue it from Rounds.'}</em>
            </span>
          </button>
          <button type="button" className="ch-rt-xopt" disabled={busy} onClick={keep}>
            <Icon icon={CirclePlay} size={18} />
            <span>
              <b>Keep playing</b>
              <em>Back to hole {currentNumber}</em>
            </span>
          </button>
          <button type="button" className="ch-rt-xopt is-danger" onClick={() => setConfirm(true)}>
            <Icon icon={Trash2} size={18} />
            <span>
              <b>Discard round</b>
              <em>Deletes every shot. You&rsquo;ll be asked first.</em>
            </span>
          </button>
        </div>
      )}
    </Modal>
  );
}

/** A finished hole for the summary: its fairway (null on a par 3) and green in regulation. */
export interface ChSummaryHole extends ChCardHole {
  fairwayHit: boolean | null;
  gir: boolean;
}

/**
 * CH-11508: the round is complete. The figures (putts, fairways, greens,
 * front and back), the card, and Submit. Back returns to the last hole.
 */
export function RoundCompleteSheet({
  open,
  heading,
  holes,
  onBack,
  onSubmit,
}: {
  open: boolean;
  /** "Finley GC · Blue · Oct 14". */
  heading: string;
  holes: ChSummaryHole[];
  onBack: () => void;
  onSubmit: () => void;
}) {
  const score = holes.reduce((s, h) => s + (h.score ?? 0), 0);
  const par = holes.reduce((s, h) => s + h.par, 0);
  const putts = holes.reduce((s, h) => s + (h.putts ?? 0), 0);
  const fwHoles = holes.filter((h) => h.fairwayHit !== null);
  const nine = (a: number, b: number) => holes.slice(a, b).reduce((s, h) => s + (h.score ?? 0), 0);
  const figs: Array<[string, string]> = [
    ['Putts', String(putts)],
    ['Fairways', `${fwHoles.filter((h) => h.fairwayHit).length}/${fwHoles.length}`],
    ['Greens', `${holes.filter((h) => h.gir).length}/${holes.length}`],
    ...(holes.length > 9 ? [['Front · Back', `${nine(0, 9)} · ${nine(9, 18)}`] as [string, string]] : []),
  ];
  return (
    <Modal
      open={open}
      onClose={onBack}
      title="Round complete"
      width={760}
      code="CH-11508"
      footer={
        <>
          <button type="button" className="ch-btn ch-btn--ghost" onClick={onBack}>
            <span>Back to hole {holes[holes.length - 1]?.number ?? ''}</span>
          </button>
          <button type="button" className="ch-btn ch-btn--primary ch-btn--lg" onClick={onSubmit}>
            <span>Submit round</span>
            <Icon icon={Send} size={16} />
          </button>
        </>
      }
    >
      <div className="ch-rt-sum">
        <div className="ch-rt-sum__hero">
          <span>{heading}</span>
          <b>{score}</b>
          <em className={score < par ? 'is-under' : undefined}>{formatToPar(score - par)}</em>
        </div>
        <dl className="ch-rt-sum__f">
          {figs.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <Scorecard holes={holes} current={null} />
      {/* R-11: no promise of edits the round review doesn't offer, or of a coach the player may not have. */}
      <p className="ch-rt-sum__n">Submitting posts this round to your stats.</p>
    </Modal>
  );
}

/**
 * CH-11603: submitting the round, over the screen. It names what is really
 * happening (the shot count) instead of timing fake steps (Q-72d); the spinner
 * stops with reduced motion. Posted: success, and the round's review (the round
 * screen opens it after a beat). Failed (CH-11005): the round stays saved on the
 * device, with Try again, and Go back to the finish sheet when the round screen
 * gives it a way (`onGoBack`), so a failure that retrying won't clear isn't a
 * dead end. Saving for over 15 seconds (CH-11909): `slowHref` says it is taking
 * longer and names a way out to Rounds, where the saved round waits.
 */
export function SubmitOverlay({
  state,
  course,
  shots,
  coach,
  reviewHref,
  error,
  onRetry,
  onGoBack,
  slowHref = null,
}: {
  state: 'saving' | 'done' | 'failed';
  course: string;
  shots: number;
  coach: string | null;
  reviewHref: string | null;
  error: string | null;
  onRetry: () => void;
  onGoBack?: () => void;
  slowHref?: string | null;
}) {
  const reduced = useChReducedMotion();
  return (
    <div className="ch-rt-scrim" data-ui="clubhouse">
      <div className="ch-rt-subm" role={state === 'failed' ? 'alert' : 'status'} aria-live="polite">
        {state === 'saving' && (
          <>
            <span className={'ch-rt-spin ch-rt-spin--lg' + (reduced ? ' is-still' : '')} aria-hidden="true" />
            <b>Submitting round</b>
            <span className="ch-rt-subm__m">Saving {shots} shots, updating your stats and writing the round recap. Keep this screen open.</span>
            {slowHref && (
              <span className="ch-rt-subm__m" data-ch-code="CH-11909">
                This is taking longer than usual. Your round is saved on this device, and it is waiting in{' '}
                <a href={slowHref}>Rounds</a>.
              </span>
            )}
          </>
        )}
        {state === 'done' && (
          <>
            <span className="ch-rt-subm__ok" aria-hidden="true">
              <Icon icon={Check} size={26} />
            </span>
            <b>Round posted</b>
            <span className="ch-rt-subm__m">
              Your round at {course} is posted.{coach ? ` ${coach} can see it now.` : ''}
            </span>
            {reviewHref && (
              <a className="ch-btn ch-btn--primary ch-btn--lg" href={reviewHref}>
                <span>View round review</span>
                <Icon icon={ArrowRight} size={16} />
              </a>
            )}
          </>
        )}
        {state === 'failed' && (
          <>
            <span className="ch-rt-subm__bad" aria-hidden="true">
              <Icon icon={TriangleAlert} size={24} />
            </span>
            <b data-ch-code="CH-11005">The round didn&rsquo;t submit</b>
            <span className="ch-rt-subm__m">{error ?? 'It’s saved on this device. Check your connection, then try again.'}</span>
            <button type="button" className="ch-btn ch-btn--primary ch-btn--lg" onClick={onRetry}>
              <span>Try again</span>
            </button>
            {onGoBack && (
              <button type="button" className="ch-btn ch-btn--ghost" onClick={onGoBack}>
                <span>Go back</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
