'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — FairwayShotEntry  (CALM SINGLE PANEL)
 * ----------------------------------------------------------------------------
 * PRESENTATION re-skin of the legacy live per-shot entry column. Every
 * conditional, option list, validation gate and dispatch is copied VERBATIM
 * from ShotTrackingComprehensive.tsx — only the layout/tokens change: the
 * separate boxed cards are now ONE calm panel of hairline-divided sections, the
 * option chips are thumb-sized, and the Next-Shot / Penalty / Undo actions live
 * in a sticky bottom bar (thumb zone).
 *
 * RISKY BEHAVIORS PRESERVED:
 *  • Result selection ONLY ever goes through `onResultSelect` → HANDLE_RESULT_SELECT.
 *  • The distance input is a REAL focusable native <input ref={distanceInputRef}>
 *    (min-w-0 so it can shrink — never widens the layout).
 *  • Distance bail-on-zero / green ≤150ft live in the parent.
 *  • ApproachMissSelector / PuttMissTagSelector reused AS-IS.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { Surface, Inset } from '@/components/fairway/surfaces/surface';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { ApproachMissSelector } from '@/components/golf/approach-miss-selector';
import { PuttMissTagSelector } from '@/components/golf/putt-miss-tag-selector';
import { calculateShotDistanceWithDirection } from '@/lib/utils/shot-helpers';
import type { ShotRecord, RoundHole, PuttMissTag, ApproachMissDirection } from '@/lib/types/golf';
import type { ShotAction } from '@/hooks/golf/use-shot-state-machine';

interface FairwayShotEntryProps {
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
  isHoleComplete: boolean;
  undoSaving: boolean;
  showUndoConfirm: boolean;
  distanceInputRef: React.RefObject<HTMLInputElement | null>;
  dispatch: React.Dispatch<ShotAction>;
  onResultSelect: (result: string) => void;
  isReadyForNextShot: () => boolean;
  onNextShot: () => void;
  onAddPenalty: () => void;
  onUndoLastShot: () => void;
}

/* Shared chip styles — thumb-sized selectable options */
const segWrap = 'flex w-full gap-1 rounded-fw-md border border-border-subtle bg-surface-sunken p-1';
const segBtn = (active: boolean) =>
  cn(
    'min-h-[48px] flex-1 rounded-fw-sm px-2 font-fw-sans text-sm font-medium transition-colors',
    'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-inset',
    active ? 'bg-accent-500 text-text-on-accent shadow-flat' : 'text-text-secondary hover:text-text-primary',
  );

function Section({
  label,
  hint,
  tint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  tint?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('px-5 py-5', tint && 'bg-accent-50/40')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-fw-sans text-eyebrow font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
        {hint}
      </div>
      {children}
    </div>
  );
}

