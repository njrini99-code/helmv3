'use client';

import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject } from 'react';
import { ArrowRight, Check, ChevronDown, FlagTriangleRight, TriangleAlert, Undo2 } from 'lucide-react';
import type { ShotAction } from '@/hooks/golf/use-shot-state-machine';
import { displayToFeet, displayToYards, yardsToDisplay, type DistancePreference } from '@/lib/golf/distance-units';
import {
  lockedAfterUnit,
  nextShotBlocker,
  plausibilityKey,
  shotPlausibility,
  shotResultOptions,
  tapInWords,
  togglePuttMissTag,
  type ShotEntryInput,
  type ShotResult,
  type TapInPlan,
} from '@/lib/golf/shot-entry-rules';
import type { ApproachMissDirection, PuttMissTag, RoundHole, ShotRecord } from '@/lib/types/golf';
import { calculateShotDistanceWithDirection } from '@/lib/utils/shot-helpers';
import { haptic } from '../../../lib/haptics';
import { roving } from '../../../ui/use-roving';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { APPROACH_GRID, BREAK_OPTIONS, cleanDistance, isDistanceText, PUTT_TAGS, quickPicks, RESULT_LABEL, SLOPE_OPTIONS, shotTitle } from './labels';
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
  /** What a tap in would write here (useShotTracking's `tapIn`); null hides it. */
  tapIn?: TapInPlan | null;
  /** Resolves true once the tap in's hole is saved. */
  onTapIn?: () => Promise<boolean>;
  /**
   * Whether the putt's optional Break and slope row is open. The round screen holds it, so once opened it stays open on
   * every putt for the rest of the round; closed until then.
   */
  puttReadOpen: boolean;
  onPuttReadOpen: (open: boolean) => void;
  /**
   * The one-tap data prompts (CH-11960 to CH-11962), drawn first in the card: the round screen owns them, so a tap
   * survives the entry being re-keyed for the next shot. Absent, the card is what it was.
   */
  prompts?: ReactNode;
}

