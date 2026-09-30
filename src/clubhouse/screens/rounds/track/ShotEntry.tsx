'use client';

import { useState, type Dispatch, type RefObject } from 'react';
import { ArrowRight, Check, FlagTriangleRight, TriangleAlert, Undo2 } from 'lucide-react';
import type { ShotAction } from '@/hooks/golf/use-shot-state-machine';
import { displayToFeet, displayToYards, yardsToDisplay, type DistancePreference } from '@/lib/golf/distance-units';
import { lockedAfterUnit, nextShotBlocker, plausibilityKey, shotPlausibility, shotResultOptions, togglePuttMissTag, type ShotEntryInput, type ShotResult } from '@/lib/golf/shot-entry-rules';
import type { ApproachMissDirection, PuttMissTag, RoundHole, ShotRecord } from '@/lib/types/golf';
import { calculateShotDistanceWithDirection } from '@/lib/utils/shot-helpers';
import { haptic } from '../../../lib/haptics';
import { Icon } from '../../../ui/Icon';
import { APPROACH_GRID, BREAK_OPTIONS, PUTT_TAGS, quickPicks, RESULT_LABEL, SLOPE_OPTIONS, shotTitle } from './labels';
import { Sec, Seg } from './parts';

export interface ShotEntryProps {
  currentHole: RoundHole;
  currentShot: number;
  shotHistory: ShotRecord[];
  isTeeShot: boolean;
  isPutting: boolean;
  isApproachOrAroundGreen: boolean;
  usedDriver: boolean | null;
  resultOfShot: ShotRecord['result'] | null;
  missDirection: string | null;
  puttBreak: ShotRecord['puttBreak'] | null;
  puttSlope: ShotRecord['puttSlope'] | null;
  puttMissTags: PuttMissTag[];
  approachMissDirection: ApproachMissDirection | null;
  distanceToHole: number;
  distanceUnit: 'yards' | 'feet';
  distanceAfterShot: string;
  distanceAfterUnit: 'yards' | 'feet';
  undoSaving: boolean;
  showUndoConfirm: boolean;
  undoError: string | null;
  distanceInputRef: RefObject<HTMLInputElement | null>;
  dispatch: Dispatch<ShotAction>;
  pref: DistancePreference;
  /** isReadyForNextShot(), from useShotTracking. */
  ready: boolean;
  onResultSelect: (result: string) => void;
  onNextShot: () => void;
  onAddPenalty: () => void;
  onUndoLastShot: () => void;
}

const DIST_ID = 'ch-rt-dist';
const BLOCKER_ID = 'ch-rt-blocker';

/**
 * The live shot entry (board `rounds-track.jsx` panel), over the shared
 * engine: every value comes from useShotTracking and every change goes
 * through its handlers or the same actions the Fairway entry dispatches. The
 * gating is the shared rules (`shot-entry-rules`), so the hint above Next shot
 * can never disagree with it.
 */