export function FairwayShotEntry({
  currentHole,
  currentShot,
  shotHistory,
  isTeeShot,
  isPutting,
  isApproachOrAroundGreen,
  usedDriver,
  resultOfShot,
  missDirection,
  puttBreak,
  puttSlope,
  puttMissTags,
  approachMissDirection,
  distanceToHole,
  distanceUnit,
  distanceAfterShot,
  distanceAfterUnit,
  isHoleComplete,
  undoSaving,
  showUndoConfirm,
  distanceInputRef,
  dispatch,
  onResultSelect,
  isReadyForNextShot,
  onNextShot,
  onAddPenalty,
  onUndoLastShot,
}: FairwayShotEntryProps) {
  const ready = isReadyForNextShot();
  const distanceInvalid =
    !!distanceAfterShot && (!Number.isFinite(parseFloat(distanceAfterShot)) || parseFloat(distanceAfterShot) < 0);

  return (
    <>
      <Surface elevation="shadow" padding="none" className="overflow-hidden">
        <div className="divide-y divide-border-subtle">
          {/* Club Selection (Tee Shot Par 4/5) */}
          {isTeeShot && currentHole.par !== 3 && (
            <Section label="Club off tee">
              <div className={segWrap} role="radiogroup" aria-label="Club off tee">
                <Button variant="ghost"
                  type="button"
                  onClick={() => dispatch({ type: 'SET_DRIVER', payload: true })}
                  role="radio"
                  aria-checked={usedDriver === true}
                  className={segBtn(usedDriver === true)}
                >
                  Driver
                </Button>
                <Button variant="ghost"
                  type="button"
                  onClick={() => dispatch({ type: 'SET_DRIVER', payload: false })}
                  role="radio"
                  aria-checked={usedDriver === false}
                  className={segBtn(usedDriver === false)}
                >
                  Non-Driver
                </Button>
              </div>
            </Section>
          )}

          {/* Putt Details (FIRST - when putting) */}
          {isPutting && (
            <Section
              label="Putting details"
              tint
              hint={<StatusPill tone="accent" dot={false} size="sm">Fill first</StatusPill>}
            >
              <div className="space-y-4">
                <div>
                  <p className="mb-2 font-fw-sans text-xs font-medium uppercase tracking-wide text-text-tertiary">Break</p>
                  <div className={segWrap} role="radiogroup" aria-label="Putt break direction">
                    {[{ v: 'left_to_right', l: 'L → R' }, { v: 'straight', l: 'Straight' }, { v: 'right_to_left', l: 'R → L' }, { v: 'multiple', l: 'Mult.' }].map((b) => (
                      <Button variant="ghost"
                        key={b.v}
                        type="button"
                        onClick={() => dispatch({ type: 'SET_PUTT_BREAK', payload: b.v as ShotRecord['puttBreak'] })}
                        role="radio"
                        aria-checked={puttBreak === b.v}
                        className={segBtn(puttBreak === b.v)}
                      >
                        {b.l}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 font-fw-sans text-xs font-medium uppercase tracking-wide text-text-tertiary">Slope</p>
                  <div className={segWrap} role="radiogroup" aria-label="Putt slope">
                    {[{ v: 'uphill', l: 'Uphill' }, { v: 'level', l: 'Level' }, { v: 'downhill', l: 'Down' }, { v: 'severe', l: 'Severe' }].map((s) => (
                      <Button variant="ghost"
                        key={s.v}
                        type="button"
                        onClick={() => dispatch({ type: 'SET_PUTT_SLOPE', payload: s.v as ShotRecord['puttSlope'] })}
                        role="radio"
                        aria-checked={puttSlope === s.v}
                        className={segBtn(puttSlope === s.v)}
                      >
                        {s.l}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* Shot Result - Context-Aware */}
          <Section label={isPutting ? 'Putt result' : 'Shot result'}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={isPutting ? 'Putt result' : 'Shot result'}>
              {(() => {
                const formatLieLabel = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
                // VERBATIM option-set logic from legacy.
                const isFirstShotPar3 = currentShot === 1 && currentHole.par === 3;
                let options: string[];
                if (isPutting) {
                  options = ['hole', 'green', 'rough', 'sand'];
                } else if (isTeeShot && currentHole.par !== 3) {
                  options = ['fairway', 'rough', 'sand', 'green', 'hole', 'other'];
                } else if ((isTeeShot && currentHole.par === 3) || isFirstShotPar3) {
                  options = ['green', 'rough', 'sand', 'hole', 'other'];
                } else {
                  options = ['fairway', 'rough', 'sand', 'green', 'hole', 'other'];
                }
                return options.map((r) => {
                  const isRareTeeResult = (isTeeShot || isFirstShotPar3) && (r === 'hole' || (r === 'green' && currentHole.par !== 3));
                  const isRarePuttResult = isPutting && (r === 'rough' || r === 'sand');
                  const isSubtle = isRareTeeResult || isRarePuttResult;
                  const isSelected = resultOfShot === r;
                  return (
                    <Button variant="ghost"
                      key={r}
                      type="button"
                      onClick={() => onResultSelect(r)}
                      role="radio"
                      aria-checked={isSelected}
                      className={cn(
                        'min-h-[52px] rounded-fw-md px-2 font-fw-sans text-sm font-medium transition-colors',
                        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                        isSelected
                          ? 'bg-accent-500 text-text-on-accent shadow-flat ring-1 ring-accent-600'
                          : isSubtle
                            ? 'bg-surface-sunken text-text-tertiary ring-1 ring-border-subtle hover:bg-surface-tint hover:text-text-secondary hover:ring-border-strong'
                            : 'bg-surface-sunken text-text-primary ring-1 ring-border-subtle hover:bg-surface-tint hover:ring-border-strong',
                      )}
                    >
                      {formatLieLabel(r)}
                      {r === 'green' && !isTeeShot && !isPutting && (
                        <span className={cn('block text-[0.65rem] font-normal leading-tight', isSelected ? 'text-white/80' : 'text-text-tertiary')}>(not fringe)</span>
                      )}
                      {r === 'hole' && (isTeeShot || isFirstShotPar3) && (
                        <span className={cn('block text-[0.65rem] font-normal leading-tight', isSelected ? 'text-white/80' : 'text-text-tertiary')}>(ace!)</span>
                      )}
                      {isRarePuttResult && (
                        <span className={cn('block text-[0.65rem] font-normal leading-tight', isSelected ? 'text-white/80' : 'text-text-tertiary')}>(rolled off)</span>
                      )}
                    </Button>
                  );
                });
              })()}
            </div>
          </Section>

          {/* Miss Direction */}
          {((isTeeShot && ['rough', 'sand', 'other'].includes(resultOfShot || '')) ||
            (isApproachOrAroundGreen && resultOfShot && !['green', 'hole'].includes(resultOfShot)) ||
            (isPutting && resultOfShot && resultOfShot !== 'hole')) && (
            <Section label="Miss direction">
              {isTeeShot && (
                <div className={segWrap} role="radiogroup" aria-label="Miss direction">
                  {['left', 'right'].map((d) => (
                    <Button variant="ghost"
                      key={d}
                      type="button"
                      onClick={() => dispatch({ type: 'SET_MISS_DIRECTION', payload: d })}
                      role="radio"
                      aria-checked={missDirection === d}
                      className={segBtn(missDirection === d)}
                    >
                      {d === 'left' ? '← ' : ''}{d.charAt(0).toUpperCase() + d.slice(1)}{d === 'right' ? ' →' : ''}
                    </Button>
                  ))}
                </div>
              )}
              {isApproachOrAroundGreen && resultOfShot && !['green', 'hole'].includes(resultOfShot) && (
                <ApproachMissSelector
                  selectedDirection={approachMissDirection}
                  onDirectionChange={(dir) => dispatch({ type: 'SET_APPROACH_MISS', payload: { direction: dir } })}
                />
              )}
              {isPutting && resultOfShot && resultOfShot !== 'hole' && (
                <PuttMissTagSelector
                  selectedTags={puttMissTags}
                  onTagsChange={(tags) => dispatch({ type: 'SET_PUTT_MISS_TAGS', payload: tags })}
                />
              )}
            </Section>
          )}

          {/* Distance Remaining - Final Step (if not holed) */}
          {resultOfShot && resultOfShot !== 'hole' && (
            <Section
              label={isPutting ? 'Leave distance' : 'Distance remaining'}
              tint
              hint={<StatusPill tone="accent" dot={false} size="sm">Required</StatusPill>}
            >
              <div className="space-y-3">
                {/* REAL focusable native input — the state-machine auto-focus effect targets this ref. */}
                {/* eslint-disable-next-line helm/no-raw-input */}
                <input
                  ref={distanceInputRef}
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="0"
                  aria-label={isPutting ? 'Leave distance in feet or yards' : 'Distance remaining to hole'}
                  value={distanceAfterShot}
                  onChange={(e) => dispatch({ type: 'SET_DISTANCE_AFTER', payload: e.target.value })}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  placeholder="0"
                  className={cn(
                    'h-16 w-full min-w-0 rounded-fw-md border-2 bg-surface px-4 text-center font-fw-display text-display font-light tracking-[-0.025em] tabular-nums text-text-primary transition-colors placeholder:text-text-tertiary/50 focus:outline-none focus:ring-4',
                    distanceInvalid
                      ? 'border-fw-danger focus:border-fw-danger focus:ring-fw-danger/15'
                      : 'border-accent-300 focus:border-accent-500 focus:ring-accent-500/15',
                  )}
                />
                {distanceInvalid && <p className="font-fw-sans text-sm text-fw-danger">Please enter a valid distance</p>}

                {isPutting && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {[5, 10, 15, 20, 30, 40].map((ft) => (
                      <Button variant="ghost"
                        key={ft}
                        type="button"
                        onClick={() => {
                          dispatch({ type: 'SET_DISTANCE_AFTER', payload: String(ft) });
                          dispatch({ type: 'SET_DISTANCE_AFTER_UNIT', payload: 'feet' });
                        }}
                        className={cn(
                          'min-h-[44px] rounded-fw-md font-fw-sans text-eyebrow font-medium transition-colors',
                          'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                          distanceAfterShot === String(ft) && distanceAfterUnit === 'feet'
                            ? 'bg-accent-500 text-text-on-accent shadow-flat'
                            : 'border border-accent-200 bg-surface text-accent-700 hover:bg-accent-50',
                        )}
                      >
                        {ft}ft
                      </Button>
                    ))}
                  </div>
                )}

                <div className="flex w-full gap-1 rounded-fw-md border border-border-subtle bg-surface-sunken p-1">
                  <Button variant="ghost"
                    type="button"
                    onClick={() => dispatch({ type: 'SET_DISTANCE_AFTER_UNIT', payload: 'yards' })}
                    className={cn(segBtn(distanceAfterUnit === 'yards'), 'min-h-[44px] uppercase tracking-wide')}
                  >
                    Yards
                  </Button>
                  <Button variant="ghost"
                    type="button"
                    onClick={() => dispatch({ type: 'SET_DISTANCE_AFTER_UNIT', payload: 'feet' })}
                    className={cn(segBtn(distanceAfterUnit === 'feet'), 'min-h-[44px] uppercase tracking-wide')}
                  >
                    Feet
                  </Button>
                </div>

                {distanceAfterShot && (
                  <Inset padding="sm" className="flex items-center justify-between px-4 py-2.5">
                    <span className="font-fw-sans text-xs font-medium uppercase tracking-wide text-text-secondary">Shot distance</span>
                    <span className="font-fw-mono text-body-lg font-medium tabular-nums text-accent-700">
                      ~{Math.round(calculateShotDistanceWithDirection(
                        distanceUnit === 'feet' ? distanceToHole / 3 : distanceToHole,
                        distanceAfterUnit === 'feet' ? (parseFloat(distanceAfterShot) || 0) / 3 : (parseFloat(distanceAfterShot) || 0),
                        isApproachOrAroundGreen ? (approachMissDirection || missDirection) : missDirection,
                      ))} yds
                    </span>
                  </Inset>
                )}
              </div>
            </Section>
          )}
        </div>
      </Surface>

      {/* Max score warning */}
      {currentShot >= 12 && !isHoleComplete && (
        <InlineNotice tone="warning">
          {currentShot >= 15
            ? 'Maximum recordable score (15) reached. Please hole out or pick up.'
            : `Shot ${currentShot} of 15 max — ${15 - currentShot} shot${15 - currentShot !== 1 ? 's' : ''} remaining before the limit.`}
        </InlineNotice>
      )}

      {/* Undo Confirmation */}
      {showUndoConfirm && shotHistory.length > 0 && (
        <InlineNotice
          tone="warning"
          title={`Undo shot ${shotHistory.length}?`}
          action={
            <>
              <Button variant="secondary" size="sm" onClick={() => dispatch({ type: 'HIDE_UNDO_CONFIRM' })}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={onUndoLastShot} disabled={undoSaving}>
                {undoSaving ? 'Removing...' : 'Confirm'}
              </Button>
            </>
          }
        >
          {shotHistory[shotHistory.length - 1]!.isPenalty
            ? `Penalty (${shotHistory[shotHistory.length - 1]!.penaltyType || 'unknown'})`
            : `${shotHistory[shotHistory.length - 1]!.shotType.replace('_', ' ')} → ${shotHistory[shotHistory.length - 1]!.result}`}
        </InlineNotice>
      )}

      {/* ── Sticky action bar (thumb zone) ──────────────────────────────────── */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-1 border-t border-border-subtle bg-canvas px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:px-6">
        <Button
          variant="primary"
          fullWidth
          onClick={onNextShot}
          disabled={!ready}
          aria-label={resultOfShot === 'hole' ? `Complete hole with score ${currentShot}` : 'Record next shot'}
        >
          {resultOfShot === 'hole' ? `Complete hole · Score ${currentShot}` : 'Next shot →'}
        </Button>
        <div className="mt-2 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onAddPenalty} aria-label="Add penalty stroke">
            + Penalty
          </Button>
          {shotHistory.length > 0 && (
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => dispatch({ type: 'SHOW_UNDO_CONFIRM' })}
              disabled={undoSaving}
              aria-label="Undo last shot"
            >
              {undoSaving ? 'Undoing...' : 'Undo last'}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
