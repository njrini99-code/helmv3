'use client';

import { useState, type Dispatch } from 'react';
import { FlagTriangleRight, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import type { EditFormData, PenaltyOrigin, ShotAction } from '@/hooks/golf/use-shot-state-machine';
import type { DistancePreference } from '@/lib/golf/distance-units';
import type { RoundEntryIssue } from '@/lib/golf/round-entry-validation';
import { editedShotIssues, editResultUpdates, togglePuttMissTag, type EditShotHoleContext } from '@/lib/golf/shot-entry-rules';
import type { ShotRecord } from '@/lib/types/golf';
import type { LieType } from '@/lib/utils/shot-helpers';
import { haptic } from '../../../lib/haptics';
import { Icon } from '../../../ui/Icon';
import { Modal } from '../../../ui/Modal';
import { APPROACH_GRID, BREAK_OPTIONS, distanceText, PENALTY_OPTIONS, PUTT_TAGS, RESULT_LABEL, SLOPE_OPTIONS, shotTitle } from './labels';
import { Seg } from './parts';

const STROKE_AND_DISTANCE = new Set(['ob', 'lost']);
const LIES: LieType[] = ['tee', 'fairway', 'rough', 'sand', 'green', 'other'];
const LIE_LABEL: Record<LieType, string> = { tee: 'Tee', fairway: 'Fairway', rough: 'Rough', sand: 'Sand', green: 'Green', other: 'Other' };
const EDIT_RESULTS = ['fairway', 'rough', 'sand', 'green', 'hole', 'other'] as const;

/** A radio row: a dot, a title and its line. */
function Choice({ checked, title, detail, onPick }: { checked: boolean; title: string; detail?: string; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className="ch-rt-opt"
      onClick={() => {
        haptic('select');
        onPick();
      }}
    >
      <span className="ch-rt-radio" aria-hidden="true" />
      <span>
        <b>{title}</b>
        {detail && <em>{detail}</em>}
      </span>
    </button>
  );
}

/**
 * CH-11503: add a penalty stroke. The four penalties with what each means;
 * for stroke and distance (out of bounds, lost ball) it asks which stroke went:
 * the last one entered, or one hit from here and not entered yet (recorded
 * with the penalty, so the card is never a stroke short). usePenaltyHandler
 * builds the records.
 */
export function PenaltySheet({
  open,
  holeNumber,
  penaltyType,
  penaltyOrigin,
  lastEnteredShot,
  currentLie,
  currentDistance,
  currentUnit,
  pref,
  dispatch,
  onConfirm,
}: {
  open: boolean;
  holeNumber: number;
  penaltyType: string | null;
  penaltyOrigin: PenaltyOrigin;
  lastEnteredShot: ShotRecord | null;
  currentLie: LieType;
  currentDistance: number;
  currentUnit: 'yards' | 'feet';
  pref: DistancePreference;
  dispatch: Dispatch<ShotAction>;
  onConfirm: () => void;
}) {
  const close = () => dispatch({ type: 'CLOSE_PENALTY_MODAL' });
  const askOrigin = !!penaltyType && STROKE_AND_DISTANCE.has(penaltyType);
  const entered = lastEnteredShot && !lastEnteredShot.isPenalty ? lastEnteredShot : null;
  const spot = (lie: string, d: number, u: 'yards' | 'feet') => `${LIE_LABEL[lie as LieType] ?? lie} · ${distanceText(d, u, pref)}`;
  return (
    <Modal
      open={open}
      onClose={close}
      title="Add a penalty stroke"
      description={`Hole ${holeNumber}`}
      icon={FlagTriangleRight}
      code="CH-11503"
      footer={
        <>
          <button type="button" className="ch-btn ch-btn--ghost" onClick={close}>
            <span>Cancel</span>
          </button>
          <button type="button" className="ch-btn ch-btn--primary" disabled={!penaltyType} onClick={onConfirm}>
            <span>Add 1 stroke</span>
          </button>
        </>
      }
    >
      <div className="ch-rt-opts" role="radiogroup" aria-label="Penalty">
        {PENALTY_OPTIONS.map(([v, title, detail]) => (
          <Choice key={v} checked={penaltyType === v} title={title} detail={detail} onPick={() => dispatch({ type: 'SET_PENALTY_TYPE', payload: v })} />
        ))}
      </div>
      {askOrigin && (
        <div className="ch-rt-opts" role="radiogroup" aria-label="Which stroke went out">
          <p className="ch-rt-opts__k">Which stroke</p>
          <Choice
            checked={penaltyOrigin === 'here' || !entered}
            title="My next shot from here"
            detail={`Not entered yet · from ${spot(currentLie, currentDistance, currentUnit)}`}
            onPick={() => dispatch({ type: 'SET_PENALTY_ORIGIN', payload: 'here' })}
          />
          {entered && (
            <Choice
              checked={penaltyOrigin === 'entered'}
              title={`Shot ${entered.shotNumber} that I entered`}
              detail={`Replay from ${spot(entered.lieBefore, entered.distanceToHoleBefore, entered.distanceUnitBefore)}`}
              onPick={() => dispatch({ type: 'SET_PENALTY_ORIGIN', payload: 'entered' })}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

/** CH-11504: going to another hole with a result chosen but not recorded asks first. */
export function UnsavedSheet({ open, onStay, onDiscard }: { open: boolean; onStay: () => void; onDiscard: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onStay}
      title="Leave this shot?"
      description="You picked a result but haven’t recorded the shot. Leaving drops it."
      icon={TriangleAlert}
      code="CH-11504"
      footer={
        <>
          <button type="button" className="ch-btn ch-btn--ghost" onClick={onStay}>
            <span>Stay</span>
          </button>
          <button
            type="button"
            className="ch-btn ch-btn--danger"
            onClick={() => {
              haptic('warning');
              onDiscard();
            }}
          >
            <span>Leave without it</span>
          </button>
        </>
      }
    />
  );
}

/**
 * CH-11505: change or delete a recorded shot (the Fairway edit modal's
 * fields and rules, in stored units). Save runs the shared shot rules: a
 * block says why and disables Save; a warning shows once and Save becomes
 * "Save anyway" (CH-11105). Delete asks first. A failed save or delete keeps
 * the sheet open with the reason (CH-11004).
 */
export function EditShotSheet({
  open,
  shot,
  form,
  hole,
  shots,
  showDeleteConfirm,
  saving,
  error,
  dispatch,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  shot: ShotRecord;
  form: EditFormData;
  hole: EditShotHoleContext;
  shots: ShotRecord[];
  showDeleteConfirm: boolean;
  saving: boolean;
  error: string | null;
  dispatch: Dispatch<ShotAction>;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [issue, setIssue] = useState<RoundEntryIssue | null>(null);
  const [checked, setChecked] = useState(form);
  if (checked !== form) {
    // Any change re-arms the check.
    setChecked(form);
    if (issue) setIssue(null);
  }
  const update = (u: Partial<EditFormData>) => dispatch({ type: 'SET_EDIT_FORM_DATA', payload: { ...form, ...u } });
  const save = () => {
    const issues = editedShotIssues(form, shot, hole, shots);
    const block = issues.find((i) => i.severity === 'block');
    if (block) return setIssue(block);
    const confirm = issues.find((i) => i.severity === 'confirm');
    if (confirm && issue?.message !== confirm.message) return setIssue(confirm);
    setIssue(null);
    onSave();
  };
  const approach = shot.shotType === 'approach' || shot.shotType === 'around_green';
  const unit = (u: 'yards' | 'feet') => (u === 'feet' ? 'ft' : 'yds');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Change shot ${shot.shotNumber}`}
      description={`Hole ${hole.holeNumber} · ${shotTitle(shot)}`}
      icon={Pencil}
      code="CH-11505"
      footer={
        showDeleteConfirm ? (
          <>
            <button type="button" className="ch-btn ch-btn--ghost" disabled={saving} onClick={() => dispatch({ type: 'HIDE_DELETE_CONFIRM' })}>
              <span>Keep it</span>
            </button>
            <button
              type="button"
              className="ch-btn ch-btn--danger"
              disabled={saving}
              onClick={() => {
                // CH-11707: deleting a shot is a warning.
                haptic('warning');
                onDelete();
              }}
            >
              <span>{saving ? 'Deleting…' : 'Delete shot'}</span>
            </button>
          </>
        ) : (
          <>
            <button type="button" className="ch-btn ch-btn--ghost ch-rt-danger" disabled={saving} onClick={() => dispatch({ type: 'SHOW_DELETE_CONFIRM' })}>
              <Icon icon={Trash2} size={15} />
              <span>Delete</span>
            </button>
            <span className="ch-rt-grow" />
            <button type="button" className="ch-btn ch-btn--ghost" disabled={saving} onClick={onClose}>
              <span>Cancel</span>
            </button>
            <button type="button" className="ch-btn ch-btn--primary" disabled={saving || issue?.severity === 'block'} onClick={save}>
              <span>{saving ? 'Saving…' : issue?.severity === 'confirm' ? 'Save anyway' : 'Save shot'}</span>
            </button>
          </>
        )
      }
    >
      {error && (
        <p className="ch-rt-note is-danger" role="alert" data-ch-code="CH-11004">
          <Icon icon={TriangleAlert} size={15} />
          <span>
            <b>Couldn&rsquo;t save the change.</b> {error}
          </span>
        </p>
      )}
      {issue && !showDeleteConfirm && (
        <p className={'ch-rt-note ' + (issue.severity === 'block' ? 'is-danger' : 'is-warn')} role="alert" data-ch-code="CH-11105">
          <Icon icon={TriangleAlert} size={15} />
          <span>{issue.message}</span>
        </p>
      )}
      {showDeleteConfirm ? (
        <p className="ch-rt-delq">Delete shot {shot.shotNumber}? The hole&rsquo;s score changes with it. This can&rsquo;t be undone.</p>
      ) : form.isPenalty ? (
        <div className="ch-rt-opts" role="radiogroup" aria-label="Penalty">
          {PENALTY_OPTIONS.map(([v, title]) => (
            <Choice key={v} checked={form.penaltyType === v} title={title} onPick={() => update({ penaltyType: v })} />
          ))}
        </div>
      ) : (
        <div className="ch-rt-edit">
          {shot.shotType === 'tee' && (
            <div className="ch-rt-sub">
              <em>Club</em>
              <Seg
                label="Club"
                value={form.clubType === 'driver' ? 'driver' : 'non_driver'}
                onChange={(v) => update({ clubType: v })}
                options={[
                  { value: 'driver', label: 'Driver' },
                  { value: 'non_driver', label: 'Non-driver' },
                ]}
              />
            </div>
          )}
          <div className="ch-rt-sub">
            <em>Lie before</em>
            <Seg
              label="Lie before"
              cols={3}
              value={form.lieBefore}
              onChange={(v) => update({ lieBefore: v, distanceUnitBefore: v === 'green' ? 'feet' : 'yards' })}
              options={LIES.map((l) => ({ value: l, label: LIE_LABEL[l] }))}
            />
          </div>
          <div className="ch-rt-sub">
            <label htmlFor="ch-rt-edit-before">Distance before</label>
            <div className="ch-rt-dist">
              <input id="ch-rt-edit-before" type="text" inputMode="numeric" autoComplete="off" value={form.distanceToHoleBefore} onChange={(e) => update({ distanceToHoleBefore: e.target.value })} />
              <em>{unit(form.distanceUnitBefore)}</em>
            </div>
          </div>
          <div className="ch-rt-sub">
            <em>Result</em>
            <Seg
              label="Result"
              cols={3}
              value={form.result}
              onChange={(r) => update(editResultUpdates(r, shot.shotType))}
              options={EDIT_RESULTS.map((r) => ({ value: r, label: RESULT_LABEL[r], note: r === 'green' ? 'not fringe' : null }))}
            />
          </div>
          {form.result !== 'hole' && (
            <div className="ch-rt-sub">
              <label htmlFor="ch-rt-edit-after">Distance after</label>
              <div className="ch-rt-dist">
                <input id="ch-rt-edit-after" type="text" inputMode="numeric" autoComplete="off" value={form.distanceToHoleAfter} onChange={(e) => update({ distanceToHoleAfter: e.target.value })} />
                <em>{unit(form.distanceUnitAfter)}</em>
              </div>
            </div>
          )}
          {shot.shotType === 'tee' && form.result !== 'hole' && form.result !== 'green' && (
            <div className="ch-rt-sub">
              <em>Miss direction</em>
              <Seg
                label="Miss direction"
                value={form.missDirection as 'left' | 'right' | null}
                onChange={(v) => update({ missDirection: form.missDirection === v ? null : v })}
                options={[
                  { value: 'left', label: '← Left' },
                  { value: 'right', label: 'Right →' },
                ]}
              />
            </div>
          )}
          {approach && form.result !== 'hole' && form.result !== 'green' && (
            <div className="ch-rt-sub">
              <em>Where it missed the green</em>
              <div className="ch-rt-amiss" role="radiogroup" aria-label="Where it missed the green">
                {APPROACH_GRID.map(([v, l]) =>
                  v === null ? (
                    <span key="green" className="ch-rt-amiss__g" aria-hidden="true">
                      <i />
                    </span>
                  ) : (
                    <button key={v} type="button" role="radio" aria-checked={form.approachMissDirection === v} onClick={() => update({ approachMissDirection: v })}>
                      {l}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
          {shot.shotType === 'putting' && (
            <>
              <div className="ch-rt-sub">
                <em>Break</em>
                <Seg label="Putt break" value={form.puttBreak} onChange={(v) => update({ puttBreak: v })} options={BREAK_OPTIONS.map(([value, label]) => ({ value, label }))} />
              </div>
              <div className="ch-rt-sub">
                <em>Slope</em>
                <Seg label="Putt slope" value={form.puttSlope} onChange={(v) => update({ puttSlope: v })} options={SLOPE_OPTIONS.map(([value, label]) => ({ value, label }))} />
              </div>
              {form.result !== 'hole' && (
                <div className="ch-rt-sub">
                  <em>What happened</em>
                  <div className="ch-rt-tags" role="group" aria-label="How the putt missed">
                    {PUTT_TAGS.map(([tag, label]) => (
                      <button key={tag} type="button" aria-pressed={form.puttMissTags.includes(tag)} onClick={() => update({ puttMissTags: togglePuttMissTag(form.puttMissTags, tag) })}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