export function ShotEntry(p: ShotEntryProps) {
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const meters = p.pref === 'meters';
  const result = p.resultOfShot === 'penalty' ? null : (p.resultOfShot as ShotResult | null);
  const input: ShotEntryInput = {
    hole: p.currentHole,
    currentShot: p.currentShot,
    shotHistory: p.shotHistory,
    isTeeShot: p.isTeeShot,
    isPutting: p.isPutting,
    isApproachOrAroundGreen: p.isApproachOrAroundGreen,
    usedDriver: p.usedDriver,
    result,
    missDirection: p.missDirection,
    approachMissDirection: p.approachMissDirection,
    puttMissTags: p.puttMissTags,
    distanceToHole: p.distanceToHole,
    distanceUnit: p.distanceUnit,
    distanceAfterShot: p.distanceAfterShot,
    distanceAfterUnit: p.distanceAfterUnit,
    distancePref: p.pref,
  };
  const issue = shotPlausibility(input, p.ready);
  const key = plausibilityKey(p.currentHole.number, p.currentShot, issue, p.resultOfShot, p.distanceAfterShot);
  const blocker = nextShotBlocker(input, p.ready, issue, key !== null && key === confirmedKey);
  const canRecord = blocker === null;

  const afterUnit = lockedAfterUnit(p.isPutting, result);
  const unitWord = meters ? 'm' : afterUnit === 'feet' ? 'ft' : 'yds';
  const distLabel = p.isPutting ? `Leave distance (${unitWord})` : result === 'green' ? `Proximity to hole (${unitWord})` : `Distance remaining (${unitWord})`;
  const parsed = parseFloat(p.distanceAfterShot);
  const distanceInvalid = !!p.distanceAfterShot && (!Number.isFinite(parsed) || parsed < 0);
  const holed = result === 'hole';
  const teeMiss = p.isTeeShot && !!result && ['rough', 'sand', 'other'].includes(result);
  const approachMiss = p.isApproachOrAroundGreen && !!result && !['green', 'hole'].includes(result);
  const puttMissed = p.isPutting && !!result && result !== 'hole';

  const shotYards = (() => {
    if (!p.distanceAfterShot || distanceInvalid || holed) return null;
    const raw = parsed || 0;
    const afterYards = meters ? (afterUnit === 'feet' ? displayToFeet(raw, 'meters') / 3 : displayToYards(raw, 'meters')) : afterUnit === 'feet' ? raw / 3 : raw;
    return Math.round(
      calculateShotDistanceWithDirection(
        p.distanceUnit === 'feet' ? p.distanceToHole / 3 : p.distanceToHole,
        afterYards,
        p.isApproachOrAroundGreen ? p.approachMissDirection || p.missDirection : p.missDirection,
      ),
    );
  })();

  // CH-11102 / CH-11103: a warning asks once (Confirm), a block says why; the confirmed state says so.
  const notice = issue ? (
    issue.severity === 'block' ? (
      <p className="ch-rt-note is-danger" role="alert" data-ch-code="CH-11103">
        <Icon icon={TriangleAlert} size={15} />
        <span>{issue.message}</span>
      </p>
    ) : key === confirmedKey ? (
      <p className="ch-rt-note" role="status" data-ch-code="CH-11102">
        <Icon icon={Check} size={15} />
        <span>Confirmed. Tap Next shot when ready.</span>
      </p>
    ) : (
      <div className="ch-rt-note is-warn" data-ch-code="CH-11102">
        <Icon icon={TriangleAlert} size={15} />
        <span>{issue.message}</span>
        <button type="button" className="ch-btn ch-btn--secondary ch-btn--sm" onClick={() => setConfirmedKey(key)}>
          <span>Confirm</span>
        </button>
      </div>
    )
  ) : null;
  const noticeAtDistance = issue?.rule === 'distance_not_decreasing';
  const lastShot = p.shotHistory[p.shotHistory.length - 1];

  return (
    <section className="ch-rt-panel" aria-label={`Shot ${p.currentShot}`}>
      {p.isTeeShot && p.currentHole.par !== 3 && (
        <Sec label="Club off tee">
          <Seg
            label="Club off tee"
            value={p.usedDriver === null ? null : p.usedDriver ? 'driver' : 'other'}
            onChange={(v) => p.dispatch({ type: 'SET_DRIVER', payload: v === 'driver' })}
            options={[
              { value: 'driver', label: 'Driver' },
              { value: 'other', label: 'Non-driver' },
            ]}
          />
        </Sec>
      )}

      {p.isPutting && (
        <Sec label="Putting details" hint="Optional" tint>
          <div className="ch-rt-sub">
            <em>Break</em>
            <Seg label="Putt break" value={p.puttBreak} onChange={(v) => p.dispatch({ type: 'SET_PUTT_BREAK', payload: v })} options={BREAK_OPTIONS.map(([value, label]) => ({ value, label }))} />
          </div>
          <div className="ch-rt-sub">
            <em>Slope</em>
            <Seg label="Putt slope" value={p.puttSlope} onChange={(v) => p.dispatch({ type: 'SET_PUTT_SLOPE', payload: v })} options={SLOPE_OPTIONS.map(([value, label]) => ({ value, label }))} />
          </div>
        </Sec>
      )}

      <Sec label={p.isPutting ? 'Putt result' : 'Shot result'}>
        <Seg
          label={p.isPutting ? 'Putt result' : 'Shot result'}
          cols={3}
          value={result}
          onChange={(v) => p.onResultSelect(v)}
          options={shotResultOptions({ isPutting: p.isPutting, isTeeShot: p.isTeeShot, par: p.currentHole.par, currentShot: p.currentShot }).map((o) => ({
            value: o.value,
            label: RESULT_LABEL[o.value],
            note: o.note,
            rare: o.rare,
          }))}
        />
        {!noticeAtDistance && notice}
      </Sec>

      {teeMiss && (
        <Sec label="Miss direction">
          <Seg
            label="Miss direction"
            value={p.missDirection as 'left' | 'right' | null}
            onChange={(v) => p.dispatch({ type: 'SET_MISS_DIRECTION', payload: v })}
            options={[
              { value: 'left', label: '← Left' },
              { value: 'right', label: 'Right →' },
            ]}
          />
        </Sec>
      )}
      {approachMiss && (
        <Sec label="Miss direction">
          <div className="ch-rt-amissw">
            <span className="ch-rt-amiss__k">Behind the green</span>
            <div className="ch-rt-amiss" role="radiogroup" aria-label="Where it missed the green">
              {APPROACH_GRID.map(([v, l]) =>
                v === null ? (
                  <span key="green" className="ch-rt-amiss__g" aria-hidden="true">
                    <i />
                  </span>
                ) : (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={p.approachMissDirection === v}
                    onClick={() => {
                      haptic('select');
                      p.dispatch({ type: 'SET_APPROACH_MISS', payload: { direction: v } });
                    }}
                  >
                    {l}
                  </button>
                ),
              )}
            </div>
            <span className="ch-rt-amiss__k">You · short of the green</span>
          </div>
        </Sec>
      )}
      {puttMissed && (
        <Sec label="What happened" hint="Optional">
          <div className="ch-rt-tags" role="group" aria-label="How the putt missed">
            {PUTT_TAGS.map(([tag, label]) => (
              <button
                key={tag}
                type="button"
                aria-pressed={p.puttMissTags.includes(tag)}
                onClick={() => {
                  haptic('select');
                  p.dispatch({ type: 'SET_PUTT_MISS_TAGS', payload: togglePuttMissTag(p.puttMissTags, tag) });
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Sec>
      )}

      {result && !holed && (
        <Sec label={distLabel} hint="Required" tint htmlFor={DIST_ID}>
          <div className="ch-rt-dist">
            {/* CH-11807: labelled by its section, aria-invalid with its message when it isn't a number. */}
            <input
              id={DIST_ID}
              ref={p.distanceInputRef}
              type="text"
              inputMode={meters ? 'decimal' : 'numeric'}
              autoComplete="off"
              enterKeyHint="done"
              placeholder="0"
              aria-invalid={distanceInvalid || undefined}
              aria-describedby={distanceInvalid ? 'ch-rt-dist-err' : undefined}
              value={p.distanceAfterShot}
              onChange={(e) => p.dispatch({ type: 'SET_DISTANCE_AFTER', payload: e.target.value })}
            />
            <em>{unitWord}</em>
            <div className="ch-rt-quick" role="group" aria-label="Quick distances">
              {quickPicks(afterUnit === 'feet' ? 'feet' : p.isTeeShot ? 'tee' : 'approach', p.pref).map((q) => (
                <button
                  key={q}
                  type="button"
                  aria-pressed={p.distanceAfterShot === String(q)}
                  onClick={() => {
                    haptic('select');
                    p.dispatch({ type: 'SET_DISTANCE_AFTER', payload: String(q) });
                    p.dispatch({ type: 'SET_DISTANCE_AFTER_UNIT', payload: afterUnit });
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
          {distanceInvalid && (
            // CH-11104: a distance that isn't a number says so under the box.
            <p className="ch-rt-error" id="ch-rt-dist-err" data-ch-code="CH-11104">
              Enter the distance as a number, like {afterUnit === 'feet' ? (meters ? 3 : 10) : meters ? 137 : 150}.
            </p>
          )}
          {shotYards != null && shotYards > 0 && (
            <p className="ch-rt-shotlen">
              Shot distance <b>~{meters ? `${yardsToDisplay(shotYards, 'meters')} m` : `${shotYards} yds`}</b>
            </p>
          )}
          {noticeAtDistance && notice}
        </Sec>
      )}

      {p.currentShot >= 12 && (
        // CH-11106: the 15-stroke limit, from shot 12.
        <p className="ch-rt-note is-warn ch-rt-note--flat" data-ch-code="CH-11106">
          <Icon icon={TriangleAlert} size={15} />
          <span>{p.currentShot >= 15 ? 'This is the most strokes a hole can record (15). Hole out or pick up.' : `Shot ${p.currentShot} of 15. ${15 - p.currentShot} more before the limit.`}</span>
        </p>
      )}

      {p.showUndoConfirm && lastShot && <UndoConfirm shots={p.shotHistory} saving={p.undoSaving} error={p.undoError} dispatch={p.dispatch} onUndo={p.onUndoLastShot} />}

      <div className="ch-rt-bar">
        {blocker && (
          // CH-11101: the one thing still missing, named above the disabled button.
          <p className="ch-rt-blocker" id={BLOCKER_ID} role="status" aria-live="polite" data-ch-code="CH-11101">
            {blocker}
          </p>
        )}
        <div className="ch-rt-bar__row">
          <button type="button" className="ch-rt-bar__i" disabled={!p.shotHistory.length || p.undoSaving} aria-label="Undo last shot" onClick={() => p.dispatch({ type: 'SHOW_UNDO_CONFIRM' })}>
            <Icon icon={Undo2} size={18} />
            <span>Undo</span>
          </button>
          <button type="button" className="ch-rt-bar__i" aria-label="Add penalty stroke" onClick={p.onAddPenalty}>
            <Icon icon={FlagTriangleRight} size={18} />
            <span>Penalty</span>
          </button>
          <button
            type="button"
            className="ch-btn ch-btn--primary ch-btn--lg ch-rt-bar__go"
            disabled={!canRecord}
            aria-describedby={blocker ? BLOCKER_ID : undefined}
            aria-label={holed ? `Complete hole with score ${p.currentShot}` : 'Record next shot'}
            onClick={() => {
              // CH-11705: a shot logged is the medium tap, once.
              haptic('commit');
              p.onNextShot();
            }}
          >
            <span>{holed ? `Hole out · ${p.currentShot}` : 'Next shot'}</span>
            <Icon icon={holed ? Check : ArrowRight} size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

/** CH-11502: undo asks first, naming the shot; a failed undo says so and keeps the shot (CH-11002). */
export function UndoConfirm({ shots, saving, error, dispatch, onUndo }: { shots: ShotRecord[]; saving: boolean; error: string | null; dispatch: Dispatch<ShotAction>; onUndo: () => void }) {
  const last = shots[shots.length - 1];
  if (!last) return null;
  return (
    <div className="ch-rt-confirm" role="group" aria-label={`Undo shot ${shots.length}`} data-ch-code="CH-11502">
      <div>
        <b>Undo shot {shots.length}?</b>
        <span>{last.isPenalty ? shotTitle(last) : `${shotTitle(last)} → ${RESULT_LABEL[last.result].toLowerCase()}`}</span>
        {error && (
          <span className="ch-rt-error" role="alert" data-ch-code="CH-11002">
            Couldn&rsquo;t undo the shot. It&rsquo;s still on your card; try again.
          </span>
        )}
      </div>
      <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm" onClick={() => dispatch({ type: 'HIDE_UNDO_CONFIRM' })}>
        <span>Keep it</span>
      </button>
      <button
        type="button"
        className="ch-btn ch-btn--danger ch-btn--sm"
        disabled={saving}
        onClick={() => {
          // CH-11707: removing a shot is a warning.
          haptic('warning');
          onUndo();
        }}
      >
        <span>{saving ? 'Undoing…' : 'Undo'}</span>
      </button>
    </div>
  );
}