const DIST_ID = 'ch-rt-dist';
const READ_ID = 'ch-rt-read';
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
  // The shot whose result is being changed (the fold's way back): held by shot, so it never carries to the next one.
  const [changingAt, setChangingAt] = useState<string | null>(null);
  const shotKey = `${p.currentHole.number}:${p.currentShot}`;
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
  const parsed = parseFloat(p.distanceAfterShot);
  const holed = result === 'hole';
  // A box that isn't a plain number blocks Next shot, as Fairway's number input (which would hold nothing) does;
  // the shared gate alone would record "150y" as 150.
  const distanceInvalid = !holed && !!p.distanceAfterShot && !isDistanceText(p.distanceAfterShot);
  const blocker = distanceInvalid ? 'Enter a valid distance' : nextShotBlocker(input, p.ready, issue, key !== null && key === confirmedKey);
  const canRecord = blocker === null;

  const afterUnit = lockedAfterUnit(p.isPutting, result);
  const unitWord = meters ? 'm' : afterUnit === 'feet' ? 'ft' : 'yds';
  const distLabel = p.isPutting ? `Leave distance (${unitWord})` : result === 'green' ? `Proximity to hole (${unitWord})` : `Distance remaining (${unitWord})`;
  const teeMiss = p.isTeeShot && !!result && ['rough', 'sand', 'other'].includes(result);
  const approachMiss = p.isApproachOrAroundGreen && !!result && !['green', 'hole'].includes(result);
  const puttMissed = p.isPutting && !!result && result !== 'hole';
  // The result's place holds one of two faces, both always in the card so the place keeps the taller one's height: the
  // results to pick from, or, once a result that asks something more is picked, that question with the pick folded into
  // its heading ("Rough · Change"). A result that asks nothing more (fairway from the tee, the green, holed) stays lit in
  // the grid. Nothing below moves either way (owner, 2026-11-11: nothing moves under the thumb).
  const face: 'pick' | 'follow' = (teeMiss || approachMiss || puttMissed) && changingAt !== shotKey ? 'follow' : 'pick';
  const [turned, setTurned] = useState({ key: shotKey, face, count: 0 });
  if (turned.key !== shotKey) setTurned({ key: shotKey, face, count: 0 });
  else if (turned.face !== face) setTurned({ key: shotKey, face, count: turned.count + 1 });
  const turn = turned.key === shotKey && turned.count > 0 ? (turned.count % 2 ? 'a' : 'b') : undefined;
  // The Break and slope row stays where it was tapped. Where the hero has height to give, the card grows up into it and
  // the row does not move; where it has none (a small phone), the card can only grow down the page, so the page is
  // scrolled by exactly what the row moved, at once, before the frame is painted.
  const readRow = useRef<HTMLButtonElement>(null);
  const readRowWas = useRef<number | null>(null);
  useLayoutEffect(() => {
    const was = readRowWas.current;
    readRowWas.current = null;
    const row = readRow.current;
    if (was === null || !row) return;
    const moved = row.getBoundingClientRect().top - was;
    if (Math.abs(moved) >= 1) window.scrollBy({ top: moved, behavior: 'instant' });
  }, [p.puttReadOpen]);
  const puttRead = [BREAK_OPTIONS.find(([v]) => v === p.puttBreak)?.[1], SLOPE_OPTIONS.find(([v]) => v === p.puttSlope)?.[1]].filter(Boolean).join(' · ');
  const resultLabel = p.isPutting ? 'Putt result' : 'Shot result';
  const followLabel = p.isPutting ? 'What happened' : 'Miss direction';

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
        <Button variant="secondary" size="sm" onClick={() => setConfirmedKey(key)}>Confirm</Button>
      </div>
    )
  ) : null;
  const noticeAtDistance = issue?.rule === 'distance_not_decreasing';
  const lastShot = p.shotHistory[p.shotHistory.length - 1];

  return (
    <section className="ch-rt-panel" aria-label={`Shot ${p.currentShot}`}>
      {/* Board 3: the entry is one ivory card; the bar under it sits on the green (phone). */}
      <div className="ch-rt-card">
        {p.prompts}
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

        <div className="ch-rt-slot" data-face={face} data-turn={turn}>
          <div className="ch-rt-face" data-face="pick" inert={face !== 'pick' || undefined} aria-hidden={face !== 'pick' || undefined}>
            <Sec label={resultLabel}>
              <Seg
                label={resultLabel}
                // A putt's four results stand in one row, so the leave distance sits directly under them.
                cols={p.isPutting ? 4 : 3}
                value={result}
                onChange={(v) => {
                  setChangingAt(null);
                  p.onResultSelect(v);
                }}
                options={shotResultOptions({ isPutting: p.isPutting, isTeeShot: p.isTeeShot, par: p.currentHole.par, currentShot: p.currentShot }).map((o) => ({
                  value: o.value,
                  label: RESULT_LABEL[o.value],
                  note: o.note,
                  rare: o.rare,
                }))}
              />
              {p.tapIn && p.onTapIn ? <TapIn plan={p.tapIn} pref={p.pref} onTapIn={p.onTapIn} /> : p.isPutting && p.onTapIn ? <div className="ch-rt-tapin is-held" aria-hidden="true" /> : null}
            </Sec>
          </div>
          {/* The follow-up is in the card from the first frame, hidden and inert until its result is picked: it is what
              holds the place's height, so the pick grows nothing. */}
          <div className="ch-rt-face" data-face="follow" inert={face !== 'follow' || undefined} aria-hidden={face !== 'follow' || undefined}>
            <section className="ch-rt-sec ch-rt-follow" aria-label={followLabel}>
              <div className="ch-rt-sec__h">
                <span>{followLabel}</span>
                {p.isPutting && <em className="ch-rt-hint">Optional</em>}
                <button type="button" className="ch-rt-pick" aria-label={`${resultLabel}: ${result ? RESULT_LABEL[result] : 'none'}. Change`} onClick={() => setChangingAt(shotKey)}>
                  <b>{result ? RESULT_LABEL[result] : RESULT_LABEL.fairway}</b>
                  <span>Change</span>
                </button>
              </div>
              {p.isTeeShot && (
                <Seg
                  label="Miss direction"
                  value={p.missDirection as 'left' | 'right' | null}
                  onChange={(v) => p.dispatch({ type: 'SET_MISS_DIRECTION', payload: v })}
                  options={[
                    { value: 'left', label: 'Left' },
                    { value: 'right', label: 'Right' },
                  ]}
                />
              )}
              {p.isApproachOrAroundGreen && (
                <div className="ch-rt-amissw">
                  <span className="ch-rt-amiss__k">Behind the green</span>
                  <div className="ch-rt-amiss" role="radiogroup" aria-label="Where it missed the green" {...roving}>
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
              )}
              {p.isPutting && (
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
              )}
            </section>
          </div>
        </div>
        {!noticeAtDistance && notice}

        {/* Held from the first frame, hidden and inert until a result is picked, so the card neither grows on the pick nor
            shrinks on Next shot (F-0019, F-0020); and held the same way once the ball is holed, which asks no distance,
            so Holed takes no height off the card either. Layout only: the field, its value and its dispatches are unchanged. */}
        <Sec
          label={distLabel}
          hint="Required"
          // Once the box holds a distance the heading says how far the shot went, where "Required" was: a line of its own
          // under the box grew the card as the quick pick was tapped (review 3, A.2).
          aside={
            shotYards != null && shotYards > 0 ? (
              <em className="ch-rt-shotlen">
                Shot distance <b>~{meters ? `${yardsToDisplay(shotYards, 'meters')} m` : `${shotYards} yds`}</b>
              </em>
            ) : undefined
          }
          tint
          htmlFor={DIST_ID}
          reserved={!result || holed}
        >
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
              onChange={(e) => p.dispatch({ type: 'SET_DISTANCE_AFTER', payload: cleanDistance(e.target.value) })}
            />
            <em>{unitWord}</em>
            <div className="ch-rt-quick" role="group" aria-label="Quick distances">
              {quickPicks(afterUnit === 'feet' ? (p.isPutting ? 'putt' : 'feet') : p.isTeeShot ? 'tee' : 'approach', p.pref).map((q) => (
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
          {noticeAtDistance && notice}
        </Sec>

        {p.isPutting && (
          // The putt's read, one optional row under the leave distance (owner, 2026-11-11): closed until the player opens
          // it, then open on every putt for the rest of the round. Closed, it still says what the putt carries.
          <section className={'ch-rt-sec ch-rt-read' + (p.puttReadOpen ? ' is-open' : '')} aria-label="Break and slope">
            <button
              ref={readRow}
              type="button"
              className="ch-rt-read__h"
              aria-expanded={p.puttReadOpen}
              aria-controls={READ_ID}
              onClick={(e) => {
                readRowWas.current = e.currentTarget.getBoundingClientRect().top;
                p.onPuttReadOpen(!p.puttReadOpen);
              }}
            >
              <span>Break and slope</span>
              {puttRead ? <b>{puttRead}</b> : <em className="ch-rt-hint">Optional</em>}
              <Icon icon={ChevronDown} size={16} className="ch-rt-read__chev" />
            </button>
            <div className="ch-rt-read__b" id={READ_ID} hidden={!p.puttReadOpen}>
              <div className="ch-rt-sub">
                <em>Break</em>
                <Seg label="Putt break" value={p.puttBreak} onChange={(v) => p.dispatch({ type: 'SET_PUTT_BREAK', payload: v })} options={BREAK_OPTIONS.map(([value, label]) => ({ value, label }))} />
              </div>
              <div className="ch-rt-sub">
                <em>Slope</em>
                <Seg label="Putt slope" value={p.puttSlope} onChange={(v) => p.dispatch({ type: 'SET_PUTT_SLOPE', payload: v })} options={SLOPE_OPTIONS.map(([value, label]) => ({ value, label }))} />
              </div>
            </div>
          </section>
        )}

        {p.currentShot >= 12 && (
          // CH-11106: the 15-stroke limit, from shot 12.
          <p className="ch-rt-note is-warn ch-rt-note--flat" data-ch-code="CH-11106">
            <Icon icon={TriangleAlert} size={15} />
            <span>{p.currentShot >= 15 ? 'This is the most strokes a hole can record (15). Hole out or pick up.' : `Shot ${p.currentShot} of 15. ${15 - p.currentShot} more before the limit.`}</span>
          </p>
        )}

        {p.showUndoConfirm && lastShot && <UndoConfirm shots={p.shotHistory} saving={p.undoSaving} error={p.undoError} dispatch={p.dispatch} onUndo={p.onUndoLastShot} />}
      </div>

      <div className="ch-rt-bar">
        {blocker && (
          // CH-11101: the one thing still missing. The disabled button shows it in place of its label; this line keeps the
          // live announcement for screen readers.
          <p className="ch-rt-blocker ch-sr-only" id={BLOCKER_ID} role="status" aria-live="polite" data-ch-code="CH-11101">
            {blocker}
          </p>
        )}
        <div className="ch-rt-bar__row">
          <button type="button" className="ch-rt-bar__i" data-ch-press="" disabled={!p.shotHistory.length || p.undoSaving} aria-label="Undo last shot" onClick={() => p.dispatch({ type: 'SHOW_UNDO_CONFIRM' })}>
            <Icon icon={Undo2} size={18} />
            <span>Undo</span>
          </button>
          <button type="button" className="ch-rt-bar__i" data-ch-press="" aria-label="Add penalty stroke" onClick={p.onAddPenalty}>
            <Icon icon={FlagTriangleRight} size={18} />
            <span>Penalty</span>
          </button>
          <button
            type="button"
            className={'ch-btn ch-btn--primary ch-btn--lg ch-rt-bar__go' + (blocker ? ' is-blocked' : '')}
            disabled={!canRecord}
            aria-describedby={blocker ? BLOCKER_ID : undefined}
            aria-label={holed ? `Complete hole with score ${p.currentShot}` : 'Record next shot'}
            onClick={() => {
              // CH-11705: a shot logged is the medium tap, once.
              haptic('commit');
              p.onNextShot();
            }}
          >
            <span aria-hidden={blocker ? true : undefined}>{blocker ?? (holed ? `Hole out · ${p.currentShot}` : 'Next shot')}</span>
            {!blocker && <Icon icon={holed ? Check : ArrowRight} size={16} />}
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * CH-11913: the tap in, one quiet line under the putt result (docs/clubhouse/phone/rounds.md, "Tap in on the phone").
 * The caption names every stroke it writes and the score, so it is never a silent shortcut.
 */
function TapIn({ plan, pref, onTapIn }: { plan: TapInPlan; pref: DistancePreference; onTapIn: () => Promise<boolean> }) {
  const words = tapInWords(plan, pref);
  return (
    <div className="ch-rt-tapin" data-ch-code="CH-11913">
      <button
        type="button"
        className="ch-btn ch-btn--ghost ch-btn--sm"
        aria-label={words.label}
        onClick={() => {
          // CH-11705: a shot logged is the medium tap; CH-11710: success once the hole's save lands.
          haptic('commit');
          void onTapIn().then((saved) => {
            if (saved) haptic('success');
          });
        }}
      >
        <span>Tap in</span>
      </button>
      <span className="ch-rt-tapin__w" aria-hidden="true">
        {words.caption}
      </span>
    </div>
  );
}

/**
 * CH-11502: undo asks first, naming the shot; a failed undo says so and keeps the shot (CH-11002). It opens at the
 * foot of the card, which on a phone can be under the action bar or below the screen, so it brings itself into view
 * clear of the bar (`scroll-margin-bottom`), at once with reduced motion.
 */
export function UndoConfirm({ shots, saving, error, dispatch, onUndo }: { shots: ShotRecord[]; saving: boolean; error: string | null; dispatch: Dispatch<ShotAction>; onUndo: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useChReducedMotion();
  const last = shots[shots.length - 1];
  const shown = !!last;
  useEffect(() => {
    const el = ref.current;
    if (shown && typeof el?.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'instant' : 'smooth' });
    // Once, as it opens.
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!last) return null;
  return (
    <div ref={ref} className="ch-rt-confirm" role="group" aria-label={`Undo shot ${shots.length}`} data-ch-code="CH-11502">
      <div>
        <b>Undo shot {shots.length}?</b>
        <span>{last.isPenalty ? shotTitle(last) : `${shotTitle(last)} → ${RESULT_LABEL[last.result].toLowerCase()}`}</span>
        {error && (
          <span className="ch-rt-error" role="alert" data-ch-code="CH-11002">
            Couldn&rsquo;t undo the shot. It&rsquo;s still on your card; try again.
          </span>
        )}
      </div>
      <Button variant="ghost" onClick={() => dispatch({ type: 'HIDE_UNDO_CONFIRM' })}>Keep it</Button>
      {/* CH-11707: removing a shot is a warning (a danger Button warns as it is pressed). */}
      <Button variant="danger" busy={saving} onClick={onUndo}>
        {saving ? 'Undoing…' : 'Undo'}
      </Button>
    </div>
  );
}
